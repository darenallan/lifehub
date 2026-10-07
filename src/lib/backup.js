// Export / import JSON des données perso. Le fichier reste sur l'appareil : rien n'est envoyé à un tiers.
// L'import est vérifié ici (structure) puis revalidé par l'API (champs, types, propriété).

export const BACKUP_VERSION = 1;
const MAX_DOCS = 50_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Collections perso exportées, dans l'ordre d'import (catégories avant dépenses, etc.). */
export const BACKUP_COLLECTIONS = [
  'profile',
  'category',
  'recurringExpense',
  'expense',
  'habit',
  'habitCheck',
  'habitDay',
  'task',
  'dailyGoal',
  'debt',
  'quickNote',
  'healthProfile',
  'emergencyContact',
];

/** Collections à document unique : leur id est toujours 'me'. */
const SINGLETONS = new Set(['profile', 'healthProfile']);

export function buildBackup(collections, now = new Date()) {
  return {
    app: 'lifehub',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    collections: Object.fromEntries(BACKUP_COLLECTIONS.map((c) => [c, collections[c] ?? []])),
  };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validId = (collection, id) =>
  typeof id === 'string' && (SINGLETONS.has(collection) ? id === 'me' : UUID.test(id));

/**
 * Vérifie un fichier d'export. Retourne { ok: true, docs, counts } où docs est la liste
 * ordonnée { collection, id, data }, ou { ok: false, error }.
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas un JSON valide." };
  }
  if (!isPlainObject(parsed) || parsed.app !== 'lifehub') {
    return { ok: false, error: "Ce fichier n'est pas un export LifeHub." };
  }
  if (parsed.version !== BACKUP_VERSION) {
    return { ok: false, error: `Version d'export non prise en charge (${parsed.version}).` };
  }
  if (!isPlainObject(parsed.collections)) {
    return { ok: false, error: 'Contenu invalide : collections manquantes.' };
  }
  const unknown = Object.keys(parsed.collections).filter((c) => !BACKUP_COLLECTIONS.includes(c));
  if (unknown.length) return { ok: false, error: `Collections inconnues : ${unknown.join(', ')}.` };

  const docs = [];
  const counts = {};
  for (const collection of BACKUP_COLLECTIONS) {
    const items = parsed.collections[collection] ?? [];
    if (!Array.isArray(items))
      return { ok: false, error: `« ${collection} » doit être une liste.` };
    for (const item of items) {
      if (!isPlainObject(item) || !validId(collection, item.id)) {
        return { ok: false, error: `Élément invalide dans « ${collection} ».` };
      }
      const { id, ...data } = item;
      if (!Object.keys(data).length) continue;
      docs.push({ collection, id, data });
      counts[collection] = (counts[collection] ?? 0) + 1;
      if (docs.length > MAX_DOCS) return { ok: false, error: 'Fichier trop volumineux.' };
    }
  }
  return { ok: true, docs, counts };
}
