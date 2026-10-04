import { reportError } from '../components/toast.js';
import { formatLongDate } from '../lib/dates.js';
import { h, mount } from '../lib/dom.js';
import { watchProfile } from '../repos/profile.js';
import { card, emptyState, pageHeader } from './common.js';

const firstName = (displayName) => (displayName ?? '').trim().split(/\s+/)[0] ?? '';

export function renderToday(outlet, { user }) {
  const header = pageHeader('Bonjour', formatLongDate());
  const title = header.querySelector('.page-title');

  const grid = h(
    'div',
    { class: 'grid' },
    card({
      title: 'Habitudes du jour',
      iconName: 'habits',
      body: emptyState('Arrive en phase 1.'),
    }),
    card({
      title: 'Dépense du jour',
      iconName: 'expenses',
      body: emptyState('Arrive en phase 2.'),
    }),
    card({
      title: 'Objectifs & tâches',
      iconName: 'tasks',
      body: emptyState('Arrive en phase 3.'),
    }),
    card({ title: 'Factures proches', iconName: 'house', body: emptyState('Arrive en phase 4.') }),
  );

  mount(outlet, header, grid);

  // Le profil est créé côté serveur au premier GET /api/me, puis arrive par la sync.
  return watchProfile((profile) => {
    const name = profile?.displayName || firstName(user.displayName);
    title.textContent = name ? `Bonjour ${name}` : 'Bonjour';
  }, reportError);
}
