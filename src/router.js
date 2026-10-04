// Routeur hash : #/today, #/expenses/new… Une vue = render(outlet, ctx) → cleanup?

export function parseHash(hash) {
  const segments = (hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [path = '', ...params] = segments;
  return { path, params };
}

/** default: true (pour tous les rôles de la route) ou liste des rôles qui y atterrissent. */
export function defaultPath(routes, role) {
  const isDefault = (r) =>
    r.default === true || (Array.isArray(r.default) && r.default.includes(role));
  return routes.find((r) => r.roles.includes(role) && isDefault(r))?.path ?? null;
}

/** Route autorisée pour ce rôle, sinon la route par défaut du rôle. */
export function pickRoute(routes, path, role) {
  const match = routes.find((r) => r.path === path && r.roles.includes(role));
  if (match) return { route: match, redirected: false };
  const fallback = routes.find((r) => r.path === defaultPath(routes, role));
  return { route: fallback ?? null, redirected: true };
}

/**
 * Une vue peut être chargée à la demande : render() renvoie alors une promesse de cleanup.
 * Si l'utilisateur a changé de page entre-temps, la vue arrivée en retard est aussitôt nettoyée.
 */
export function createRouter({ routes, outlet, getContext, onRoute }) {
  let cleanup = null;
  let navigation = 0;
  let destroyed = false;

  async function render() {
    const ctx = getContext();
    const { path, params } = parseHash(location.hash);
    const { route, redirected } = pickRoute(routes, path, ctx.role);
    if (!route) return;
    if (redirected) history.replaceState(null, '', `#/${route.path}`);

    const current = ++navigation;
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    document.title = `${route.title} · LifeHub`;
    onRoute?.(route);

    const result = await route.render(outlet, { ...ctx, params });
    if (current !== navigation || destroyed) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = result ?? null;
  }

  const onHashChange = () => {
    render().catch((err) => console.error(err));
  };
  window.addEventListener('hashchange', onHashChange);

  return {
    render: onHashChange,
    destroy() {
      destroyed = true;
      window.removeEventListener('hashchange', onHashChange);
      if (typeof cleanup === 'function') cleanup();
      cleanup = null;
    },
  };
}
