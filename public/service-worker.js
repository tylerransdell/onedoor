// public/service-worker.js
const CACHE_NAME = 'onedoor-v2';

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // BYPASS: Do NOT intercept API, Video, or SIP calls
    // These must go directly to the network/nginx
    if (url.pathname.startsWith('/api') || 
        url.pathname.startsWith('/go2rtc') || 
        url.pathname.startsWith('/asterisk-ws')) {
        return; 
    }

    // Default behavior for HTML/JS/Icons
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
