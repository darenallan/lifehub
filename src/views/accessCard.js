// Réglages · « Accès à LifeHub » : le propriétaire autorise quelques personnes (leur propre espace).
// La carte n'apparaît que si l'API confirme que l'utilisateur est le propriétaire.
import { confirmDialog } from '../components/modal.js';
import { reportError, showToast } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { grantAccess, listAccess, revokeAccess } from '../repos/access.js';
import { card } from './common.js';

const ERRORS = {
  invalid_email: 'Adresse e-mail invalide.',
  owner_email: "C'est ton propre compte : tu as déjà accès.",
  too_many_users: 'Nombre maximum de personnes atteint.',
};

const formatDay = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export function accessCard() {
  const body = h('div', { class: 'stack' });
  const el = card({ title: 'Accès à LifeHub', iconName: 'settings', body });
  el.hidden = true;
  let active = true;

  async function remove(email) {
    const ok = await confirmDialog({
      title: `Retirer l'accès de ${email} ?`,
      message:
        'Cette personne ne pourra plus se connecter. Ses données sont conservées : la réajouter lui rend tout.',
      confirmLabel: "Retirer l'accès",
      danger: true,
    });
    if (!ok) return;
    await revokeAccess(email);
    showToast('Accès retiré.');
    await load();
  }

  function userRow(user) {
    return h(
      'li',
      { class: 'contact' },
      h(
        'div',
        { class: 'contact__text' },
        h('strong', { class: 'mono' }, user.email),
        h('span', { class: 'muted' }, `Depuis le ${formatDay(user.addedOn)}`),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'aria-label': `Retirer l'accès de ${user.email}`,
          onclick: () => remove(user.email).catch(reportError),
        },
        'Retirer',
      ),
    );
  }

  function render({ users, max }) {
    const email = h('input', {
      class: 'input',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'off',
      placeholder: 'adresse@gmail.com',
      required: true,
      'aria-label': 'E-mail de la personne à autoriser',
    });
    const submit = async (e) => {
      e.preventDefault();
      try {
        await grantAccess(email.value.trim());
        showToast('Accès ajouté : la personne peut se connecter avec ce compte Google.');
        await load();
      } catch (err) {
        if (ERRORS[err.code]) showToast(ERRORS[err.code], { tone: 'danger' });
        else reportError(err);
      }
    };
    mount(
      body,
      h(
        'p',
        { class: 'muted' },
        "Chaque personne ajoutée a son propre LifeHub, séparé du tien : elle ne voit pas tes données, et tu ne vois pas les siennes dans l'app.",
      ),
      users.length
        ? h('ul', { class: 'contact-list' }, users.map(userRow))
        : h('p', { class: 'empty' }, 'Personne pour le moment.'),
      users.length < max
        ? h(
            'form',
            { class: 'row', onsubmit: submit },
            email,
            h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
          )
        : h('p', { class: 'muted' }, `Maximum atteint (${max} personnes).`),
      h(
        'p',
        { class: 'field__hint' },
        "Tu héberges leurs données, y compris de santé : elles leur appartiennent. Elles se connectent avec Google, avec l'adresse exacte ajoutée ici.",
      ),
    );
  }

  async function load() {
    try {
      const data = await listAccess();
      if (!active) return;
      el.hidden = false;
      render(data);
    } catch (err) {
      // 403 : pas le propriétaire. Hors ligne : la gestion attendra le réseau.
      if (err.status !== 403 && err.status !== 0) reportError(err);
    }
  }

  load();
  return {
    el,
    cleanup: () => {
      active = false;
    },
  };
}
