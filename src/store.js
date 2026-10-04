// État global minimal. Le rôle affiché vient de l'API (voir auth.js), qui reste seule juge.

const state = {
  authReady: false,
  user: null, // { uid, email, displayName, photoURL }
  role: null, // null = pas encore connu (premier lancement, serveur en réveil)
  roleError: null,
  authError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'error'
  pending: {}, // { [source]: nombre d'écritures en attente }
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Alimenté par le moteur de sync (taille de l'outbox). */
export function setPending(key, count) {
  if ((state.pending[key] ?? 0) === count) return;
  setState({ pending: { ...state.pending, [key]: count } });
}

export function pendingCount(s = state) {
  return Object.values(s.pending).reduce((sum, n) => sum + n, 0);
}
