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
