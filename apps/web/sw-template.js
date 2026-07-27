// Offline app shell. This file is a template: the build writes it to
// dist/sw.js with VERSION and PRECACHE filled in from the actual bundle (see
// the serviceWorker() plugin in vite.config.ts), so the precache list always
// matches the hashed filenames that were just emitted.
//
// The bank itself is already cached in localStorage (src/storage/localCache),
// so a shell that boots offline is the whole missing piece.
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `zitie-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: "reload" so install never picks the files back out of the HTTP
    // cache — a stale shell is exactly what this is meant to prevent.
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // The version is a hash of the precache list, so a new deploy means a new
    // cache name and every older one goes.
    for (const key of await caches.keys()) {
      if (key.startsWith("zitie-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only this origin. The API lives elsewhere and its responses are per-user
  // and change constantly — none of it belongs in a shared shell cache.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network first: a page load is how a new deploy gets picked up. The
    // precached shell is the offline fallback.
    event.respondWith(
      fetch(req).catch(async () => (await caches.match("/")) ?? (await caches.match("/index.html")) ?? Response.error()),
    );
    return;
  }

  // Assets are content-hashed, so a cache hit is always the right file.
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  })());
});
