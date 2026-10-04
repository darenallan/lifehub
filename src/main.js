import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { registerSW } from 'virtual:pwa-register';
import { initAuth } from './auth.js';
import { createNav } from './components/nav.js';
import { createOfflineBadge } from './components/offlineBadge.js';
import { showToast } from './components/toast.js';
import { h, mount } from './lib/dom.js';
import { ROLE } from './lib/roles.js';
import { applyTheme } from './lib/theme.js';
import { createRouter } from './router.js';
import { ROUTES } from './routes.js';
import { getState, setState, subscribe } from './store.js';
import { renderLogin } from './views/login.js';
import { renderUnauthorized } from './views/unauthorized.js';

applyTheme();

const root = document.getElementById('app');
let router = null;
let badge = null;
let screenKey = null;

function teardownShell() {
  router?.destroy();
  badge?.destroy();
  router = null;
  badge = null;
}

function renderShell(state) {
  const nav = createNav(ROUTES, state.role);
  badge = createOfflineBadge();
  const outlet = h('div', { class: 'view' });

  mount(
    root,
    h(
      'div',
      { class: 'app' },
      nav.el,
      h(
        'div',
        { class: 'main' },
        h(
          'header',
          { class: 'topbar' },
          h('span', { class: 'topbar__brand' }, 'LifeHub'),
          badge.el,
        ),
        h('main', { id: 'main' }, outlet),
      ),
    ),
  );
  badge.render(state);

  router = createRouter({
    routes: ROUTES,
    outlet,
    getContext: () => ({ user: getState().user, role: getState().role }),
    onRoute: (route) => nav.setActive(route.path),
  });
  router.render();
}

/** Ne reconstruit l'écran que si l'identité, le rôle ou l'erreur de connexion change. */
function renderApp(state) {
  const key = [state.authReady, state.user?.uid, state.role, state.authError].join('|');
  if (key === screenKey) return;
  screenKey = key;
  teardownShell();

  if (!state.authReady) {
    mount(
      root,
      h(
        'div',
        { class: 'center-screen' },
        h('span', { class: 'spinner', role: 'progressbar', 'aria-label': 'Chargement' }),
      ),
    );
  } else if (!state.user) {
    mount(root, renderLogin(state));
  } else if (state.role === ROLE.UNAUTHORIZED) {
    mount(root, renderUnauthorized(state));
  } else {
    renderShell(state);
  }
}

window.addEventListener('online', () => setState({ online: true }));
window.addEventListener('offline', () => setState({ online: false }));

const updateSW = registerSW({
  onNeedRefresh() {
    showToast('Nouvelle version disponible', {
      actionLabel: 'Recharger',
      onAction: () => updateSW(true),
      persistent: true,
    });
  },
  onOfflineReady() {
    showToast('Prêt à fonctionner hors ligne');
  },
});

subscribe(renderApp);
renderApp(getState());
initAuth();
