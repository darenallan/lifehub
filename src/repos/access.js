// Accès à LifeHub (propriétaire seulement) : en ligne uniquement, pas de cache local.
import { api } from '../api.js';

/** { users: [{ email, addedOn }], max } ; ApiError 403 si l'utilisateur n'est pas le propriétaire. */
export function listAccess() {
  return api('/api/access');
}

export function grantAccess(email) {
  return api('/api/access', { method: 'POST', body: { email } });
}

export function revokeAccess(email) {
  return api(`/api/access/${encodeURIComponent(email)}`, { method: 'DELETE' });
}
