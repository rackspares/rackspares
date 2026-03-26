/* RackSpares Service Worker — v0.5.0 */
const CACHE = 'rackspares-v0.5.0';

// App shell — the minimum needed to render something offline
const SHELL = ['/', '/index.html'];

// ── Install: cache the app shell ──────────────────────────────────────────────
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activate: prune old caches ────────────────────────────────────────────────
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (evt) => {
  const { request } = evt;
  const url = new URL(request.url);

  // Never intercept non-GET requests or cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // API calls: network-first, return offline JSON on failure
  if (url.pathname.startsWith('/api/')) {
    evt.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ detail: 'You appear to be offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Static assets (JS/CSS/fonts): cache-first, populate on miss
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    evt.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return resp;
          })
      )
    );
    return;
  }

  // HTML navigation: network-first, fall back to cached index.html
  evt.respondWith(
    fetch(request).catch(() =>
      caches.match('/index.html').then(
        (cached) =>
          cached ||
          new Response('<h1>Offline</h1><p>Please reconnect to use RackSpares.</p>', {
            headers: { 'Content-Type': 'text/html' },
          })
      )
    )
  );
});
