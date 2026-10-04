import { refreshRole } from '../../auth.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';
import { h } from '../../lib/dom.js';
import { cancelInvite, inviteMember, removeMember, renameHouse } from '../../repos/house.js';
import { card } from '../common.js';
import { apiErrorMessage } from './common.js';

const failed = (err) => showToast(apiErrorMessage(err), { tone: 'danger' });

function inviteForm(houseId) {
  const email = h('input', {
    class: 'input',
    type: 'email',
    required: true,
    maxlength: 254,
    autocomplete: 'off',
    placeholder: 'adresse@gmail.com',
    'aria-label': 'E-mail Google du coloc',
  });
  return h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const value = email.value.trim();
        if (!value) return;
        inviteMember(houseId, value)
          .then(() => {
            showToast("Invitation enregistrée. Partage-lui le lien de l'app.");
            email.value = '';
          })
          .catch(failed);
      },
    },
    email,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Inviter'),
  );
}

function renameForm(house) {
  const name = h('input', {
    class: 'input',
    maxlength: 60,
    required: true,
    value: house.name,
    'aria-label': 'Nom de la maison',
  });
  return h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const value = name.value.trim();
        if (value && value !== house.name) {
          renameHouse(house.id, value)
            .then(() => showToast('Nom mis à jour.'))
            .catch(failed);
        }
      },
    },
    name,
    h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Renommer'),
  );
}

const label = (m) => m.displayName || m.email;

export function membersPanel({ house, members, invites, isAdmin, uid }) {
  const sorted = [...members].sort(
    (a, b) =>
      Number(b.role === 'admin') - Number(a.role === 'admin') ||
      label(a).localeCompare(label(b), 'fr'),
  );

  const revoke = async (member) => {
    const ok = await confirmDialog({
      title: `Retirer ${label(member)} ?`,
      message:
        "Son accès est coupé immédiatement, et les données de la maison sont effacées de son appareil à sa prochaine ouverture de l'app.",
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (ok) removeMember(house.id, member.userId).catch(failed);
  };

  const leave = async () => {
    const ok = await confirmDialog({
      title: 'Quitter la maison ?',
      message: "Tu n'auras plus accès à ses données. L'admin pourra te réinviter.",
      confirmLabel: 'Quitter',
      danger: true,
    });
    if (!ok) return;
    removeMember(house.id, uid)
      .then(() => refreshRole())
      .catch(failed);
  };

  const memberList = h(
    'ul',
    { class: 'member-list' },
    sorted.map((m) =>
      h(
        'li',
        { class: 'member' },
        h(
          'div',
          { class: 'member__text' },
          h('strong', {}, label(m), m.userId === uid ? ' (toi)' : ''),
          h('span', { class: 'muted' }, m.email),
        ),
        m.role === 'admin' ? h('span', { class: 'badge badge--text' }, 'Admin') : null,
        isAdmin && m.role === 'member'
          ? h(
              'button',
              { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => revoke(m) },
              'Retirer',
            )
          : null,
      ),
    ),
  );

  const cards = [card({ title: 'Membres', iconName: 'house', body: memberList })];

  if (isAdmin) {
    const pending = invites.length
      ? h(
          'ul',
          { class: 'member-list' },
          invites.map((invite) =>
            h(
              'li',
              { class: 'member' },
              h(
                'div',
                { class: 'member__text' },
                h('strong', {}, invite.email),
                h('span', { class: 'muted' }, 'En attente de connexion'),
              ),
              h(
                'button',
                {
                  class: 'btn btn--ghost btn--sm',
                  type: 'button',
                  onclick: () => cancelInvite(house.id, invite.id).catch(failed),
                },
                'Annuler',
              ),
            ),
          ),
        )
      : null;
    cards.push(
      card({
        title: 'Inviter un coloc',
        body: [
          h(
            'p',
            { class: 'muted' },
            "Saisis son adresse Google. Quand il ouvre l'app et se connecte avec cette adresse, il rejoint la maison (accès Maison uniquement).",
          ),
          inviteForm(house.id),
          pending,
        ],
      }),
      card({ title: 'Nom de la maison', body: renameForm(house) }),
    );
  } else {
    cards.push(
      card({
        title: 'Quitter',
        body: h(
          'button',
          { class: 'btn btn--danger', type: 'button', onclick: leave },
          'Quitter la maison',
        ),
      }),
    );
  }
  return h('div', { class: 'stack' }, cards);
}
