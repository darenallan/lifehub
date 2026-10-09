// Web Push (phase 7.6a) : rappels quand l'app est fermée.
//
// Render gratuit s'endort après 15 min : un cron externe (cron-job.org) appelle /api/push/tick
// chaque minute. Pour que Neon gratuit puisse rester en veille, le tick ne lit QUE la mémoire :
// la base n'est touchée qu'au premier tick après un démarrage, et quand un rappel part vraiment.
//
// Vie privée : le contenu envoyé est toujours générique (jamais de nom de médicament ni de valeur),
// en plus du chiffrement de bout en bout du protocole Web Push.
import { timingSafeEqual } from 'node:crypto';
import { AuthError } from './auth.js';

const STALE_MS = 30 * 60_000; // un rappel en retard de plus de 30 min n'est plus envoyé
const HORIZON_MS = 8 * 24 * 3600_000;
const TAG = '^[A-Za-z0-9|:_-]{1,120}$';

const PAYLOADS = {
  dose: { title: 'LifeHub', body: "C'est l'heure d'une prise.", url: '/#/health' },
  appointment: { title: 'LifeHub', body: 'Rappel de rendez-vous.', url: '/#/health/care' },
};

/** Contenu générique d'une notification (testé : aucune donnée de santé). */
export const pushPayload = (reminder) => ({ ...PAYLOADS[reminder.kind], tag: reminder.tag });

const EPOCH_MS = '(extract(epoch from fire_at) * 1000)::bigint::text AS fire_at';

/**
 * État en mémoire + écriture en base. `send(subscription, payload)` est injecté
 * (web-push en production, faux envoyeur dans les tests).
 */
