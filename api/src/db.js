// Adaptateur unique : Postgres (Neon) en prod, PGlite (Postgres WASM) en local et en test.
// Interface : query(sql, params) → rows, exec(sql), tx(fn(q)), close().

export async function createDb({ databaseUrl, pgliteDir } = {}) {
  return databaseUrl ? createPgDb(databaseUrl) : createPgliteDb(pgliteDir);
}

async function createPgDb(connectionString) {
  const { default: pg } = await import('pg');
  // SSL piloté par la chaîne de connexion Neon (sslmode=require).
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
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
