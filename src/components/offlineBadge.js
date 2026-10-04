import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { pendingCount, subscribe } from '../store.js';

/** « Hors ligne » / « En attente de sync (n) » ; masqué quand tout est synchronisé. */
export function createOfflineBadge() {
  const el = h('div', { class: 'sync-badge', role: 'status', 'aria-live': 'polite', hidden: true });

  function render(state) {
    const pending = pendingCount(state);
    if (state.online && pending === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.classList.toggle('sync-badge--offline', !state.online);
    const label = state.online
      ? `En attente de sync (${pending})`
      : `Hors ligne${pending ? ` · ${pending} en attente` : ''}`;
    mount(el, icon(state.online ? 'sync' : 'cloudOff', { size: 16 }), h('span', {}, label));
  }

  const unsubscribe = subscribe(render);
  return { el, render, destroy: unsubscribe };
}
