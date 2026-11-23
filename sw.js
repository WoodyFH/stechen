/*
 * Service Worker für Stechen – offline, Cache-first.
 * Die Versionsnummer kommt aus version.js (einzige Stelle zum Hochzählen).
 * Neuer Cache pro Version, alte werden beim Aktivieren gelöscht, die neue
 * Version übernimmt sofort (skipWaiting + clients.claim).
 */
importScripts('./version.js');

const VERSION = self.STECHEN_VERSION;
const PREFIX = 'stechen-v';
const CACHE = `${PREFIX}${VERSION}`;

// Alle Pfade relativ zum Service Worker, damit die App in einem Unterordner läuft.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './version.js',
  './manifest.webmanifest',
  './js/app.js',
  './js/board.js',
  './js/dom.js',
  './js/logic.js',
  './js/overlays.js',
  './js/screens.js',
  './js/store.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien landen.
      await Promise.all(
        ASSETS.map(async (url) => {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      try {
        return await fetch(req);
      } catch {
        return Response.error();
      }
    })(),
  );
});
