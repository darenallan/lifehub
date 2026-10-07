import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkReminder, checkSchedule } from '../src/health.js';
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

const reminder = {
  enabled: true,
  advanceMin: 0,
  repeatEveryMin: 10,
  repeatCount: 2,
  snoozeMin: 15,
  discreet: false,
};
const med = (data = {}) => ({
  name: 'Paracétamol',
  form: 'tablet',
  strength: '500 mg',
  unit: 'comprimé',
  instructions: 'after_meal',
  color: 'blue',
  startDate: '2026-10-01',
  endDate: null,
  active: true,
  notes: null,
  schedule: {
    type: 'daily',
    times: [
      { time: '08:00', amount: 1 },
      { time: '20:00', amount: 0.5 },
    ],
  },
  reminder,
  ...data,
});
const dose = (medId, data = {}) => ({
  medId,
  date: '2026-10-07',
  time: '08:00',
  amount: 1,
  status: 'taken',
  takenAt: '2026-10-07T08:12',
  snoozeUntil: null,
  note: null,
  scheduled: true,
  ...data,
});

describe('médicaments', () => {
  it('stocke planning et rappels en JSON et les renvoie tels quels', async () => {
    const id = randomUUID();
    const res = await send(TOKENS.admin, patch('med', id, med()));
    expect(res.rejected).toEqual([]);
    expect(res.changes.find((c) => c.docId === id).data).toEqual(med());
  });

  it('remplace le planning en entier lors d’un patch', async () => {
    const id = randomUUID();
    await send(TOKENS.admin, patch('med', id, med()));
    const schedule = { type: 'asNeeded', amount: 1, maxPer24h: 4, minGapMin: 240 };
    const res = await send(TOKENS.admin, patch('med', id, { schedule }));
    expect(res.changes.find((c) => c.docId === id).data.schedule).toEqual(schedule);
  });

  it.each([
    [{ form: 'pilule' }],
    [{ endDate: '2026-09-01' }],
    [{ schedule: { type: 'daily', times: [] } }],
    [{ schedule: { type: 'daily', times: [{ time: '25:00', amount: 1 }] } }],
    [{ schedule: { type: 'daily', times: [{ time: '08:00', amount: 0 }] } }],
    [{ schedule: { type: 'daily', times: [{ time: '08:00', amount: 1, dose: 2 }] } }],
    [{ schedule: { type: 'weekdays', times: [{ time: '08:00', amount: 1 }], weekdays: [0] } }],
    [{ schedule: { type: 'asNeeded' } }],
    [{ schedule: [] }],
    [{ reminder: { enabled: true } }],
  ])('refuse %j', async (override) => {
    const res = await send(TOKENS.admin, patch('med', randomUUID(), med(override)));
    expect(res.rejected).toMatchObject([{ reason: 'invalid' }]);
  });

  it("n'expose pas de valeur saisie dans les détails d'un refus", async () => {
    const schedule = { type: 'daily', times: [{ time: 'Doliprane-secret', amount: 1 }] };
    const res = await send(TOKENS.admin, patch('med', randomUUID(), med({ schedule })));
    expect(JSON.stringify(res.rejected)).not.toContain('secret');
  });

  it('un coloc ne peut rien écrire', async () => {
    const res = await sync(
      app,
      { cursor: '0', mutations: [patch('med', randomUUID(), med())] },
      TOKENS.coloc,
    );
    expect(res.statusCode).not.toBe(200);
    expect(await db.query('SELECT 1 FROM meds')).toEqual([]);
  });
});

describe('prises', () => {
  it('pris → annulé (suppression logique) → repris : une seule ligne', async () => {
    const medId = randomUUID();
    const id = randomUUID();
    await send(TOKENS.admin, patch('med', medId, med()));
    await send(TOKENS.admin, patch('doseLog', id, dose(medId)));
    await send(TOKENS.admin, { id: randomUUID(), collection: 'doseLog', docId: id, op: 'delete' });
    await send(TOKENS.admin, patch('doseLog', id, dose(medId, { takenAt: '2026-10-07T09:00' })));
    const rows = await db.query('SELECT taken_at, deleted_at FROM dose_logs');
    expect(rows).toEqual([{ taken_at: '2026-10-07T09:00', deleted_at: null }]);
  });

  it('accepte un report avec heure de fin', async () => {
    const m = patch(
      'doseLog',
      randomUUID(),
      dose(randomUUID(), { status: 'snoozed', takenAt: null, snoozeUntil: '2026-10-07T08:15' }),
    );
    expect((await send(TOKENS.admin, m)).rejected).toEqual([]);
  });

  it.each([
    [{ status: 'taken', takenAt: null }],
    [{ status: 'snoozed', takenAt: null, snoozeUntil: null }],
    [{ amount: 0.333 }],
    [{ amount: 1001 }],
    [{ status: 'missed' }],
    [{ time: '8h' }],
  ])('refuse %j', async (override) => {
    const m = patch('doseLog', randomUUID(), dose(randomUUID(), override));
    expect((await send(TOKENS.admin, m)).rejected).toMatchObject([{ reason: 'invalid' }]);
  });
});

describe('validateurs (unitaires)', () => {
  const times = [{ time: '08:00', amount: 1 }];
  it.each([
    [{ type: 'daily', times }],
    [{ type: 'weekdays', times, weekdays: [1, 3, 5] }],
    [{ type: 'everyNDays', times, interval: 3 }],
    [{ type: 'everyNHours', times, interval: 8 }],
    [{ type: 'cycle', times, cycle: { on: 21, off: 7 } }],
    [{ type: 'monthly', times, monthDay: 31 }],
    [{ type: 'asNeeded', amount: 2, maxPer24h: 6, minGapMin: 240 }],
  ])('planning valide %j', (s) => {
    expect(checkSchedule(s)).toBeNull();
  });

  it.each([
    [{ type: 'everyNHours', times: [...times, { time: '20:00', amount: 1 }], interval: 8 }],
    [{ type: 'everyNDays', times, interval: 1 }],
    [{ type: 'cycle', times, cycle: { on: 0, off: 7 } }],
    [{ type: 'daily', times: [...times, ...times] }],
    [{ type: 'daily', times, extra: true }],
  ])('planning invalide %j', (s) => {
    expect(checkSchedule(s)).not.toBeNull();
  });

  it('rappel : toutes les clés, bornées', () => {
    expect(checkReminder(reminder)).toBeNull();
    expect(checkReminder({ ...reminder, snoozeMin: 1 })).not.toBeNull();
    expect(checkReminder({ ...reminder, sound: true })).not.toBeNull();
  });
});
