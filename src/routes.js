import { ROLE } from './lib/roles.js';
import { renderExpenses } from './views/expenses.js';
import { renderHabits } from './views/habits.js';
import { renderHouse } from './views/house/index.js';
import { renderSettings } from './views/settings.js';
import { renderTasks } from './views/tasks.js';
import { renderToday } from './views/today.js';

const ADMIN_ONLY = [ROLE.ADMIN];
const HOUSE_ROLES = [ROLE.ADMIN, ROLE.MEMBER];

// `default` : true (pour tous les rôles de la route) ou liste des rôles qui y atterrissent.
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
    render: renderHabits,
  },
  {
    path: 'expenses',
    title: 'Dépenses',
    icon: 'expenses',
    roles: ADMIN_ONLY,
    inNav: true,
    render: renderExpenses,
  },
  {
    path: 'tasks',
    title: 'Tâches',
    icon: 'tasks',
    roles: ADMIN_ONLY,
    inNav: true,
    render: renderTasks,
  },
  {
    path: 'house',
    title: 'Maison',
    icon: 'house',
    roles: HOUSE_ROLES,
    inNav: true,
    default: [ROLE.MEMBER],
    render: renderHouse,
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
