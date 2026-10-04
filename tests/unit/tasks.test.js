import { describe, expect, it } from 'vitest';
import {
  compareTasks,
  dueLabel,
  dueReminders,
  nextDueDate,
  nextGoalPosition,
  taskBucket,
  tasksForView,
  timeKey,
} from '../../src/lib/tasks.js';

const TODAY = '2026-10-04';
const t = (id, data = {}) => ({
  id,
  title: id,
  done: false,
  priority: 2,
  dueDate: null,
  dueTime: null,
  recurrence: null,
  doneOn: null,
  ...data,
});

describe('nextDueDate', () => {
  it.each([
    ['2026-10-04', 'daily', '2026-10-05'],
    ['2026-10-31', 'daily', '2026-11-01'],
    ['2026-10-04', 'weekly', '2026-10-11'],
    ['2026-12-28', 'weekly', '2027-01-04'],
    ['2026-10-04', 'monthly', '2026-11-04'],
    ['2026-01-31', 'monthly', '2026-02-28'],
    ['2026-12-15', 'monthly', '2027-01-15'],
  ])('%s + %s → %s', (due, recurrence, expected) => {
    expect(nextDueDate(due, recurrence)).toBe(expected);
  });

  it('refuse une récurrence inconnue', () => {
    expect(() => nextDueDate('2026-10-04', 'yearly')).toThrow(RangeError);
  });
});

describe('classement', () => {
  it.each([
    [t('a', { done: true, dueDate: '2026-10-01' }), 'done'],
    [t('b'), 'someday'],
    [t('c', { dueDate: '2026-10-03' }), 'overdue'],
    [t('d', { dueDate: TODAY }), 'today'],
    [t('e', { dueDate: '2026-10-05' }), 'upcoming'],
  ])('%j → %s', (task, bucket) => {
    expect(taskBucket(task, TODAY)).toBe(bucket);
  });

  it('trie par échéance, heure, priorité, titre ; sans date en dernier', () => {
    const tasks = [
      t('sans-date', { priority: 1 }),
      t('b', { dueDate: TODAY, dueTime: '18:00' }),
      t('a', { dueDate: TODAY, dueTime: '09:00', priority: 3 }),
      t('c', { dueDate: TODAY, priority: 1 }),
      t('hier', { dueDate: '2026-10-03' }),
    ];
    expect([...tasks].sort(compareTasks).map((x) => x.id)).toEqual([
      'hier',
      'a',
      'b',
      'c',
      'sans-date',
    ]);
  });

  it('onglets', () => {
    const tasks = [
      t('retard', { dueDate: '2026-10-01' }),
      t('jour', { dueDate: TODAY }),
      t('demain', { dueDate: '2026-10-05' }),
      t('libre'),
      t('fini-1', { done: true, doneOn: '2026-10-02' }),
      t('fini-2', { done: true, doneOn: '2026-10-03' }),
    ];
    const ids = (view) => tasksForView(tasks, view, TODAY).map((x) => x.id);
    expect(ids('today')).toEqual(['retard', 'jour']);
    expect(ids('upcoming')).toEqual(['demain', 'libre']);
    expect(ids('done')).toEqual(['fini-2', 'fini-1']);
  });
});

describe('libellés', () => {
  it.each([
    [t('x', { dueDate: TODAY, dueTime: '09:00' }), "Aujourd'hui · 09:00"],
    [t('x', { dueDate: '2026-10-05' }), 'Demain'],
    [t('x', { dueDate: '2026-10-09' }), 'ven. 9 oct.'],
    [t('x', { dueDate: '2026-10-01' }), 'En retard · jeu. 1 oct.'],
    [t('x', { dueDate: '2026-10-01', done: true }), 'jeu. 1 oct.'],
    [t('x'), null],
  ])('%j → %s', (task, expected) => {
    expect(dueLabel(task, TODAY)).toBe(expected);
  });
});

describe('rappels', () => {
  it("ne rappelle que les tâches du jour à l'heure passée, une seule fois", () => {
    const tasks = [
      t('passe', { dueDate: TODAY, dueTime: '08:00' }),
      t('plus-tard', { dueDate: TODAY, dueTime: '20:00' }),
      t('sans-heure', { dueDate: TODAY }),
      t('fait', { dueDate: TODAY, dueTime: '07:00', done: true }),
      t('deja', { dueDate: TODAY, dueTime: '07:30' }),
    ];
    const due = dueReminders(tasks, TODAY, '12:00', new Set(['deja']));
    expect(due.map((x) => x.id)).toEqual(['passe']);
  });

  it('timeKey', () => {
    expect(timeKey(new Date(2026, 9, 4, 7, 5))).toBe('07:05');
  });
});

describe('objectifs du jour', () => {
  it('première position libre, null au-delà de 5', () => {
    expect(nextGoalPosition([])).toBe(0);
    expect(nextGoalPosition([{ position: 0 }, { position: 2 }])).toBe(1);
    expect(nextGoalPosition([0, 1, 2, 3, 4].map((position) => ({ position })))).toBeNull();
  });
});
