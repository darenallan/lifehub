// Session de données de l'utilisateur connecté : moteur de sync + déclencheurs.
import { api } from './api.js';
import { showToast } from './components/toast.js';
import { setPending, setState } from './store.js';
import { createSyncEngine, deleteLocalData } from './sync/engine.js';

const PERIODIC_SYNC_MS = 60_000;

let engine = null;
let currentUid = null;
let detach = null;

export function getEngine() {
  if (!engine) throw new Error('Aucune session de données ouverte.');
  return engine;
}

export async function startSession(uid) {
  if (engine && currentUid === uid) return engine;
  await endSession();

  engine = await createSyncEngine({
    uid,
    send: (body) => api('/api/sync', { method: 'POST', body }),
    onPending: (n) => setPending('outbox', n),
    onRejected: () =>
      showToast('Une modification a été refusée par le serveur et annulée.', { tone: 'danger' }),
    onStatus: (status) => setState({ syncStatus: status }),
  });
  currentUid = uid;

  const sync = () => engine?.syncNow();
  const onVisible = () => document.visibilityState === 'visible' && sync();
  const interval = setInterval(onVisible, PERIODIC_SYNC_MS);
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', onVisible);
  detach = () => {
    clearInterval(interval);
    window.removeEventListener('online', sync);
    document.removeEventListener('visibilitychange', onVisible);
  };

  sync();
  return engine;
}

/** wipe : efface aussi la base locale de cet utilisateur (écritures non synchronisées perdues). */
export async function endSession({ wipe = false } = {}) {
  const uid = currentUid;
  detach?.();
  engine?.close();
  engine = null;
  currentUid = null;
  detach = null;
  setPending('outbox', 0);
  if (wipe && uid) await deleteLocalData(uid);
}
