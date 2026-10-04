import { h } from '../lib/dom.js';

let region;

function getRegion() {
  if (!region) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

/**
 * showToast('Enregistré') ou showToast('Nouvelle version', { actionLabel, onAction, persistent: true })
 * Retourne une fonction pour fermer le toast.
 */
export function showToast(
  message,
  { actionLabel, onAction, persistent = false, duration = 4000, tone } = {},
) {
  const close = () => toast.remove();
  const action = actionLabel
    ? h(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          onclick: () => {
            close();
            onAction?.();
          },
        },
        actionLabel,
      )
    : null;
  const dismiss = persistent
    ? h(
        'button',
        { class: 'toast__close', type: 'button', 'aria-label': 'Fermer', onclick: close },
        '×',
      )
    : null;
  const toast = h(
    'div',
    { class: `toast${tone ? ` toast--${tone}` : ''}` },
    h('span', {}, message),
    action,
    dismiss,
  );

  getRegion().append(toast);
  if (!persistent) setTimeout(close, duration);
  return close;
}

/** Erreur d'écriture/lecture Firestore → message lisible. */
export function reportError(err) {
  console.error(err);
  const denied = err?.code === 'permission-denied';
  showToast(denied ? 'Action refusée par les règles de sécurité.' : 'Une erreur est survenue.', {
    tone: 'danger',
  });
}
