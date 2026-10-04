import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { setPending } from '../store.js';

const profileRef = (uid) => doc(db, 'users', uid, 'settings', 'profile');

/**
 * onData(profile|null, { fromCache }). Rend depuis le cache hors ligne.
 * Retourne la fonction de désabonnement.
 */
export function watchProfile(uid, onData, onError) {
  const unsubscribe = onSnapshot(
    profileRef(uid),
    { includeMetadataChanges: true },
    (snap) => {
      setPending('profile', snap.metadata.hasPendingWrites ? 1 : 0);
      onData(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache });
    },
    onError,
  );
  return () => {
    unsubscribe();
    setPending('profile', 0);
  };
}

/**
 * Écriture partielle (merge). Hors ligne, la promesse ne se résout qu'au retour du réseau :
 * l'appelant ne doit pas l'attendre pour mettre l'UI à jour.
 */
export function saveProfile(uid, patch) {
  return setDoc(profileRef(uid), patch, { merge: true });
}
