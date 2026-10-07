// Module Santé (phase 7.0) : avertissement au premier lancement, profil santé, contacts d'urgence.
// Rien n'est pré-rempli ni interprété : tout vient de la saisie de l'utilisateur.
import { confirmDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { h, mount } from '../../lib/dom.js';
import {
  BLOOD_GROUPS,
  cleanText,
  isValidPhone,
  parseHeight,
  sortContacts,
  splitList,
  telHref,
} from '../../lib/health/emergency.js';
import { icon } from '../../lib/icons.js';
import {
  acceptDisclaimer,
  deleteEmergencyContact,
  saveEmergencyContact,
  saveHealthProfile,
  watchEmergencyContacts,
  watchHealthProfile,
} from '../../repos/health.js';
import { card, pageHeader } from '../common.js';
import { renderEmergency } from './emergency.js';

const NEXT_STEPS = [
  'Médicaments, prises du jour et rappels',
  'Stock de médicaments et renouvellement',
  'Mesures (tension, glycémie, poids…) et journal',
  'Rendez-vous et contacts médicaux',
  'Rapport pour le médecin (PDF, CSV)',
];

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
}

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

function emergencySummary(profile, contacts) {
  const parts = [
    profile?.bloodGroup ? `Groupe ${profile.bloodGroup}` : null,
    profile?.allergies ? `${splitList(profile.allergies).length} allergie(s)` : null,
    contacts.length ? `${contacts.length} contact(s)` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'À remplir : groupe sanguin, allergies, contacts';
}

function emergencyLink(summary) {
  return h(
    'a',
    { class: 'card emergency-link', href: '#/health/emergency' },
    h('span', { class: 'emergency-link__icon', 'aria-hidden': 'true' }, icon('emergency')),
    h(
      'span',
      { class: 'emergency-link__text' },
      h('strong', {}, "Carte d'urgence"),
      h('span', { class: 'muted' }, summary),
    ),
  );
}

function input(value, props) {
  const el = h('input', { class: 'input', autocomplete: 'off', ...props });
  el.value = value ?? '';
  return el;
}

function textarea(value, maxlength, placeholder) {
  const el = h('textarea', { class: 'input textarea', rows: 3, maxlength, placeholder });
  el.value = value ?? '';
  return el;
}

/**
 * Formulaire du profil. getProfile() donne l'état local courant au moment de l'envoi :
 * seuls les champs modifiés partent (patchs par champ, pas d'écrasement d'un autre appareil).
 */
function profileForm(getProfile) {
  const profile = getProfile();
  const bloodGroup = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, 'Non renseigné'),
    BLOOD_GROUPS.map((g) => h('option', { value: g }, g)),
  );
  bloodGroup.value = profile?.bloodGroup ?? '';
  const height = input(profile?.heightCm, {
    inputmode: 'numeric',
    maxlength: 3,
    placeholder: 'ex. 175',
  });
  const allergies = textarea(profile?.allergies, 500, 'Une par ligne, ex. Pénicilline');
  const conditions = textarea(profile?.conditions, 500, 'Une par ligne, ex. Asthme');
  const notes = textarea(profile?.emergencyNotes, 300, 'Ce que les secours doivent savoir');
  const doctorName = input(profile?.doctorName, { maxlength: 60 });
  const doctorPhone = input(profile?.doctorPhone, { type: 'tel', inputmode: 'tel', maxlength: 24 });

  const submit = (e) => {
    e.preventDefault();
    const heightText = height.value.trim();
    const phoneText = doctorPhone.value.trim();
    if (heightText && parseHeight(heightText) == null) {
      showToast('Taille : un nombre entier en cm, entre 50 et 250.', { tone: 'danger' });
      height.focus();
      return;
    }
    if (phoneText && !isValidPhone(phoneText)) {
      showToast('Téléphone du médecin invalide.', { tone: 'danger' });
      doctorPhone.focus();
      return;
    }
    const next = {
      bloodGroup: bloodGroup.value || null,
      heightCm: parseHeight(heightText),
      allergies: cleanText(allergies.value, 500),
      conditions: cleanText(conditions.value, 500),
      emergencyNotes: cleanText(notes.value, 300),
      doctorName: cleanText(doctorName.value, 60),
      doctorPhone: phoneText || null,
    };
    const current = getProfile();
    const changed = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => value !== (current?.[key] ?? null)),
    );
    if (!Object.keys(changed).length) {
      showToast('Rien à modifier.');
      return;
    }
    saveHealthProfile(changed)
      .then(() => showToast('Profil santé enregistré.'))
      .catch(reportError);
  };

  return card({
    title: 'Profil santé',
    iconName: 'health',
    body: h(
      'form',
      { class: 'stack', onsubmit: submit },
      h(
        'div',
        { class: 'form-grid' },
        field('Groupe sanguin', bloodGroup),
        field('Taille (cm)', height),
      ),
      field('Allergies', allergies),
      field('Pathologies chroniques', conditions),
      field('Notes pour les secours', notes),
      h(
        'div',
        { class: 'form-grid' },
        field('Médecin traitant', doctorName),
        field('Son téléphone', doctorPhone),
      ),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
    ),
  });
}

