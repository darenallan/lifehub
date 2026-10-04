import { reportError } from '../../components/toast.js';
import { dayKey, isoWeekKey, parseDayKey } from '../../lib/dates.js';
import { h } from '../../lib/dom.js';
import { isWeekKey, MEALS, shiftWeek, weekDays } from '../../lib/house.js';
import { setMenuDish } from '../../repos/house.js';
import { card } from '../common.js';

const short = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmt = (key) => short.format(parseDayKey(key));

export function menuPanel({ house, menu, params }) {
  const current = isoWeekKey(new Date());
  const week = isWeekKey(params[0]) ? params[0] : current;
  const days = weekDays(week);
  const today = dayKey();
  const dish = (day, meal) =>
    menu.find((e) => e.week === week && e.day === day && e.meal === meal)?.dish ?? '';

  const nav = h(
    'div',
    { class: 'row row--between menu-nav' },
    h(
      'a',
      {
        class: 'icon-btn',
        href: `#/house/menu/${shiftWeek(week, -1)}`,
        'aria-label': 'Semaine précédente',
      },
      '‹',
    ),
    h(
      'div',
      { class: 'menu-nav__label' },
      h('strong', {}, `Semaine du ${fmt(days[0].date)} au ${fmt(days[6].date)}`),
      week !== current ? h('a', { class: 'link', href: '#/house/menu' }, 'Cette semaine') : null,
    ),
    h(
      'a',
      {
        class: 'icon-btn',
        href: `#/house/menu/${shiftWeek(week, 1)}`,
        'aria-label': 'Semaine suivante',
      },
      '›',
    ),
  );

  const grid = h(
    'div',
    { class: 'menu-grid' },
    days.map((d) =>
      h(
        'section',
        { class: `menu-day${d.date === today ? ' is-today' : ''}` },
        h('h3', { class: 'menu-day__title' }, `${d.label} ${Number(d.date.slice(8))}`),
        MEALS.map(([meal, label]) =>
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field__label' }, label),
            h('input', {
              class: 'input',
              maxlength: 80,
              value: dish(d.key, meal),
              placeholder: '—',
              onchange: (e) =>
                setMenuDish(house.id, week, d.key, meal, e.target.value.trim()).catch(reportError),
            }),
          ),
        ),
      ),
    ),
  );

  return card({ title: 'Menu de la semaine', iconName: 'house', body: [nav, grid] });
}
