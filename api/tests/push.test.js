import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPushService, pushPayload } from '../src/push.js';
import { call, setup, TOKENS } from './helpers.js';

const SECRET = 'x'.repeat(40);
const PUSH = {
  vapidPublicKey: 'BPub-test-key',
  vapidPrivateKey: 'private-test-key',
  pushCronSecret: SECRET,
};
const subscription = (n = 1) => ({
  endpoint: `https://push.example.com/send/abc${n}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
  label: 'Téléphone',
});

let app;
let db;
afterEach(async () => {
  await app?.close();
  await db?.close();
  app = null;
  db = null;
});

async function withPush(sender = vi.fn(async () => {})) {
  ({ app, db } = await setup({ extra: PUSH, pushSender: sender }));
  await call(app, { url: '/api/me', token: TOKENS.admin });
  return sender;
}
const post = (url, body, token = TOKENS.admin) => call(app, { method: 'POST', url, token, body });
const tick = (secret = SECRET) =>
  call(app, { method: 'POST', url: '/api/push/tick', headers: { 'x-cron-secret': secret } });
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const devices = async () =>
  (await call(app, { url: '/api/push/subscriptions', token: TOKENS.admin })).json().devices;

describe('Web Push désactivé (pas de clés VAPID)', () => {
  it('répond 503 sans planter', async () => {
    ({ app, db } = await setup());
    expect((await call(app, { url: '/api/push/key', token: TOKENS.admin })).statusCode).toBe(503);
    expect((await tick()).statusCode).toBe(503);
  });
});

describe('abonnement et appareils', () => {
  it('abonne un appareil, le liste, puis le révoque', async () => {
    await withPush();
    expect((await call(app, { url: '/api/push/key', token: TOKENS.admin })).json()).toEqual({
      publicKey: 'BPub-test-key',
    });
    const res = await post('/api/push/subscribe', subscription());
    expect(res.statusCode).toBe(201);
    const { id } = res.json();
    expect(await devices()).toEqual([{ id, label: 'Téléphone', createdOn: expect.any(String) }]);
    const del = await call(app, {
      method: 'DELETE',
      url: `/api/push/subscriptions/${id}`,
      token: TOKENS.admin,
    });
    expect(del.statusCode).toBe(204);
    expect(await devices()).toEqual([]);
  });

  it.each([
    ['endpoint http', { ...subscription(), endpoint: 'http://push.example.com/x' }],
    ['clé trop courte', { ...subscription(), keys: { p256dh: 'court', auth: 'a'.repeat(22) } }],
    ['champ en trop', { ...subscription(), extra: true }],
  ])('refuse un abonnement invalide (%s)', async (_, body) => {
    await withPush();
    expect((await post('/api/push/subscribe', body)).statusCode).toBe(400);
  });

  it('réservé aux comptes qui ont un espace perso', async () => {
    await withPush();
    const res = await post('/api/push/subscribe', subscription(), TOKENS.stranger);
    expect(res.statusCode).toBe(403);
  });
});

describe('envoi par le cron', () => {
  it('exige le secret partagé', async () => {
    await withPush();
    expect((await tick('mauvais')).statusCode).toBe(403);
    expect((await call(app, { method: 'POST', url: '/api/push/tick' })).statusCode).toBe(403);
  });

  it('envoie une seule fois un rappel échu, avec un contenu générique', async () => {
    const sender = await withPush();
    await post('/api/push/subscribe', subscription());
    await post('/api/push/schedule', {
      reminders: [
        { tag: 'dose-2026-10-08-08:00', kind: 'dose', fireAt: inMinutes(-1) },
        { tag: 'rdv|abc|day', kind: 'appointment', fireAt: inMinutes(60) },
      ],
    });
    expect((await tick()).json()).toEqual({ sent: 1 });
    expect(sender).toHaveBeenCalledTimes(1);
    const [sub, payload] = sender.mock.calls[0];
    expect(sub.endpoint).toBe(subscription().endpoint);
    expect(payload).toEqual({
      title: 'LifeHub',
      body: "C'est l'heure d'une prise.",
      url: '/#/health',
      tag: 'dose-2026-10-08-08:00',
    });
    expect((await tick()).json()).toEqual({ sent: 0 });

    // Renvoyer le même planning ne fait pas repartir un rappel déjà envoyé.
    await post('/api/push/schedule', {
      reminders: [{ tag: 'dose-2026-10-08-08:00', kind: 'dose', fireAt: inMinutes(-1) }],
    });
    expect((await tick()).json()).toEqual({ sent: 0 });
  });

  it('révoque un abonnement expiré (410)', async () => {
    const gone = Object.assign(new Error('gone'), { statusCode: 410 });
    await withPush(vi.fn(async () => Promise.reject(gone)));
    await post('/api/push/subscribe', subscription());
    await post('/api/push/schedule', {
      reminders: [{ tag: 'dose-a', kind: 'dose', fireAt: inMinutes(-1) }],
    });
    expect((await tick()).json()).toEqual({ sent: 0 });
    const rows = await db.query('SELECT revoked_at IS NOT NULL AS revoked FROM push_subscriptions');
    expect(rows).toEqual([{ revoked: true }]);
  });

  it('ignore les rappels trop anciens ou trop lointains', async () => {
    const sender = await withPush();
    await post('/api/push/subscribe', subscription());
    const res = await post('/api/push/schedule', {
      reminders: [
        { tag: 'vieux', kind: 'dose', fireAt: inMinutes(-120) },
        { tag: 'lointain', kind: 'dose', fireAt: inMinutes(60 * 24 * 30) },
      ],
    });
    expect(res.statusCode).toBe(204);
    expect(await db.query('SELECT tag FROM push_reminders')).toEqual([]);
    await tick();
    expect(sender).not.toHaveBeenCalled();
  });

  it.each([
    ['étiquette invalide', { tag: 'pas bon !', kind: 'dose' }],
    ['type inconnu', { tag: 'a', kind: 'autre' }],
  ])('refuse un planning invalide (%s)', async (_, override) => {
    await withPush();
    const res = await post('/api/push/schedule', {
      reminders: [{ fireAt: inMinutes(5), ...override }],
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('service (unitaire)', () => {
  it('sans rappel échu, un tick ne touche pas la base (Neon peut rester en veille)', async () => {
    const query = vi.fn(async () => []);
    const service = createPushService({ db: { query, tx: vi.fn() }, send: vi.fn() });
    await service.tick(); // premier tick : chargement unique
    const afterLoad = query.mock.calls.length;
    await service.tick();
    await service.tick();
    expect(query.mock.calls.length).toBe(afterLoad);
  });

  it('contenu toujours générique, sans donnée de santé', () => {
    expect(pushPayload({ kind: 'appointment', tag: 't' })).toEqual({
      title: 'LifeHub',
      body: 'Rappel de rendez-vous.',
      url: '/#/health/care',
      tag: 't',
    });
  });
});
