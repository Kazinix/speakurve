const CACHE = 'speakurve-v2';
const SCOPE = '/speakurve/';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      SCOPE, `${SCOPE}index.html`, `${SCOPE}style.css`, `${SCOPE}script.js`,
      `${SCOPE}chart.min.js`, `${SCOPE}manifest.json`, `${SCOPE}icon.svg`
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
    ])
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith(SCOPE) || url.pathname === '/speakurve') {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
