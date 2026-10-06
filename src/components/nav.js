import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

/** Barre du bas (mobile) / sidebar (desktop), selon le CSS. */
export function createNav(routes, role) {
  const links = routes
    .filter((r) => r.inNav && r.roles.includes(role))
    .map((r) =>
      h(
        'a',
        { class: 'nav__link', href: `#/${r.path}`, dataset: { path: r.path } },
        icon(r.icon),
        h('span', { class: 'nav__label' }, r.title),
      ),
    );

  const el = h(
    'nav',
    { class: 'nav', 'aria-label': 'Navigation principale' },
    h(
      'div',
      { class: 'nav__brand' },
      h('span', { class: 'brand-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'shimmer' }, 'LifeHub'),
    ),
    h('div', { class: 'nav__links' }, links),
  );

  function setActive(path) {
    for (const link of links) {
      const active = link.dataset.path === path;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  return { el, setActive };
}
