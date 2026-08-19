// Bumped v3 -> v4: actually populate the cache. Static assets are served
// cache-first (fast repeat loads), the HTML page is network-first (keeps the
// latest app/config). Same strategy as before for /api, /go2rtc, /ws (bypassed).
const CACHE_NAME = 'onedoor-v4';
const PRECACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/jssip.min.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(PRECACHE.map(url => new Request(url, { cache: 'no-cache' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const u = new URL(e.request.url);
    if (u.pathname.startsWith('/api') || u.pathname.startsWith('/go2rtc') || u.pathname.startsWith('/ws')) return;

    const isHTML = e.request.mode === 'navigate' || /\.html?$/.test(u.pathname);

    if (isHTML) {
        // Network-first for the page so the latest app/config is used.
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res.ok) {
                        const cacheKey = u.pathname === '/' ? '/index.html' : e.request;
                        caches.open(CACHE_NAME).then(c => c.put(cacheKey, res.clone()));
                    }
                    return res;
                })
                .catch(() =>
                    caches.match(e.request).then(m => m || caches.match('/index.html'))
                )
        );
        return;
    }

    // Cache-first for static assets: fast repeat loads, works offline.
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
                return res;
            });
        })
    );
});

self.addEventListener('push', e => {
    try {
        const data = JSON.parse(e.data?.text() || '{}');
        e.waitUntil(
            self.registration.showNotification(data.title || 'OneDoor', {
                body: data.body || '',
                icon: data.icon || '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: data.tag || 'door-event',
                data: { url: data.url || '/' }  // ← FIXED: Added "data:" key
            })
        );
    } catch {
        // Fallback to plain text
        e.waitUntil(
            self.registration.showNotification('OneDoor', {
                body: e.data?.text() || 'Door event',
                data: { url: '/' }  // ← FIXED: Added "data:" key
            })
        );
    }
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    try {
        const url = e.notification.data?.url || '/';
        e.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
                const c = list.find(x => x.url.includes(location.hostname));
                return c && 'focus' in c ? c.focus().then(x => x.navigate(url)) : clients.openWindow(url);
            })
        );
    } catch(err) {}
});
