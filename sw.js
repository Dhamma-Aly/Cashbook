// ===================================================================
// sw.js - Service Worker for Sāsana ERP PWA
// Enables instant loading & fast static caching for app UI,
// while keeping API requests (/api/) live and direct for real-time data
// ===================================================================

const CACHE_NAME = 'sasana-erp-v1.2';

// Static UI Assets to pre-cache on app install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './avicon.svg',
  './css/tailwind.build.css',
  './css/fontawesome.min.css',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/Dashboard.js',
  './js/Banks.js',
  './js/Books.js',
  './js/Inventory.js',
  './js/yogi.js',
  './js/report-system.js',
  './js/app.js',
  './view/Dashboard.html',
  './view/Banks.html',
  './view/Books.html',
  './view/Inventory.html',
  './view/yogi.html',
  './view/report-system.html'
];

// 1. Install Event - Pre-cache Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Stale-While-Revalidate for UI, Network-Only for /api/
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Rule A: Real-Time API Requests (/api/) -> Always Network Direct
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ success: false, error: 'အင်တာနက်/ကွန်ရက် ချိတ်ဆက်မှု မရှိပါ' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Rule B: Static App Assets -> Stale-While-Revalidate Strategy (Instant UI render)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
