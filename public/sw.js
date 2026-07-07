/* Service Worker de AdaptaJIREH — recibe notificaciones push de recordatorio. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'AdaptaJIREH', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'AdaptaJIREH';
  const options = {
    body: data.body || 'Tienes repasos pendientes para hoy.',
    icon: '/icon-notif-192.png',
    badge: '/badge-96.png',
    data: { url: data.url || '/student' },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/student';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
