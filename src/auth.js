import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { auth, clearLocalCache } from './firebase.js';
import { resolveRole } from './lib/roles.js';
import { setState } from './store.js';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? '';
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

export function initAuth() {
  getRedirectResult(auth).catch((err) => setState({ authError: authErrorMessage(err) }));

  onAuthStateChanged(auth, (user) => {
    setState({
      authReady: true,
      user: user
        ? {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
          }
        : null,
      role: resolveRole(user, ADMIN_EMAIL),
    });
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

/** clearCache : efface aussi les données Firestore stockées sur l'appareil. */
export async function logout({ clearCache = false } = {}) {
  await signOut(auth);
  if (clearCache) {
    await clearLocalCache();
    location.reload();
  }
}
