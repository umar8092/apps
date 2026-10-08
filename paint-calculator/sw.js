// Saves the app on the device so it opens with no connection.
// Network first: online you always get the newest files; the saved copy is used only when the network fails.
// Change CACHE only when you add, remove or rename a file in FILES.
const CACHE = 'paint-calculator-v1';
const FILES = ['../theme.js', '../help.js', './', 'index.html', 'style.css', 'core.js', 'script.js', 'favicon.svg', 'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
    // cache: 'reload' skips the browser's own short-lived cache, so the saved copy is always the newest files
    const requests = FILES.map(file => new Request(file, { cache: 'reload' }));
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.startsWith('paint-calculator-') && key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(saved => {
            const fresh = fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, copy));
                }
                return response;
            }).catch(() => saved || (request.mode === 'navigate' ? caches.match('./') : undefined));
            return fresh;  // online: always the newest files; offline: the catch below serves the saved copy
        })
    );
});
