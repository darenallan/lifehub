import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Applique dans l'ordre les fichiers NNN_nom.sql pas encore enregistrés. */
export async function migrate(db, dir = MIGRATIONS_DIR) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();

  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await db.tx(async (q) => {
      for (const statement of splitStatements(sql)) await q(statement);
      await q('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

// Les migrations n'utilisent ni fonctions ni chaînes contenant « ; ».
function splitStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
