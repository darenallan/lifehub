// Module Santé : accueil (#/health) et aiguillage des sous-écrans.
// Rien n'est pré-rempli ni interprété : tout vient de la saisie de l'utilisateur.
import { reportError, showToast } from '../../components/toast.js';
import { dayKey } from '../../lib/dates.js';
import { h, mount } from '../../lib/dom.js';
import { splitList } from '../../lib/health/emergency.js';
import { MED_FORMS, medTitle, scheduleLabel } from '../../lib/health/meds.js';
import {
  cureEnded,
  cureSummary,
  dosesForDay,
  missedDoses,
  nowStamp,
  parseStamp,
} from '../../lib/health/schedule.js';
import { icon } from '../../lib/icons.js';
import {
  acceptDisclaimer,
  watchEmergencyContacts,
  watchHealthProfile,
} from '../../repos/health.js';
import { saveMed, watchMedsAndLogs } from '../../repos/meds.js';
import { card, emptyState, pageHeader } from '../common.js';
import { asNeededRow, doseList, openCatchUp } from './doses.js';
import { renderEmergency } from './emergency.js';
import { renderMedForm } from './medForm.js';
import { renderHealthProfile } from './profile.js';

const TICK_MS = 60_000; // les statuts (à prendre → manquée) évoluent avec l'heure

const NEXT_STEPS = [
  'Stock de médicaments et renouvellement',
  'Mesures (tension, glycémie, poids…) et journal',
  'Rendez-vous et contacts médicaux',
  'Rapport pour le médecin (PDF, CSV)',
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

function medRow(med) {
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
      ),
    ),
  );
}

function medsCard(meds) {
  const active = meds.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const archived = meds.filter((m) => !m.active);
  return card({
    title: 'Mes traitements',
    iconName: 'tasks',
    body: [
      active.length
        ? h('ul', { class: 'med-list' }, active.map(medRow))
        : emptyState('Ajoute un médicament pour suivre tes prises et recevoir des rappels.'),
      archived.length
        ? h(
            'details',
            { class: 'more' },
            h('summary', {}, `Archivés (${archived.length})`),
            h('ul', { class: 'med-list' }, archived.map(medRow)),
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
  const state = { profile: undefined, contacts: [], data: null };

  function render() {
    if (state.profile === undefined || !state.data) return; // base locale pas encore lue
    if (!state.profile?.disclaimerSeenOn) {
      mount(outlet, header, h('div', { class: 'stack' }, disclaimerCard()));
      return;
    }
    const today = dayKey();
    const now = parseStamp(nowStamp());
    const { meds, logs } = state.data;
    const missed = missedDoses(meds, logs, now);
    const ended = meds.filter((m) => m.active && cureEnded(m, today));
    mount(
      outlet,
      header,
      h(
        'div',
        { class: 'stack' },
        missed.length ? catchUpNotice(missed, logs) : null,
        ended.map((med) => cureEndedCard(med, logs)),
        dosesCard(state.data, today, now),
        medsCard(meds),
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
    default:
      return renderHome(outlet);
  }
}
