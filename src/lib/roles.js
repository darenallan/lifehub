export const ROLE = Object.freeze({
  ADMIN: 'admin',
  MEMBER: 'member',
  UNAUTHORIZED: 'unauthorized',
});

// Le rôle est décidé par l'API (GET /api/me). On le garde en cache par appareil
// pour pouvoir ouvrir l'app hors ligne ; ce cache ne donne accès à aucune donnée serveur.
const key = (uid) => `lifehub.role.${uid}`;

export function readCachedRole(uid) {
  try {
    const value = localStorage.getItem(key(uid));
    return Object.values(ROLE).includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function cacheRole(uid, role) {
  try {
    if (role) localStorage.setItem(key(uid), role);
    else localStorage.removeItem(key(uid));
  } catch {
    // stockage indisponible : le rôle sera redemandé au prochain lancement
  }
}
