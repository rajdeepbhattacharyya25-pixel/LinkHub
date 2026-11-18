/* Link Hub Admin Studio Scoped Service Worker (/admin) */
const ADMIN_SHELL_CACHE = 'linkhub-admin-shell-v1';
const STATIC_SHELL_ASSETS = [
  '/admin-manifest.webmanifest',
  '/icons/admin-icon-192.png',
  '/icons/admin-icon-512.png',
  '/icons/admin-icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ADMIN_SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_SHELL_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== ADMIN_SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Strictly never intercept cross-origin, Firebase/Google Auth, or API endpoints
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for /admin navigation so auth & studio HTML stay always fresh
  if (request.mode === 'navigate' && url.pathname.startsWith('/admin')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ADMIN_SHELL_CACHE).then((cache) => cache.put('/admin', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/admin').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Cache-first for hashed static build assets & admin icons
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/admin-manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ADMIN_SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
  }
});
