// Rapport pour le médecin (phase 7.5) : #/health/report.
// PDF via la feuille d'impression du navigateur (window.print → « Enregistrer en PDF »), zéro
// dépendance ; CSV générés sur l'appareil. Rien n'est envoyé à un tiers. DOM sûr (dom.js) partout.
import { reportError, showToast } from '../../components/toast.js';
import { lineChart } from '../../lib/charts.js';
import { dayKey, formatLongDate, parseDayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import { adherence } from '../../lib/health/adherence.js';
import { APPOINTMENT_STATUS, appointmentTitle } from '../../lib/health/care.js';
import { splitList } from '../../lib/health/emergency.js';
import { MOODS } from '../../lib/health/journal.js';
import {
  FIELD_LABELS,
  allTypes,
  formatNumber,
  formatReading,
  series,
  stats,
} from '../../lib/health/measures.js';
import { INSTRUCTIONS, MED_FORMS, medTitle, scheduleLabel } from '../../lib/health/meds.js';
import { dosesCsv, measuresCsv } from '../../lib/health/report.js';
import {
  GRACE_MIN,
  dayFromIndex,
  dayIndex,
  nowStamp,
  parseStamp,
  wallMinutes,
} from '../../lib/health/schedule.js';
import {
  watchCare,
  watchHabitDays,
  watchHealthProfile,
  watchJournals,
  watchMeasures,
} from '../../repos/health.js';
import { watchMedsAndLogs } from '../../repos/meds.js';
import { watchProfile } from '../../repos/profile.js';

const shortDate = (date) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const round1 = (n) => Math.round(n * 10) / 10;

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = h('a', { download: filename });
  link.href = url; // URL blob: posée directement (dom.js n'autorise que http/https/relatives)
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function table(headers, rows) {
  return h(
    'table',
    { class: 'report-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        headers.map((t) => h('th', { scope: 'col' }, t)),
      ),
    ),
    h(
      'tbody',
      {},
      rows.map((row) =>
        h(
          'tr',
          {},
          row.map((cell) => h('td', {}, cell ?? '')),
        ),
      ),
    ),
  );
}

function section(title, ...content) {
  return h('section', { class: 'report-section' }, h('h2', {}, title), ...content);
}

function takenText(med, counts, logs, from, to) {
  if (med.schedule?.type === 'asNeeded') {
    const n = logs.filter(
      (l) => l.medId === med.id && !l.scheduled && l.date >= from && l.date <= to,
    ).length;
    return `${n} prise(s) à la demande`;
  }
  if (!counts?.total) return '—';
  const done = counts.onTime + counts.late;
  return `${counts.pct} % (${done}/${counts.total} ; ${counts.late} en retard, ${counts.missed} manquée(s), ${counts.skipped} ignorée(s))`;
}

function treatmentsSection(meds, logs, from, to, now) {
  const scheduled = meds.filter((m) => m.schedule?.type !== 'asNeeded');
  const result = adherence(scheduled, logs, from, to, now);
  const byId = new Map(result.byMed.map((c) => [c.med.id, c]));
  const inPeriod = meds.filter((m) => m.startDate <= to && (!m.endDate || m.endDate >= from));
  if (!inPeriod.length) {
    return section('Traitements', h('p', {}, 'Aucun traitement sur la période.'));
  }
  return section(
    'Traitements',
    table(
      ['Médicament', 'Forme · consigne', 'Planning', 'Période', 'Prises faites'],
      inPeriod.map((med) => [
        medTitle(med),
        [MED_FORMS[med.form]?.label, INSTRUCTIONS[med.instructions]].filter(Boolean).join(' · '),
        scheduleLabel(med.schedule),
        `${shortDate(med.startDate)} → ${med.endDate ? shortDate(med.endDate) : 'en cours'}`,
        takenText(med, byId.get(med.id), logs, from, to),
      ]),
    ),
    result.overall.total
      ? h('p', {}, `Ensemble : ${result.overall.pct} % des prises planifiées faites.`)
      : null,
  );
}

