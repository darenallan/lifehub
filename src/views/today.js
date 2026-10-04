import { reportError } from '../components/toast.js';
import { dayKey, formatLongDate, monthKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { activeHabits, checkKey, indexChecks } from '../lib/habits.js';
import { setCheck, watchHabits, watchMonthLogs } from '../repos/habits.js';
import { watchProfile } from '../repos/profile.js';
import { card, emptyState, pageHeader } from './common.js';

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

export function renderToday(outlet, { user }) {
  const header = pageHeader('Bonjour', formatLongDate());
  const title = header.querySelector('.page-title');
  const habits = habitsTodayCard();

  const grid = h(
    'div',
    { class: 'grid' },
    habits.el,
    card({
      title: 'Dépense du jour',
      iconName: 'expenses',
      body: emptyState('Arrive en phase 2.'),
    }),
    card({
      title: 'Objectifs & tâches',
      iconName: 'tasks',
      body: emptyState('Arrive en phase 3.'),
    }),
    card({ title: 'Factures proches', iconName: 'house', body: emptyState('Arrive en phase 4.') }),
  );

  mount(outlet, header, grid);

  // Le profil est créé côté serveur au premier GET /api/me, puis arrive par la sync.
  const unsubscribeProfile = watchProfile((profile) => {
    const name = profile?.displayName || firstName(user.displayName);
    title.textContent = name ? `Bonjour ${name}` : 'Bonjour';
  }, reportError);

  return () => {
    unsubscribeProfile();
    habits.cleanup();
  };
}
