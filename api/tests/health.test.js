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

const profile = (data = {}) => ({
  bloodGroup: 'O+',
  allergies: 'Pénicilline\nArachides',
  conditions: 'Asthme',
  emergencyNotes: null,
  heightCm: 178,
  doctorName: 'Dr Kouassi',
  doctorPhone: '+225 07 00 00 00 00',
  disclaimerSeenOn: '2026-10-07',
  ...data,
});
const contact = (data = {}) => ({
  name: 'Awa',
  phone: '+225 01 02 03 04 05',
  relation: 'Sœur',
  order: 0,
  ...data,
});

/** Coloc membre d'une maison : il a un rôle « member », mais aucun droit sur la santé. */
async function addColoc() {
  await call(app, { url: '/api/me', token: TOKENS.admin });
  const house = await call(app, {
    method: 'POST',
    url: '/api/houses',
    token: TOKENS.admin,
    body: { name: 'Coloc' },
  });
  await call(app, {
    method: 'POST',
    url: `/api/houses/${house.json().id}/invites`,
    token: TOKENS.admin,
    body: { email: 'coloc@example.com' },
  });
  await call(app, { url: '/api/me', token: TOKENS.coloc });
}

describe('profil santé', () => {
  it('crée le singleton puis le modifie champ par champ', async () => {
    expect((await send(TOKENS.admin, patch('healthProfile', 'me', profile()))).rejected).toEqual(
      [],
    );
    const res = await send(TOKENS.admin, patch('healthProfile', 'me', { bloodGroup: null }));
    const change = res.changes.find((c) => c.collection === 'healthProfile');
    expect(change).toMatchObject({ docId: 'me', data: profile({ bloodGroup: null }) });
  });

  it.each([
    [{ bloodGroup: 'Z+' }],
    [{ heightCm: 30 }],
    [{ heightCm: 175.5 }],
    [{ allergies: 'x'.repeat(501) }],
    [{ doctorPhone: 'appelle-moi' }],
    [{ disclaimerSeenOn: 'hier' }],
    [{ weight: 80 }],
  ])('refuse %j', async (data) => {
    const res = await send(TOKENS.admin, patch('healthProfile', 'me', data));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });

  it("refuse un autre docId que 'me'", async () => {
    const res = await send(TOKENS.admin, patch('healthProfile', randomUUID(), profile()));
    expect(res.rejected).toMatchObject([{ reason: 'invalid_doc_id' }]);
  });
});

describe("contacts d'urgence", () => {
  it('crée, modifie puis supprime logiquement', async () => {
    const id = randomUUID();
    await send(TOKENS.admin, patch('emergencyContact', id, contact()));
    await send(TOKENS.admin, patch('emergencyContact', id, { relation: null }));
    const res = await send(TOKENS.admin, {
      id: randomUUID(),
      collection: 'emergencyContact',
      docId: id,
      op: 'delete',
    });
    expect(res.changes.find((c) => c.docId === id).data).toBeNull();
    const [row] = await db.query('SELECT relation, deleted_at FROM emergency_contacts');
    expect(row.relation).toBeNull();
    expect(row.deleted_at).not.toBeNull();
  });

  it.each(['15', '185', '(01) 23 45 67'])('accepte le numéro %s', async (phone) => {
    const m = patch('emergencyContact', randomUUID(), contact({ phone }));
    expect((await send(TOKENS.admin, m)).rejected).toEqual([]);
  });

  it.each([[{ name: '' }], [{ phone: '1' }], [{ phone: '07<script>' }], [{ order: -1 }]])(
    'refuse %j',
    async (override) => {
      const m = patch('emergencyContact', randomUUID(), contact(override));
      expect((await send(TOKENS.admin, m)).rejected).toMatchObject([{ reason: 'invalid' }]);
    },
  );
});

describe("droits : la santé est réservée à l'admin", () => {
  it('un coloc ne peut ni écrire ni lire', async () => {
    await send(TOKENS.admin, patch('healthProfile', 'me', profile()));
    await send(TOKENS.admin, patch('emergencyContact', randomUUID(), contact()));
    await addColoc();

    const res = await send(
      TOKENS.coloc,
      patch('healthProfile', 'me', profile()),
      patch('emergencyContact', randomUUID(), contact()),
    );
    expect(res.rejected).toMatchObject([{ reason: 'forbidden' }, { reason: 'forbidden' }]);
    const leaked = res.changes.filter((c) =>
      ['healthProfile', 'emergencyContact'].includes(c.collection),
    );
    expect(leaked).toEqual([]);
  });

  it('un compte inconnu est refusé', async () => {
    const res = await sync(
      app,
      { cursor: '0', mutations: [patch('healthProfile', 'me', profile())] },
      TOKENS.stranger,
    );
    expect(res.statusCode).toBe(403);
  });
});
