// Statistiques d'observance (phase 7.5) : #/health/stats[/YYYY-MM].
// Chiffres descriptifs uniquement : aucune interprétation médicale.
import { reportError } from '../../components/toast.js';
import { ring } from '../../lib/charts.js';
import {
  dayKey,
  daysInMonth,
  formatMonth,
  isMonthKey,
  monthKey,
  shiftMonth,
} from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import {
  adherence,
  dailyRates,
  dayTone,
  streak,
  symptomCorrelation,
} from '../../lib/health/adherence.js';
import { medTitle } from '../../lib/health/meds.js';
import {
  dayFromIndex,
  dayIndex,
  isoWeekday,
  nowStamp,
  parseStamp,
} from '../../lib/health/schedule.js';
import { watchJournals } from '../../repos/health.js';
import { watchMedsAndLogs } from '../../repos/meds.js';
import { card, emptyState, pageHeader } from '../common.js';

const PERIODS = [7, 30, 90];
const PARTS = ['Matin', 'Après-midi', 'Soir', 'Nuit'];
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function countsLine(c) {
  return [
    `${c.onTime} à l'heure`,
    `${c.late} en retard`,
    `${c.skipped} ignorée(s)`,
    `${c.missed} manquée(s)`,
  ].join(' · ');
}

function meter(pct) {
  const bar = h('span', { class: 'meter__bar' });
  // CSSOM (autorisé par la CSP, contrairement à l'attribut style).
  bar.style.setProperty('--pct', `${pct ?? 0}%`);
  return h('span', { class: 'meter', 'aria-hidden': 'true' }, bar);
}

function rateRow(label, counts) {
  return h(
    'li',
    { class: 'rate-row' },
    h(
      'div',
      { class: 'rate-row__head' },
      h('strong', {}, label),
      h('span', { class: 'rate-row__pct' }, counts.pct != null ? `${counts.pct} %` : '—'),
    ),
    meter(counts.pct),
    h('span', { class: 'muted' }, countsLine(counts)),
  );
}

/** Calendrier du mois : une case par jour, teintée selon la part des prises faites. */
function monthCalendar(meds, logs, month, now) {
  const first = `${month}-01`;
  const count = daysInMonth(month);
  const last = `${month}-${String(count).padStart(2, '0')}`;
  const rates = dailyRates(meds, logs, first, last, now);
  const offset = isoWeekday(dayIndex(first)) - 1;
  const cells = [
    ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'heat__head' }, d)),
    ...Array.from({ length: offset }, () => h('span', { class: 'heat__cell heat__cell--blank' })),
  ];
  for (let i = 0; i < count; i++) {
    const date = dayFromIndex(dayIndex(first) + i);
    const day = rates.get(date);
    const label = day
      ? `${date.slice(8)} : ${day.taken}/${day.total} prises`
      : `${date.slice(8)} : aucune prise jugée`;
    cells.push(
      h(
        'span',
        { class: `heat__cell heat__cell--${dayTone(day)}`, title: label, 'aria-label': label },
        String(i + 1),
      ),
    );
  }
  return h(
    'div',
    { class: 'stack stack--tight' },
    h(
      'div',
      { class: 'heat', role: 'img', 'aria-label': `Prises du mois de ${formatMonth(month)}` },
      cells,
    ),
    h(
      'p',
      { class: 'heat__legend field__hint' },
      h('span', { class: 'heat__swatch heat__cell--full' }),
      'toutes · ',
      h('span', { class: 'heat__swatch heat__cell--partial' }),
      'la moitié ou plus · ',
      h('span', { class: 'heat__swatch heat__cell--low' }),
      'moins de la moitié',
    ),
  );
}

