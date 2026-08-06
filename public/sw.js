/* OSSC service worker — hand-rolled, no build step touches this file.
   Everything is derived from `registration.scope`, never from a literal path, so
   the same file works on GitHub Pages (/octatrack-exporter/), on `vite preview`,
   and at a domain root.

   The worker globals are declared here rather than in eslint.config.js: this is
   the only ServiceWorkerGlobalScope file in the repo, and a lone `files: public`
   block would out-weigh keeping the declaration next to the code that needs it. */
/* global self, caches, fetch, URL, Response */

const VERSION = 'v1';
const PREFIX = 'ossc-';
const CACHE = PREFIX + VERSION;

// The app shell. Scope is an absolute URL ending in '/', so this is the
// directory index — the document every navigation ultimately resolves to.
const SHELL = new URL('./', self.registration.scope).href;
const ASSETS = new URL('./assets/', self.registration.scope).href;

self.addEventListener('install', (event) => {
  // Only the shell is precached; the hashed bundles it pulls in are picked up by
  // the runtime rules below on the very same load, so there is nothing to keep
  // in sync with the build output.
  event.waitUntil(caches.open(CACHE).then(c => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(PREFIX) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const put = async (request, response) => {
  // Partial and error responses would poison the cache on replay.
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

// Navigations: network first, so a deploy is picked up as soon as the user is
// online, and the cached shell only stands in when the network cannot answer.
const navigateStrategy = async (request) => {
  try {
    const fresh = await fetch(request);
    await put(SHELL, fresh);
    return fresh;
  } catch {
    const cached = await caches.match(SHELL);
    if (cached) return cached;
    throw new Error('offline and no cached shell');
  }
};

// Hashed build output is immutable: if it is in the cache it is correct.
const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  return cached || put(request, await fetch(request));
};

// Everything else same-origin (icons, the manifest, anything added later):
// serve what we have and refresh it in the background.
const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request);
  const network = fetch(request).then(r => put(request, r)).catch(() => null);
  return cached || (await network) || Response.error();
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin (the webfont CSS, anything a user pastes in) is left to the
  // browser: opaque responses cannot be validated and would bloat the cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') event.respondWith(navigateStrategy(request));
  else if (url.href.startsWith(ASSETS)) event.respondWith(cacheFirst(request));
  else event.respondWith(staleWhileRevalidate(request));
});
