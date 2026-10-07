// Carte d'urgence : lisible d'un coup d'œil par un tiers, hors ligne (base locale uniquement).
// Raccourci PWA « Urgence » → #/health/emergency.
import { reportError } from '../../components/toast.js';
import { h, mount } from '../../lib/dom.js';
import { hasEmergencyInfo, sortContacts, splitList, telHref } from '../../lib/health/emergency.js';
import { icon } from '../../lib/icons.js';
import { watchEmergencyContacts, watchHealthProfile } from '../../repos/health.js';
import { watchProfile } from '../../repos/profile.js';

function section(title, ...content) {
  return h('section', { class: 'sos__block' }, h('h2', { class: 'sos__label' }, title), ...content);
}

function tags(text, tone) {
  const items = splitList(text);
  if (!items.length) return h('p', { class: 'muted' }, 'Rien de renseigné.');
  return h(
    'ul',
    { class: `sos__tags${tone ? ` sos__tags--${tone}` : ''}` },
    items.map((item) => h('li', {}, item)),
  );
}

function callButton({ name, detail, phone }) {
  const href = telHref(phone);
  if (!href) return null;
  return h(
    'a',
    { class: 'sos__call', href },
    h('span', { class: 'sos__call-icon', 'aria-hidden': 'true' }, icon('phone', { size: 20 })),
    h(
      'span',
      { class: 'sos__call-text' },
      h('strong', {}, name),
      h('span', {}, [detail, phone].filter(Boolean).join(' · ')),
    ),
  );
}

function emptyCard() {
  return h(
    'div',
    { class: 'card sos__empty' },
    h('p', {}, "Ta carte d'urgence est vide."),
    h(
      'p',
      { class: 'muted' },
      'Groupe sanguin, allergies et contacts à prévenir : deux minutes suffisent.',
    ),
    h('a', { class: 'btn btn--primary', href: '#/health/profile' }, 'Remplir ma carte'),
  );
}

function sosCard({ profile, contacts, name }) {
  const calls = [
    ...sortContacts(contacts).map((c) =>
      callButton({ name: c.name, detail: c.relation, phone: c.phone }),
    ),
    profile?.doctorPhone
      ? callButton({
          name: profile.doctorName ?? 'Médecin traitant',
          detail: profile.doctorName ? 'Médecin traitant' : null,
          phone: profile.doctorPhone,
        })
      : null,
  ].filter(Boolean);

  return h(
    'div',
    { class: 'sos__body' },
    h(
      'div',
      { class: 'sos__facts' },
      h(
        'div',
        { class: 'sos__fact sos__fact--blood' },
        h('span', { class: 'sos__label' }, 'Groupe sanguin'),
        h('strong', {}, profile?.bloodGroup ?? '—'),
      ),
      profile?.heightCm
        ? h(
            'div',
            { class: 'sos__fact' },
            h('span', { class: 'sos__label' }, 'Taille'),
            h('strong', {}, `${profile.heightCm} cm`),
          )
        : null,
    ),
    section('Allergies', tags(profile?.allergies, 'danger')),
    section('Pathologies chroniques', tags(profile?.conditions)),
    profile?.emergencyNotes
      ? section('À savoir', h('p', { class: 'sos__notes' }, profile.emergencyNotes))
      : null,
    section(
      'Appeler',
      calls.length
        ? h('div', { class: 'sos__calls' }, calls)
        : h('p', { class: 'muted' }, 'Aucun contact renseigné.'),
    ),
    name ? h('p', { class: 'sos__owner muted' }, `Carte de ${name}`) : null,
    h('a', { class: 'btn btn--ghost sos__edit', href: '#/health/profile' }, 'Modifier ma carte'),
  );
}

export function renderEmergency(outlet) {
  const state = { profile: undefined, contacts: [], name: null };
  const body = h('div');

  mount(
    outlet,
    h(
      'article',
      { class: 'sos', 'aria-labelledby': 'sos-title' },
      h(
        'header',
        { class: 'sos__head' },
        h('span', { class: 'sos__badge', 'aria-hidden': 'true' }, icon('emergency', { size: 26 })),
        h(
          'div',
          {},
          h('h1', { class: 'sos__title', id: 'sos-title' }, 'Urgence médicale'),
          h('p', { class: 'muted' }, 'Informations saisies par la personne elle-même.'),
        ),
      ),
      body,
    ),
  );

  function render() {
    if (state.profile === undefined) return;
    mount(body, hasEmergencyInfo(state.profile, state.contacts) ? sosCard(state) : emptyCard());
  }

  const stops = [
    watchHealthProfile((profile) => {
      state.profile = profile;
      render();
    }, reportError),
    watchEmergencyContacts((contacts) => {
      state.contacts = contacts;
      render();
    }, reportError),
    watchProfile((profile) => {
      state.name = profile?.displayName ?? null;
      render();
    }, reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
