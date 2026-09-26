/* Service worker « ChefChefChef »
 * - Précache la coquille de l'app à l'installation.
 * - Réseau d'abord pour les fichiers du site (les mises à jour arrivent tout
 *   de suite), cache en secours quand on est hors ligne.
 * - Ne touche jamais aux appels Supabase / Claude.
 */
const CACHE = 'ccc-shell-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './css/app.css',
  './vendor/supabase.js',
  './vendor/preact.module.js',
  './vendor/hooks.module.js',
  './vendor/htm.module.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './seed/seed.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, photos externes… : jamais interceptés

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'hors ligne' });
      })
  );
});
