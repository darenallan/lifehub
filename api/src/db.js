// Adaptateur unique : Postgres (Neon) en prod, PGlite (Postgres WASM) en local et en test.
// Interface : query(sql, params) → rows, exec(sql), tx(fn(q)), close().
import { mkdir } from 'node:fs/promises';

export async function createDb({ databaseUrl, pgliteDir } = {}) {
  return databaseUrl ? createPgDb(databaseUrl) : createPgliteDb(pgliteDir);
}

/**
 * La chaîne Neon contient `channel_binding=require`, que `pg` ne lit pas dans l'URL :
 * on le retire et on active l'option équivalente. SSL reste piloté par `sslmode=require`.
 */
export function parseConnectionString(url) {
  const parsed = new URL(url);
  const channelBinding = parsed.searchParams.get('channel_binding') === 'require';
  parsed.searchParams.delete('channel_binding');
  return { connectionString: parsed.toString(), enableChannelBinding: channelBinding };
}

async function createPgDb(url) {
  const { default: pg } = await import('pg');
  const { connectionString, enableChannelBinding } = parseConnectionString(url);
  const pool = new pg.Pool({
    connectionString,
    enableChannelBinding,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  const run = (client) => (sql, params) => client.query(sql, params).then((r) => r.rows);

  return {
    query: run(pool),
    exec: (sql) => pool.query(sql).then(() => undefined),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(run(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** dataDir absent = base en mémoire (tests). */
export async function createPgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  // PGlite ne crée que le dernier dossier : sur un clone neuf, `.data/` n'existe pas encore.
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const run = (client) => (sql, params) => client.query(sql, params).then((r) => r.rows);

  return {
    query: run(pg),
    exec: (sql) => pg.exec(sql).then(() => undefined),
    tx: (fn) => pg.transaction((t) => fn(run(t))),
    close: () => pg.close(),
  };
}
