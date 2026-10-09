import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Chaque test démarre son PGlite (Postgres WASM) et rejoue toutes les migrations : lourd en
    // CPU. Avec tous les fichiers en parallèle, la machine sature et les délais sautent ;
    // deux fichiers à la fois reste rapide et stable.
    maxWorkers: 2,
    testTimeout: 60000,
    hookTimeout: 90000,
  },
});
