// Santé : profil (singleton) et contacts d'urgence. Lectures/écritures locales, synchronisées.
// Données sensibles : jamais dans la console, les URLs ou un service tiers.
import { dayKey } from '../lib/dates.js';
import { getEngine } from '../session.js';

const PROFILE = 'healthProfile';
const CONTACT = 'emergencyContact';

function watch(load, collection, onData, onError) {
  const engine = getEngine();
  let active = true;
  const run = () =>
    load(engine)
      .then((data) => active && onData(data))
      .catch(onError);
  const unsubscribe = engine.subscribe(collection, run);
  run();
  return () => {
    active = false;
    unsubscribe();
  };
}

/** onData(profil|null). */
export const watchHealthProfile = (onData, onError) =>
  watch((engine) => engine.get(PROFILE, 'me'), PROFILE, onData, onError);

export function saveHealthProfile(patch) {
  return getEngine().patch(PROFILE, 'me', patch);
}

export function acceptDisclaimer() {
  return saveHealthProfile({ disclaimerSeenOn: dayKey() });
}

export const watchEmergencyContacts = (onData, onError) =>
  watch((engine) => engine.getAll(CONTACT), CONTACT, onData, onError);

export function saveEmergencyContact(id, data) {
  return getEngine().patch(CONTACT, id ?? crypto.randomUUID(), data);
}

export function deleteEmergencyContact(id) {
  return getEngine().remove(CONTACT, id);
}
