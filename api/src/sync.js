import { validatePatch } from './validate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z_][a-z0-9_]*$/;
const PULL_LIMIT = 500;

// Les identifiants SQL viennent du registre (constantes), jamais du client ; on vérifie quand même.
function ident(name) {
  if (!IDENT.test(name)) throw new Error(`Identifiant SQL invalide : ${name}`);
  return `"${name}"`;
}

function keyColumn(def) {
  return def.singleton ? 'user_id' : 'id';
}

/** docId client → valeur de clé en base, ou null si invalide. */
function resolveKey(def, docId, uid) {
  if (def.singleton) return docId === 'me' ? uid : null;
  return UUID.test(docId) ? docId.toLowerCase() : null;
}

const applied = () => ({ status: 'applied' });
const rejected = (reason, details) => ({ status: 'rejected', reason, ...(details && { details }) });

/**
 * Applique une mutation dans sa propre transaction (une mutation refusée n'annule pas les autres).
 * user.uid vient du jeton vérifié, jamais du corps de la requête.
 */
export async function applyMutation(db, { user, role, collections }, m) {
  const def = Object.hasOwn(collections, m.collection) ? collections[m.collection] : null;
  if (!def || !def.roles.includes(role)) return rejected('forbidden');
  const key = resolveKey(def, m.docId, user.uid);
  if (!key) return rejected('invalid_doc_id');

  if (m.op === 'patch') {
    const errors = validatePatch(def.fields, m.data);
    if (errors.length) return rejected('invalid', errors);
  }

  try {
    return await db.tx(async (q) => {
      const seen = await q('SELECT 1 FROM applied_mutations WHERE id = $1 AND user_id = $2', [
        m.id,
        user.uid,
      ]);
      if (seen.length) return applied();

      if (m.op === 'patch') {
        const rows = await upsert(q, def, key, user.uid, m.data);
        // 0 ligne : le document existe mais appartient à quelqu'un d'autre.
        if (rows.length === 0) return rejected('forbidden');
      } else {
        await softDelete(q, def, key, user.uid);
      }
      await q('INSERT INTO applied_mutations (id, user_id) VALUES ($1, $2)', [m.id, user.uid]);
      return applied();
    });
  } catch (err) {
    // Classes 22 (donnée invalide) et 23 (contrainte violée) : refus, pas erreur serveur.
    if (/^2[23]/.test(err?.code ?? '')) return rejected('invalid');
    throw err;
  }
}

function upsert(q, def, key, uid, data) {
  const table = ident(def.table);
  const entries = Object.entries(data).map(([field, value]) => [
    ident(def.fields[field].column),
    value,
  ]);
  const columns = def.singleton ? ['"user_id"'] : ['"id"', '"user_id"'];
  const values = def.singleton ? [uid] : [key, uid];
  for (const [column, value] of entries) {
    columns.push(column);
    values.push(value);
  }
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const updates = [
    ...entries.map(([column]) => `${column} = EXCLUDED.${column}`),
    "version = nextval('change_seq')",
    'updated_at = now()',
    'deleted_at = NULL',
  ];
  const ownerCheck = def.singleton ? '' : `WHERE ${table}."user_id" = $2`;

  return q(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (${ident(keyColumn(def))}) DO UPDATE SET ${updates.join(', ')}
     ${ownerCheck}
     RETURNING 1`,
    values,
  );
}

// Suppression logique : la pierre tombale (deleted_at) se propage aux autres appareils.
function softDelete(q, def, key, uid) {
  return q(
    `UPDATE ${ident(def.table)}
     SET deleted_at = now(), version = nextval('change_seq'), updated_at = now()
     WHERE ${ident(keyColumn(def))} = $1 AND "user_id" = $2 AND deleted_at IS NULL`,
    [key, uid],
  );
}

/**
 * Changements visibles par l'utilisateur depuis `cursor` (exclu).
 * Si une collection atteint la limite, le curseur s'arrête à sa dernière version :
 * les autres lignes seront renvoyées au tour suivant (doublons sans effet côté client).
 */
export async function pullChanges(db, { user, role, collections }, cursor, limit = PULL_LIMIT) {
  const changes = [];
  const truncatedAt = [];
  let maxVersion = BigInt(cursor);

  for (const [name, def] of Object.entries(collections)) {
    if (!def.roles.includes(role)) continue;
    const fieldEntries = Object.entries(def.fields);
    const select = fieldEntries.map(([, f]) => ident(f.column)).join(', ');
    const rows = await db.query(
      `SELECT ${ident(keyColumn(def))}::text AS doc_key, version::text AS version,
              deleted_at IS NOT NULL AS deleted, ${select}
       FROM ${ident(def.table)}
       WHERE "user_id" = $1 AND version > $2::bigint
       ORDER BY version
       LIMIT $3`,
      [user.uid, cursor, limit],
    );

    for (const row of rows) {
      const version = BigInt(row.version);
      if (version > maxVersion) maxVersion = version;
      changes.push({
        collection: name,
        docId: def.singleton ? 'me' : row.doc_key,
        version: row.version,
        data: row.deleted
          ? null
          : Object.fromEntries(fieldEntries.map(([field, f]) => [field, row[f.column]])),
      });
    }
    if (rows.length === limit) truncatedAt.push(BigInt(rows.at(-1).version));
  }

  const next = truncatedAt.length ? truncatedAt.reduce((a, b) => (a < b ? a : b)) : maxVersion;
  return { changes, cursor: next.toString(), hasMore: truncatedAt.length > 0 };
}
