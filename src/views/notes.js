import { confirmDialog, openDialog } from '../components/modal.js';
import { reportError } from '../components/toast.js';
import { formatLongDate, parseDayKey } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { addNote, deleteNote, updateNote, watchNotes } from '../repos/extras.js';
import { pageHeader } from './common.js';

const MAX = 2000;

/** Épinglées d'abord, puis les plus récentes. */
const sortNotes = (notes) =>
  [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
  );

function stamp(createdAt) {
  return `${formatLongDate(parseDayKey(createdAt.slice(0, 10)))} · ${createdAt.slice(11)}`;
}

function openNoteEditor(note) {
  const text = h('textarea', {
    class: 'input textarea',
    maxlength: MAX,
    rows: 8,
    'aria-label': 'Texte de la note',
  });
  text.value = note.text;
  let dialog;
  const save = (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (value && value !== note.text) updateNote(note.id, { text: value }).catch(reportError);
    dialog.close();
  };
  dialog = openDialog({
    title: 'Modifier la note',
    content: h(
      'form',
      { class: 'stack', onsubmit: save },
      text,
      h(
        'div',
        { class: 'row modal__actions' },
        h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer'),
      ),
    ),
  });
  text.focus();
}

function noteCard(note) {
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette note ?',
      message: note.text.slice(0, 80),
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) deleteNote(note.id).catch(reportError);
  };
  return h(
    'article',
    { class: `card note${note.pinned ? ' is-pinned' : ''}` },
    h('p', { class: 'note__text' }, note.text),
    h(
      'div',
      { class: 'row row--between row--wrap note__footer' },
      h('span', { class: 'muted' }, stamp(note.createdAt)),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            'aria-pressed': String(note.pinned),
            onclick: () => updateNote(note.id, { pinned: !note.pinned }).catch(reportError),
          },
          note.pinned ? 'Désépingler' : 'Épingler',
        ),
        h(
          'button',
          { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => openNoteEditor(note) },
          'Modifier',
        ),
        h(
          'button',
          { class: 'btn btn--danger btn--sm', type: 'button', onclick: remove },
          'Supprimer',
        ),
      ),
    ),
  );
}

export function renderNotes(outlet) {
  const input = h('textarea', {
    class: 'input textarea',
    maxlength: MAX,
    rows: 3,
    placeholder: 'Une idée, un code, une adresse…',
    'aria-label': 'Nouvelle note',
  });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        addNote(text).catch(reportError);
        input.value = '';
      },
    },
    input,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter la note'),
    ),
  );
  const list = h('div', { class: 'notes' });
  mount(outlet, pageHeader('Notes rapides'), h('div', { class: 'stack' }, form, list));

  return watchNotes((notes) => {
    mount(
      list,
      notes.length
        ? sortNotes(notes).map(noteCard)
        : h('p', { class: 'empty' }, 'Aucune note pour le moment.'),
    );
  }, reportError);
}
