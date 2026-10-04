import { h } from '../lib/dom.js';

/** Boîte de confirmation basée sur <dialog>. Résout true si confirmé. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'modal', 'aria-labelledby': 'modal-title' },
      h(
        'form',
        { method: 'dialog', class: 'modal__body' },
        h('h2', { id: 'modal-title', class: 'modal__title' }, title),
        message ? h('p', { class: 'muted' }, message) : null,
        h(
          'div',
          { class: 'modal__actions' },
          h('button', { class: 'btn btn--ghost', value: 'cancel' }, 'Annuler'),
          h(
            'button',
            { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, value: 'ok' },
            confirmLabel,
          ),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

let dialogCount = 0;

/** Fenêtre générique (titre + contenu). Retourne { close }. onClose appelé une fois à la fermeture. */
export function openDialog({ title, content, onClose }) {
  const titleId = `dialog-title-${++dialogCount}`;
  const dialog = h(
    'dialog',
    { class: 'modal modal--wide', 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'modal__body' },
      h(
        'div',
        { class: 'modal__header' },
        h('h2', { id: titleId, class: 'modal__title' }, title),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Fermer',
            onclick: () => dialog.close(),
          },
          '×',
        ),
      ),
      content,
    ),
  );
  dialog.addEventListener('close', () => {
    onClose?.();
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close: () => dialog.close() };
}
