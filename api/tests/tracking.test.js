import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, sync, TOKENS } from './helpers.js';

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
const changeOf = (res, id) => res.changes.find((c) => c.docId === id)?.data;

const refill = (data = {}) => ({
  medId: randomUUID(),
  qty: 30,
  at: '2026-10-07T18:00',
  price: 2500,
  expenseId: randomUUID(),
  ...data,
});
const measure = (data = {}) => ({
  typeKey: 'bp',
  values: { sys: 125, dia: 82, pulse: 70 },
  at: '2026-10-07T08:00',
  date: '2026-10-07',
  context: 'rest',
  unit: null,
  note: null,
  ...data,
});
const journal = (data = {}) => ({
  date: '2026-10-07',
  energy: 3,
  painLevel: 4,
  painZone: 'Dos',
  symptoms: [{ name: 'Fatigue', severity: 2, note: null }],
  tags: ['Chaleur'],
  note: 'Mauvaise nuit.',
  ...data,
});

describe('stock (7.2)', () => {
  it('ajoute les champs de stock à un médicament existant, sans toucher au reste', async () => {
    const id = randomUUID();
    const med = {
      name: 'Metformine',
      form: 'tablet',
      strength: null,
      unit: 'comprimé',
      instructions: null,
      color: 'green',
      startDate: '2026-10-01',
      endDate: null,
      active: true,
      notes: null,
      schedule: { type: 'daily', times: [{ time: '08:00', amount: 1 }] },
      reminder: {
        enabled: false,
        advanceMin: 0,
        repeatEveryMin: 0,
        repeatCount: 0,
        snoozeMin: 15,
        discreet: false,
      },
    };
    await send(TOKENS.admin, patch('med', id, med));
    const stock = {
      stockQty: 28.5,
      stockAt: '2026-10-07T09:00',
      refillAt: 7,
      pharmacy: 'Pharmacie du Plateau',
      price: 3200,
      packSize: 30,
    };
    const res = await send(TOKENS.admin, patch('med', id, stock));
    expect(changeOf(res, id)).toEqual({ ...med, ...stock });
  });

  it('enregistre un rachat', async () => {
    const id = randomUUID();
    const res = await send(TOKENS.admin, patch('medRefill', id, refill()));
    expect(res.rejected).toEqual([]);
    expect(changeOf(res, id)).toEqual(expect.objectContaining({ qty: 30, price: 2500 }));
  });

  it.each([[{ qty: 0 }], [{ price: 12.5 }], [{ at: 'hier' }], [{ medId: 'x' }]])(
    'refuse le rachat %j',
    async (override) => {
      const res = await send(TOKENS.admin, patch('medRefill', randomUUID(), refill(override)));
      expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
    },
  );
});

describe('mesures (7.3)', () => {
  it('stocke les valeurs en JSON (colonne readings) et les renvoie', async () => {
    const id = randomUUID();
    const res = await send(TOKENS.admin, patch('measure', id, measure()));
    expect(res.rejected).toEqual([]);
    expect(changeOf(res, id)).toEqual(measure());
  });

  it("type personnalisé avec cible saisie par l'utilisateur", async () => {
    const id = randomUUID();
    const type = {
      key: 'c_hydratation',
      label: 'Hydratation',
      unit: 'L',
      custom: true,
      targets: { value: { min: 1.5, max: null } },
    };
    const res = await send(TOKENS.admin, patch('measureType', id, type));
    expect(changeOf(res, id)).toEqual(type);
  });

  it.each([
    [{ values: {} }],
    [{ values: { sys: '125' } }],
    [{ values: { poids: 80 } }],
    [{ values: { value: 1.234 } }],
    [{ typeKey: 'Tension!' }],
    [{ context: 'sieste' }],
  ])('refuse la mesure %j', async (override) => {
    const res = await send(TOKENS.admin, patch('measure', randomUUID(), measure(override)));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });

  it.each([
    [{ value: { min: 5, max: 1 } }],
    [{ value: { min: 1 } }],
    [{ autre: { min: null, max: null } }],
  ])('refuse la cible %j', async (targets) => {
    const type = { key: 'weight', label: 'Poids', unit: 'kg', custom: false, targets };
    const res = await send(TOKENS.admin, patch('measureType', randomUUID(), type));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('journal santé (7.3)', () => {
  it('une ligne par jour, symptômes et tags en listes', async () => {
    const id = randomUUID();
    await send(TOKENS.admin, patch('healthJournal', id, { date: '2026-10-07', energy: 2 }));
    const res = await send(TOKENS.admin, patch('healthJournal', id, journal()));
    expect(changeOf(res, id)).toEqual(journal());
    expect(await db.query('SELECT count(*)::int AS n FROM health_journal')).toEqual([{ n: 1 }]);
  });

  it('une première écriture partielle a des listes vides par défaut', async () => {
    const id = randomUUID();
    const res = await send(
      TOKENS.admin,
      patch('healthJournal', id, { date: '2026-10-07', energy: 4 }),
    );
    expect(changeOf(res, id)).toMatchObject({ energy: 4, symptoms: [], tags: [] });
  });

  it.each([
    [{ energy: 6 }],
    [{ painLevel: 11 }],
    [{ symptoms: { name: 'Fatigue' } }],
    [{ symptoms: [{ name: 'Fatigue', severity: 9, note: null }] }],
    [
      {
        symptoms: [
          { name: 'Toux', severity: 1, note: null },
          { name: 'toux', severity: 2, note: null },
        ],
      },
    ],
    [{ tags: ['a', 'A'] }],
    [{ tags: 'chaleur' }],
  ])('refuse %j', async (override) => {
    const res = await send(TOKENS.admin, patch('healthJournal', randomUUID(), journal(override)));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('droits', () => {
  it('un compte sans accès ne peut rien écrire', async () => {
    const res = await sync(
      app,
      { cursor: '0', mutations: [patch('measure', randomUUID(), measure())] },
      TOKENS.stranger,
    );
    expect(res.statusCode).toBe(403);
    expect(await db.query('SELECT 1 FROM measures')).toEqual([]);
  });
});
