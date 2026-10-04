// Calculs des dépenses : fonctions pures (entiers FCFA), testées avec Vitest.
import { daysInMonth, shiftMonth } from './dates.js';
import { parseAmount } from './money.js';

export const CATEGORY_COLORS = [
  ['orange', 'Orange'],
  ['blue', 'Bleu'],
  ['green', 'Vert'],
  ['red', 'Rouge'],
  ['purple', 'Violet'],
  ['yellow', 'Jaune'],
  ['teal', 'Turquoise'],
  ['pink', 'Rose'],
  ['gray', 'Gris'],
];

export const sumAmounts = (items) => items.reduce((sum, e) => sum + e.amount, 0);

/** Catégories actives dans l'ordre choisi. */
export function activeCategories(categories) {
  return categories
    .filter((c) => c.active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr'));
}

/** Dépenses groupées par jour, du plus récent au plus ancien. */
export function groupByDay(expenses) {
  const groups = new Map();
  for (const e of expenses) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => b.amount - a.amount),
      total: sumAmounts(items),
    }));
}

/** Total par catégorie (catégorie supprimée → category: null), du plus gros au plus petit. */
export function totalsByCategory(expenses, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const e of expenses) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount);
  const grand = sumAmounts(expenses);
  return [...totals.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      category: byId.get(categoryId) ?? null,
      total,
      share: grand > 0 ? total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Total de chaque jour (même ordre que `days`). */
export function dailyTotals(expenses, days) {
  const totals = new Map(days.map((d) => [d, 0]));
  for (const e of expenses)
    if (totals.has(e.date)) totals.set(e.date, totals.get(e.date) + e.amount);
  return days.map((d) => totals.get(d));
}

/** Somme des budgets des catégories actives (0 = pas de budget). */
export function totalBudget(categories) {
  return categories.filter((c) => c.active).reduce((s, c) => s + (c.monthlyBudget ?? 0), 0);
}

/** État d'une jauge : none (pas de budget), ok, warn (≥ 80 %), over (> 100 %). */
export function budgetStatus(spent, budget) {
  if (!budget) return { state: 'none', ratio: 0, remaining: null };
  const ratio = spent / budget;
  const state = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  return { state, ratio, remaining: budget - spent };
}

/** Budget saisi : vide ou 0 → 0 ; sinon entier positif ; null si invalide. */
export function parseBudget(input) {
  const raw = String(input ?? '').trim();
  if (raw === '' || /^0+$/.test(raw)) return 0;
  return parseAmount(raw);
}

/** Jours écoulés du mois pour la moyenne quotidienne (0 pour un mois futur). */
export function elapsedDays(month, today) {
  const current = today.slice(0, 7);
  if (month < current) return daysInMonth(month);
  if (month > current) return 0;
  return Number(today.slice(8));
}

const pad = (n) => String(n).padStart(2, '0');

/** Date d'occurrence d'un modèle dans un mois (le 31 devient le dernier jour du mois). */
export function occurrenceDate(month, dayOfMonth) {
  return `${month}-${pad(Math.min(dayOfMonth, daysInMonth(month)))}`;
}

/**
 * Occurrences de dépenses récurrentes à créer jusqu'à aujourd'hui inclus.
 * On repart du mois suivant lastMonth (ou de startMonth) ; rattrapage limité à maxMonths.
 */
export function planRecurring(templates, today, maxMonths = 12) {
  const current = today.slice(0, 7);
  const earliest = shiftMonth(current, -(maxMonths - 1));
  const plan = [];
  for (const template of templates) {
    if (!template.active) continue;
    let month = template.lastMonth ? shiftMonth(template.lastMonth, 1) : template.startMonth;
    if (month < earliest) month = earliest;
    while (month <= current) {
      const date = occurrenceDate(month, template.dayOfMonth);
      if (date > today) break;
      plan.push({ template, month, date });
      month = shiftMonth(month, 1);
    }
  }
  return plan;
}

/** Premier mois d'un nouveau modèle : ce mois-ci si le jour n'est pas passé, sinon le suivant. */
export function firstRecurringMonth(dayOfMonth, today) {
  const current = today.slice(0, 7);
  return occurrenceDate(current, dayOfMonth) >= today ? current : shiftMonth(current, 1);
}
