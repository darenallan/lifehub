export const ROLE = Object.freeze({
  ADMIN: 'admin',
  MEMBER: 'member',
  UNAUTHORIZED: 'unauthorized',
});

/**
 * Rôle d'affichage uniquement (quel shell montrer). La source de vérité reste
 * firestore.rules : un rôle mal déduit ici ne donne accès à aucune donnée.
 * La détection des colocs (members/{uid}) arrive en phase 4.
 */
export function resolveRole(user, adminEmail) {
  if (!user) return null;
  if (!user.emailVerified) return ROLE.UNAUTHORIZED;
  const email = (user.email ?? '').toLowerCase();
  if (adminEmail && email === adminEmail.toLowerCase()) return ROLE.ADMIN;
  return ROLE.UNAUTHORIZED;
}