export function createPushService({ db, send, now = () => Date.now() }) {
  const reminders = new Map(); // userId → Map(tag → { kind, fireAt })
  const subscriptions = new Map(); // userId → Map(id → { id, endpoint, keys })
  let loading = null;

  const userMap = (store, userId) => {
    if (!store.has(userId)) store.set(userId, new Map());
    return store.get(userId);
  };

  /** Chargement unique après un démarrage (ou un réveil) du serveur. */
  function load() {
    loading ??= (async () => {
      const subs = await db.query(
        `SELECT id::text AS id, user_id, endpoint, p256dh, auth FROM push_subscriptions
         WHERE revoked_at IS NULL`,
      );
      for (const s of subs) {
        userMap(subscriptions, s.user_id).set(s.id, {
          id: s.id,
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
      }
      const rows = await db.query(
        `SELECT user_id, tag, kind, ${EPOCH_MS} FROM push_reminders WHERE sent_at IS NULL`,
      );
      for (const r of rows) {
        userMap(reminders, r.user_id).set(r.tag, { kind: r.kind, fireAt: Number(r.fire_at) });
      }
    })().catch((err) => {
      loading = null; // nouvel essai au prochain tick
      throw err;
    });
    return loading;
  }

  async function subscribe(userId, { endpoint, keys, label }) {
    await load();
    const [row] = await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           label = EXCLUDED.label, revoked_at = NULL
       RETURNING id::text AS id`,
      [userId, endpoint, keys.p256dh, keys.auth, label ?? null],
    );
    // Un même navigateur ne peut appartenir qu'à un compte à la fois.
    for (const subs of subscriptions.values()) {
      for (const [id, s] of subs) if (s.endpoint === endpoint) subs.delete(id);
    }
    userMap(subscriptions, userId).set(row.id, { id: row.id, endpoint, keys });
    return row.id;
  }

  async function revoke(userId, id) {
    await load();
    await db.query(
      `UPDATE push_subscriptions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [id, userId],
    );
    subscriptions.get(userId)?.delete(id);
  }

  async function list(userId) {
    const rows = await db.query(
      `SELECT id::text AS id, label, to_char(created_at, 'YYYY-MM-DD') AS created_on
       FROM push_subscriptions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at`,
      [userId],
    );
    return rows.map((r) => ({ id: r.id, label: r.label, createdOn: r.created_on }));
  }

  /** Remplace le planning à venir de l'utilisateur ; les rappels déjà envoyés ne repartent pas. */
  async function setSchedule(userId, list) {
    await load();
    await db.tx(async (q) => {
      await q('DELETE FROM push_reminders WHERE user_id = $1 AND sent_at IS NULL', [userId]);
      for (const r of list) {
        await q(
          `INSERT INTO push_reminders (user_id, tag, kind, fire_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, tag) DO NOTHING`,
          [userId, r.tag, r.kind, new Date(r.fireAt).toISOString()],
        );
      }
    });
    const rows = await db.query(
      `SELECT tag, kind, ${EPOCH_MS} FROM push_reminders WHERE user_id = $1 AND sent_at IS NULL`,
      [userId],
    );
    reminders.set(
      userId,
      new Map(rows.map((r) => [r.tag, { kind: r.kind, fireAt: Number(r.fire_at) }])),
    );
  }

  async function deliver(userId, payload) {
    let sent = 0;
    for (const sub of [...(subscriptions.get(userId)?.values() ?? [])]) {
      try {
        await send(sub, payload);
        sent += 1;
      } catch (err) {
        // Abonnement expiré ou appli désinstallée : on le révoque.
        if (err?.statusCode === 404 || err?.statusCode === 410) await revoke(userId, sub.id);
      }
    }
    return sent;
  }

  /** Envoie les rappels échus. Sans rappel échu : aucune requête SQL. */
  async function tick() {
    await load();
    const t = now();
    let sent = 0;
    for (const [userId, map] of reminders) {
      const due = [...map].filter(([, r]) => r.fireAt <= t);
      for (const [tag, r] of due) {
        map.delete(tag);
        if (r.fireAt > t - STALE_MS)
          sent += await deliver(userId, pushPayload({ tag, kind: r.kind }));
        await db.query(
          'UPDATE push_reminders SET sent_at = now() WHERE user_id = $1 AND tag = $2',
          [userId, tag],
        );
      }
    }
    return { sent };
  }

  return { subscribe, revoke, list, setSchedule, tick };
}

const subscribeBody = {
  type: 'object',
  additionalProperties: false,
  required: ['endpoint', 'keys'],
  properties: {
    endpoint: { type: 'string', pattern: '^https://', maxLength: 1000 },
    keys: {
      type: 'object',
      additionalProperties: false,
      required: ['p256dh', 'auth'],
      properties: {
        p256dh: { type: 'string', pattern: '^[A-Za-z0-9_-]{40,200}$' },
        auth: { type: 'string', pattern: '^[A-Za-z0-9_-]{10,100}$' },
      },
    },
    label: { type: 'string', maxLength: 60 },
  },
};

const scheduleBody = {
  type: 'object',
  additionalProperties: false,
  required: ['reminders'],
  properties: {
    reminders: {
      type: 'array',
      maxItems: 300,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tag', 'kind', 'fireAt'],
        properties: {
          tag: { type: 'string', pattern: TAG },
          kind: { enum: ['dose', 'appointment'] },
          fireAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerPushRoutes(app, { authenticate, push, publicKey, cronSecret }) {
  const enabled = Boolean(push && publicKey);
  const requireAdmin = (request) => {
    if (request.user.role !== 'admin') throw new AuthError(403, 'not_authorized');
    if (!enabled) throw new AuthError(503, 'push_disabled');
  };

  app.get('/api/push/key', { preHandler: authenticate }, async (request) => {
    requireAdmin(request);
    return { publicKey };
  });

  app.get('/api/push/subscriptions', { preHandler: authenticate }, async (request) => {
    requireAdmin(request);
    return { devices: await push.list(request.user.uid) };
  });

  app.post(
    '/api/push/subscribe',
    { preHandler: authenticate, schema: { body: subscribeBody } },
    async (request, reply) => {
      requireAdmin(request);
      const id = await push.subscribe(request.user.uid, request.body);
      return reply.code(201).send({ id });
    },
  );

  app.delete(
    '/api/push/subscriptions/:id',
    { preHandler: authenticate, schema: { params: idParams } },
    async (request, reply) => {
      requireAdmin(request);
      await push.revoke(request.user.uid, request.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/push/schedule',
    { preHandler: authenticate, schema: { body: scheduleBody } },
    async (request, reply) => {
      requireAdmin(request);
      const now = Date.now();
      const list = request.body.reminders.filter((r) => {
        const t = Date.parse(r.fireAt);
        return t > now - STALE_MS && t < now + HORIZON_MS;
      });
      await push.setSchedule(request.user.uid, list);
      return reply.code(204).send();
    },
  );

  // Appelée chaque minute par le cron externe, avec le secret partagé (aucun jeton utilisateur).
  app.post('/api/push/tick', async (request, reply) => {
    if (!enabled || !cronSecret) return reply.code(503).send({ error: 'push_disabled' });
    if (!sameSecret(request.headers['x-cron-secret'], cronSecret)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return push.tick();
  });
}
