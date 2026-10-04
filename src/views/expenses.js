import { reportError } from '../components/toast.js';
import { barChart } from '../lib/charts.js';
import {
  dayKey,
  formatLongDate,
  formatMonth,
  isMonthKey,
  monthDays,
  monthKey,
  parseDayKey,
  shiftMonth,
} from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import {
  activeCategories,
  budgetStatus,
  dailyTotals,
  elapsedDays,
  groupByDay,
  sumAmounts,
  totalBudget,
  totalsByCategory,
} from '../lib/expenses.js';
import { formatXOF } from '../lib/money.js';
import {
  generateRecurring,
  watchCategories,
  watchMonthExpenses,
  watchRecurring,
} from '../repos/expenses.js';
import { openCategoryManager } from './categoriesManage.js';
import { card } from './common.js';
import {
  categoryLabel,
  openExpenseEditor,
  openQuickAdd,
  openRecurringEditor,
} from './expenseSheets.js';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longLabel = (day) => capitalize(formatLongDate(parseDayKey(day)));
const colorClass = (category) => `cat--${category?.color ?? 'gray'}`;

/** Jauge horizontale ; la largeur passe par une variable CSS posée en CSSOM (CSP). */
export function gauge(ratio, state = 'ok') {
  const fill = h('span', { class: 'gauge__fill' });
  fill.style.setProperty('--p', String(Math.min(Math.max(ratio, 0), 1)));
  return h('span', { class: `gauge gauge--${state}`, 'aria-hidden': 'true' }, fill);
}

/** Jauge + texte « Reste … / Dépassé de … » (null sans budget). */
export function budgetLine(spent, budget) {
  const status = budgetStatus(spent, budget);
  if (status.state === 'none') return null;
  const text =
    status.remaining >= 0
      ? `Reste ${formatXOF(status.remaining)} sur ${formatXOF(budget)}`
      : `Dépassé de ${formatXOF(-status.remaining)} (budget ${formatXOF(budget)})`;
  return h(
    'div',
    { class: 'stack stack--tight' },
    gauge(status.ratio, status.state),
    h('p', { class: `budget-text budget-text--${status.state}` }, text),
  );
}

