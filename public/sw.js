/* Service Worker de AdaptaJIREH — notificaciones push + soporte offline.
 *
 * ESTRATEGIA OFFLINE:
 *  · Estáticos (_next/static, imágenes, fuentes): cache-first (inmutables).
 *  · Navegaciones (HTML): network-first → caché → /offline.html.
 *  · APIs de LECTURA del alumno (teoría, materias, racha, pendientes...):
 *    network-first con respaldo en caché → el alumno puede LEER sus apuntes
 *    y ver su dashboard sin conexión, con los datos de la última sincronización.
 *  · POST/PUT (responder repasos, sesiones, login) NUNCA se cachean: la
 *    calificación requiere el servidor (juez LLM) y registrar respuestas en
 *    diferido contaminaría las variables de investigación (AR, racha, IRE).
 */

const VERSION        = 'v2';
const CACHE_ESTATICO = `adaptajireh-estatico-${VERSION}`;
const CACHE_PAGINAS  = `adaptajireh-paginas-${VERSION}`;
const CACHE_API      = `adaptajireh-api-${VERSION}`;
const CACHES_VALIDOS = [CACHE_ESTATICO, CACHE_PAGINAS, CACHE_API];

const OFFLINE_URL = '/offline.html';
const PRECACHE    = [OFFLINE_URL, '/icon-192.png', '/logo-jireh.png'];

// APIs de lectura que se sirven desde caché al perder conexión.
const RE_API_CACHEABLE =
  /^\/api\/(student\/(learn|subjects|forecast|streak|notifications)|fsrs\/pending)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ESTATICO).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('adaptajireh-') && !CACHES_VALIDOS.includes(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Limpieza de datos personales cacheados (se invoca al cerrar sesión o al 401),
// para que otro usuario del mismo dispositivo no vea datos del anterior.
self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'LIMPIAR_CACHE') {
    event.waitUntil(Promise.all([caches.delete(CACHE_API), caches.delete(CACHE_PAGINAS)]));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT van siempre a la red

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ── Navegaciones (HTML): red → caché → página offline ──────────
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_PAGINAS).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit ?? caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // ── Estáticos inmutables: caché → red ──────────────────────────
  const esEstatico =
    url.pathname.startsWith('/_next/static/') ||
    ['image', 'font', 'style', 'script'].includes(req.destination);
  if (esEstatico) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_ESTATICO).then((c) => c.put(req, copia));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── APIs de lectura: red → caché (datos de la última conexión) ──
  if (RE_API_CACHEABLE.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_API).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => {
          if (hit) return hit;
          return new Response(
            JSON.stringify({ error: 'Sin conexión', code: 'OFFLINE' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }))
    );
  }
  // Resto de peticiones: comportamiento normal del navegador.
});

/* ── Notificaciones push (sin cambios) ─────────────────────────── */

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
    // Icono de la notificación: el escudo del colegio en versión CUADRADA sobre
    // fondo blanco (icon-192.png). El logo-jireh.png original es muy grande y no
    // cuadrado, así que algunos móviles no lo cargaban y mostraban la inicial de
    // la app ("A") como respaldo. Se omite `badge` a propósito para no mostrar el
    // ícono monocromático extra (la campana/libro) y que la notificación se vea
    // más limpia con un solo ícono: el del colegio.
    icon: '/icon-192.png',
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