function contactRow(contact) {
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Retirer ${contact.name} ?`,
      message: "Ce contact n'apparaîtra plus sur ta carte d'urgence.",
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (ok) await deleteEmergencyContact(contact.id);
  };
  const href = telHref(contact.phone);
  return h(
    'li',
    { class: 'contact' },
    h(
      'div',
      { class: 'contact__text' },
      h('strong', {}, contact.name),
      h('span', { class: 'muted' }, [contact.relation, contact.phone].filter(Boolean).join(' · ')),
    ),
    href
      ? h(
          'a',
          { class: 'icon-btn contact__call', href, 'aria-label': `Appeler ${contact.name}` },
          icon('phone', { size: 18 }),
        )
      : null,
    h(
      'button',
      {
        class: 'icon-btn icon-btn--quiet',
        type: 'button',
        'aria-label': `Retirer ${contact.name}`,
        onclick: () => remove().catch(reportError),
      },
      '×',
    ),
  );
}

function contactsCard(contacts) {
  const name = input('', {
    maxlength: 60,
    placeholder: 'Nom',
    required: true,
    'aria-label': 'Nom',
  });
  const phone = input('', {
    type: 'tel',
    inputmode: 'tel',
    maxlength: 24,
    placeholder: 'Téléphone',
    required: true,
    'aria-label': 'Téléphone',
  });
  const relation = input('', {
    maxlength: 40,
    placeholder: 'Lien (facultatif), ex. Sœur',
    'aria-label': 'Lien avec toi',
  });
  const add = (e) => {
    e.preventDefault();
    const form = e.target;
    const cleanName = cleanText(name.value, 60);
    if (!cleanName) return;
    if (!isValidPhone(phone.value)) {
      showToast('Numéro de téléphone invalide.', { tone: 'danger' });
      phone.focus();
      return;
    }
    const order = contacts.reduce((max, c) => Math.max(max, c.order + 1), 0);
    saveEmergencyContact(null, {
      name: cleanName,
      phone: phone.value.trim(),
      relation: cleanText(relation.value, 40),
      order,
    })
      .then(() => form.reset())
      .catch(reportError);
  };

  return card({
    title: "Contacts d'urgence",
    iconName: 'phone',
    body: [
      contacts.length
        ? h('ul', { class: 'contact-list' }, sortContacts(contacts).map(contactRow))
        : h('p', { class: 'empty' }, 'Ajoute une ou deux personnes à prévenir en cas de besoin.'),
      h(
        'form',
        { class: 'contact-form', onsubmit: add },
        name,
        phone,
        relation,
        h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
      ),
    ],
  });
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

export function renderHealth(outlet, ctx) {
  if (ctx.params[0] === 'emergency') return renderEmergency(outlet);

  const header = pageHeader('Santé', 'Suivi personnel');
  const state = { profile: undefined, contacts: [] };
  const slots = { link: h('div'), form: h('div'), contacts: h('div') };
  let mainMounted = false;

  function render() {
    if (state.profile === undefined) return; // base locale pas encore lue
    if (!state.profile?.disclaimerSeenOn) {
      mainMounted = false;
      mount(outlet, header, h('div', { class: 'stack' }, disclaimerCard()));
      return;
    }
    mount(slots.link, emergencyLink(emergencySummary(state.profile, state.contacts)));
    mount(slots.contacts, contactsCard(state.contacts));
    if (mainMounted) return; // le formulaire n'est pas reconstruit pendant la saisie
    mainMounted = true;
    mount(
      slots.form,
      profileForm(() => state.profile),
    );
    mount(
      outlet,
      header,
      h('div', { class: 'stack' }, slots.link, slots.form, slots.contacts, nextStepsCard()),
    );
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
  ];
  return () => stops.forEach((stop) => stop());
}
