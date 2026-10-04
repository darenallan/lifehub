import { describe, expect, it } from 'vitest';
import { defaultPath, parseHash, pickRoute } from '../../src/router.js';

const ROUTES = [
  { path: 'today', roles: ['admin'], default: true },
  { path: 'expenses', roles: ['admin'] },
  { path: 'house', roles: ['admin', 'member'] },
  { path: 'settings', roles: ['admin', 'member'] },
  { path: 'house-home', roles: ['member'], default: true },
];

describe('parseHash', () => {
  it.each([
    ['#/today', { path: 'today', params: [] }],
    ['#/expenses/new', { path: 'expenses', params: ['new'] }],
    ['#today', { path: 'today', params: [] }],
    ['', { path: '', params: [] }],
    ['#/', { path: '', params: [] }],
  ])('%j', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });
});

describe('pickRoute', () => {
  it('trouve une route autorisée', () => {
    expect(pickRoute(ROUTES, 'expenses', 'admin')).toMatchObject({
      route: { path: 'expenses' },
      redirected: false,
    });
  });

  it('redirige un coloc hors des modules perso', () => {
    expect(pickRoute(ROUTES, 'expenses', 'member')).toMatchObject({
      route: { path: 'house-home' },
      redirected: true,
    });
  });

  it('redirige une route inconnue vers la route par défaut', () => {
    expect(pickRoute(ROUTES, 'nope', 'admin').route.path).toBe('today');
  });

  it('ne renvoie rien pour un rôle sans route', () => {
    expect(pickRoute(ROUTES, 'today', 'unauthorized').route).toBeNull();
    expect(defaultPath(ROUTES, null)).toBeNull();
  });
});
