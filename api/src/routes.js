import { registerAccessRoutes } from './access.js';
import { registerPushRoutes } from './push.js';
import { AuthError } from './auth.js';
import { seedDefaultCategories } from './defaults.js';
import { acceptInvites, memberHouses, registerHouseRoutes } from './house.js';
import { createLimiter } from './limiter.js';
import { applyMutation, pullChanges } from './sync.js';

const syncBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cursor', 'mutations'],
  properties: {
    cursor: { type: 'string', pattern: '^[0-9]{1,19}$' },
    mutations: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'collection', 'docId', 'op'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          collection: { type: 'string', maxLength: 40 },
          docId: { type: 'string', minLength: 1, maxLength: 128 },
          op: { enum: ['patch', 'delete'] },
          data: { type: 'object' },
        },
      },
    },
  },
};

function requireRole(request) {
  if (!request.user.role) throw new AuthError(403, 'not_authorized');
}

const firstName = (name) => (name.trim().split(/\s+/)[0] ?? '').slice(0, 60);

export function registerRoutes(app, { db, collections, authenticate, push, config }) {
  // Pas d'accès base : la sonde de Render ne doit pas réveiller Neon.
  app.get('/healthz', async () => ({ ok: true }));

  app.get('/api/me', { preHandler: authenticate }, async (request) => {
    // Invité dans une maison : il la rejoint à sa connexion (e-mail vérifié), même s'il a
    // déjà son propre espace (personne autorisée par le propriétaire).
    if ((await acceptInvites(db, request.user)) > 0 && !request.user.role) {
      request.user.role = 'member';
    }
    requireRole(request);
    const { uid, email, name, role, owner } = request.user;
    if (role === 'admin') {
      // Profil créé au premier passage, avec le prénom Google, puis les catégories par défaut.
      await db.query(
        'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [uid, firstName(name)],
      );
      await seedDefaultCategories(db, uid);
    }
    return { uid, email, role, owner, houses: await memberHouses(db, uid) };
  });

  registerHouseRoutes(app, { db, authenticate });
  registerAccessRoutes(app, { db, authenticate });
  registerPushRoutes(app, {
    authenticate,
    push,
    publicKey: config.vapidPublicKey,
    cronSecret: config.pushCronSecret,
  });

  // 60 synchros / minute / compte : large pour l'app (une sync par écriture groupée),
  // bloquant pour un script qui martèlerait l'API avec un jeton volé.
  const allowSync = createLimiter({ max: 60, windowMs: 60_000 });

  app.post(
    '/api/sync',
    { preHandler: authenticate, schema: { body: syncBodySchema } },
    async (request, reply) => {
      requireRole(request);
      if (!allowSync(request.user.uid)) {
        return reply.code(429).send({ error: 'too_many_requests' });
      }
      const ctx = { user: request.user, role: request.user.role, collections };
      const result = { applied: [], rejected: [] };

      for (const mutation of request.body.mutations) {
        const outcome = await applyMutation(db, ctx, mutation);
        if (outcome.status === 'applied') result.applied.push(mutation.id);
        else {
          result.rejected.push({
            id: mutation.id,
            reason: outcome.reason,
            details: outcome.details,
          });
        }
      }
      if (result.rejected.length)
        request.log.warn({ rejected: result.rejected }, 'mutations refusées');

      // Tirage après application : le client reçoit ses propres écritures avec leur version serveur.
      const pull = await pullChanges(db, ctx, request.body.cursor);
      return { ...result, ...pull };
    },
  );
}
