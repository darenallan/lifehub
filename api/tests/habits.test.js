import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, sync } from './helpers.js';

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
const send = (...mutations) => sync(app, { cursor: '0', mutations }).then((r) => r.json());

const habit = (data = {}) => ({ name: 'Sport', emoji: '🏃', order: 0, active: true, ...data });

describe('habitudes', () => {
  it('crée une habitude puis coche une case', async () => {
    const habitId = randomUUID();
    const checkId = randomUUID();
    const res = await send(
      patch('habit', habitId, habit()),
      patch('habitCheck', checkId, { habitId, day: '2026-10-04', done: true }),
    );
    expect(res.rejected).toEqual([]);
    expect(res.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'habit', docId: habitId, data: habit() }),
        expect.objectContaining({
          collection: 'habitCheck',
          docId: checkId,
          data: { habitId, day: '2026-10-04', done: true },
        }),
      ]),
    );
  });

  it('décocher = patch done:false sur la même ligne', async () => {
    const habitId = randomUUID();
    const checkId = randomUUID();
    await send(patch('habit', habitId, habit()));
    await send(patch('habitCheck', checkId, { habitId, day: '2026-10-04', done: true }));
    await send(patch('habitCheck', checkId, { done: false }));
    const rows = await db.query('SELECT done FROM habit_checks');
    expect(rows).toEqual([{ done: false }]);
  });

  it("refuse de cocher l'habitude d'un autre utilisateur", async () => {
    const foreignHabit = randomUUID();
    await db.query("INSERT INTO habits (id, user_id, name) VALUES ($1, 'someone-else', 'Secret')", [
      foreignHabit,
    ]);
    const m = patch('habitCheck', randomUUID(), {
      habitId: foreignHabit,
      day: '2026-10-04',
      done: true,
    });
    const res = await send(m);
    expect(res.rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
  });

  it('refuse une case en double pour la même habitude et le même jour', async () => {
    const habitId = randomUUID();
    await send(patch('habit', habitId, habit()));
    await send(patch('habitCheck', randomUUID(), { habitId, day: '2026-10-04', done: true }));
    const dup = patch('habitCheck', randomUUID(), { habitId, day: '2026-10-04', done: true });
    expect((await send(dup)).rejected).toMatchObject([{ id: dup.id, reason: 'invalid' }]);
  });

  it.each([
    ['habit', habit({ name: '' })],
    ['habit', habit({ name: 'x'.repeat(61) })],
    ['habit', habit({ order: 1.5 })],
    ['habit', habit({ active: 'oui' })],
    ['habitDay', { day: '2026-10-04', mood: 6 }],
    ['habitDay', { day: '2026-10-04', mood: 0 }],
    ['habitDay', { day: '2026-10-04', sleepMinutes: 1441 }],
    ['habitDay', { day: '04/10/2026', mood: 3 }],
    ['habitDay', { day: '2026-13-01', mood: 3 }],
    ['habitCheck', { habitId: 'pas-un-uuid', day: '2026-10-04', done: true }],
  ])('refuse %s %j', async (collection, data) => {
    const m = patch(collection, randomUUID(), data);
    expect((await send(m)).rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
  });

  it('journal du jour : humeur et sommeil, effaçables', async () => {
    const id = randomUUID();
    await send(patch('habitDay', id, { day: '2026-10-04', mood: 4, sleepMinutes: 450 }));
    const res = await send(patch('habitDay', id, { mood: null }));
    expect(res.changes.find((c) => c.docId === id).data).toEqual({
      day: '2026-10-04',
      mood: null,
      sleepMinutes: 450,
    });
  });

  it('un jour de journal par utilisateur et par jour', async () => {
    await send(patch('habitDay', randomUUID(), { day: '2026-10-04', mood: 3 }));
    const dup = patch('habitDay', randomUUID(), { day: '2026-10-04', mood: 5 });
    expect((await send(dup)).rejected).toMatchObject([{ id: dup.id, reason: 'invalid' }]);
  });
});
