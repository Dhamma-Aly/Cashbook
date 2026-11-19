// ===================================================================
// sw.js - Sāsana ERP PWA Service Worker (v4.3 Hardened Pro D1)
// Features: Auto Old-Cache Purge, Full Offline Navigation,
// CDN Font/Icon Caching, API Bypass & Safe Background Revalidation
// ===================================================================

const CACHE_NAME = 'sasana-erp-v4.4-pro-d1';

// 📦 App Shell & Static Core Assets
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './css/style.css',
  './css/tailwind.build.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/Dashboard.js',
  './js/Banks.js',
  './js/Inventory.js',
  './js/yogi.js',
  './js/report-system.js',
  './js/app.js',
  './view/Dashboard.html',
  './view/Banks.html',
  './view/Inventory.html',
  './view/yogi.html',
  './view/report-system.html'
];

// -------------------------------------------------------------------
// 1. Install Event: Force Fresh Reload of Static Assets
// -------------------------------------------------------------------
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { cache: 'reload' })
            .then(res => {
              if (res && res.status === 200) {
                return cache.put(url, res);
              }
            })
            .catch(err => console.warn(`[PWA Skip Asset]: ${url}`, err))
        )
      );
    })
  );
});

// -------------------------------------------------------------------
// 2. Activate Event: Purge Old Cache Versions & Claim Clients
// -------------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------
// 3. Fetch Event Handler
// -------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 🛡️ Cloudflare Worker API requests များကို Cache မလုပ်ဘဲ api.js IndexedDB သို့ လွှဲပေးခြင်း
  if (url.hostname.includes('workers.dev') || url.pathname.includes('/api/')) {
    return;
  }

  // 📱 Navigation (index.html / ?tab=...) -> Network-First with Offline Fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('./index.html') || await cache.match('./');
          return cachedIndex || new Response('Offline: Sāsana ERP is ready in offline mode.', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // ⚡ Static Assets & CDN Fonts -> Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const fetchPromise = fetch(req)
        .then(networkResponse => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(req, responseToCache))
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// -------------------------------------------------------------------
// 4. Message Event: Instant Update Trigger
// -------------------------------------------------------------------
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
// === END OF sw.js ===
