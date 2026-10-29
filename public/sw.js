// Lantern Works offline support. Hand-written, no dependencies.
// Install: precache the page plus every asset listed in asset-manifest.json (written by vite.config.ts).
// Fetch: pages are network-first with the cached copy as the offline fallback; other same-origin GETs are
// cache-first (they have content-hashed names). Cross-origin requests (the Claude API) are left alone.
// The page registers this file as sw.js?v=<entry chunk name>, so each deploy gets its own cache.
// Updates wait until existing tabs close, keeping their lazy chunks available for the whole visit.

const SCOPE = self.registration.scope;
const PREFIX = `lantern-${encodeURIComponent(new URL(SCOPE).pathname)}-`;
const CACHE = `${PREFIX}${new URL(self.location.href).searchParams.get('v') ?? 'dev'}`;
const ASSETS = new URL('assets/', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(new URL('asset-manifest.json', SCOPE), { cache: 'no-cache' });
      const { files } = await res.json();
      const cache = await caches.open(CACHE);
      await cache.addAll([SCOPE, new URL('favicon.svg', SCOPE).href, ...files.map((f) => new URL(f, SCOPE).href)]);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Keep the precached shell paired with this version's assets for offline navigation.
          return await fetch(req);
        } catch {
          return (await caches.match(SCOPE, { cacheName: CACHE })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      // Vite's generated assets have identical bodies across Origin headers. Runtime URLs keep Vary matching.
      const ignoreVary = req.url.startsWith(ASSETS);
      const cached = await caches.match(req, { cacheName: CACHE, ignoreVary });
      if (cached) return cached;
      // A network navigation can load the next build while its worker waits. Its immutable chunks
      // are already precached there, so that new tab must also be able to load them offline.
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX) || key === CACHE) continue;
        const next = await caches.match(req, { cacheName: key, ignoreVary });
        if (next) return next;
      }
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    })(),
  );
});
