// Santé · profil et contacts d'urgence (#/health/profile) : ce qui alimente la carte d'urgence.
// Rien n'est pré-rempli ni interprété : tout vient de la saisie de l'utilisateur.
import { confirmDialog, openDialog } from '../../components/modal.js';
import { reportError, showToast } from '../../components/toast.js';
import { h, mount } from '../../lib/dom.js';
import {
  BLOOD_GROUPS,
  cleanText,
  isValidPhone,
  parseHeight,
  sortContacts,
  telHref,
} from '../../lib/health/emergency.js';
import { icon } from '../../lib/icons.js';
import {
  deleteAllHealthData,
  deleteEmergencyContact,
  saveEmergencyContact,
  saveHealthProfile,
  watchEmergencyContacts,
  watchHealthProfile,
} from '../../repos/health.js';
import { card, pageHeader } from '../common.js';

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control);
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

/** Suppression de toutes les données de santé : confirmation forte (mot à taper). */
function openDeleteAll() {
  const word = h('input', {
    class: 'input',
    autocomplete: 'off',
    'aria-label': 'Tape SUPPRIMER pour confirmer',
    placeholder: 'SUPPRIMER',
  });
  let dialog;
  const submit = async (e) => {
    e.preventDefault();
    if (word.value.trim() !== 'SUPPRIMER') {
      showToast('Tape SUPPRIMER en majuscules pour confirmer.', { tone: 'danger' });
      return;
    }
    try {
      const count = await deleteAllHealthData();
      dialog.close();
      showToast(`Données de santé supprimées (${count} élément(s)).`);
      location.hash = '#/health';
    } catch (err) {
      reportError(err);
    }
  };
  dialog = openDialog({
    title: 'Supprimer toutes mes données de santé ?',
    content: h(
      'form',
      { class: 'stack', onsubmit: submit },
      h(
        'p',
        {},
        "Traitements, prises, stock, mesures, journal, profil santé et contacts d'urgence seront supprimés sur tous tes appareils.",
      ),
      h(
        'p',
        { class: 'muted' },
        "Les dépenses de pharmacie et l'humeur/sommeil (Habitudes) sont conservés. Pense à exporter tes données avant (Réglages → Mes données).",
      ),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tape SUPPRIMER'), word),
      h('button', { class: 'btn btn--danger btn--lg', type: 'submit' }, 'Tout supprimer'),
    ),
  });
  word.focus();
}

export function renderHealthProfile(outlet) {
  const state = { profile: undefined, contacts: [] };
  const form = h('div');
  const contacts = h('div');
  let formMounted = false;

  mount(
    outlet,
    pageHeader('Profil et contacts', 'Santé'),
    h(
      'div',
      { class: 'stack' },
      h(
        'p',
        { class: 'muted' },
        "Ces informations alimentent ta carte d'urgence, lisible hors ligne.",
      ),
      form,
      contacts,
      h('a', { class: 'btn btn--ghost', href: '#/health/emergency' }, "Voir ma carte d'urgence"),
      card({
        title: 'Zone sensible',
        body: [
          h(
            'p',
            { class: 'muted' },
            'Tes données de santé sont sur cet appareil et sur ton serveur LifeHub, jamais chez un tiers.',
          ),
          h(
            'button',
            { class: 'btn btn--danger', type: 'button', onclick: openDeleteAll },
            'Supprimer toutes mes données de santé',
          ),
        ],
      }),
    ),
  );

  function render() {
    if (state.profile === undefined) return; // base locale pas encore lue
    mount(contacts, contactsCard(state.contacts));
    if (formMounted) return; // le formulaire n'est pas reconstruit pendant la saisie
    formMounted = true;
    mount(
      form,
      profileForm(() => state.profile),
    );
  }

  const stops = [
    watchHealthProfile((profile) => {
      state.profile = profile;
      render();
    }, reportError),
    watchEmergencyContacts((list) => {
      state.contacts = list;
      render();
    }, reportError),
  ];
  return () => stops.forEach((stop) => stop());
}