function profileSection(health) {
  if (!health) return null;
  const items = [
    health.bloodGroup ? ['Groupe sanguin', health.bloodGroup] : null,
    health.heightCm ? ['Taille', `${health.heightCm} cm`] : null,
    health.allergies ? ['Allergies', splitList(health.allergies).join(', ')] : null,
    health.conditions ? ['Pathologies', splitList(health.conditions).join(', ')] : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return section(
    'Profil',
    h(
      'dl',
      { class: 'report-dl' },
      items.map(([dt, dd]) => h('div', {}, h('dt', {}, dt), h('dd', {}, dd))),
    ),
  );
}

function measureBlock(type, inPeriod, from, to) {
  const fields = type.key === 'bp' ? ['sys', 'dia'] : ['value'];
  const lines = fields.map((f) => ({
    field: f,
    points: series(inPeriod, type.key, f, from),
    className: `line__series line__series--${f}`,
  }));
  const entries = inPeriod
    .filter((m) => m.typeKey === type.key)
    .sort((a, b) => b.at.localeCompare(a.at));
  const summary = lines
    .map((l) => {
      const s = stats(l.points);
      const prefix = fields.length > 1 ? `${FIELD_LABELS[l.field]} : ` : '';
      return `${prefix}moyenne ${formatNumber(s.avg)}, min ${formatNumber(s.min)}, max ${formatNumber(s.max)} (${s.count})`;
    })
    .join(' · ');
  return h(
    'div',
    { class: 'report-measure' },
    h('h3', {}, type.label),
    h('p', {}, summary),
    lines.some((l) => l.points.length > 1)
      ? lineChart(lines, {
          from: parseStamp(`${from}T00:00`),
          to: parseStamp(`${to}T23:59`),
          band: type.key === 'bp' ? type.targets?.sys : type.targets?.value,
          label: `${type.label}, évolution sur la période`,
          height: 110,
        })
      : null,
    table(
      ['Date', 'Valeur', 'Note'],
      entries
        .slice(0, 15)
        .map((m) => [
          `${shortDate(m.date)} ${m.at.slice(11)}`,
          formatReading(type, m.values, m.unit),
          m.note,
        ]),
    ),
  );
}

function measuresSection(measureData, from, to) {
  const types = allTypes(measureData.types);
  const inPeriod = measureData.measures.filter((m) => m.date >= from && m.date <= to);
  const used = types.filter((t) => inPeriod.some((m) => m.typeKey === t.key));
  if (!used.length) return section('Mesures', h('p', {}, 'Aucune mesure sur la période.'));
  return section(
    'Mesures',
    used.map((type) => measureBlock(type, inPeriod, from, to)),
  );
}

function journalSection(journals, habitDays, from, to) {
  const entries = journals.filter((j) => j.date >= from && j.date <= to);
  const moods = habitDays
    .filter((d) => d.day >= from && d.day <= to && d.mood != null)
    .map((d) => d.mood);
  if (!entries.length && !moods.length) return null;
  const energies = entries.map((j) => j.energy).filter((e) => e != null);
  const pains = entries.map((j) => j.painLevel).filter((p) => p != null);
  const symptomDays = new Map();
  for (const j of entries) {
    for (const s of j.symptoms ?? []) symptomDays.set(s.name, (symptomDays.get(s.name) ?? 0) + 1);
  }
  const notes = entries.filter((j) => j.note).sort((a, b) => b.date.localeCompare(a.date));
  const lines = [
    moods.length
      ? `Humeur moyenne : ${round1(avg(moods))}/5 ${MOODS[Math.round(avg(moods)) - 1]} (${moods.length} jour(s))`
      : null,
    energies.length ? `Énergie moyenne : ${round1(avg(energies))}/5` : null,
    pains.length
      ? `Douleur : moyenne ${round1(avg(pains))}/10, maximum ${Math.max(...pains)}/10 (${pains.length} jour(s))`
      : null,
  ].filter(Boolean);
  return section(
    'Journal',
    lines.length
      ? h(
          'ul',
          {},
          lines.map((l) => h('li', {}, l)),
        )
      : null,
    symptomDays.size
      ? table(
          ['Symptôme', 'Jours'],
          [...symptomDays].sort((a, b) => b[1] - a[1]).map(([name, n]) => [name, String(n)]),
        )
      : null,
    notes.length
      ? h(
          'div',
          {},
          h('h3', {}, 'Notes'),
          h(
            'ul',
            {},
            notes.slice(0, 10).map((j) => h('li', {}, `${shortDate(j.date)} : ${j.note}`)),
          ),
        )
      : null,
  );
}

function appointmentsSection(care, from, to) {
  const list = care.appointments
    .filter((a) => a.at.slice(0, 10) >= from && a.at.slice(0, 10) <= to)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!list.length) return null;
  return section(
    'Rendez-vous',
    table(
      ['Date', 'Avec', 'Statut', 'Notes'],
      list.map((a) => [
        `${shortDate(a.at.slice(0, 10))} ${a.at.slice(11)}`,
        appointmentTitle(a, care.doctors),
        APPOINTMENT_STATUS[a.status],
        a.afterNotes,
      ]),
    ),
  );
}

