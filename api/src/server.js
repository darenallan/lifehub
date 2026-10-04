import { buildApp } from './app.js';
import { createTokenVerifier } from './auth.js';
import { assertConfig, loadConfig } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';

const config = loadConfig();
assertConfig(config);

const db = await createDb(config);
const applied = await migrate(db);

// Journal technique d'idempotence (pas une donnée utilisateur) : 30 jours suffisent
// pour rejouer une écriture restée hors ligne.
await db.query("DELETE FROM applied_mutations WHERE applied_at < now() - interval '30 days'");

const verifyToken = createTokenVerifier({
  projectId: config.firebaseProjectId,
  emulator: Boolean(config.authEmulatorHost),
});

const app = await buildApp({
  db,
  verifyToken,
  config,
  logger: { level: config.isHosted ? 'info' : 'debug' },
});

if (applied.length) app.log.info({ applied }, 'migrations appliquées');
if (!config.databaseUrl) app.log.warn(`Base locale PGlite : ${config.pgliteDir}`);
if (config.authEmulatorHost) app.log.warn("Jetons de l'émulateur Auth acceptés (local uniquement)");

await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
