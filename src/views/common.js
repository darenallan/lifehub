import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

export function pageHeader(title, subtitle) {
  return h(
    'header',
    { class: 'page-header' },
    subtitle ? h('p', { class: 'eyebrow' }, subtitle) : null,
    h('h1', { class: 'page-title' }, title),
  );
}

export function card({ title, iconName, body, footer }) {
  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card__title' }, iconName ? icon(iconName, { size: 18 }) : null, title),
    h('div', { class: 'card__body' }, body),
    footer ? h('div', { class: 'card__footer' }, footer) : null,
  );
}

export function emptyState(text) {
  return h('p', { class: 'empty' }, text);
}

/** Écran des modules à venir. */
export function comingSoon(title, phase) {
  return (outlet) => {
    outlet.replaceChildren(
      pageHeader(title),
      card({ title: 'Bientôt', body: emptyState(`Ce module arrive en phase ${phase}.`) }),
    );
  };
}
