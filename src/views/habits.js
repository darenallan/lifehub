import { reportError } from '../components/toast.js';
import { barChart, ring } from '../lib/charts.js';
import {
  dayKey,
  formatLongDate,
  formatMonth,
  isMonday,
  isMonthKey,
  monthDays,
  monthKey,
  parseDayKey,
  shiftMonth,
  weekdayInitial,
} from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import {
  activeHabits,
  checkKey,
  currentStreak,
  dailyProgress,
  formatPct,
  formatSleep,
  habitStats,
  indexChecks,
  journalAverages,
  progress,
  topHabits,
  weeklyProgress,
} from '../lib/habits.js';
import { setCheck, setJournal, watchHabits, watchMonthLogs } from '../repos/habits.js';
import { card } from './common.js';
import { habitForm, openHabitManager, suggestionChips } from './habitsManage.js';

const MOODS = [
  { value: 1, emoji: '😫', label: 'Très mauvaise' },
  { value: 2, emoji: '🙁', label: 'Mauvaise' },
  { value: 3, emoji: '😐', label: 'Moyenne' },
  { value: 4, emoji: '🙂', label: 'Bonne' },
  { value: 5, emoji: '😄', label: 'Excellente' },
];
const SLEEP_STEP = 30;
const SLEEP_DEFAULT = 7 * 60;

const cls = (...parts) => parts.filter(Boolean).join(' ');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayNumber = (day) => String(Number(day.slice(8)));
const longLabel = (day) => formatLongDate(parseDayKey(day));

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, String(value)));
}

/** Jour du journal affiché par défaut : aujourd'hui, ou le dernier jour d'un mois passé. */
function defaultJournalDay(days, today) {
  if (days.includes(today)) return today;
  return days[0] < today ? days.at(-1) : null;
}

