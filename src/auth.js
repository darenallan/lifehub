import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from '@firebase/auth';
import { api } from './api.js';
import { auth } from './firebase.js';
import { cacheRole, readCachedRole, ROLE } from './lib/roles.js';
import { endSession, startSession } from './session.js';
import { getState, setState } from './store.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Popup impossible (PWA iOS, bloqueur) : on bascule sur la redirection.
const FALLBACK_TO_REDIRECT = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-environment',
]);

const ERROR_MESSAGES = {
  'auth/popup-closed-by-user': 'Connexion annulée.',
  'auth/cancelled-popup-request': 'Connexion annulée.',
  'auth/network-request-failed': 'Pas de réseau : la première connexion nécessite Internet.',
  'auth/unauthorized-domain': "Ce domaine n'est pas autorisé dans Firebase Auth.",
  'auth/user-disabled': 'Ce compte est désactivé.',
};

export function authErrorMessage(err) {
  return ERROR_MESSAGES[err?.code] ?? 'Connexion impossible. Réessaie.';
}

/** Ouvre la session de données si le rôle y donne droit, puis publie le rôle. */
async function applyRole(uid, role) {
  cacheRole(uid, role);
  if (role === ROLE.ADMIN) await startSession(uid);
  else await endSession();
  if (getState().user?.uid === uid) setState({ role, roleError: null });
}

/** Demande le rôle à l'API. Hors ligne, on garde le rôle en cache s'il existe. */
export async function refreshRole() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  setState({ roleError: null });
  try {
    const me = await api('/api/me');
    await applyRole(uid, me.role);
  } catch (err) {
    if (err.status === 403) return applyRole(uid, ROLE.UNAUTHORIZED);
    if (!getState().role) {
      setState({ roleError: err.status === 0 ? 'Serveur injoignable.' : 'Erreur du serveur.' });
    }
  }
}

export function initAuth() {
  getRedirectResult(auth).catch((err) => setState({ authError: authErrorMessage(err) }));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      await endSession();
      setState({ authReady: true, user: null, role: null, roleError: null });
      return;
    }
    const profile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    // Rôle connu sur cet appareil : l'app s'ouvre tout de suite, même hors ligne.
    const cached = readCachedRole(user.uid);
    if (cached === ROLE.ADMIN) await startSession(user.uid);
    setState({ authReady: true, user: profile, role: cached, authError: null });
    refreshRole();
  });
}

export async function signIn() {
  setState({ authError: null });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (FALLBACK_TO_REDIRECT.has(err?.code)) return signInWithRedirect(auth, provider);
    setState({ authError: authErrorMessage(err) });
  }
}

/** clearCache : efface aussi les données stockées sur l'appareil (IndexedDB + rôle en cache). */
export async function logout({ clearCache = false } = {}) {
  const uid = auth.currentUser?.uid;
  await endSession({ wipe: clearCache });
  if (clearCache && uid) cacheRole(uid, null);
  await signOut(auth);
}
