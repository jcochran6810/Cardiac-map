/* CardioSim service worker: makes the installed app open instantly and keep working offline.
 *
 * - Pages: network first (always the latest release when online), cached copy when offline.
 * - Build files (/_next/static, content-hashed): cache first.
 * - 3D heart models (~6 MB): cache first, kept across releases so updates don't re-download them.
 * - Everything else from this site: served from cache, refreshed in the background.
 * Registered as /sw.js?v=<build id>; each release gets its own cache and drops the previous one.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = `cardiosim-shell-${VERSION}`;
const MODELS = 'cardiosim-models-v1';
const PRECACHE = ['/', '/monitor', '/manifest.webmanifest', '/logo.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cardiosim-') && k !== SHELL && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFor = (url) => (url.pathname.startsWith('/models/') ? MODELS : SHELL);
const cacheable = (res) => res && res.ok && res.type === 'basic';

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((res) => {
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  });
  if (!cached) return network.catch(async () => (await cache.match('/')) || Response.error());
  // Slow or no connection: don't keep the user waiting on a page we already have
  const fallback = new Promise((resolve) => setTimeout(() => resolve(cached), 4000));
  return Promise.race([network.catch(() => cached), fallback]);
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return; // Next.js router data, never cached
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') event.respondWith(networkFirst(request));
  else if (url.pathname.startsWith('/models/')) event.respondWith(cacheFirst(request, MODELS));
  else if (url.pathname.startsWith('/_next/static/')) event.respondWith(cacheFirst(request, SHELL));
  else event.respondWith(staleWhileRevalidate(request));
});

// The very first visit loads before this worker exists; the page sends what it fetched so it is cached too.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.map(async (u) => {
        let url;
        try { url = new URL(u, self.location.origin); } catch { return; }
        if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.searchParams.has('_rsc')) return;
        const cache = await caches.open(cacheFor(url));
        if (await cache.match(url.href)) return;
        try {
          const res = await fetch(url.href);
          if (cacheable(res)) await cache.put(url.href, res);
        } catch { /* offline: try again next visit */ }
      }),
    ),
  );
});
