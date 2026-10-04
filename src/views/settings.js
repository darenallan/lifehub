import { logout } from '../auth.js';
import { confirmDialog } from '../components/modal.js';
import { reportError, showToast } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { saveProfile, watchProfile } from '../repos/profile.js';
import { card, pageHeader } from './common.js';

const THEMES = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

function themeSwitch(uid) {
  const buttons = THEMES.map(({ value, label }) =>
    h(
      'button',
      {
        type: 'button',
        class: 'segmented__btn',
        dataset: { value },
        'aria-pressed': String(getTheme() === value),
        onclick: () => {
          setTheme(value);
          for (const b of buttons)
            b.setAttribute('aria-pressed', String(b.dataset.value === value));
          saveProfile(uid, { theme: value }).catch(reportError);
        },
      },
      label,
    ),
  );
  return h('div', { class: 'segmented', role: 'group', 'aria-label': 'Thème' }, buttons);
}

function nameForm(uid) {
  const input = h('input', {
    class: 'input',
    id: 'displayName',
    name: 'displayName',
    maxlength: 60,
    autocomplete: 'nickname',
  });
  const form = h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const displayName = input.value.trim().slice(0, 60);
        saveProfile(uid, { displayName }).catch(reportError);
        showToast('Nom enregistré');
      },
    },
    h('label', { class: 'sr-only', for: 'displayName' }, 'Prénom affiché'),
    input,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
  );
  return { form, input };
}

async function confirmWipe() {
  const ok = await confirmDialog({
    title: 'Effacer les données locales ?',
    message:
      'Les écritures pas encore synchronisées seront perdues. Les données déjà sur le serveur ne sont pas touchées.',
    confirmLabel: 'Déconnecter et effacer',
    danger: true,
  });
  if (ok) logout({ clearCache: true }).catch(reportError);
}

export function renderSettings(outlet, { user }) {
  const { form, input } = nameForm(user.uid);

  const accountActions = h(
    'div',
    { class: 'row row--wrap' },
    h(
      'button',
      { class: 'btn btn--ghost', type: 'button', onclick: () => logout().catch(reportError) },
      icon('logout', { size: 18 }),
      'Se déconnecter',
    ),
    h(
      'button',
      { class: 'btn btn--danger', type: 'button', onclick: confirmWipe },
      'Déconnecter et effacer cet appareil',
    ),
  );

  mount(
    outlet,
    pageHeader('Réglages'),
    h(
      'div',
      { class: 'stack' },
      card({ title: 'Profil', body: [h('p', { class: 'muted' }, 'Prénom affiché'), form] }),
      card({ title: 'Apparence', body: themeSwitch(user.uid) }),
      card({
        title: 'Compte',
        body: [
          h('p', { class: 'muted' }, 'Connecté en tant que'),
          h('p', { class: 'mono' }, user.email),
        ],
        footer: accountActions,
      }),
    ),
  );

  return watchProfile(
    user.uid,
    (profile) => {
      if (document.activeElement !== input) input.value = profile?.displayName ?? '';
    },
    reportError,
  );
}
