// État global minimal. Pas de rôle « de confiance » ici : voir lib/roles.js.

const state = {
  authReady: false,
  user: null, // { uid, email, displayName, photoURL }
  role: null,
  authError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: {}, // { [cléDeListener]: nombre de docs avec écritures en attente }
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

/** Alimenté par les repos à partir de snapshot.metadata.hasPendingWrites. */
export function setPending(key, count) {
  if ((state.pending[key] ?? 0) === count) return;
  setState({ pending: { ...state.pending, [key]: count } });
}

export function pendingCount(s = state) {
  return Object.values(s.pending).reduce((sum, n) => sum + n, 0);
}
