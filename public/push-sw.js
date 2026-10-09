// Complément du service worker (chargé par importScripts depuis le SW généré par Workbox).
// Web Push : affiche le rappel reçu (contenu générique, sans donnée de santé) et ouvre l'app
// sur la bonne page au clic. Aucune écriture de données ici : tout se fait dans l'app.

function readPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  // Même étiquette que les rappels in-app : une notification remplace l'autre, sans doublon.
  event.waitUntil(
    self.registration.showNotification(data.title || 'LifeHub', {
      body: data.body || 'Rappel',
      tag: data.tag || 'lifehub',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url },
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((c) => (c ?? open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
