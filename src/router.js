// Routeur hash : #/today, #/expenses/new… Une vue = render(outlet, ctx) → cleanup?

export function parseHash(hash) {
  const segments = (hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [path = '', ...params] = segments;
  return { path, params };
}

export function defaultPath(routes, role) {
  return routes.find((r) => r.roles.includes(role) && r.default)?.path ?? null;
}

/** Route autorisée pour ce rôle, sinon la route par défaut du rôle. */
export function pickRoute(routes, path, role) {
  const match = routes.find((r) => r.path === path && r.roles.includes(role));
  if (match) return { route: match, redirected: false };
  const fallback = routes.find((r) => r.path === defaultPath(routes, role));
  return { route: fallback ?? null, redirected: true };
}

export function createRouter({ routes, outlet, getContext, onRoute }) {
  let cleanup = null;

  function render() {
    const ctx = getContext();
    const { path, params } = parseHash(location.hash);
    const { route, redirected } = pickRoute(routes, path, ctx.role);
    if (!route) return;
    if (redirected) history.replaceState(null, '', `#/${route.path}`);

    if (typeof cleanup === 'function') cleanup();
    cleanup = route.render(outlet, { ...ctx, params }) ?? null;
    document.title = `${route.title} · LifeHub`;
    onRoute?.(route);
  }

  window.addEventListener('hashchange', render);

  return {
    render,
    destroy() {
      window.removeEventListener('hashchange', render);
      if (typeof cleanup === 'function') cleanup();
      cleanup = null;
    },
  };
}
