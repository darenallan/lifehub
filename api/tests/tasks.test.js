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

const goal = (position, data = {}) => ({
  day: '2026-10-04',
  position,
  text: `Objectif ${position}`,
  done: false,
  ...data,
});
const task = (data = {}) => ({
  title: 'Payer le loyer',
  done: false,
  priority: 1,
  dueDate: '2026-10-05',
  dueTime: '09:00',
  recurrence: 'monthly',
  doneOn: null,
  ...data,
});

describe('objectifs du jour', () => {
  it('5 objectifs maximum : positions 0 à 4', async () => {
    const ok = [0, 1, 2, 3, 4].map((p) => patch('dailyGoal', randomUUID(), goal(p)));
    expect((await send(...ok)).rejected).toEqual([]);
    const sixth = patch('dailyGoal', randomUUID(), goal(5));
    expect((await send(sixth)).rejected).toMatchObject([{ reason: 'invalid' }]);
  });

  it('une seule ligne par jour et par position', async () => {
    await send(patch('dailyGoal', randomUUID(), goal(0)));
    const dup = patch('dailyGoal', randomUUID(), goal(0, { text: 'Autre' }));
    expect((await send(dup)).rejected).toMatchObject([{ id: dup.id, reason: 'invalid' }]);
  });

  it('cocher puis décocher', async () => {
    const id = randomUUID();
    await send(patch('dailyGoal', id, goal(0)));
    const res = await send(patch('dailyGoal', id, { done: true }));
    expect(res.changes.find((c) => c.docId === id).data.done).toBe(true);
  });

  it.each([[{ text: '' }], [{ text: 'x'.repeat(121) }], [{ day: 'hier' }], [{ position: -1 }]])(
    'refuse %j',
    async (override) => {
      const m = patch('dailyGoal', randomUUID(), goal(0, override));
      expect((await send(m)).rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
    },
  );
});

describe('tâches', () => {
  it('crée une tâche complète', async () => {
    const id = randomUUID();
    const res = await send(patch('task', id, task()));
    expect(res.rejected).toEqual([]);
    expect(res.changes.find((c) => c.docId === id).data).toEqual(task());
  });

  it('tâche minimale sans échéance', async () => {
    const m = patch(
      'task',
      randomUUID(),
      task({ dueDate: null, dueTime: null, recurrence: null, priority: 3 }),
    );
    expect((await send(m)).rejected).toEqual([]);
  });

  it('terminer enregistre le jour de réalisation', async () => {
    const id = randomUUID();
    await send(patch('task', id, task()));
    await send(patch('task', id, { done: true, doneOn: '2026-10-05' }));
    const [row] = await db.query('SELECT done, done_on FROM tasks');
    expect(row).toEqual({ done: true, done_on: '2026-10-05' });
  });

  it.each([
    [{ priority: 0 }],
    [{ priority: 4 }],
    [{ recurrence: 'hourly' }],
    [{ dueTime: '25:00' }],
    [{ dueTime: '9h' }],
    [{ title: '' }],
    [{ title: 'x'.repeat(201) }],
    [{ dueDate: null }], // récurrence sans échéance
    [{ dueDate: null, recurrence: null }], // heure sans date
  ])('refuse %j', async (override) => {
    const m = patch('task', randomUUID(), task(override));
    expect((await send(m)).rejected).toMatchObject([{ id: m.id, reason: 'invalid' }]);
  });
});
