// GroupPad service worker — installability + a graceful offline shell.
// Deliberately conservative: API and share routes ALWAYS hit the network, so
// live data is never served stale. Static assets are stale-while-revalidate;
// navigations are network-first with the cached shell as the offline fallback.
const CACHE = 'gp-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // leave cross-origin (images, APIs) alone
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return; // never cache live data

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try { const fresh = await fetch(req); cache.put('/index.html', fresh.clone()); return fresh; }
      catch { return (await cache.match('/index.html')) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
