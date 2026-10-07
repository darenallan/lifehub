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

const patch = (collection, docId, data) => ({
  id: randomUUID(),
  collection,
  docId,
  op: 'patch',
  data,
});
const send = (token, ...mutations) =>
  sync(app, { cursor: '0', mutations }, token).then((r) => r.json());
const me = (token) => call(app, { url: '/api/me', token });
const post = (url, token, body) => call(app, { method: 'POST', url, token, body });
const del = (url, token) => call(app, { method: 'DELETE', url, token });

async function createHouse() {
  await me(TOKENS.admin);
  const res = await post('/api/houses', TOKENS.admin, { name: 'Coloc Cocody' });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

/** Maison avec le coloc déjà membre (invitation acceptée). */
async function houseWithColoc() {
  const houseId = await createHouse();
  const invite = await post(`/api/houses/${houseId}/invites`, TOKENS.admin, {
    email: ' COLOC@example.com ',
  });
  expect(invite.statusCode).toBe(201);
  expect((await me(TOKENS.coloc)).statusCode).toBe(200);
  return houseId;
}

const bill = (houseId, data = {}) => ({
  houseId,
  label: 'CIE électricité',
  amount: 18000,
  dueDate: '2026-10-15',
  recurrence: 'monthly',
  paid: false,
  paidOn: null,
  paidBy: null,
  ...data,
});
const stock = (houseId, data = {}) => ({
  houseId,
  name: 'Riz',
  qty: 2.5,
  unit: 'kg',
  minQty: 1,
  location: 'Placard',
  ...data,
});

describe('création de la maison', () => {
  it("seul l'admin crée une maison, une seule fois", async () => {
    await createHouse();
    expect((await post('/api/houses', TOKENS.admin, { name: 'Autre' })).statusCode).toBe(409);
    expect((await post('/api/houses', TOKENS.stranger, { name: 'Squat' })).statusCode).toBe(403);
  });

  it("l'admin voit sa maison et son statut de membre par la sync", async () => {
    const houseId = await createHouse();
    const res = await send(TOKENS.admin);
    expect(res.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'house', docId: houseId }),
        expect.objectContaining({
          collection: 'houseMember',
          data: expect.objectContaining({ role: 'admin', userId: 'admin-uid' }),
        }),
      ]),
    );
  });
});

describe("flux d'invitation", () => {
  it("le coloc invité rejoint à sa première connexion, l'invitation est consommée", async () => {
    const houseId = await houseWithColoc();
    const res = await me(TOKENS.coloc);
    expect(res.json()).toEqual({
      uid: 'coloc-uid',
      email: 'coloc@example.com',
      role: 'member',
      owner: false,
      houses: [houseId],
    });
    const invites = await db.query('SELECT deleted_at IS NOT NULL AS used FROM house_invites');
    expect(invites).toEqual([{ used: true }]);
  });

  it("un compte inconnu (sans invitation) n'obtient rien", async () => {
    await createHouse();
    expect((await me(TOKENS.stranger)).statusCode).toBe(403);
    const res = await sync(app, { cursor: '0', mutations: [] }, TOKENS.stranger);
    expect(res.statusCode).toBe(403);
  });

  it("e-mail non vérifié : l'invitation n'est pas utilisée", async () => {
    const houseId = await createHouse();
    await post(`/api/houses/${houseId}/invites`, TOKENS.admin, { email: 'coloc@example.com' });
    expect((await me(TOKENS.colocUnverified)).statusCode).toBe(403);
    const rows = await db.query('SELECT 1 FROM house_members WHERE user_id = $1', ['coloc-uid']);
    expect(rows).toEqual([]);
  });

  it("seul l'admin de la maison invite ; e-mails invalides refusés", async () => {
    const houseId = await houseWithColoc();
    const url = `/api/houses/${houseId}/invites`;
    expect((await post(url, TOKENS.coloc, { email: 'ami@example.com' })).statusCode).toBe(403);
    expect((await post(url, TOKENS.admin, { email: 'pas-un-email' })).statusCode).toBe(400);
    expect((await post(url, TOKENS.admin, { email: 'admin@example.com' })).statusCode).toBe(400);
    expect((await post(url, TOKENS.admin, { email: 'coloc@example.com' })).statusCode).toBe(409);
  });

  it('le coloc ne voit pas les invitations en attente', async () => {
    const houseId = await houseWithColoc();
    await post(`/api/houses/${houseId}/invites`, TOKENS.admin, { email: 'ami@example.com' });
    const colocView = await send(TOKENS.coloc);
    expect(colocView.changes.some((c) => c.collection === 'houseInvite')).toBe(false);
    const adminView = await send(TOKENS.admin);
    expect(adminView.changes.some((c) => c.collection === 'houseInvite')).toBe(true);
  });
});

