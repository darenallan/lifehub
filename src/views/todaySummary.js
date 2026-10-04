// « Ma journée » (chiffres du jour + actions rapides) et « Cette semaine » (revue en cours).
import { reportError, showToast } from '../components/toast.js';
import { dayKey, isoWeekKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { sumAmounts } from '../lib/expenses.js';
import { activeHabits, checkKey, formatPct, indexChecks } from '../lib/habits.js';
import { shiftWeek } from '../lib/house.js';
import { formatXOF } from '../lib/money.js';
import { buildReview } from '../lib/review.js';
import { tasksForView } from '../lib/tasks.js';
import { watchReviewData } from '../repos/review.js';
import { card } from './common.js';
import { openQuickAdd } from './expenseSheets.js';
import { openTaskEditor } from './taskSheet.js';

const ANNOUNCED_KEY = 'lifehub.review.announced';

/**
 * Revue automatique : à la première ouverture d'une nouvelle semaine, on propose la revue
 * de la semaine écoulée (pas au tout premier lancement : il n'y a encore rien à revoir).
 */
function announceWeeklyReview(week) {
  let previous;
  try {
    previous = localStorage.getItem(ANNOUNCED_KEY);
    if (previous === week) return;
    localStorage.setItem(ANNOUNCED_KEY, week);
  } catch {
    return;
  }
  if (previous === null) return;
  const lastWeek = shiftWeek(week, -1);
  showToast('Ta revue de la semaine dernière est prête', {
    actionLabel: 'Voir',
    duration: 8000,
    onAction: () => {
      location.hash = `#/review/${lastWeek}`;
    },
  });
}

const stat = (value, label, href) =>
  h('a', { class: 'day-stat', href }, h('strong', {}, value), h('span', {}, label));

const action = (label, onclick) =>
  h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick }, label);

const shortcut = (label, href) => h('a', { class: 'btn btn--ghost btn--sm', href }, label);

const weekStat = (label, value) =>
  h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));

/** onAddGoal : place le curseur dans le champ « nouvel objectif » de la carte dédiée. */
export function summaryCards({ onAddGoal }) {
  const today = dayKey();
  const week = isoWeekKey(new Date());
  let data = null;

  const stats = h('div', { class: 'day-stats' });
  const dayCard = card({
    title: 'Ma journée',
    iconName: 'today',
    body: [
      stats,
      h(
        'div',
        { class: 'quick-actions' },
        action('+ Dépense', () => openQuickAdd(data?.categories ?? [])),
        action('+ Tâche', () => openTaskEditor(null, { dueDate: today })),
        action('+ Objectif', onAddGoal),
        shortcut('Humeur & sommeil', '#/habits'),
        shortcut('Courses', '#/house/shopping'),
      ),
    ],
  });
  dayCard.classList.add('card--wide');

  const weekBody = h('div', { class: 'stack' });
  const weekCard = card({
    title: 'Cette semaine',
    iconName: 'habits',
    body: weekBody,
    footer: h('a', { class: 'link', href: `#/review/${week}` }, 'Revue complète →'),
  });

  function render() {
    const done = indexChecks(data.checks);
    const habits = activeHabits(data.habits);
    const habitsDone = habits.filter((hb) => done.has(checkKey(hb.id, today))).length;
    const goals = data.goals.filter((g) => g.day === today);
    const spent = sumAmounts(data.expenses.filter((e) => e.date === today));
    mount(
      stats,
      stat(`${habitsDone}/${habits.length}`, 'habitudes', '#/habits'),
      stat(`${goals.filter((g) => g.done).length}/${goals.length}`, 'objectifs', '#/tasks'),
      stat(String(tasksForView(data.tasks, 'today', today).length), 'tâches à faire', '#/tasks'),
      stat(formatXOF(spent), 'dépensé', '#/expenses'),
    );

    const review = buildReview({ ...data, week, today });
    mount(
      weekBody,
      h(
        'dl',
        { class: 'stats' },
        weekStat('Habitudes', formatPct(review.habits.pct)),
        weekStat('Dépenses', formatXOF(review.expenses.total)),
        weekStat('Tâches faites', String(review.tasks.tasksDone)),
        weekStat('Objectifs', `${review.tasks.goalsDone}/${review.tasks.goalsTotal}`),
      ),
      review.insights.length
        ? h(
            'ul',
            { class: 'insights' },
            review.insights.slice(0, 3).map((line) => h('li', {}, line)),
          )
        : h('p', { class: 'empty' }, 'La semaine commence : coche, note, dépense…'),
    );
  }

  const cleanup = watchReviewData((next) => {
    data = next;
    render();
  }, reportError);
  announceWeeklyReview(week);
  return { dayEl: dayCard, weekEl: weekCard, cleanup };
}
