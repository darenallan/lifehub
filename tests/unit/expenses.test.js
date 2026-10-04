import { describe, expect, it } from 'vitest';
import {
  activeCategories,
  budgetStatus,
  dailyTotals,
  elapsedDays,
  firstRecurringMonth,
  groupByDay,
  occurrenceDate,
  parseBudget,
  planRecurring,
  sumAmounts,
  totalBudget,
  totalsByCategory,
} from '../../src/lib/expenses.js';

const food = { id: 'c1', name: 'Alimentation', order: 0, active: true, monthlyBudget: 100000 };
const taxi = { id: 'c2', name: 'Transport', order: 1, active: true, monthlyBudget: 0 };
const old = { id: 'c3', name: 'Ancienne', order: 2, active: false, monthlyBudget: 50000 };

const e = (amount, categoryId, date) => ({ amount, categoryId, date });
const expenses = [
  e(2500, 'c1', '2026-10-04'),
  e(1000, 'c2', '2026-10-04'),
  e(12000, 'c1', '2026-10-02'),
  e(500, 'gone', '2026-10-02'),
];

describe('agrégations', () => {
  it('somme en entiers', () => {
    expect(sumAmounts(expenses)).toBe(16000);
    expect(sumAmounts([])).toBe(0);
  });

  it('groupe par jour, du plus récent, gros montants en tête', () => {
    const groups = groupByDay(expenses);
    expect(groups.map((g) => [g.day, g.total])).toEqual([
      ['2026-10-04', 3500],
      ['2026-10-02', 12500],
    ]);
    expect(groups[1].items[0].amount).toBe(12000);
  });

  it('totaux par catégorie, catégorie supprimée = null', () => {
    const totals = totalsByCategory(expenses, [food, taxi]);
    expect(totals.map((t) => [t.categoryId, t.total])).toEqual([
      ['c1', 14500],
      ['c2', 1000],
      ['gone', 500],
    ]);
    expect(totals[0].share).toBeCloseTo(14500 / 16000);
    expect(totals[2].category).toBeNull();
  });

  it('totaux par jour', () => {
    expect(dailyTotals(expenses, ['2026-10-01', '2026-10-02', '2026-10-04'])).toEqual([
      0, 12500, 3500,
    ]);
  });

  it('catégories actives triées, budget total des actives', () => {
    expect(activeCategories([old, taxi, food]).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(totalBudget([food, taxi, old])).toBe(100000);
  });
});

describe('budgets', () => {
  it.each([
    [0, 0, 'none'],
    [50000, 100000, 'ok'],
    [80000, 100000, 'warn'],
    [100000, 100000, 'warn'],
    [100001, 100000, 'over'],
  ])('%d / %d → %s', (spent, budget, state) => {
    expect(budgetStatus(spent, budget).state).toBe(state);
  });

  it('reste à dépenser (négatif si dépassé)', () => {
    expect(budgetStatus(120000, 100000).remaining).toBe(-20000);
  });

  it.each([
    ['', 0],
    ['0', 0],
    ['150 000', 150000],
    ['12,5', null],
    ['-3', null],
  ])('parseBudget(%j) → %j', (input, expected) => {
    expect(parseBudget(input)).toBe(expected);
  });

  it('jours écoulés pour la moyenne', () => {
    expect(elapsedDays('2026-10', '2026-10-04')).toBe(4);
    expect(elapsedDays('2026-09', '2026-10-04')).toBe(30);
    expect(elapsedDays('2026-11', '2026-10-04')).toBe(0);
  });
});

describe('dépenses récurrentes', () => {
  const internet = {
    id: 'r1',
    active: true,
    dayOfMonth: 5,
    startMonth: '2026-08',
    lastMonth: null,
  };

  it('le 31 tombe le dernier jour des mois courts', () => {
    expect(occurrenceDate('2026-02', 31)).toBe('2026-02-28');
    expect(occurrenceDate('2026-10', 31)).toBe('2026-10-31');
  });

  it("rattrape les mois manqués jusqu'à aujourd'hui inclus", () => {
    const plan = planRecurring([internet], '2026-10-05');
    expect(plan.map((p) => p.date)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  });

  it("n'anticipe pas un jour pas encore arrivé", () => {
    const plan = planRecurring([internet], '2026-10-04');
    expect(plan.map((p) => p.month)).toEqual(['2026-08', '2026-09']);
  });

  it('reprend après lastMonth et ignore les modèles en pause', () => {
    expect(planRecurring([{ ...internet, lastMonth: '2026-10' }], '2026-10-20')).toEqual([]);
    expect(planRecurring([{ ...internet, active: false }], '2026-10-20')).toEqual([]);
  });

  it('limite le rattrapage', () => {
    const plan = planRecurring([{ ...internet, startMonth: '2020-01' }], '2026-10-20', 3);
    expect(plan.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('premier mois : ce mois-ci si le jour est à venir, sinon le suivant', () => {
    expect(firstRecurringMonth(20, '2026-10-04')).toBe('2026-10');
    expect(firstRecurringMonth(4, '2026-10-04')).toBe('2026-10');
    expect(firstRecurringMonth(1, '2026-10-04')).toBe('2026-11');
    expect(firstRecurringMonth(1, '2026-12-15')).toBe('2027-01');
  });
});
