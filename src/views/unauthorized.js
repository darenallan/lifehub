import { logout } from '../auth.js';
import { h } from '../lib/dom.js';

export function renderUnauthorized({ user }) {
  return h(
    'main',
    { class: 'center-screen' },
    h(
      'div',
      { class: 'auth-card' },
      h('h1', { class: 'page-title' }, 'Accès non autorisé'),
      h(
        'p',
        { class: 'muted' },
        "Ce compte n'a pas accès à LifeHub. Si tu as été invité, demande à l'admin de vérifier l'adresse :",
      ),
      h('p', { class: 'mono' }, user?.email ?? ''),
      h(
        'button',
        { class: 'btn btn--ghost', type: 'button', onclick: () => logout() },
        'Changer de compte',
      ),
    ),
  );
}
