import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError } from '../components/toast.js';
import { h, mount } from '../lib/dom.js';
import { activeHabits } from '../lib/habits.js';
import { addHabit, deleteHabit, updateHabit, watchHabits } from '../repos/habits.js';

export const SUGGESTIONS = [
  ['🏃', 'Sport'],
  ['📖', 'Lecture'],
  ['💧', "Boire 2 L d'eau"],
  ['🧘', 'Méditation'],
  ['📵', "Pas d'écran au lit"],
  ['🛏️', 'Coucher avant 23 h'],
];

const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

/** Formulaire d'ajout. getExisting() fournit les habitudes connues (pour l'ordre). */
export function habitForm(getExisting, { autofocus = false } = {}) {
  const emoji = h('input', {
    class: 'input input--emoji',
    name: 'emoji',
    maxlength: 16,
    placeholder: '🙂',
    'aria-label': 'Emoji (facultatif)',
    autocomplete: 'off',
  });
  const name = h('input', {
    class: 'input',
    name: 'name',
    maxlength: 60,
    required: true,
    placeholder: 'Nouvelle habitude',
    'aria-label': "Nom de l'habitude",
    autocomplete: 'off',
    autofocus,
  });
  return h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        const value = name.value.trim();
        if (!value) return;
        addHabit({ name: value, emoji: emoji.value.trim() }, getExisting()).catch(reportError);
        e.target.reset();
        name.focus();
      },
    },
    emoji,
    name,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter'),
  );
}

/** Boutons de suggestions (n'affiche que celles pas encore créées). */
export function suggestionChips(getExisting) {
  const taken = new Set(getExisting().map((hb) => hb.name.toLowerCase()));
  return h(
    'div',
    { class: 'chips' },
    SUGGESTIONS.filter(([, label]) => !taken.has(label.toLowerCase())).map(([emoji, label]) =>
      h(
        'button',
        {
          class: 'chip',
          type: 'button',
          onclick: () => addHabit({ name: label, emoji }, getExisting()).catch(reportError),
        },
        `${emoji} ${label}`,
      ),
    ),
  );
}

function reorder(siblings, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= siblings.length) return;
  const next = [...siblings];
  [next[index], next[target]] = [next[target], next[index]];
  next.forEach((hb, i) => {
    if (hb.order !== i) updateHabit(hb.id, { order: i }).catch(reportError);
  });
}

function habitRow(habit, index, siblings) {
  const nameInput = h('input', {
    class: 'input',
    value: habit.name,
    maxlength: 60,
    'aria-label': `Nom de ${habit.name}`,
    onchange: (e) => {
      const value = e.target.value.trim();
      if (!value) {
        e.target.value = habit.name;
        return;
      }
      if (value !== habit.name) updateHabit(habit.id, { name: value }).catch(reportError);
    },
  });
  const emojiInput = h('input', {
    class: 'input input--emoji',
    value: habit.emoji ?? '',
    maxlength: 16,
    'aria-label': `Emoji de ${habit.name}`,
    onchange: (e) =>
      updateHabit(habit.id, { emoji: e.target.value.trim() || null }).catch(reportError),
  });

  const moves =
    index >= 0
      ? [
          h(
            'button',
            {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              'aria-label': `Monter ${habit.name}`,
              disabled: index === 0,
              onclick: () => reorder(siblings, index, -1),
            },
            '↑',
          ),
          h(
            'button',
            {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              'aria-label': `Descendre ${habit.name}`,
              disabled: index === siblings.length - 1,
              onclick: () => reorder(siblings, index, 1),
            },
            '↓',
          ),
        ]
      : [];

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer « ${habit.name} » ?`,
      message: "Elle disparaît de toutes les grilles. « Archiver » garde l'historique.",
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) deleteHabit(habit.id).catch(reportError);
  };

  return h(
    'li',
    { class: 'manage-item' },
    h('div', { class: 'row' }, emojiInput, nameInput),
    h(
      'div',
      { class: 'row manage-item__actions' },
      moves,
      h(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          onclick: () => updateHabit(habit.id, { active: !habit.active }).catch(reportError),
        },
        habit.active ? 'Archiver' : 'Réactiver',
      ),
      h(
        'button',
        { class: 'btn btn--danger btn--sm', type: 'button', onclick: remove },
        'Supprimer',
      ),
    ),
  );
}

/** Fenêtre « Mes habitudes » : ajout, renommage, ordre, archivage, suppression. */
export function openHabitManager() {
  let habits = [];
  let renderLater = false;
  const list = h('div', { class: 'stack' });

  function render() {
    // Ne pas reconstruire sous les doigts : on attend la sortie du champ en cours d'édition.
    if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      renderLater = true;
      return;
    }
    renderLater = false;
    const active = activeHabits(habits);
    const archived = habits.filter((hb) => !hb.active).sort(byName);
    mount(
      list,
      active.length
        ? h(
            'ul',
            { class: 'manage-items' },
            active.map((hb, i) => habitRow(hb, i, active)),
          )
        : h('p', { class: 'empty' }, 'Aucune habitude active.'),
      archived.length
        ? [
            h('h3', { class: 'manage-subtitle' }, 'Archivées'),
            h(
              'ul',
              { class: 'manage-items' },
              archived.map((hb) => habitRow(hb, -1, [])),
            ),
          ]
        : null,
    );
  }
  list.addEventListener('focusout', () => setTimeout(() => renderLater && render(), 0));

  const content = h(
    'div',
    { class: 'stack' },
    habitForm(() => habits, { autofocus: true }),
    list,
  );
  let unsubscribe = null;
  openDialog({ title: 'Mes habitudes', content, onClose: () => unsubscribe?.() });
  unsubscribe = watchHabits((all) => {
    habits = all;
    render();
  }, reportError);
}
