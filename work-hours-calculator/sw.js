// Saves the app on the device so it opens with no connection.
// Network first: online you always get the newest files (and the saved copy is refreshed); offline the saved copy is used.
// Change CACHE whenever the app changes.
const CACHE = 'work-hours-calculator-v1';
const FILES = ['../theme.js', '../help.js', './', 'index.html', 'style.css', 'core.js', 'script.js', 'favicon.svg', 'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
    const requests = FILES.map(file => new Request(file, { cache: 'reload' }));
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.startsWith('work-hours-calculator-') && key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
    event.respondWith(
        fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request, { ignoreSearch: true }).then(saved => saved || (request.mode === 'navigate' ? caches.match('./') : undefined)))
    );
});
