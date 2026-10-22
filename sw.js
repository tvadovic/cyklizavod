// Service worker: appka funguje aj bez internetu.
// Súbory appky sa načítajú zo siete, ak je dostupná (vždy najnovšia verzia),
// inak z vyrovnávacej pamäte. Pri zmene súborov zvýš číslo verzie.
const CACHE = 'cyklizavod-v5';
const APP = [
  './', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'css/app.css', 'js/app.js', 'js/data.js', 'js/rules.js', 'js/store.js', 'js/firebase-config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const cdn = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
  if (!own && !cdn) return; // Firestore a prihlásenie idú priamo na sieť

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: own }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
