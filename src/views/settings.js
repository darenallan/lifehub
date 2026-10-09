import { logout } from '../auth.js';
import { confirmDialog } from '../components/modal.js';
import { reportError, showToast } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { ROLE } from '../lib/roles.js';
import { saveProfile, watchProfile } from '../repos/profile.js';
import { parseBackup } from '../lib/backup.js';
import { dayKey } from '../lib/dates.js';
import { exportBackup, importBackup } from '../repos/extras.js';
import { accessCard } from './accessCard.js';
import { isNative } from '../native.js';
import { alarmsCard } from './alarmsCard.js';
import { pushCard } from './pushCard.js';
import { card, pageHeader } from './common.js';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

async function downloadExport() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { download: `lifehub-export-${dayKey()}.json` });
  link.href = url; // URL blob: posée directement (dom.js n'autorise que http/https/relatives)
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const total = Object.values(backup.collections).reduce((s, list) => s + list.length, 0);
  showToast(`Export prêt : ${total} élément(s).`);
}

async function importFile(file) {
  if (file.size > MAX_IMPORT_BYTES) {
    showToast('Fichier trop volumineux (10 Mo maximum).', { tone: 'danger' });
    return;
  }
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    showToast(parsed.error, { tone: 'danger' });
    return;
  }
  const summary = Object.entries(parsed.counts)
    .map(([collection, n]) => `${collection} : ${n}`)
    .join(', ');
  const ok = await confirmDialog({
    title: `Importer ${parsed.docs.length} élément(s) ?`,
    message: `${summary}. Les éléments du fichier remplacent ceux qui ont le même identifiant ; rien n'est supprimé.`,
    confirmLabel: 'Importer',
  });
  if (!ok) return;
  const count = await importBackup(parsed.docs, (n) => showToast(`Import… ${n}`));
  showToast(`Import terminé : ${count} élément(s). Synchronisation en cours.`);
}

/** Export / import JSON : le fichier reste sur l'appareil, rien n'est envoyé à un tiers. */
function dataCard() {
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    id: 'import-file',
    onchange: (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (file) importFile(file).catch(reportError);
    },
  });
  return card({
    title: 'Mes données',
    body: [
      h(
        'p',
        { class: 'muted' },
        "Export de tes données perso (habitudes, dépenses, tâches, dettes, notes…) dans un fichier JSON sur ton appareil. Rien n'est envoyé à un tiers.",
      ),
      h(
        'div',
        { class: 'row row--wrap' },
        h(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            onclick: () => downloadExport().catch(reportError),
          },
          'Exporter (JSON)',
        ),
        h('label', { class: 'btn btn--ghost', for: 'import-file' }, 'Importer un fichier'),
        fileInput,
      ),
    ],
  });
}

const THEMES = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

/** syncProfile : l'admin garde son thème dans son profil ; un coloc seulement sur l'appareil. */
function themeSwitch(syncProfile) {
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
          if (syncProfile) saveProfile({ theme: value }).catch(reportError);
        },
      },
      label,
    ),
  );
  return h('div', { class: 'segmented', role: 'group', 'aria-label': 'Thème' }, buttons);
}

function nameForm() {
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
        saveProfile({ displayName }).catch(reportError);
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

export function renderSettings(outlet, { user, role }) {
  const isAdmin = role === ROLE.ADMIN;
  const { form, input } = nameForm();
  // Visible seulement si l'API confirme que c'est le propriétaire.
  const access = isAdmin ? accessCard() : null;
  // Appli Android : alarmes locales ; navigateur : Web Push.
  const push = isAdmin ? (isNative() ? alarmsCard() : pushCard()) : null;

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
      isAdmin
        ? card({ title: 'Profil', body: [h('p', { class: 'muted' }, 'Prénom affiché'), form] })
        : null,
      card({ title: 'Apparence', body: themeSwitch(isAdmin) }),
      isAdmin ? dataCard() : null,
      push?.el,
      access?.el,
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

  if (!isAdmin) return null; // profil = donnée perso de l'admin
  const unsubscribe = watchProfile((profile) => {
    if (document.activeElement !== input) input.value = profile?.displayName ?? '';
  }, reportError);
  return () => {
    unsubscribe();
    access.cleanup();
    push.cleanup();
  };
}
