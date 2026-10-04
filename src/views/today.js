import { reportError } from '../components/toast.js';
import { dayKey, formatLongDate, monthKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { activeHabits, checkKey, indexChecks } from '../lib/habits.js';
import { setCheck, watchHabits, watchMonthLogs } from '../repos/habits.js';
import { sumAmounts, totalBudget } from '../lib/expenses.js';
import { formatXOF } from '../lib/money.js';
import { generateRecurring, watchCategories, watchMonthExpenses } from '../repos/expenses.js';
import { watchProfile } from '../repos/profile.js';
import { card, emptyState, pageHeader } from './common.js';
import { billsDueSoon } from '../lib/house.js';
import { tasksForView } from '../lib/tasks.js';
import { watchHouse } from '../repos/house.js';
import { unpaidBillRow } from './house/bills.js';
import { watchTasks } from '../repos/tasks.js';
import { openQuickAdd } from './expenseSheets.js';
import { budgetLine } from './expenses.js';
import { goalsCard } from './goals.js';
import { taskRow } from './tasks.js';

const firstName = (displayName) => (displayName ?? '').trim().split(/\s+/)[0] ?? '';

/** Habitudes du jour, cochables directement. */
function habitsTodayCard() {
  const today = dayKey();
  const state = { habits: [], checks: [] };
  const body = h('div', { class: 'stack' });
  const counter = h('span', { class: 'card__meta' });
  const el = card({
    title: 'Habitudes du jour',
    iconName: 'habits',
    body,
    footer: h('a', { class: 'link', href: '#/habits' }, 'Voir le mois →'),
  });
  el.querySelector('.card__title').append(counter);

  function render() {
    const habits = activeHabits(state.habits);
    if (!habits.length) {
      counter.textContent = '';
      mount(body, emptyState("Aucune habitude pour l'instant."));
      return;
    }
    const done = indexChecks(state.checks);
    const n = habits.filter((hb) => done.has(checkKey(hb.id, today))).length;
    counter.textContent = `${n}/${habits.length}`;
    mount(
      body,
      h(
        'div',
        { class: 'chips' },
        habits.map((habit) => {
          const pressed = done.has(checkKey(habit.id, today));
          return h(
            'button',
            {
              class: 'chip chip--toggle',
              type: 'button',
              'aria-pressed': String(pressed),
              onclick: () => setCheck(habit.id, today, !pressed).catch(reportError),
            },
            habit.emoji ? `${habit.emoji} ${habit.name}` : habit.name,
          );
        }),
      ),
    );
  }

  const unsubscribers = [
    watchHabits((all) => {
      state.habits = all;
      render();
    }, reportError),
    watchMonthLogs(
      monthKey(),
      ({ checks }) => {
        state.checks = checks;
        render();
      },
      reportError,
    ),
  ];
  return { el, cleanup: () => unsubscribers.forEach((u) => u()) };
}

/** Dépense du jour, budget restant du mois, ajout rapide. */
function spendingTodayCard() {
  const today = dayKey();
  const state = { categories: [], expenses: [] };
  const body = h('div', { class: 'stack' });
  const el = card({
    title: 'Dépense du jour',
    iconName: 'expenses',
    body,
    footer: h(
      'div',
      { class: 'row row--between' },
      h('a', { class: 'link', href: '#/expenses' }, 'Voir le mois →'),
      h(
        'button',
        {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          onclick: () => openQuickAdd(state.categories),
        },
        '+ Dépense',
      ),
    ),
  });

  function render() {
    const todayTotal = sumAmounts(state.expenses.filter((e) => e.date === today));
    const monthTotal = sumAmounts(state.expenses);
    mount(
      body,
      h('p', { class: 'money-big' }, formatXOF(todayTotal)),
      h('p', { class: 'muted' }, `Ce mois-ci : ${formatXOF(monthTotal)}`),
      budgetLine(monthTotal, totalBudget(state.categories)),
    );
  }

  const unsubscribers = [
    watchCategories((all) => {
      state.categories = all;
      render();
    }, reportError),
    watchMonthExpenses(
      monthKey(),
      (expenses) => {
        state.expenses = expenses;
        render();
      },
      reportError,
    ),
  ];
  // Les dépenses récurrentes dues apparaissent dès l'ouverture de l'app.
  generateRecurring().catch(reportError);
  return { el, cleanup: () => unsubscribers.forEach((u) => u()) };
}

/** Factures de la maison non payées : en retard ou dues sous 7 jours. */
function billsTodayCard() {
  const today = dayKey();
  const body = h('div');
  const el = card({
    title: 'Factures proches',
    iconName: 'house',
    body,
    footer: h('a', { class: 'link', href: '#/house/bills' }, 'Toutes les factures →'),
  });

  const cleanup = watchHouse(({ house, bills }) => {
    const due = billsDueSoon(bills, today);
    mount(
      body,
      !house
        ? emptyState('Pas encore de maison : crée-la dans « Maison ».')
        : due.length
          ? h(
              'ul',
              { class: 'bill-list' },
              due.map((b) => unpaidBillRow(b, { isAdmin: true, today })),
            )
          : emptyState('Aucune facture dans les 7 prochains jours.'),
    );
  }, reportError);
  return { el, cleanup };
}

/** Tâches en retard et du jour (5 premières), cochables. */
function tasksTodayCard() {
  const today = dayKey();
  const body = h('div');
  const counter = h('span', { class: 'card__meta' });
  const el = card({
    title: 'Tâches du jour',
    iconName: 'tasks',
    body,
    footer: h('a', { class: 'link', href: '#/tasks' }, 'Toutes les tâches →'),
  });
  el.querySelector('.card__title').append(counter);

  const cleanup = watchTasks((all) => {
    const due = tasksForView(all, 'today', today);
    counter.textContent = due.length ? String(due.length) : '';
    mount(
      body,
      due.length
        ? h(
            'ul',
            { class: 'tasks' },
            due.slice(0, 5).map((t) => taskRow(t, today)),
          )
        : emptyState("Rien de prévu aujourd'hui."),
      due.length > 5 ? h('p', { class: 'muted' }, `+ ${due.length - 5} autre(s)`) : null,
    );
  }, reportError);
  return { el, cleanup };
}

export function renderToday(outlet, { user }) {
  const header = pageHeader('Bonjour', formatLongDate());
  const title = header.querySelector('.page-title');
  const goals = goalsCard();
  const tasks = tasksTodayCard();
  const habits = habitsTodayCard();
  const spending = spendingTodayCard();
  const bills = billsTodayCard();

  const grid = h('div', { class: 'grid' }, goals.el, tasks.el, habits.el, spending.el, bills.el);

  mount(outlet, header, grid);

  // Le profil est créé côté serveur au premier GET /api/me, puis arrive par la sync.
  const unsubscribeProfile = watchProfile((profile) => {
    const name = profile?.displayName || firstName(user.displayName);
    title.textContent = name ? `Bonjour ${name}` : 'Bonjour';
  }, reportError);

  return () => {
    unsubscribeProfile();
    goals.cleanup();
    tasks.cleanup();
    habits.cleanup();
    spending.cleanup();
    bills.cleanup();
  };
}
