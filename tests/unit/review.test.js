import { describe, expect, it } from 'vitest';
import { buildReview, weekDayKeys } from '../../src/lib/review.js';

// Semaine 2026-W40 : lundi 28 sept. → dimanche 4 oct. ; W39 : 21 → 27 sept.
const WEEK = '2026-W40';
const sport = { id: 'h1', name: 'Sport', order: 0, active: true };
const lecture = { id: 'h2', name: 'Lecture', order: 1, active: true };
const food = { id: 'c1', name: 'Alimentation', active: true };

const check = (habitId, day) => ({ habitId, day, done: true });
const expense = (amount, date, categoryId = 'c1') => ({ amount, date, categoryId });

function data(overrides = {}) {
  return {
    week: WEEK,
    today: '2026-10-04',
    habits: [sport, lecture],
    checks: [
      ...weekDayKeys(WEEK)
        .slice(0, 6)
        .map((d) => check('h1', d)), // sport 6/7
      check('h2', '2026-09-28'), // lecture 1/7
      check('h1', '2026-09-27'), // semaine précédente : ignoré
    ],
    journal: [
      { day: '2026-09-29', mood: 4, sleepMinutes: 420 },
      { day: '2026-09-30', mood: 3, sleepMinutes: 480 },
    ],
    expenses: [
      expense(10000, '2026-09-29'),
      expense(2000, '2026-10-02'),
      expense(10000, '2026-09-22'),
    ],
    categories: [food],
    tasks: [
      { title: 'a', done: true, doneOn: '2026-09-30', priority: 1 },
      { title: 'b', done: true, doneOn: '2026-09-20', priority: 2 },
      { title: 'c', done: false, dueDate: '2026-10-01', priority: 2 },
    ],
    goals: [
      { day: '2026-09-28', done: true },
      { day: '2026-09-29', done: false },
    ],
    ...overrides,
  };
}

describe('buildReview', () => {
  it('habitudes : progression, meilleure et plus faible', () => {
    const { habits } = buildReview(data());
    expect(habits).toMatchObject({ goal: 14, done: 7, elapsedDays: 7 });
    expect(habits.best).toMatchObject({ habit: sport, done: 6, total: 7 });
    expect(habits.weakest).toMatchObject({ habit: lecture, done: 1 });
    expect(habits.perDay).toHaveLength(7);
  });

  it('semaine en cours : seuls les jours écoulés comptent', () => {
    const { habits } = buildReview(data({ today: '2026-09-30' }));
    expect(habits.elapsedDays).toBe(3);
    expect(habits.goal).toBe(6);
    expect(habits.perDay[6].future).toBe(true);
  });

  it('dépenses : total, comparaison, premier poste', () => {
    const { expenses } = buildReview(data());
    expect(expenses).toMatchObject({ total: 12000, prevTotal: 10000, count: 2, dailyAvg: 1714 });
    expect(expenses.deltaRatio).toBeCloseTo(0.2);
    expect(expenses.byCategory[0].category).toBe(food);
  });

  it('tâches et objectifs de la semaine', () => {
    expect(buildReview(data()).tasks).toEqual({
      tasksDone: 1,
      highPriorityDone: 1,
      overdue: 1,
      goalsTotal: 2,
      goalsDone: 1,
    });
  });

  it('points clés lisibles', () => {
    expect(buildReview(data()).insights).toEqual([
      '50 % des habitudes cochées (7/14).',
      'Meilleure habitude : Sport (6/7 j).',
      'À relancer : Lecture (1/7 j).',
      expect.stringMatching(/^Dépenses en hausse de 20 % : 12.000 FCFA \(contre 10.000 FCFA\)\.$/),
      expect.stringMatching(/^Premier poste : Alimentation \(12.000 FCFA\)\.$/),
      '1 tâche(s) terminée(s).',
      '1 tâche(s) en retard à rattraper.',
      'Objectifs du jour atteints : 1/2.',
      'Sommeil moyen : 7 h 30.',
      'Humeur moyenne : 3,5 / 5.',
    ]);
  });

  it('semaine vide : aucun point inventé', () => {
    const empty = buildReview(
      data({ habits: [], checks: [], journal: [], expenses: [], tasks: [], goals: [] }),
    );
    expect(empty.insights).toEqual([]);
  });

  it('dépenses stables à ±5 %', () => {
    const review = buildReview(
      data({ expenses: [expense(10200, '2026-09-29'), expense(10000, '2026-09-22')] }),
    );
    expect(review.insights).toContainEqual(expect.stringMatching(/^Dépenses stables/));
  });
});
