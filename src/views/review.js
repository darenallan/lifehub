// Revue hebdomadaire complète : #/review/YYYY-Www (semaine en cours par défaut).
import { reportError } from '../components/toast.js';
import { barChart, ring } from '../lib/charts.js';
import { dayKey, isoWeekKey, parseDayKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { formatPct, formatSleep } from '../lib/habits.js';
import { isWeekKey, shiftWeek } from '../lib/house.js';
import { formatXOF } from '../lib/money.js';
import { buildReview, weekDayKeys } from '../lib/review.js';
import { watchReviewData } from '../repos/review.js';
import { card } from './common.js';
import { categoryLabel } from './expenseSheets.js';
import { gauge } from './expenses.js';

const INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmt = (key) => shortDate.format(parseDayKey(key));
const formatMood = (mood) => (mood == null ? '—' : `${mood.toFixed(1).replace('.', ',')} / 5`);

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, String(value)));
}

function insightsCard(review) {
  return card({
    title: 'Points clés',
    iconName: 'today',
    body: review.insights.length
      ? h(
          'ul',
          { class: 'insights' },
          review.insights.map((line) => h('li', {}, line)),
        )
      : h('p', { class: 'empty' }, 'Pas encore de données pour cette semaine.'),
  });
}

function habitsCard({ habits }) {
  const today = dayKey();
  return card({
    title: 'Habitudes',
    iconName: 'habits',
    body: [
      h(
        'div',
        { class: 'summary' },
        ring(habits.pct, { size: 112, label: 'Habitudes de la semaine' }),
        h(
          'dl',
          { class: 'stats' },
          stat('Cochées', habits.done),
          stat('Objectif', habits.goal),
          stat('Jours comptés', habits.elapsedDays),
          stat('Habitudes', habits.perHabit.length),
        ),
      ),
      barChart(
        habits.perDay.map((d, i) => ({
          label: INITIALS[i],
          value: d.future ? 0 : d.pct,
          title: d.future ? `${fmt(d.day)} : à venir` : `${fmt(d.day)} : ${formatPct(d.pct)}`,
          highlight: d.day === today,
        })),
        { label: 'Pourcentage réalisé par jour', height: 64 },
      ),
      habits.perHabit.length
        ? h(
            'ul',
            { class: 'review-list' },
            habits.perHabit.map((p) =>
              h(
                'li',
                {},
                h('span', {}, `${p.habit.emoji ? `${p.habit.emoji} ` : ''}${p.habit.name}`),
                h('strong', {}, `${p.done}/${p.total}`),
              ),
            ),
          )
        : null,
    ],
  });
}

function expensesCard({ expenses }) {
  const comparison =
    expenses.deltaRatio === null
      ? 'Pas de dépenses la semaine précédente.'
      : `${expenses.deltaRatio >= 0 ? '+' : '−'}${formatPct(Math.abs(expenses.deltaRatio))} par rapport à la semaine précédente (${formatXOF(expenses.prevTotal)}).`;
  return card({
    title: 'Dépenses',
    iconName: 'expenses',
    body: [
      h('p', { class: 'money-big' }, formatXOF(expenses.total)),
      h('p', { class: 'muted' }, comparison),
      expenses.count
        ? h(
            'p',
            { class: 'muted' },
            `${expenses.count} dépense(s) · ${formatXOF(expenses.dailyAvg)} / jour`,
          )
        : null,
      expenses.byCategory.length
        ? h(
            'ul',
            { class: 'share-list' },
            expenses.byCategory
              .slice(0, 5)
              .map((t) =>
                h(
                  'li',
                  { class: `cat--${t.category?.color ?? 'gray'}` },
                  h(
                    'div',
                    { class: 'row share-list__head' },
                    h('span', { class: 'cat-dot', 'aria-hidden': 'true' }),
                    h('span', { class: 'share-list__name' }, categoryLabel(t.category)),
                    h('span', { class: 'share-list__amount' }, formatXOF(t.total)),
                  ),
                  gauge(t.share, 'cat'),
                ),
              ),
          )
        : null,
    ],
  });
}

function tasksCard({ tasks }) {
  return card({
    title: 'Tâches et objectifs',
    iconName: 'tasks',
    body: h(
      'dl',
      { class: 'stats' },
      stat('Tâches terminées', tasks.tasksDone),
      stat('Dont prioritaires', tasks.highPriorityDone),
      stat('En retard', tasks.overdue),
      stat('Objectifs atteints', `${tasks.goalsDone}/${tasks.goalsTotal}`),
    ),
  });
}

function journalCard({ journal }) {
  return card({
    title: 'Humeur et sommeil',
    iconName: 'habits',
    body: h(
      'dl',
      { class: 'stats' },
      stat('Humeur moyenne', formatMood(journal.mood)),
      stat('Sommeil moyen', formatSleep(journal.sleepMinutes)),
    ),
  });
}

export function renderReview(outlet, { params }) {
  const current = isoWeekKey(new Date());
  // Clés 'YYYY-Www' comparables en texte ; pas de revue d'une semaine future.
  const week = isWeekKey(params[0]) && params[0] <= current ? params[0] : current;
  const days = weekDayKeys(week);

  const nav = h(
    'div',
    { class: 'row' },
    h(
      'a',
      {
        class: 'icon-btn',
        href: `#/review/${shiftWeek(week, -1)}`,
        'aria-label': 'Semaine précédente',
      },
      '‹',
    ),
    week !== current
      ? h('a', { class: 'btn btn--ghost btn--sm', href: '#/review' }, 'Cette semaine')
      : null,
    week !== current
      ? h(
          'a',
          {
            class: 'icon-btn',
            href: `#/review/${shiftWeek(week, 1)}`,
            'aria-label': 'Semaine suivante',
          },
          '›',
        )
      : null,
  );

  const body = h('div', { class: 'stack' });
  mount(
    outlet,
    h(
      'header',
      { class: 'page-header page-header--row' },
      h(
        'div',
        {},
        h(
          'p',
          { class: 'eyebrow' },
          week === current ? 'Revue de la semaine en cours' : 'Revue de la semaine',
        ),
        h('h1', { class: 'page-title' }, `Du ${fmt(days[0])} au ${fmt(days[6])}`),
      ),
      nav,
    ),
    body,
  );

  return watchReviewData((data) => {
    const review = buildReview({ ...data, week, today: dayKey() });
    mount(
      body,
      insightsCard(review),
      h('div', { class: 'grid' }, habitsCard(review), expensesCard(review)),
      h('div', { class: 'grid' }, tasksCard(review), journalCard(review)),
    );
  }, reportError);
}