export function renderExpenses(outlet, { params }) {
  const today = dayKey();
  const wantsQuickAdd = params[0] === 'new'; // raccourci PWA « Dépense rapide »
  const month = isMonthKey(params[0]) ? params[0] : monthKey();
  if (wantsQuickAdd) history.replaceState(null, '', '#/expenses');
  const days = monthDays(month);

  const state = { categories: [], expenses: [], recurring: [], categoriesLoaded: false };
  const quickAdd = () => openQuickAdd(state.categories);

  const header = h(
    'header',
    { class: 'page-header page-header--row' },
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, 'Dépenses'),
      h('h1', { class: 'page-title' }, capitalize(formatMonth(month))),
    ),
    h(
      'div',
      { class: 'row row--wrap' },
      h(
        'a',
        {
          class: 'icon-btn',
          href: `#/expenses/${shiftMonth(month, -1)}`,
          'aria-label': 'Mois précédent',
        },
        '‹',
      ),
      month !== monthKey()
        ? h('a', { class: 'btn btn--ghost btn--sm', href: '#/expenses' }, 'Ce mois-ci')
        : null,
      h(
        'a',
        {
          class: 'icon-btn',
          href: `#/expenses/${shiftMonth(month, 1)}`,
          'aria-label': 'Mois suivant',
        },
        '›',
      ),
      h(
        'button',
        { class: 'btn btn--ghost btn--sm', type: 'button', onclick: openCategoryManager },
        'Catégories',
      ),
      h(
        'button',
        { class: 'btn btn--primary btn--sm desktop-only', type: 'button', onclick: quickAdd },
        '+ Dépense',
      ),
    ),
  );

  const fab = h(
    'button',
    { class: 'fab', type: 'button', 'aria-label': 'Ajouter une dépense', onclick: quickAdd },
    '+',
  );

  const sections = {
    summary: h('section', { class: 'card summary-money' }),
    budgets: h('div'),
    byCategory: h('div'),
    byDay: h('div'),
    list: h('div'),
    recurring: h('div'),
  };

  mount(
    outlet,
    header,
    h(
      'div',
      { class: 'stack' },
      sections.summary,
      h('div', { class: 'grid' }, sections.byCategory, sections.budgets),
      sections.byDay,
      h('div', { class: 'grid grid--wide-left' }, sections.list, sections.recurring),
    ),
    fab,
  );

  function renderSummary(total) {
    const elapsed = elapsedDays(month, today);
    const budget = totalBudget(state.categories);
    mount(
      sections.summary,
      h('p', { class: 'muted' }, 'Total du mois'),
      h('p', { class: 'money-big' }, formatXOF(total)),
      h(
        'p',
        { class: 'muted' },
        `${state.expenses.length} dépense(s)`,
        elapsed > 0 && total > 0
          ? ` · moyenne ${formatXOF(Math.round(total / elapsed))} / jour`
          : '',
      ),
      budgetLine(total, budget),
    );
  }

  function renderBudgets(byCategory) {
    const spentById = new Map(byCategory.map((t) => [t.categoryId, t.total]));
    const tracked = activeCategories(state.categories).filter((c) => c.monthlyBudget > 0);
    mount(
      sections.budgets,
      card({
        title: 'Budgets',
        body: tracked.length
          ? h(
              'ul',
              { class: 'budget-list' },
              tracked.map((c) => {
                const spent = spentById.get(c.id) ?? 0;
                const status = budgetStatus(spent, c.monthlyBudget);
                return h(
                  'li',
                  { class: colorClass(c) },
                  h(
                    'div',
                    { class: 'row budget-list__head' },
                    h('span', { class: 'budget-list__name' }, categoryLabel(c)),
                    h(
                      'span',
                      { class: `budget-text budget-text--${status.state}` },
                      `${formatXOF(spent)} / ${formatXOF(c.monthlyBudget)}`,
                    ),
                  ),
                  gauge(status.ratio, status.state),
                );
              }),
            )
          : h(
              'p',
              { class: 'empty' },
              'Aucun budget défini. Ajoute-en dans « Catégories » pour suivre tes limites.',
            ),
      }),
    );
  }

  function renderByCategory(byCategory) {
    mount(
      sections.byCategory,
      card({
        title: 'Par catégorie',
        body: byCategory.length
          ? h(
              'ul',
              { class: 'share-list' },
              byCategory.map((t) =>
                h(
                  'li',
                  { class: colorClass(t.category) },
                  h(
                    'div',
                    { class: 'row share-list__head' },
                    h('span', { class: 'cat-dot', 'aria-hidden': 'true' }),
                    h('span', { class: 'share-list__name' }, categoryLabel(t.category)),
                    h('span', { class: 'share-list__amount' }, formatXOF(t.total)),
                    h('span', { class: 'share-list__pct' }, `${Math.round(t.share * 100)} %`),
                  ),
                  gauge(t.share, 'cat'),
                ),
              ),
            )
          : h('p', { class: 'empty' }, 'Aucune dépense ce mois-ci.'),
      }),
    );
  }

  function renderByDay() {
    const totals = dailyTotals(state.expenses, days);
    const max = Math.max(0, ...totals);
    mount(
      sections.byDay,
      card({
        title: 'Par jour',
        body: barChart(
          days.map((day, i) => ({
            label: String(Number(day.slice(8))),
            value: max ? totals[i] / max : 0,
            title: `${longLabel(day)} : ${formatXOF(totals[i])}`,
            highlight: day === today,
          })),
          { label: 'Dépenses de chaque jour du mois' },
        ),
      }),
    );
  }

  function expenseRow(e, category) {
    return h(
      'li',
      {},
      h(
        'button',
        {
          class: `expense-row ${colorClass(category)}`,
          type: 'button',
          'aria-label': `Modifier ${formatXOF(e.amount)}, ${categoryLabel(category)}`,
          onclick: () => openExpenseEditor(e, state.categories),
        },
        h('span', { class: 'cat-dot', 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'expense-row__text' },
          h('span', { class: 'expense-row__cat' }, categoryLabel(category)),
          e.note ? h('span', { class: 'expense-row__note' }, e.note) : null,
        ),
        e.recurringId ? h('span', { class: 'badge', title: 'Récurrente' }, '↻') : null,
        h('span', { class: 'expense-row__amount' }, formatXOF(e.amount)),
      ),
    );
  }

  function renderList() {
    const byId = new Map(state.categories.map((c) => [c.id, c]));
    const groups = groupByDay(state.expenses);
    mount(
      sections.list,
      card({
        title: 'Détail',
        body: groups.length
          ? groups.map((g) =>
              h(
                'section',
                { class: 'day-group' },
                h(
                  'h3',
                  { class: 'day-group__title' },
                  h('span', {}, longLabel(g.day)),
                  h('span', { class: 'day-group__total' }, formatXOF(g.total)),
                ),
                h(
                  'ul',
                  { class: 'expense-list' },
                  g.items.map((e) => expenseRow(e, byId.get(e.categoryId) ?? null)),
                ),
              ),
            )
          : [
              h('p', { class: 'empty' }, 'Aucune dépense ce mois-ci.'),
              h(
                'button',
                { class: 'btn btn--primary', type: 'button', onclick: quickAdd },
                'Ajouter une dépense',
              ),
            ],
      }),
    );
  }

  function recurringRow(t, category) {
    return h(
      'li',
      {},
      h(
        'button',
        {
          class: `expense-row ${colorClass(category)}${t.active ? '' : ' is-paused'}`,
          type: 'button',
          onclick: () => openRecurringEditor(state.categories, t),
        },
        h('span', { class: 'cat-dot', 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'expense-row__text' },
          h('span', { class: 'expense-row__cat' }, t.note || categoryLabel(category)),
          h(
            'span',
            { class: 'expense-row__note' },
            t.active ? `Le ${t.dayOfMonth} de chaque mois` : 'En pause',
          ),
        ),
        h('span', { class: 'expense-row__amount' }, formatXOF(t.amount)),
      ),
    );
  }

  function renderRecurring() {
    const byId = new Map(state.categories.map((c) => [c.id, c]));
    const templates = [...state.recurring].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.dayOfMonth - b.dayOfMonth,
    );
    mount(
      sections.recurring,
      card({
        title: 'Récurrentes',
        body: [
          templates.length
            ? h(
                'ul',
                { class: 'expense-list' },
                templates.map((t) => recurringRow(t, byId.get(t.categoryId))),
              )
            : h('p', { class: 'empty' }, 'Loyer, internet, abonnements… ajoutés automatiquement.'),
          h(
            'button',
            {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              onclick: () => openRecurringEditor(state.categories),
            },
            '+ Récurrente',
          ),
        ],
      }),
    );
  }

  function render() {
    const total = sumAmounts(state.expenses);
    const byCategory = totalsByCategory(state.expenses, state.categories);
    renderSummary(total);
    renderBudgets(byCategory);
    renderByCategory(byCategory);
    renderByDay();
    renderList();
    renderRecurring();
  }

  const unsubscribers = [
    watchCategories((all) => {
      state.categories = all;
      if (!state.categoriesLoaded) {
        state.categoriesLoaded = true;
        if (wantsQuickAdd) quickAdd();
      }
      render();
    }, reportError),
    watchMonthExpenses(
      month,
      (expenses) => {
        state.expenses = expenses;
        render();
      },
      reportError,
    ),
    watchRecurring((templates) => {
      state.recurring = templates;
      render();
      // Après une sync, de nouveaux modèles peuvent être arrivés.
      generateRecurring().catch(reportError);
    }, reportError),
  ];

  return () => unsubscribers.forEach((u) => u());
}
