// Logique pure de synchronisation (testée sans navigateur).

export const keyOf = (collection, id) => `${collection}/${id}`;

/** Patch par champ, comme côté serveur. */
export function mergePatch(current, patch) {
  return { ...(current ?? {}), ...patch };
}

/**
 * Traduit les changements serveur en opérations locales.
 * Un document qui a encore des écritures en attente garde sa version locale :
 * le serveur le renverra entier, avec une nouvelle version, une fois la mutation appliquée.
 */
export function planServerChanges(changes, pendingKeys) {
  const latest = new Map();
  for (const change of changes) {
    const key = keyOf(change.collection, change.docId);
    if (pendingKeys.has(key)) continue;
    const prev = latest.get(key);
    if (!prev || BigInt(change.version) >= BigInt(prev.version)) latest.set(key, change);
  }

  return [...latest.entries()].map(([key, c]) =>
    c.data === null
      ? { type: 'delete', key, collection: c.collection }
      : {
          type: 'put',
          key,
          collection: c.collection,
          row: { key, collection: c.collection, id: c.docId, data: c.data, version: c.version },
        },
  );
}

/** Délai avant la prochaine tentative après un échec réseau : 5 s, 10 s… plafonné à 5 min. */
export function nextRetryDelay(previous) {
  return Math.min(previous ? previous * 2 : 5_000, 5 * 60_000);
}
