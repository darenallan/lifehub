import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_USERS } from '../src/access.js';
import { call, setup, sync, TOKENS } from './helpers.js';

let app;
let db;

beforeEach(async () => {
  ({ app, db } = await setup());
});
afterEach(async () => {
  await app.close();
  await db.close();
});

// TOKENS.stranger = x@example.com : l'ami que le propriétaire autorise.
const FRIEND = 'x@example.com';
const me = (token) => call(app, { url: '/api/me', token });
const grant = (email, token = TOKENS.admin) =>
  call(app, { method: 'POST', url: '/api/access', token, body: { email } });
const revoke = (email, token = TOKENS.admin) =>
  call(app, { method: 'DELETE', url: `/api/access/${encodeURIComponent(email)}`, token });
const list = (token = TOKENS.admin) => call(app, { url: '/api/access', token });

const patch = (collection, docId, data) => ({
  id: randomUUID(),
  collection,
  docId,
  op: 'patch',
  data,
});
const send = (token, ...mutations) =>
  sync(app, { cursor: '0', mutations }, token).then((r) => r.json());

describe('accès accordé par le propriétaire', () => {
  it("un e-mail autorisé obtient son propre espace (sans droit d'en inviter d'autres)", async () => {
    expect((await me(TOKENS.stranger)).statusCode).toBe(403);
    expect((await grant(' X@Example.com ')).statusCode).toBe(201);

    const res = await me(TOKENS.stranger);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ uid: 'stranger-uid', role: 'admin', owner: false });
    expect((await list()).json().users).toEqual([
      { email: FRIEND, addedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    ]);
    // Profil créé pour lui seul.
    const profiles = await db.query('SELECT user_id FROM profiles ORDER BY user_id');
    expect(profiles.map((p) => p.user_id)).toEqual(['stranger-uid']);
  });

  it('seul le propriétaire gère les accès', async () => {
    await grant(FRIEND);
    expect((await list(TOKENS.stranger)).statusCode).toBe(403);
    expect((await grant('autre@example.com', TOKENS.stranger)).statusCode).toBe(403);
    expect((await revoke(FRIEND, TOKENS.stranger)).statusCode).toBe(403);
    expect((await list(TOKENS.coloc)).statusCode).toBe(403);
  });

  it.each([['pas-un-email'], ['admin@example.com']])('refuse %s', async (email) => {
    expect((await grant(email)).statusCode).toBe(400);
  });

  it(`limite à ${MAX_USERS} personnes`, async () => {
    for (let i = 0; i < MAX_USERS; i++) {
      expect((await grant(`ami${i}@example.com`)).statusCode).toBe(201);
    }
    expect((await grant('de-trop@example.com')).statusCode).toBe(409);
    // Réajouter quelqu'un de déjà présent reste possible.
    expect((await grant('ami0@example.com')).statusCode).toBe(201);
  });
});

describe('cloisonnement des données entre personnes', () => {
  it('chacun ne voit et ne modifie que ses propres données', async () => {
    await grant(FRIEND);
    const habitId = randomUUID();
    await send(
      TOKENS.admin,
      patch('habit', habitId, { name: 'Sport', emoji: null, order: 0, active: true }),
      patch('healthProfile', 'me', { bloodGroup: 'O+' }),
    );
    await send(TOKENS.stranger, patch('healthProfile', 'me', { bloodGroup: 'A-' }));

    // L'ami ne reçoit rien de l'admin : ni habitude, ni profil santé.
    const friend = await send(TOKENS.stranger);
    expect(friend.changes.some((c) => c.docId === habitId)).toBe(false);
    const friendHealth = friend.changes.find((c) => c.collection === 'healthProfile');
    expect(friendHealth.data.bloodGroup).toBe('A-');
    const owner = await send(TOKENS.admin);
    const ownerHealth = owner.changes.find((c) => c.collection === 'healthProfile');
    expect(ownerHealth.data.bloodGroup).toBe('O+');

    // Écrire sur l'id d'un document de l'admin est refusé, et rien ne change.
    const res = await send(
      TOKENS.stranger,
      patch('habit', habitId, { name: 'Piraté', emoji: null, order: 0, active: true }),
    );
    expect(res.rejected).toMatchObject([{ reason: 'forbidden' }]);
    const [row] = await db.query('SELECT name, user_id FROM habits');
    expect(row).toEqual({ name: 'Sport', user_id: 'admin-uid' });
  });
});

describe('retrait et réactivation', () => {
  it("retirer coupe l'accès immédiatement, sans supprimer les données", async () => {
    await grant(FRIEND);
    await me(TOKENS.stranger);
    await send(TOKENS.stranger, patch('healthProfile', 'me', { bloodGroup: 'A-' }));

    expect((await revoke(FRIEND)).statusCode).toBe(204);
    expect((await me(TOKENS.stranger)).statusCode).toBe(403);
    const blocked = await sync(app, { cursor: '0', mutations: [] }, TOKENS.stranger);
    expect(blocked.statusCode).toBe(403);
    expect((await list()).json().users).toEqual([]);
    expect(await db.query('SELECT blood_group FROM health_profiles')).toEqual([
      { blood_group: 'A-' },
    ]);

    await grant(FRIEND);
    const back = await send(TOKENS.stranger);
    expect(back.changes.find((c) => c.collection === 'healthProfile').data.bloodGroup).toBe('A-');
  });
});

describe('maison', () => {
  it("une personne autorisée peut aussi rejoindre la maison de l'admin", async () => {
    await me(TOKENS.admin);
    const house = await call(app, {
      method: 'POST',
      url: '/api/houses',
      token: TOKENS.admin,
      body: { name: 'Coloc' },
    });
    const houseId = house.json().id;
    await grant(FRIEND);
    await call(app, {
      method: 'POST',
      url: `/api/houses/${houseId}/invites`,
      token: TOKENS.admin,
      body: { email: FRIEND },
    });
    expect((await me(TOKENS.stranger)).json()).toMatchObject({ role: 'admin', houses: [houseId] });
  });
});