function overallCard(overall, days) {
  const items = [
    ["À l'heure", overall.onTime],
    ['En retard', overall.late],
    ['Ignorées', overall.skipped],
    ['Manquées', overall.missed],
  ];
  return card({
    title: 'Prises faites',
    body: overall.total
      ? h(
          'div',
          { class: 'summary' },
          ring((overall.pct ?? 0) / 100, { label: 'Prises faites' }),
          h(
            'dl',
            { class: 'stats' },
            items.map(([dt, dd]) =>
              h('div', { class: 'stat' }, h('dt', {}, dt), h('dd', {}, String(dd))),
            ),
          ),
        )
      : emptyState('Pas encore de prise passée sur la période.'),
    footer: h(
      'p',
      { class: 'muted' },
      days ? `Série en cours : ${days} jour(s) sans oubli.` : 'Pas de série en cours.',
    ),
  });
}

function correlationCard(links) {
  return card({
    title: 'Symptômes et oublis',
    body: [
      h(
        'ul',
        { class: 'insights' },
        links.map((l) =>
          h(
            'li',
            {},
            `${l.name} : noté ${l.withMissed} % des jours avec un oubli, ${l.withoutMissed} % des jours sans oubli.`,
          ),
        ),
      ),
      h(
        'p',
        { class: 'field__hint' },
        'Simple constat sur tes propres notes, pas une explication médicale.',
      ),
    ],
  });
}

function draw(outlet, { meds, logs }, journals, period, month, setPeriod) {
  const header = pageHeader('Statistiques', 'Santé');
  const scheduled = meds.filter((m) => m.schedule?.type !== 'asNeeded');
  if (!scheduled.length) {
    mount(outlet, header, emptyState('Ajoute un traitement planifié pour voir tes statistiques.'));
    return;
  }
  const today = dayKey();
  const now = parseStamp(nowStamp());
  const from = dayFromIndex(dayIndex(today) - period + 1);
  const stats = adherence(scheduled, logs, from, today, now);
  const days = streak(
    scheduled.filter((m) => m.active),
    logs,
    today,
    now,
  );
  const links = symptomCorrelation(scheduled, logs, journals, from, today, now);
  const monthLink = (target, label) =>
    h('a', { class: 'btn btn--ghost btn--sm', href: `#/health/stats/${target}` }, label);

  mount(
    outlet,
    header,
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Période' },
        PERIODS.map((n) =>
          h(
            'button',
            {
              class: 'segmented__btn',
              type: 'button',
              'aria-pressed': String(n === period),
              onclick: () => setPeriod(n),
            },
            `${n} j`,
          ),
        ),
      ),
      overallCard(stats.overall, days),
      stats.byMed.length
        ? card({
            title: 'Par médicament',
            body: h(
              'ul',
              { class: 'rate-list' },
              stats.byMed.map((c) => rateRow(medTitle(c.med), c)),
            ),
          })
        : null,
      Object.keys(stats.byPart).length
        ? card({
            title: 'Par moment de la journée',
            body: h(
              'ul',
              { class: 'rate-list' },
              PARTS.filter((p) => stats.byPart[p]).map((p) => rateRow(p, stats.byPart[p])),
            ),
          })
        : null,
      card({
        title: capitalize(formatMonth(month)),
        body: monthCalendar(scheduled, logs, month, now),
        footer: h(
          'div',
          { class: 'row' },
          monthLink(shiftMonth(month, -1), '‹ Mois précédent'),
          month < monthKey() ? monthLink(shiftMonth(month, 1), 'Mois suivant ›') : null,
        ),
      }),
      links.length ? correlationCard(links) : null,
      h(
        'a',
        { class: 'btn btn--primary btn--lg', href: '#/health/report' },
        'Rapport pour le médecin',
      ),
    ),
  );
}

export function renderStats(outlet, requestedMonth) {
  const month =
    isMonthKey(requestedMonth) && requestedMonth <= monthKey() ? requestedMonth : monthKey();
  const state = { data: null, journals: null, period: 30 };
  const render = () => {
    if (!state.data || !state.journals) return;
    draw(outlet, state.data, state.journals, state.period, month, (n) => {
      state.period = n;
      render();
    });
  };
  const stops = [
    watchMedsAndLogs((data) => {
      state.data = data;
      render();
    }, reportError),
    watchJournals((journals) => {
      state.journals = journals;
      render();
    }, reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
