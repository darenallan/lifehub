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

const doctor = (data = {}) => ({
  name: 'Dr Kouassi',
  kind: 'doctor',
  specialty: 'Cardiologue',
  phone: '+225 07 00 00 00 00',
  address: 'Cocody, Abidjan',
  notes: null,
  ...data,
});
const appointment = (data = {}) => ({
  doctorId: randomUUID(),
  at: '2026-10-20T09:30',
  reason: 'Contrôle tension',
  place: null,
  status: 'planned',
  afterNotes: null,
  remindDayBefore: true,
  remindHoursBefore: 2,
  medIds: [randomUUID()],
  ...data,
});
const SAME_ID = randomUUID();

describe('contacts médicaux', () => {
  it('crée un médecin et une pharmacie', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const pharmacy = doctor({ name: 'Pharmacie du Plateau', kind: 'pharmacy', specialty: null });
    const res = await send(
      TOKENS.admin,
      patch('doctor', a, doctor()),
      patch('doctor', b, pharmacy),
    );
    expect(res.rejected).toEqual([]);
    expect(changeOf(res, a)).toEqual(doctor());
  });

  it.each([
    [{ name: '' }],
    [{ kind: 'guérisseur' }],
    [{ phone: 'appelle' }],
    [{ notes: 'x'.repeat(501) }],
  ])('refuse %j', async (override) => {
    const res = await send(TOKENS.admin, patch('doctor', randomUUID(), doctor(override)));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('rendez-vous', () => {
  it('planifie, puis note la consultation et la marque faite', async () => {
    const id = randomUUID();
    await send(TOKENS.admin, patch('appointment', id, appointment()));
    const res = await send(
      TOKENS.admin,
      patch('appointment', id, { status: 'done', afterNotes: 'Continuer le traitement 3 mois.' }),
    );
    expect(changeOf(res, id)).toMatchObject({ status: 'done', remindHoursBefore: 2 });
  });

  it('valeurs par défaut des rappels et des médicaments liés', async () => {
    const id = randomUUID();
    const res = await send(
      TOKENS.admin,
      patch('appointment', id, { at: '2026-10-20T09:30', status: 'planned' }),
    );
    expect(changeOf(res, id)).toMatchObject({
      remindDayBefore: true,
      remindHoursBefore: 2,
      medIds: [],
    });
  });

  it.each([
    [{ at: '20/10/2026' }],
    [{ status: 'reporté' }],
    [{ remindHoursBefore: 49 }],
    [{ medIds: ['pas-un-id'] }],
    [{ medIds: [SAME_ID, SAME_ID] }],
  ])('refuse %j', async (override) => {
    const res = await send(TOKENS.admin, patch('appointment', randomUUID(), appointment(override)));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });

  it("un compte sans accès n'écrit rien", async () => {
    const res = await sync(
      app,
      { cursor: '0', mutations: [patch('appointment', randomUUID(), appointment())] },
      TOKENS.stranger,
    );
    expect(res.statusCode).toBe(403);
    expect(await db.query('SELECT 1 FROM appointments')).toEqual([]);
  });
});