export function renderHabits(outlet, { params }) {
  const today = dayKey();
  const month = isMonthKey(params[0]) ? params[0] : monthKey();
  const days = monthDays(month);
  const isFuture = (day) => day > today; // comparaison lexicographique valable pour YYYY-MM-DD

  const state = { all: [], checks: [], journal: [], journalDay: defaultJournalDay(days, today) };
  let grid = null; // { signature, scroller, cells: Map, pctCells: Map }

  const header = h(
    'header',
    { class: 'page-header page-header--row' },
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, 'Habitudes'),
      h('h1', { class: 'page-title' }, capitalize(formatMonth(month))),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'a',
        {
          class: 'icon-btn',
          href: `#/habits/${shiftMonth(month, -1)}`,
          'aria-label': 'Mois précédent',
        },
        '‹',
      ),
      month !== monthKey()
        ? h('a', { class: 'btn btn--ghost btn--sm', href: '#/habits' }, 'Ce mois-ci')
        : null,
      h(
        'a',
        {
          class: 'icon-btn',
          href: `#/habits/${shiftMonth(month, 1)}`,
          'aria-label': 'Mois suivant',
        },
        '›',
      ),
      h(
        'button',
        { class: 'btn btn--primary btn--sm', type: 'button', onclick: openHabitManager },
        'Gérer',
      ),
    ),
  );

  const body = h('div', { class: 'stack' });
  const sections = {
    summary: h('section', { class: 'card summary' }),
    gridCard: h('section', { class: 'card card--flush' }),
    daily: h('div'),
    weekly: h('div'),
    analysis: h('div'),
    top: h('div'),
    journal: h('div'),
  };
  let layoutMounted = false;

  mount(outlet, header, body);

  // ---------- Grille ----------

  function toggle(habitId, day, button) {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(next)); // retour immédiat, la sync suit
    setCheck(habitId, day, next).catch(reportError);
  }

  function buildGrid(habits) {
    const cells = new Map();
    const pctCells = new Map();
    const dayClass = (day) => cls(day === today && 'is-today', isMonday(day) && 'is-week-start');

    const head = h(
      'tr',
      {},
      h('th', { class: 'hgrid__name hgrid__corner', scope: 'col' }, 'Habitude'),
      days.map((day) =>
        h(
          'th',
          { scope: 'col', class: cls('hgrid__day', dayClass(day)), abbr: longLabel(day) },
          h('span', { class: 'hgrid__wd' }, weekdayInitial(day)),
          h('span', { class: 'hgrid__dn' }, dayNumber(day)),
        ),
      ),
    );

    const rows = habits.map((habit) =>
      h(
        'tr',
        {},
        h(
          'th',
          { scope: 'row', class: 'hgrid__name' },
          habit.emoji
            ? h('span', { class: 'hgrid__emoji', 'aria-hidden': 'true' }, habit.emoji)
            : null,
          h('span', { class: 'hgrid__label' }, habit.name),
        ),
        days.map((day) => {
          const button = h('button', {
            type: 'button',
            class: 'cell',
            'aria-pressed': 'false',
            'aria-label': `${habit.name}, ${longLabel(day)}`,
            disabled: isFuture(day),
            onclick: () => toggle(habit.id, day, button),
          });
          cells.set(checkKey(habit.id, day), button);
          return h('td', { class: dayClass(day) }, button);
        }),
      ),
    );

    const foot = h(
      'tr',
      {},
      h('th', { scope: 'row', class: 'hgrid__name hgrid__foot' }, '% du jour'),
      days.map((day) => {
        const td = h('td', { class: cls('hgrid__pct', dayClass(day)) });
        pctCells.set(day, td);
        return td;
      }),
    );

    const scroller = h(
      'div',
      { class: 'hgrid-scroll', tabindex: '0', role: 'region', 'aria-label': 'Grille du mois' },
      h(
        'table',
        { class: 'hgrid' },
        h('thead', {}, head),
        h('tbody', {}, rows),
        h('tfoot', {}, foot),
      ),
    );
    return { scroller, cells, pctCells };
  }

  /** Amène la semaine du jour contre la colonne des noms (mobile : défilement par semaine). */
  function scrollToCurrentWeek(scroller) {
    requestAnimationFrame(() => {
      let th = scroller.querySelector('th.is-today');
      if (!th) return;
      while (th.previousElementSibling && !th.classList.contains('is-week-start')) {
        th = th.previousElementSibling;
      }
      const corner = scroller.querySelector('.hgrid__corner');
      scroller.scrollLeft = th.offsetLeft - (corner?.offsetWidth ?? 0);
    });
  }

  function renderGrid(habits, done) {
    const signature = habits.map((hb) => `${hb.id}:${hb.name}:${hb.emoji ?? ''}`).join('|');
    if (grid?.signature !== signature) {
      const scrollLeft = grid?.scroller.scrollLeft;
      grid = { signature, ...buildGrid(habits) };
      mount(sections.gridCard, grid.scroller);
      if (scrollLeft === undefined) scrollToCurrentWeek(grid.scroller);
      else grid.scroller.scrollLeft = scrollLeft;
    }
    for (const [key, button] of grid.cells) {
      button.setAttribute('aria-pressed', String(done.has(key)));
    }
    for (const d of dailyProgress(habits, done, days)) {
      const td = grid.pctCells.get(d.day);
      td.textContent = isFuture(d.day) ? '' : String(Math.round(d.pct * 100));
      td.classList.toggle('is-full', d.pct === 1);
    }
  }

  // ---------- Synthèse, graphiques, analyse ----------

  function renderSummary(habits, done) {
    const p = progress(habits, done, days);
    mount(
      sections.summary,
      ring(p.pct, { label: 'Progression du mois' }),
      h(
        'dl',
        { class: 'stats' },
        stat('Réalisé', p.done),
        stat('Objectif', p.goal),
        stat('Restant', p.remaining),
        stat('Habitudes', habits.length),
      ),
    );
  }

  function renderCharts(habits, done) {
    const daily = dailyProgress(habits, done, days);
    mount(
      sections.daily,
      card({
        title: 'Progression par jour',
        body: barChart(
          daily.map((d) => ({
            label: dayNumber(d.day),
            value: d.pct,
            title: `${longLabel(d.day)} : ${formatPct(d.pct)}`,
            highlight: d.day === today,
          })),
          { label: 'Pourcentage réalisé chaque jour du mois' },
        ),
      }),
    );
    const weekly = weeklyProgress(habits, done, days);
    mount(
      sections.weekly,
      card({
        title: 'Progression par semaine',
        body: barChart(
          weekly.map((w) => ({
            label: `S${Number(w.week.slice(-2))}`,
            value: w.pct,
            title: `Semaine ${Number(w.week.slice(-2))} : ${formatPct(w.pct)} (${w.done}/${w.goal})`,
            highlight: w.days.includes(today),
          })),
          { label: 'Pourcentage réalisé par semaine' },
        ),
      }),
    );
  }

  function renderAnalysis(habits, done) {
    const rows = habitStats(habits, done, days).map((s) =>
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, s.habit.emoji ? `${s.habit.emoji} ` : '', s.habit.name),
        h('td', {}, String(s.goal)),
        h('td', {}, String(s.done)),
        h('td', {}, String(s.remaining)),
        h(
          'td',
          { class: 'analysis__pct' },
          h('progress', { max: 1, value: s.pct, 'aria-hidden': 'true' }),
          h('span', {}, formatPct(s.pct)),
        ),
      ),
    );
    mount(
      sections.analysis,
      card({
        title: 'Analyse',
        body: h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'analysis' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['Habitude', 'Objectif', 'Réalisé', 'Restant', '%'].map((t) =>
                  h('th', { scope: 'col' }, t),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        ),
      }),
    );
  }

  function renderTop(habits, done) {
    const top = topHabits(habits, done, days);
    const medals = ['🥇', '🥈', '🥉'];
    mount(
      sections.top,
      card({
        title: 'Top habitudes',
        body: top.length
          ? h(
              'ol',
              { class: 'top-list' },
              top.map((s, i) => {
                const streak = currentStreak(s.habit.id, done);
                return h(
                  'li',
                  {},
                  h('span', { class: 'top-list__medal', 'aria-hidden': 'true' }, medals[i]),
                  h('span', { class: 'top-list__name' }, s.habit.name),
                  h('span', { class: 'top-list__pct' }, formatPct(s.pct)),
                  streak > 1 ? h('span', { class: 'top-list__streak' }, `🔥 ${streak} j`) : null,
                );
              }),
            )
          : h('p', { class: 'empty' }, 'Coche des cases pour voir ton classement.'),
      }),
    );
  }

  // ---------- Journal : humeur + sommeil ----------

  function renderJournal() {
    const selected = state.journalDay;
    if (!selected) {
      mount(
        sections.journal,
        card({ title: 'Humeur et sommeil', body: h('p', { class: 'empty' }, 'Mois à venir.') }),
      );
      return;
    }
    const entry = state.journal.find((e) => e.day === selected) ?? {};
    const index = days.indexOf(selected);
    const go = (delta) => {
      state.journalDay = days[index + delta];
      renderJournal();
    };

    const nav = h(
      'div',
      { class: 'row journal__nav' },
      h(
        'button',
        {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          'aria-label': 'Jour précédent',
          disabled: index === 0,
          onclick: () => go(-1),
        },
        '‹',
      ),
      h('strong', { class: 'journal__day' }, capitalize(longLabel(selected))),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          'aria-label': 'Jour suivant',
          disabled: index === days.length - 1 || isFuture(days[index + 1]),
          onclick: () => go(1),
        },
        '›',
      ),
    );

    const moods = h(
      'div',
      { class: 'moods', role: 'group', 'aria-label': 'Humeur' },
      MOODS.map((m) =>
        h(
          'button',
          {
            class: 'mood',
            type: 'button',
            'aria-pressed': String(entry.mood === m.value),
            'aria-label': m.label,
            title: m.label,
            onclick: () =>
              setJournal(selected, { mood: entry.mood === m.value ? null : m.value }).catch(
                reportError,
              ),
          },
          m.emoji,
        ),
      ),
    );

    const sleep = entry.sleepMinutes ?? null;
    const setSleep = (value) => setJournal(selected, { sleepMinutes: value }).catch(reportError);
    const sleepRow = h(
      'div',
      { class: 'row sleep' },
      h('span', { class: 'muted' }, 'Sommeil'),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          'aria-label': 'Moins 30 minutes',
          disabled: sleep === 0,
          onclick: () => setSleep(sleep == null ? SLEEP_DEFAULT : Math.max(0, sleep - SLEEP_STEP)),
        },
        '−',
      ),
      h('output', { class: 'sleep__value', 'aria-live': 'polite' }, formatSleep(sleep)),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          'aria-label': 'Plus 30 minutes',
          disabled: sleep === 1440,
          onclick: () =>
            setSleep(sleep == null ? SLEEP_DEFAULT : Math.min(1440, sleep + SLEEP_STEP)),
        },
        '+',
      ),
      sleep != null
        ? h(
            'button',
            { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => setSleep(null) },
            'Effacer',
          )
        : null,
    );

    const avg = journalAverages(state.journal);
    const mood = avg.mood == null ? '—' : avg.mood.toFixed(1).replace('.', ',');
    const averages = h(
      'p',
      { class: 'muted journal__avg' },
      `Moyenne du mois : humeur ${mood} / 5 · sommeil ${formatSleep(avg.sleepMinutes)}`,
    );

    mount(
      sections.journal,
      card({ title: 'Humeur et sommeil', body: [nav, moods, sleepRow, averages] }),
    );
  }

  // ---------- Assemblage ----------

  function renderEmpty() {
    layoutMounted = false;
    grid = null;
    const archived = state.all.filter((hb) => !hb.active).length;
    mount(
      body,
      card({
        title: 'Commence par une habitude',
        body: [
          h(
            'p',
            { class: 'muted' },
            'Ajoute ce que tu veux suivre chaque jour, ou pioche une idée :',
          ),
          habitForm(() => state.all, { autofocus: true }),
          suggestionChips(() => state.all),
          archived
            ? h(
                'p',
                { class: 'muted' },
                `${archived} habitude(s) archivée(s) : « Gérer » pour les réactiver.`,
              )
            : null,
        ],
      }),
    );
  }

  function render() {
    const habits = activeHabits(state.all);
    if (!habits.length) return renderEmpty();
    if (!layoutMounted) {
      mount(
        body,
        sections.summary,
        sections.gridCard,
        h('div', { class: 'grid' }, sections.daily, sections.weekly),
        h(
          'div',
          { class: 'grid' },
          sections.analysis,
          h('div', { class: 'stack' }, sections.top, sections.journal),
        ),
      );
      layoutMounted = true;
    }
    const done = indexChecks(state.checks);
    renderSummary(habits, done);
    renderGrid(habits, done);
    renderCharts(habits, done);
    renderAnalysis(habits, done);
    renderTop(habits, done);
    renderJournal();
  }

  const unsubscribeHabits = watchHabits((all) => {
    state.all = all;
    render();
  }, reportError);
  const unsubscribeLogs = watchMonthLogs(
    month,
    ({ checks, days: journal }) => {
      state.checks = checks;
      state.journal = journal;
      render();
    },
    reportError,
  );

  return () => {
    unsubscribeHabits();
    unsubscribeLogs();
  };
}
