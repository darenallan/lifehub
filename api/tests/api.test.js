import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const patch = (collection, docId, data, id = randomUUID()) => ({
  id,
  collection,
  docId,
  op: 'patch',
  data,
});

describe('authentification', () => {
  it('401 sans jeton ou jeton invalide', async () => {
    expect((await call(app, { url: '/api/me' })).statusCode).toBe(401);
    expect((await call(app, { url: '/api/me', token: TOKENS.broken })).statusCode).toBe(401);
    const res = await call(app, { url: '/api/me', headers: { authorization: 'Basic abc' } });
    expect(res.statusCode).toBe(401);
  });

  it('403 si e-mail non vérifié, même admin', async () => {
    const res = await call(app, { url: '/api/me', token: TOKENS.adminUnverified });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'email_not_verified' });
  });

  it('403 pour un compte inconnu, sur /me et /sync', async () => {
    expect((await call(app, { url: '/api/me', token: TOKENS.stranger })).json()).toEqual({
      error: 'not_authorized',
    });
    const res = await sync(app, { cursor: '0', mutations: [] }, TOKENS.stranger);
    expect(res.statusCode).toBe(403);
  });

  it('/me renvoie le rôle admin et crée le profil avec le prénom', async () => {
    const res = await call(app, { url: '/api/me', token: TOKENS.admin });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      uid: 'admin-uid',
      email: 'admin@example.com',
      role: 'admin',
      owner: true,
      houses: [],
    });
    const [row] = await db.query('SELECT display_name, currency, theme FROM profiles');
    expect(row).toEqual({ display_name: 'Daren', currency: 'XOF', theme: 'dark' });
  });

  it('/healthz sans auth ni base', async () => {
    expect((await call(app, { url: '/healthz' })).json()).toEqual({ ok: true });
  });
});

describe('CORS', () => {
  it("n'autorise que les origines configurées", async () => {
    const ok = await call(app, { url: '/healthz', headers: { origin: 'http://127.0.0.1:7070' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://127.0.0.1:7070');
    const ko = await call(app, { url: '/healthz', headers: { origin: 'https://evil.example' } });
    expect(ko.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('sync', () => {
  it('applique un patch puis le renvoie avec sa version', async () => {
    const m = patch('profile', 'me', { theme: 'light', displayName: 'Daren' });
    const res = await sync(app, { cursor: '0', mutations: [m] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied).toEqual([m.id]);
    expect(body.rejected).toEqual([]);
    expect(body.changes).toEqual([
      {
        collection: 'profile',
        docId: 'me',
        version: body.cursor,
        data: { displayName: 'Daren', currency: 'XOF', theme: 'light' },
      },
    ]);
  });

  it('patch partiel : ne touche pas aux autres champs', async () => {
    await sync(app, { cursor: '0', mutations: [patch('profile', 'me', { displayName: 'A' })] });
    const res = await sync(app, {
      cursor: '0',
      mutations: [patch('profile', 'me', { theme: 'light' })],
    });
    expect(res.json().changes[0].data).toMatchObject({ displayName: 'A', theme: 'light' });
  });

  it('est idempotent : une mutation rejouée ne réécrit pas', async () => {
    const m = patch('profile', 'me', { displayName: 'Premier' });
    await sync(app, { cursor: '0', mutations: [m] });
    await sync(app, {
      cursor: '0',
      mutations: [patch('profile', 'me', { displayName: 'Second' })],
    });
    const replay = await sync(app, { cursor: '0', mutations: [m] });
    expect(replay.json().applied).toEqual([m.id]);
    expect(replay.json().changes[0].data.displayName).toBe('Second');
  });

  it('ne renvoie que les changements après le curseur', async () => {
    const first = await sync(app, {
      cursor: '0',
      mutations: [patch('profile', 'me', { theme: 'light' })],
    });
    const res = await sync(app, { cursor: first.json().cursor, mutations: [] });
    expect(res.json().changes).toEqual([]);
    expect(res.json().cursor).toBe(first.json().cursor);
  });

  it.each([
    [{ theme: 'blue' }],
    [{ currency: 'EUR' }],
    [{ displayName: 'x'.repeat(61) }],
    [{ displayName: 42 }],
    [{ role: 'admin' }],
    [{}],
  ])('refuse un patch invalide %j', async (data) => {
    const m = patch('profile', 'me', data);
    const res = await sync(app, { cursor: '0', mutations: [m] });
    expect(res.json().rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
    expect(await db.query('SELECT 1 FROM profiles')).toEqual([]);
  });

  it('refuse une collection inconnue ou un docId invalide', async () => {
    const res = await sync(app, {
      cursor: '0',
      mutations: [
        patch('secrets', 'me', { a: 1 }),
        patch('profile', 'other-uid', { theme: 'light' }),
        patch('note', 'pas-un-uuid', { title: 'x' }),
      ],
    });
    expect(res.json().rejected.map((r) => r.reason)).toEqual([
      'forbidden',
      'invalid_doc_id',
      'invalid_doc_id',
    ]);
  });

  it("une mutation refusée n'empêche pas les autres", async () => {
    const good = patch('profile', 'me', { theme: 'light' });
    const bad = patch('profile', 'me', { theme: 'rose' });
    const res = await sync(app, { cursor: '0', mutations: [bad, good] });
    expect(res.json().applied).toEqual([good.id]);
  });

  it("refuse d'écraser le document d'un autre utilisateur", async () => {
    const id = randomUUID();
    await db.query("INSERT INTO notes (id, user_id, title) VALUES ($1, 'someone-else', 'secret')", [
      id,
    ]);
    const m = patch('note', id, { title: 'piraté' });
    const res = await sync(app, { cursor: '0', mutations: [m] });
    expect(res.json().rejected).toMatchObject([{ id: m.id, reason: 'forbidden' }]);
    expect(res.json().changes).toEqual([]); // la note d'autrui n'est jamais renvoyée
    const [row] = await db.query('SELECT title FROM notes WHERE id = $1', [id]);
    expect(row.title).toBe('secret');
  });

  it('suppression logique propagée comme pierre tombale', async () => {
    const id = randomUUID();
    await sync(app, { cursor: '0', mutations: [patch('note', id, { title: 'à jeter' })] });
    const del = { id: randomUUID(), collection: 'note', docId: id, op: 'delete' };
    const res = await sync(app, { cursor: '0', mutations: [del] });
    expect(res.json().changes).toContainEqual(
      expect.objectContaining({ collection: 'note', docId: id, data: null }),
    );
    expect(await db.query('SELECT deleted_at IS NOT NULL AS d FROM notes')).toEqual([{ d: true }]);
  });

  it('400 sur un corps mal formé', async () => {
    const valid = patch('profile', 'me', { theme: 'light' });
    const bads = [
      { cursor: '-1', mutations: [] },
      { cursor: '0' },
      { cursor: '0', mutations: [], extra: 1 },
      { cursor: '0', mutations: [{ ...valid, id: 'nope' }] },
      { cursor: '0', mutations: [{ ...valid, op: 'drop' }] },
    ];
    for (const body of bads) expect((await sync(app, body)).statusCode).toBe(400);
  });

  it("l'uid vient du jeton, jamais du corps", async () => {
    const m = { ...patch('profile', 'me', { theme: 'light' }), userId: 'stranger-uid' };
    expect((await sync(app, { cursor: '0', mutations: [m] })).statusCode).toBe(400);
  });
});
