// Onglet « Plus » : regroupe les écrans secondaires pour garder la barre du bas lisible.
import { h, mount } from '../lib/dom.js';
import { ROLE } from '../lib/roles.js';
import { pageHeader } from './common.js';

const ITEMS = [
  {
    href: '#/health',
    title: 'Santé',
    text: "Profil santé, contacts d'urgence ; bientôt traitements et mesures.",
    admin: true,
  },
  {
    href: '#/health/emergency',
    title: "Carte d'urgence",
    text: 'Groupe sanguin, allergies, contacts à appeler. Lisible hors ligne.',
    admin: true,
  },
  {
    href: '#/review',
    title: 'Revue de la semaine',
    text: 'Habitudes, dépenses, tâches : le bilan automatique.',
    admin: true,
  },
  {
    href: '#/debts',
    title: 'Dettes et prêts',
    text: 'Qui doit quoi, et ce qui est réglé.',
    admin: true,
  },
  {
    href: '#/notes',
    title: 'Notes rapides',
    text: 'Idées, codes, adresses… sous la main.',
    admin: true,
  },
  {
    href: '#/settings',
    title: 'Réglages',
    text: 'Thème, compte, export et import de tes données.',
    admin: false,
  },
];

export function renderMore(outlet, { role }) {
  const items = ITEMS.filter((item) => !item.admin || role === ROLE.ADMIN);
  mount(
    outlet,
    pageHeader('Plus'),
    h(
      'ul',
      { class: 'more-list' },
      items.map((item) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'card more-item', href: item.href },
            h('strong', {}, item.title),
            h('span', { class: 'muted' }, item.text),
          ),
        ),
      ),
    ),
  );
}
