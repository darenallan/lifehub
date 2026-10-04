// Dettes et prêts, notes rapides, export / import des données perso.
import { BACKUP_COLLECTIONS, buildBackup } from '../lib/backup.js';
import { dayKey } from '../lib/dates.js';
import { getEngine } from '../session.js';

function watch(collection, onData, onError) {
  const engine = getEngine();
  let active = true;
  const run = () =>
    engine
      .getAll(collection)
      .then((rows) => active && onData(rows))
      .catch(onError);
  const unsubscribe = engine.subscribe(collection, run);
  run();
  return () => {
    active = false;
    unsubscribe();
  };
}

// ---------- Dettes et prêts ----------

export const watchDebts = (onData, onError) => watch('debt', onData, onError);

export function saveDebt(id, data) {
  return getEngine().patch('debt', id ?? crypto.randomUUID(), data);
}

export function setDebtSettled(debt, settled) {
  return getEngine().patch('debt', debt.id, { settled, settledOn: settled ? dayKey() : null });
}

export function deleteDebt(id) {
  return getEngine().remove('debt', id);
}

// ---------- Notes rapides ----------

const pad = (n) => String(n).padStart(2, '0');
const nowMinute = (d = new Date()) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const watchNotes = (onData, onError) => watch('quickNote', onData, onError);

export function addNote(text) {
  return getEngine().patch('quickNote', crypto.randomUUID(), {
    text,
    pinned: false,
    createdAt: nowMinute(),
  });
}

export function updateNote(id, patch) {
  return getEngine().patch('quickNote', id, patch);
}

export function deleteNote(id) {
  return getEngine().remove('quickNote', id);
}

// ---------- Export / import ----------

/** Données perso telles que stockées sur l'appareil (dernier état synchronisé + écritures en attente). */
export async function exportBackup() {
  const engine = getEngine();
  const lists = await Promise.all(BACKUP_COLLECTIONS.map((c) => engine.getAll(c)));
  return buildBackup(Object.fromEntries(BACKUP_COLLECTIONS.map((c, i) => [c, lists[i]])));
}

/**
 * Réécrit chaque élément du fichier (même id = même ligne : un import répété ne duplique rien).
 * Rien n'est supprimé. L'API revalide tout ; un élément refusé est signalé par la sync.
 */
export async function importBackup(docs, onProgress) {
  const engine = getEngine();
  let done = 0;
  for (const { collection, id, data } of docs) {
    await engine.patch(collection, id, data);
    done += 1;
    if (done % 200 === 0) onProgress?.(done);
  }
  return done;
}
