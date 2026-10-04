// Profil (settings) : lecture/écriture locales, synchronisées par le moteur de sync.
import { getEngine } from '../session.js';

const COLLECTION = 'profile';
const DOC_ID = 'me';

/** onData(profile|null) à chaque changement local ou serveur. Retourne le désabonnement. */
export function watchProfile(onData, onError) {
  const engine = getEngine();
  let active = true;
  const load = () =>
    engine
      .get(COLLECTION, DOC_ID)
      .then((profile) => active && onData(profile))
      .catch(onError);
  const unsubscribe = engine.subscribe(COLLECTION, load);
  load();
  return () => {
    active = false;
    unsubscribe();
  };
}

/** Écrit tout de suite en local ; l'envoi au serveur se fait en arrière-plan. */
export function saveProfile(patch) {
  return getEngine().patch(COLLECTION, DOC_ID, patch);
}
