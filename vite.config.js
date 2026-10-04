import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: '127.0.0.1', port: 7070, strictPort: true },
  preview: { host: '127.0.0.1', port: 7060, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Firebase dans son propre chunk : il change rarement, reste en cache entre déploiements.
        codeSplitting: { groups: [{ name: 'firebase', test: /node_modules[\\/]@?firebase/ }] },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      // Enregistrement fait dans main.js (pas de script inline : CSP stricte).
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LifeHub',
        short_name: 'LifeHub',
        description: 'Habitudes, dépenses, tâches et maison, au même endroit.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/#/today',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b0c',
        theme_color: '#0b0b0c',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Dépense rapide', short_name: 'Dépense', url: '/#/expenses/new' },
          { name: "Aujourd'hui", short_name: "Aujourd'hui", url: '/#/today' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        // Navigation : réseau d'abord, repli sur le shell précaché.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/__/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: 'index.html' },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
