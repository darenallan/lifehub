import { signIn } from '../auth.js';
import { h } from '../lib/dom.js';

export function renderLogin({ authError }) {
  const button = h(
    'button',
    {
      class: 'btn btn--primary btn--lg',
      type: 'button',
      onclick: async () => {
        button.disabled = true;
        try {
          await signIn();
        } finally {
          button.disabled = false;
        }
      },
    },
    'Se connecter avec Google',
  );

  return h(
    'main',
    { class: 'center-screen' },
    h(
      'div',
      { class: 'auth-card' },
      h('span', { class: 'brand-dot brand-dot--lg', 'aria-hidden': 'true' }),
      h('h1', { class: 'page-title shimmer' }, 'LifeHub'),
      h('p', { class: 'muted' }, 'Habitudes, dépenses, tâches et maison. Hors ligne compris.'),
      button,
      authError ? h('p', { class: 'error', role: 'alert' }, authError) : null,
    ),
  );
}
