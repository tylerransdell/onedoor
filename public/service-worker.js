const CACHE_NAME = 'onedoor-v3';

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
    const u = new URL(e.request.url);
    if (u.pathname.startsWith('/api') || u.pathname.startsWith('/go2rtc') || u.pathname.startsWith('/ws')) return;
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
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
