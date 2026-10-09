// Module Santé : accueil (#/health) et aiguillage des sous-écrans.
// Rien n'est pré-rempli ni interprété : tout vient de la saisie de l'utilisateur.
import { reportError, showToast } from '../../components/toast.js';
import { dayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import { splitList } from '../../lib/health/emergency.js';
import { appointmentTitle, upcomingAppointments, whenLabel } from '../../lib/health/care.js';
import { journalSummary } from '../../lib/health/journal.js';
import { allTypes, formatReading, latestByType } from '../../lib/health/measures.js';
import { MED_FORMS, medTitle, scheduleLabel } from '../../lib/health/meds.js';
import {
  cureEnded,
  cureSummary,
  dayFromIndex,
  dayIndex,
  dosesForDay,
  missedDoses,
  nowStamp,
  parseStamp,
} from '../../lib/health/schedule.js';
import { stockStatus } from '../../lib/health/stock.js';
import { icon } from '../../lib/icons.js';
import {
  acceptDisclaimer,
  watchEmergencyContacts,
  watchHealthProfile,
  watchCare,
  watchJournalDay,
  watchMeasures,
} from '../../repos/health.js';
import { saveMed, watchMedsAndLogs } from '../../repos/meds.js';
import { card, emptyState, pageHeader } from '../common.js';
import { asNeededRow, doseList, openCatchUp } from './doses.js';
import { renderCare } from './care.js';
import { renderEmergency } from './emergency.js';
import { renderJournal } from './journal.js';
import { openMeasureSheet, renderMeasures } from './measures.js';
import { renderMedForm } from './medForm.js';
import { renderHealthProfile } from './profile.js';
import { renderReport } from './report.js';
import { renderStats } from './stats.js';
import { openRefillSheet, stockAlertText, stockBadge } from './stock.js';

const TICK_MS = 60_000; // les statuts (à prendre → manquée) évoluent avec l'heure

const NEXT_STEPS = [
  'Rappels fiables même app fermée',
  'Proche aidant (résumé en lecture seule) et verrouillage par code',
];

const shortDate = (date) => `${date.slice(8)}/${date.slice(5, 7)}`;

function disclaimerCard() {
  const accept = h(
    'button',
    {
      class: 'btn btn--primary btn--lg',
      type: 'button',
      onclick: () => {
        accept.disabled = true;
        acceptDisclaimer().catch((err) => {
          accept.disabled = false;
          reportError(err);
        });
      },
    },
    "J'ai compris",
  );
  return h(
    'section',
    { class: 'card health-intro', role: 'note', 'aria-labelledby': 'health-intro-title' },
    h('span', { class: 'health-intro__icon', 'aria-hidden': 'true' }, icon('health', { size: 28 })),
    h('h2', { class: 'health-intro__title', id: 'health-intro-title' }, 'Avant de commencer'),
    h(
      'p',
      { class: 'health-intro__lead' },
      "Cet outil t'aide à suivre ton traitement. Il ne remplace pas l'avis d'un médecin ou d'un pharmacien.",
    ),
    h(
      'ul',
      { class: 'health-intro__list' },
      h('li', {}, 'Aucun conseil médical, aucune dose suggérée, aucun contrôle des interactions.'),
      h('li', {}, "Tout ce que tu vois ici, c'est toi qui l'as saisi."),
      h(
        'li',
        {},
        'Tes données restent sur ton appareil et ton serveur LifeHub, jamais chez un tiers.',
      ),
    ),
    accept,
  );
}

function catchUpNotice(missed, logs) {
  return h(
    'div',
    { class: 'notice notice--alert', role: 'status' },
    h('span', {}, `${missed.length} prise(s) manquée(s) depuis hier`),
    h(
      'button',
      {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => openCatchUp(missed, logs),
      },
      'Rattraper',
    ),
  );
}

function cureEndedCard(med, logs) {
  const { planned, taken } = cureSummary(med, logs);
  const archive = () =>
    saveMed(med.id, { active: false })
      .then(() => showToast('Traitement archivé.'))
      .catch(reportError);
  return h(
    'section',
    { class: 'card cure-done' },
    h('h2', { class: 'card__title' }, `Cure terminée · ${medTitle(med)}`),
    h(
      'p',
      { class: 'muted' },
      `${taken} prise(s) enregistrée(s) sur ${planned} prévue(s), du ${shortDate(med.startDate)} au ${shortDate(med.endDate)}.`,
    ),
    h(
      'div',
      { class: 'row row--wrap' },
      h(
        'button',
        { class: 'btn btn--primary btn--sm', type: 'button', onclick: archive },
        'Archiver',
      ),
      h('a', { class: 'btn btn--ghost btn--sm', href: `#/health/med/${med.id}` }, 'Prolonger'),
    ),
  );
}

function dosesCard({ meds, logs }, today, now) {
  const entries = dosesForDay(meds, logs, today, now);
  const asNeeded = meds.filter((m) => m.active && m.schedule?.type === 'asNeeded');
  const taken = entries.filter((e) => e.status === 'taken').length;
  const el = card({
    title: 'Prises du jour',
    iconName: 'health',
    body: [
      entries.length
        ? doseList(entries, logs)
        : emptyState(
            asNeeded.length
              ? 'Aucune prise planifiée aujourd’hui.'
              : 'Aucune prise prévue aujourd’hui.',
          ),
      asNeeded.length
        ? h(
            'section',
            { class: 'dose-group' },
            h('h3', { class: 'dose-group__title' }, 'À la demande'),
            h(
              'ul',
              { class: 'dose-list' },
              asNeeded.map((med) => asNeededRow(med, logs, today)),
            ),
          )
        : null,
    ],
  });
  if (entries.length) {
    el.querySelector('.card__title').append(
      h('span', { class: 'card__meta' }, `${taken}/${entries.length}`),
    );
  }
  return el;
}

function medRow(med, status) {
  return h(
    'li',
    {},
    h(
      'a',
      { class: `med-row cat--${med.color}`, href: `#/health/med/${med.id}` },
      h(
        'span',
        { class: 'med-row__icon', 'aria-hidden': 'true' },
        MED_FORMS[med.form]?.emoji ?? '✚',
      ),
      h(
        'span',
        { class: 'med-row__text' },
        h('strong', {}, medTitle(med)),
        h(
          'span',
          { class: 'muted' },
          [scheduleLabel(med.schedule), med.endDate ? `jusqu'au ${shortDate(med.endDate)}` : null]
            .filter(Boolean)
            .join(' · '),
        ),
        stockBadge(med, status),
      ),
    ),
  );
}

function medsCard(meds, statusOf) {
  const active = meds.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const archived = meds.filter((m) => !m.active);
  return card({
    title: 'Mes traitements',
    iconName: 'tasks',
    body: [
      active.length
        ? h(
            'ul',
            { class: 'med-list' },
            active.map((m) => medRow(m, statusOf(m))),
          )
        : emptyState('Ajoute un médicament pour suivre tes prises et recevoir des rappels.'),
      archived.length
        ? h(
            'details',
            { class: 'more' },
            h('summary', {}, `Archivés (${archived.length})`),
            h(
              'ul',
              { class: 'med-list' },
              archived.map((m) => medRow(m, null)),
            ),
          )
        : null,
    ],
    footer: h(
      'a',
      { class: 'btn btn--primary', href: '#/health/med/new' },
      '+ Ajouter un traitement',
    ),
  });
}

/** Traitements à racheter bientôt (seuil saisi, ou moins de 7 jours de stock). */
function stockAlertsCard(alerts, refills) {
  return card({
    title: 'À racheter',
    iconName: 'expenses',
    body: h(
      'ul',
      { class: 'contact-list' },
      alerts.map(({ med, status }) =>
        h(
          'li',
          { class: 'contact' },
          h(
            'div',
            { class: 'contact__text' },
            h('strong', {}, medTitle(med)),
            h(
              'span',
              { class: 'muted' },
              [stockAlertText(status), med.pharmacy].filter(Boolean).join(' · '),
            ),
          ),
          h(
            'button',
            {
              class: 'btn btn--primary btn--sm',
              type: 'button',
              onclick: () => openRefillSheet(med, refills),
            },
            "J'ai racheté",
          ),
        ),
      ),
    ),
  });
}

function measuresCard(measureData) {
  const types = allTypes(measureData.types);
  const latest = latestByType(measureData.measures);
  const recent = types
    .filter((t) => latest.has(t.key))
    .sort((a, b) => latest.get(b.key).at.localeCompare(latest.get(a.key).at))
    .slice(0, 4);
  return card({
    title: 'Mesures',
    iconName: 'health',
    body: recent.length
      ? h(
          'ul',
          { class: 'measure-grid measure-grid--compact' },
          recent.map((t) => {
            const m = latest.get(t.key);
            return h(
              'li',
              {},
              h(
                'a',
                { class: 'measure-tile', href: `#/health/measures/${t.key}` },
                h('span', { class: 'measure-tile__label' }, t.label),
                h('strong', { class: 'measure-tile__value' }, formatReading(t, m.values, m.unit)),
              ),
            );
          }),
        )
      : emptyState('Tension, glycémie, poids… suis tes mesures dans le temps.'),
    footer: h(
      'div',
      { class: 'row row--wrap' },
      h(
        'button',
        {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          onclick: () => openMeasureSheet(types),
        },
        '+ Mesure',
      ),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#/health/measures' }, 'Tout voir'),
    ),
  });
}

function careCard(care, today) {
  const next = care ? upcomingAppointments(care.appointments, parseStamp(nowStamp()))[0] : null;
  const tomorrow = dayFromIndex(dayIndex(today) + 1);
  return linkCard({
    href: '#/health/care',
    iconName: 'today',
    title: 'Rendez-vous',
    text: next
      ? `${whenLabel(next.at, today, tomorrow)} · ${appointmentTitle(next, care.doctors)}`
      : 'Médecins, pharmacies, prochains rendez-vous.',
  });
}

function journalCard(journal) {
  const summary = journal ? journalSummary(journal.entry, journal.habitDay) : '';
  return linkCard({
    href: '#/health/journal',
    iconName: 'today',
    title: 'Journal du jour',
    text: summary || 'Humeur, énergie, douleur, symptômes : 30 secondes.',
  });
}

function emergencySummary(profile, contacts) {
  const parts = [
    profile?.bloodGroup ? `Groupe ${profile.bloodGroup}` : null,
    profile?.allergies ? `${splitList(profile.allergies).length} allergie(s)` : null,
    contacts.length ? `${contacts.length} contact(s)` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'À remplir : groupe sanguin, allergies, contacts';
}

function linkCard({ href, iconName, title, text, tone }) {
  return h(
    'a',
    { class: `card emergency-link${tone ? ` emergency-link--${tone}` : ''}`, href },
    h('span', { class: 'emergency-link__icon', 'aria-hidden': 'true' }, icon(iconName)),
    h(
      'span',
      { class: 'emergency-link__text' },
      h('strong', {}, title),
      h('span', { class: 'muted' }, text),
    ),
  );
}

function nextStepsCard() {
  return card({
    title: 'Bientôt dans Santé',
    body: h(
      'ul',
      { class: 'health-next' },
      NEXT_STEPS.map((step) => h('li', {}, step)),
    ),
  });
}

function renderHome(outlet) {
  const header = pageHeader('Santé', 'Suivi personnel');
  const state = {
    profile: undefined,
    contacts: [],
    data: null,
    measures: null,
    journal: null,
    care: null,
  };

  function render() {
    if (state.profile === undefined || !state.data) return; // base locale pas encore lue
    if (!state.profile?.disclaimerSeenOn) {
      mount(outlet, header, h('div', { class: 'stack' }, disclaimerCard()));
      return;
    }
    const today = dayKey();
    const now = parseStamp(nowStamp());
    const { meds, logs, refills } = state.data;
    const missed = missedDoses(meds, logs, now);
    const ended = meds.filter((m) => m.active && cureEnded(m, today));
    const statusOf = (med) => stockStatus(med, logs, refills, today);
    const alerts = meds
      .filter((m) => m.active)
      .map((med) => ({ med, status: statusOf(med) }))
      .filter(({ status }) => status && status.level !== 'ok');
    mount(
      outlet,
      header,
      h(
        'div',
        { class: 'stack' },
        missed.length ? catchUpNotice(missed, logs) : null,
        ended.map((med) => cureEndedCard(med, logs)),
        alerts.length ? stockAlertsCard(alerts, refills) : null,
        dosesCard(state.data, today, now),
        careCard(state.care, today),
        journalCard(state.journal),
        medsCard(meds, statusOf),
        state.measures ? measuresCard(state.measures) : null,
        linkCard({
          href: '#/health/stats',
          iconName: 'habits',
          title: 'Statistiques et rapport',
          text: 'Prises faites, calendrier du mois, rapport PDF / CSV pour ton médecin.',
        }),
        linkCard({
          href: '#/health/emergency',
          iconName: 'emergency',
          title: "Carte d'urgence",
          text: emergencySummary(state.profile, state.contacts),
          tone: 'danger',
        }),
        linkCard({
          href: '#/health/profile',
          iconName: 'phone',
          title: 'Profil et contacts',
          text: 'Groupe sanguin, allergies, médecin traitant, personnes à prévenir.',
        }),
        nextStepsCard(),
      ),
    );
  }

  const tick = setInterval(render, TICK_MS);
  const stops = [
    watchHealthProfile((profile) => {
      state.profile = profile;
      render();
    }, reportError),
    watchEmergencyContacts((contacts) => {
      state.contacts = contacts;
      render();
    }, reportError),
    watchMedsAndLogs((data) => {
      state.data = data;
      render();
    }, reportError),
    watchMeasures((measures) => {
      state.measures = measures;
      render();
    }, reportError),
    watchCare((care) => {
      state.care = care;
      render();
    }, reportError),
    watchJournalDay(
      dayKey(),
      (journal) => {
        state.journal = journal;
        render();
      },
      reportError,
    ),
  ];
  return () => {
    clearInterval(tick);
    stops.forEach((stop) => stop());
  };
}

export function renderHealth(outlet, { params }) {
  switch (params[0]) {
    case 'emergency':
      return renderEmergency(outlet);
    case 'profile':
      return renderHealthProfile(outlet);
    case 'med':
      return renderMedForm(outlet, params[1] ?? 'new');
    case 'measures':
      return renderMeasures(outlet, params[1] ?? null);
    case 'journal':
      return renderJournal(outlet, params[1]);
    case 'care':
      return renderCare(outlet);
    case 'stats':
      return renderStats(outlet, params[1]);
    case 'report':
      return renderReport(outlet);
    default:
      return renderHome(outlet);
  }
}
