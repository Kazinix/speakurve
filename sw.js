const CACHE = 'speakurve-v1';
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
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith(SCOPE) || url.pathname === '/speakurve') {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
