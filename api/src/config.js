// Configuration lue depuis l'environnement (Render en prod, api/.env en local).

export function loadConfig(env = process.env) {
  const isHosted = Boolean(env.RENDER);
  return {
    isHosted,
    // Render impose d'écouter sur toutes les interfaces ; en local, uniquement 127.0.0.1.
    host: env.HOST ?? (isHosted ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR ?? './.data/pglite',
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? '',
    adminEmail: (env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:7070,http://localhost:7070')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST || null,
  };
}

export function assertConfig(config) {
  const missing = [];
  if (!config.firebaseProjectId) missing.push('FIREBASE_PROJECT_ID');
  if (!config.adminEmail) missing.push('ADMIN_EMAIL');
  if (config.isHosted && !config.databaseUrl) missing.push('DATABASE_URL');
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(', ')}`);
  // Les jetons de l'émulateur ne sont pas signés : jamais en production.
  if (config.isHosted && config.authEmulatorHost) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST interdit en production.');
  }
}
