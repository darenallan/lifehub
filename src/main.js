// Polices auto-hébergées (CSP font-src 'self', précachées pour le hors ligne), sous-ensemble latin.
import '@fontsource/syne/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import '@fontsource/instrument-serif/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/habits.css';
import './styles/expenses.css';
import './styles/tasks.css';
import './styles/house.css';
import './styles/ambiance.css';

import { registerSW } from 'virtual:pwa-register';
import { initAuth, logout, refreshRole } from './auth.js';
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

const ENTER_MS = 1300;

/** Rejoue l'entrée en cascade de la page ; la classe est retirée ensuite pour que
 *  les re-rendus liés aux données (cocher, sync) ne relancent pas l'animation. */
function playEnter(outlet) {
  clearTimeout(outlet.enterTimer);
  outlet.classList.remove('is-entering');
  void outlet.offsetWidth; // force le redémarrage des animations CSS
  outlet.classList.add('is-entering');
  outlet.enterTimer = setTimeout(() => outlet.classList.remove('is-entering'), ENTER_MS);
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
          h('span', { class: 'topbar__brand shimmer' }, 'LifeHub'),
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
    onRoute: (route) => {
      nav.setActive(route.navParent ?? route.path);
      playEnter(outlet);
    },
  });
  router.render();
}

function renderWaitingForRole(state) {
  const body = state.roleError
    ? [
        h('p', { class: 'error', role: 'alert' }, state.roleError),
        h(
          'button',
          { class: 'btn btn--primary', type: 'button', onclick: refreshRole },
          'Réessayer',
        ),
        h(
          'button',
          { class: 'btn btn--ghost', type: 'button', onclick: () => logout() },
          'Changer de compte',
        ),
      ]
    : [
        h('span', { class: 'spinner', role: 'progressbar', 'aria-label': 'Chargement' }),
        // Premier appel après une période d'inactivité : Render redémarre le serveur.
        h('p', { class: 'muted' }, "Connexion au serveur… (jusqu'à une minute au réveil)"),
      ];
  return h('main', { class: 'center-screen' }, h('div', { class: 'auth-card' }, body));
}

/** Ne reconstruit l'écran que si l'identité, le rôle ou une erreur change. */
function renderApp(state) {
  const key = [state.authReady, state.user?.uid, state.role, state.authError, state.roleError].join(
    '|',
  );
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
  } else if (!state.role) {
    mount(root, renderWaitingForRole(state));
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
