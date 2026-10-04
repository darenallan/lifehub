// Enveloppe minimale d'IndexedDB en promesses (aucune dépendance).

export const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function openDatabase(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base locale bloquée par un autre onglet.'));
  });
}

export function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // supprimée dès que les autres onglets se ferment
  });
}

/**
 * fn(stores) s'exécute dans une transaction ; la promesse se résout quand elle est validée.
 * Dans fn, n'attendre que des requêtes IndexedDB (sinon la transaction se ferme).
 */
export function transaction(db, names, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction annulée'));
    const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)]));
    Promise.resolve()
      .then(() => fn(stores))
      .then(
        (value) => {
          result = value;
        },
        (err) => {
          try {
            tx.abort();
          } catch {
            // déjà terminée
          }
          reject(err);
        },
      );
  });
}