export function renderReport(outlet) {
  const today = dayKey();
  const state = {
    from: dayFromIndex(dayIndex(today) - 29),
    to: today,
    data: null,
    measures: null,
    journals: null,
    habitDays: null,
    health: undefined,
    care: null,
    name: null,
  };
  const doc = h('article', { class: 'report', 'aria-label': 'Rapport de suivi' });
  const from = h('input', { class: 'input', type: 'date', value: state.from, max: today });
  const to = h('input', { class: 'input', type: 'date', value: state.to, max: today });
  const ready = () =>
    Boolean(state.data && state.measures && state.journals && state.habitDays && state.care) &&
    state.health !== undefined;
  const isPast = (o) => parseStamp(nowStamp()) > wallMinutes(o.date, o.time) + GRACE_MIN;

  function exportCsv(kind) {
    if (!ready()) return;
    const range = `${state.from}_${state.to}`;
    if (kind === 'doses') {
      const { meds, logs } = state.data;
      download(`lifehub-prises-${range}.csv`, dosesCsv(meds, logs, state.from, state.to, isPast));
    } else {
      const types = allTypes(state.measures.types);
      download(
        `lifehub-mesures-${range}.csv`,
        measuresCsv(state.measures.measures, types, state.from, state.to),
      );
    }
    showToast('Fichier CSV prêt.');
  }

  function render() {
    if (!ready()) return;
    const now = parseStamp(nowStamp());
    const { from: start, to: end } = state;
    mount(
      doc,
      h(
        'header',
        { class: 'report-head' },
        h('h1', {}, 'Rapport de suivi'),
        h(
          'p',
          {},
          [state.name, `du ${shortDate(start)} au ${shortDate(end)}`].filter(Boolean).join(' · '),
        ),
        h(
          'p',
          { class: 'report-note' },
          `Généré le ${formatLongDate(parseDayKey(today))} avec LifeHub. Données saisies par la personne elle-même, sans interprétation.`,
        ),
      ),
      profileSection(state.health),
      treatmentsSection(state.data.meds, state.data.logs, start, end, now),
      measuresSection(state.measures, start, end),
      journalSection(state.journals, state.habitDays, start, end),
      appointmentsSection(state.care, start, end),
    );
  }

  const changeRange = () => {
    if (!from.value || !to.value) return;
    if (from.value > to.value) {
      showToast('La date de début est après la date de fin.', { tone: 'danger' });
      return;
    }
    state.from = from.value;
    state.to = to.value;
    render();
  };
  from.addEventListener('change', changeRange);
  to.addEventListener('change', changeRange);

  const csvButton = (kind, label) =>
    h(
      'button',
      { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => exportCsv(kind) },
      label,
    );

  mount(
    outlet,
    h(
      'div',
      { class: 'stack no-print' },
      h(
        'header',
        { class: 'page-header' },
        h('p', { class: 'eyebrow' }, 'Santé'),
        h('h1', { class: 'page-title' }, 'Rapport'),
      ),
      h(
        'div',
        { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Du'), from),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Au'), to),
      ),
      h(
        'button',
        { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => window.print() },
        'Imprimer / enregistrer en PDF',
      ),
      h(
        'div',
        { class: 'row row--wrap' },
        csvButton('doses', 'CSV des prises'),
        csvButton('measures', 'CSV des mesures'),
      ),
      h(
        'p',
        { class: 'field__hint' },
        'Le PDF et les CSV sont créés sur ton appareil. Partage-les seulement avec ton médecin.',
      ),
    ),
    doc,
  );

  const set = (key) => (value) => {
    state[key] = value;
    render();
  };
  const stops = [
    watchMedsAndLogs(set('data'), reportError),
    watchMeasures(set('measures'), reportError),
    watchJournals(set('journals'), reportError),
    watchHabitDays(set('habitDays'), reportError),
    watchHealthProfile(set('health'), reportError),
    watchCare(set('care'), reportError),
    watchProfile((profile) => set('name')(profile?.displayName ?? null), reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
