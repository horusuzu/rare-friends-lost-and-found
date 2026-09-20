// Network-first shell only. Ownership, RPC calls and save data are never cached.
const PREFIX = `rare-friends-island-life:${self.registration.scope}:`;
const CACHE = `${PREFIX}v3`;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
 for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 const request = event.request, url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
 if (!/\.(?:html|js|css|png|svg|webmanifest)$/.test(url.pathname) && !url.pathname.endsWith('/')) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE);
  try { const response = await fetch(request); if (response.ok && response.type === 'basic') await cache.put(request, response.clone()); return response; }
  catch { const stored = await cache.match(request); if (stored) return stored; return Response.error(); }
 })());
});
