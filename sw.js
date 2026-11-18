/* sw.js — fonctionnement hors ligne.
   À chaque nouvelle version des fichiers, change VERSION : l'appli se met alors à jour. */
const VERSION = 'etape2b-caracteres';
const CACHE = 'atelier-chinois-' + VERSION;
const FILES = [
  './', './index.html', './style.css',
  './core.js', './store.js', './audio.js', './ui.js', './screens.js', './session.js', './listen.js', './rubriques.js', './atelier.js', './strokes.js', './ecriture.js', './app.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf('atelier-chinois-') === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
