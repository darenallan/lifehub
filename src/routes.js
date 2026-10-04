import { ROLE } from './lib/roles.js';
import { comingSoon } from './views/common.js';
import { renderSettings } from './views/settings.js';
import { renderToday } from './views/today.js';

const ADMIN_ONLY = [ROLE.ADMIN];
const HOUSE_ROLES = [ROLE.ADMIN, ROLE.MEMBER];

// `default` : route d'atterrissage du rôle. Un coloc atterrira sur « house » (phase 4).
export const ROUTES = [
  {
    path: 'today',
    title: "Aujourd'hui",
    icon: 'today',
    roles: ADMIN_ONLY,
    inNav: true,
    default: true,
    render: renderToday,
  },
  {
    path: 'habits',
    title: 'Habitudes',
    icon: 'habits',
    roles: ADMIN_ONLY,
    inNav: true,
    render: comingSoon('Habitudes', 1),
  },
  {
    path: 'expenses',
    title: 'Dépenses',
    icon: 'expenses',
    roles: ADMIN_ONLY,
    inNav: true,
    render: comingSoon('Dépenses', 2),
  },
  {
    path: 'tasks',
    title: 'Tâches',
    icon: 'tasks',
    roles: ADMIN_ONLY,
    inNav: true,
    render: comingSoon('Tâches', 3),
  },
  {
    path: 'house',
    title: 'Maison',
    icon: 'house',
    roles: HOUSE_ROLES,
    inNav: true,
    render: comingSoon('Maison', 4),
  },
  {
    path: 'settings',
    title: 'Réglages',
    icon: 'settings',
    roles: HOUSE_ROLES,
    inNav: true,
    render: renderSettings,
  },
];