describe('droits du coloc', () => {
  it('lit et écrit le stock, le menu et les courses', async () => {
    const houseId = await houseWithColoc();
    const res = await send(
      TOKENS.coloc,
      patch('stockItem', randomUUID(), stock(houseId)),
      patch('shoppingItem', randomUUID(), {
        houseId,
        name: 'Huile',
        qty: '1 L',
        checked: false,
        source: 'manual',
        stockId: null,
      }),
      patch('menuEntry', randomUUID(), {
        houseId,
        week: '2026-W40',
        day: 'mon',
        meal: 'lunch',
        dish: 'Attiéké poisson',
      }),
    );
    expect(res.rejected).toEqual([]);
  });

  it("n'a aucun accès aux données perso de l'admin", async () => {
    await houseWithColoc();
    const res = await send(TOKENS.coloc, patch('task', randomUUID(), { title: 'x' }));
    expect(res.rejected).toMatchObject([{ reason: 'forbidden' }]);
    const personal = ['profile', 'category', 'task', 'expense', 'habit'];
    expect(res.changes.some((c) => personal.includes(c.collection))).toBe(false);
  });

  it("factures : lecture, « payée » à son nom seulement, rien d'autre", async () => {
    const houseId = await houseWithColoc();
    const billId = randomUUID();
    expect((await send(TOKENS.admin, patch('bill', billId, bill(houseId)))).rejected).toEqual([]);

    const attempts = await send(
      TOKENS.coloc,
      patch('bill', randomUUID(), bill(houseId)), // création
      patch('bill', billId, { amount: 1 }), // autre champ
      patch('bill', billId, { paid: true, paidOn: '2026-10-10', paidBy: 'admin-uid' }), // au nom d'un autre
      { id: randomUUID(), collection: 'bill', docId: billId, op: 'delete' },
    );
    expect(attempts.rejected.map((r) => r.reason)).toEqual([
      'forbidden',
      'forbidden',
      'forbidden',
      'forbidden',
    ]);

    const paid = await send(
      TOKENS.coloc,
      patch('bill', billId, { paid: true, paidOn: '2026-10-10', paidBy: 'coloc-uid' }),
    );
    expect(paid.rejected).toEqual([]);
  });

  it('facture récurrente payée : la suivante est créée une seule fois', async () => {
    const houseId = await houseWithColoc();
    const billId = randomUUID();
    await send(TOKENS.admin, patch('bill', billId, bill(houseId, { dueDate: '2026-01-31' })));
    const payment = { paid: true, paidOn: '2026-01-30', paidBy: 'coloc-uid' };
    await send(TOKENS.coloc, patch('bill', billId, payment));
    await send(TOKENS.coloc, patch('bill', billId, { paid: false, paidOn: null, paidBy: null }));
    await send(TOKENS.coloc, patch('bill', billId, payment));
    const rows = await db.query('SELECT due_date FROM bills ORDER BY due_date');
    expect(rows.map((r) => r.due_date)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it("ne peut pas écrire dans la maison d'un autre ni déplacer une donnée", async () => {
    const houseId = await houseWithColoc();
    const otherHouse = randomUUID();
    await db.query("INSERT INTO houses (id, admin_uid, name) VALUES ($1, 'someone', 'Autre')", [
      otherHouse,
    ]);
    const itemId = randomUUID();
    await send(TOKENS.coloc, patch('stockItem', itemId, stock(houseId)));
    const res = await send(
      TOKENS.coloc,
      patch('stockItem', randomUUID(), stock(otherHouse)),
      patch('stockItem', itemId, { houseId: otherHouse }),
    );
    expect(res.rejected.map((r) => r.reason)).toEqual(['forbidden', 'forbidden']);
  });

  it('ne peut pas modifier la maison ni la liste des membres par la sync', async () => {
    const houseId = await houseWithColoc();
    const res = await send(
      TOKENS.coloc,
      patch('house', houseId, { name: 'Pris' }),
      patch('houseMember', randomUUID(), { houseId, role: 'admin' }),
    );
    expect(res.rejected.map((r) => r.reason)).toEqual(['forbidden', 'forbidden']);
  });

  it('quantités de stock : nombres positifs uniquement', async () => {
    const houseId = await houseWithColoc();
    const res = await send(
      TOKENS.coloc,
      patch('stockItem', randomUUID(), stock(houseId, { qty: -1 })),
      patch('stockItem', randomUUID(), stock(houseId, { qty: '2' })),
    );
    expect(res.rejected.map((r) => r.reason)).toEqual(['invalid', 'invalid']);
  });

  it('menu : une seule ligne par semaine, jour et repas', async () => {
    const houseId = await houseWithColoc();
    const entry = { houseId, week: '2026-W40', day: 'mon', meal: 'lunch', dish: 'Garba' };
    await send(TOKENS.coloc, patch('menuEntry', randomUUID(), entry));
    const dup = await send(TOKENS.admin, patch('menuEntry', randomUUID(), entry));
    expect(dup.rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('révocation et départ', () => {
  it("l'admin retire le coloc : plus aucun accès", async () => {
    const houseId = await houseWithColoc();
    const res = await del(`/api/houses/${houseId}/members/coloc-uid`, TOKENS.admin);
    expect(res.statusCode).toBe(200);
    expect((await me(TOKENS.coloc)).statusCode).toBe(403);
    const after = await sync(app, { cursor: '0', mutations: [] }, TOKENS.coloc);
    expect(after.statusCode).toBe(403);
  });

  it("le coloc peut partir, mais ne peut retirer ni l'admin ni un autre", async () => {
    const houseId = await houseWithColoc();
    const url = (uid) => `/api/houses/${houseId}/members/${uid}`;
    expect((await del(url('admin-uid'), TOKENS.coloc)).statusCode).toBe(403);
    expect((await del(url('admin-uid'), TOKENS.admin)).statusCode).toBe(404);
    expect((await del(url('coloc-uid'), TOKENS.coloc)).statusCode).toBe(200);
  });

  it("une invitation annulée n'est plus utilisable", async () => {
    const houseId = await createHouse();
    const invite = await post(`/api/houses/${houseId}/invites`, TOKENS.admin, {
      email: 'coloc@example.com',
    });
    await del(`/api/houses/${houseId}/invites/${invite.json().id}`, TOKENS.admin);
    expect((await me(TOKENS.coloc)).statusCode).toBe(403);
  });
});
