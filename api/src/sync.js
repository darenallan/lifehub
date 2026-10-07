import { validatePatch } from './validate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z_][a-z0-9_]*$/;
const PULL_LIMIT = 500;

// Les identifiants SQL viennent du registre (constantes), jamais du client ; on vérifie quand même.
function ident(name) {
  if (!IDENT.test(name)) throw new Error(`Identifiant SQL invalide : ${name}`);
  return `"${name}"`;
}

const isHouseScoped = (def) => def.scope === 'house';

function keyColumn(def) {
  return def.singleton ? 'user_id' : 'id';
}

/** Colonne qui rattache la ligne à son propriétaire : l'utilisateur, ou la maison. */
function ownerColumn(def) {
  return isHouseScoped(def) ? (def.houseColumn ?? 'house_id') : 'user_id';
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
  if (!def || !def.roles.includes(role) || def.readOnly) return rejected('forbidden');
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

      const refusal = isHouseScoped(def)
        ? await writeHouseScoped(q, def, key, user, m)
        : await writeUserScoped(q, def, key, user, m);
      if (refusal) return refusal;

      await q('INSERT INTO applied_mutations (id, user_id) VALUES ($1, $2)', [m.id, user.uid]);
      return applied();
    });
  } catch (err) {
    // Classes 22 (donnée invalide) et 23 (contrainte violée) : refus, pas erreur serveur.
    if (/^2[23]/.test(err?.code ?? '')) return rejected('invalid');
    throw err;
  }
}

/** Données perso : la ligne appartient à l'utilisateur du jeton. Retourne un refus ou null. */
async function writeUserScoped(q, def, key, user, m) {
  const owner = { column: 'user_id', value: user.uid };
  if (m.op === 'delete') {
    await softDelete(q, def, key, owner);
    return null;
  }
  // Rien d'écrit : le document existe mais appartient à quelqu'un d'autre.
  return (await upsert(q, def, key, owner, m.data)) ? null : rejected('forbidden');
}

/**
 * Données de maison : l'utilisateur doit être membre de la maison de la ligne,
 * une ligne ne change jamais de maison, et les droits fins viennent de def.access.
 */
async function writeHouseScoped(q, def, key, user, m) {
  const existing = await readExisting(q, def, key);
  const requested = m.data?.houseId;
  if (existing && requested && requested !== existing.houseId) return rejected('forbidden');

  const houseId = existing?.houseId ?? requested;
  if (!houseId) return m.op === 'delete' ? null : rejected('invalid');

  const houseRole = await memberRole(q, houseId, user.uid);
  if (!houseRole) return rejected('forbidden');

  const allowed =
    !def.access ||
    def.access({
      op: m.op,
      data: m.data ?? {},
      existing: existing?.data ?? null,
      houseRole,
      uid: user.uid,
    });
  if (!allowed) return rejected('forbidden');

  const owner = { column: ownerColumn(def), value: houseId };
  if (m.op === 'delete') {
    await softDelete(q, def, key, owner);
    return null;
  }
  const data = { ...m.data };
  delete data.houseId; // posé via la colonne propriétaire
  if (!(await upsert(q, def, key, owner, data))) return rejected('forbidden');
  await def.afterWrite?.(q, key);
  return null;
}

async function memberRole(q, houseId, uid) {
  const rows = await q(
    'SELECT role FROM house_members WHERE house_id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [houseId, uid],
  );
  return rows[0]?.role ?? null;
}

/** Ligne existante (même supprimée logiquement), champs du registre en camelCase. */
async function readExisting(q, def, key) {
  const fields = Object.entries(def.fields);
  const rows = await q(
    `SELECT ${ident(ownerColumn(def))}::text AS owner_key,
            ${fields.map(([, f]) => ident(f.column)).join(', ')}
     FROM ${ident(def.table)} WHERE ${ident(keyColumn(def))} = $1`,
    [key],
  );
  if (!rows.length) return null;
  const [row] = rows;
  return {
    houseId: row.owner_key,
    data: Object.fromEntries(fields.map(([name, f]) => [name, row[f.column]])),
  };
}

/**
 * UPDATE d'abord (patch partiel d'un document existant), INSERT sinon.
 * Un seul INSERT … ON CONFLICT ne suffit pas : Postgres vérifie les NOT NULL de la ligne
 * proposée avant le conflit, donc un patch { done: false } échouerait sur une ligne existante.
 * Retourne false si la clé existe déjà chez un autre propriétaire.
 */
async function upsert(q, def, key, owner, data) {
  const table = ident(def.table);
  const keyCol = ident(keyColumn(def));
  const ownerCol = ident(owner.column);
  // jsonb : sérialisé ici, sinon le pilote enverrait un tableau JS comme tableau Postgres.
  const entries = Object.entries(data).map(([field, value]) => {
    const { column, schema } = def.fields[field];
    return [
      ident(column),
      schema.type === 'json' && value !== null ? JSON.stringify(value) : value,
    ];
  });

  const sets = [
    ...entries.map(([column], i) => `${column} = $${i + 3}`),
    "version = nextval('change_seq')",
    'updated_at = now()',
    'deleted_at = NULL',
  ];
  const updated = await q(
    `UPDATE ${table} SET ${sets.join(', ')}
     WHERE ${keyCol} = $1 AND ${ownerCol} = $2
     RETURNING 1`,
    [key, owner.value, ...entries.map(([, value]) => value)],
  );
  if (updated.length) return true;

  // Singleton : la clé EST la colonne propriétaire.
  const columns = keyCol === ownerCol ? [ownerCol] : [keyCol, ownerCol];
  const values = keyCol === ownerCol ? [owner.value] : [key, owner.value];
  for (const [column, value] of entries) {
    columns.push(column);
    values.push(value);
  }
  const inserted = await q(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (${keyCol}) DO NOTHING
     RETURNING 1`,
    values,
  );
  return inserted.length > 0;
}

// Suppression logique : la pierre tombale (deleted_at) se propage aux autres appareils.
function softDelete(q, def, key, owner) {
  return q(
    `UPDATE ${ident(def.table)}
     SET deleted_at = now(), version = nextval('change_seq'), updated_at = now()
     WHERE ${ident(keyColumn(def))} = $1 AND ${ident(owner.column)} = $2 AND deleted_at IS NULL`,
    [key, owner.value],
  );
}

/** Filtre SQL des lignes visibles par l'utilisateur ($1 = uid). */
function visibilityFilter(def) {
  if (!isHouseScoped(def)) return '"user_id" = $1';
  const roles = (def.houseRoles ?? []).map((r) => {
    if (!IDENT.test(r)) throw new Error(`Rôle invalide : ${r}`);
    return `'${r}'`;
  });
  return `${ident(ownerColumn(def))} IN (
    SELECT house_id FROM house_members
    WHERE user_id = $1 AND deleted_at IS NULL${roles.length ? ` AND role IN (${roles.join(', ')})` : ''}
  )`;
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
       WHERE ${visibilityFilter(def)} AND version > $2::bigint
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
