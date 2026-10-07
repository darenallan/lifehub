import { ROLE } from './lib/roles.js';

const ADMIN_ONLY = [ROLE.ADMIN];
const HOUSE_ROLES = [ROLE.ADMIN, ROLE.MEMBER];

/**
 * Vue chargée à la demande : écran de connexion et premier affichage plus légers.
 * Le service worker précache tous les fichiers, donc l'app reste utilisable hors ligne.
 */
const lazy = (load, name) => async (outlet, ctx) => (await load())[name](outlet, ctx);

// `default` : true (pour tous les rôles de la route) ou liste des rôles qui y atterrissent.
// `navParent` : onglet de la barre à mettre en avant pour un écran secondaire.
export const ROUTES = [
  {
    path: 'today',
    title: "Aujourd'hui",
    icon: 'today',
    roles: ADMIN_ONLY,
    inNav: true,
    default: true,
    render: lazy(() => import('./views/today.js'), 'renderToday'),
  },
  {
    path: 'habits',
    title: 'Habitudes',
    icon: 'habits',
    roles: ADMIN_ONLY,
    inNav: true,
    render: lazy(() => import('./views/habits.js'), 'renderHabits'),
  },
  {
    path: 'expenses',
    title: 'Dépenses',
    icon: 'expenses',
    roles: ADMIN_ONLY,
    inNav: true,
    render: lazy(() => import('./views/expenses.js'), 'renderExpenses'),
  },
  {
    path: 'tasks',
    title: 'Tâches',
    icon: 'tasks',
    roles: ADMIN_ONLY,
    inNav: true,
    render: lazy(() => import('./views/tasks.js'), 'renderTasks'),
  },
  {
    path: 'house',
    title: 'Maison',
    icon: 'house',
    roles: HOUSE_ROLES,
    inNav: true,
    default: [ROLE.MEMBER],
    render: lazy(() => import('./views/house/index.js'), 'renderHouse'),
  },
  {
    path: 'more',
    title: 'Plus',
    icon: 'more',
    roles: HOUSE_ROLES,
    inNav: true,
    render: lazy(() => import('./views/more.js'), 'renderMore'),
  },
  {
    path: 'health',
    title: 'Santé',
    icon: 'health',
    roles: ADMIN_ONLY,
    navParent: 'more',
    subPages: true, // #/health/med/…, #/health/profile, #/health/emergency : retour vers #/health
    render: lazy(() => import('./views/health/index.js'), 'renderHealth'),
  },
  {
    path: 'review',
    title: 'Revue de la semaine',
    icon: 'today',
    roles: ADMIN_ONLY,
    navParent: 'more',
    render: lazy(() => import('./views/review.js'), 'renderReview'),
  },
  {
    path: 'debts',
    title: 'Dettes et prêts',
    icon: 'expenses',
    roles: ADMIN_ONLY,
    navParent: 'more',
    render: lazy(() => import('./views/debts.js'), 'renderDebts'),
  },
  {
    path: 'notes',
    title: 'Notes rapides',
    icon: 'tasks',
    roles: ADMIN_ONLY,
    navParent: 'more',
    render: lazy(() => import('./views/notes.js'), 'renderNotes'),
  },
  {
    path: 'settings',
    title: 'Réglages',
    icon: 'settings',
    roles: HOUSE_ROLES,
    navParent: 'more',
    render: lazy(() => import('./views/settings.js'), 'renderSettings'),
  },
];
