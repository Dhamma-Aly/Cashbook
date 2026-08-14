// ===================================================================
// sw.js - Sāsana ERP PWA Service Worker (Robust Resilient Precache)
// ===================================================================

const CACHE_NAME = 'sasana-erp-v3.0-bulletproof-cache';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
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

// 1. Install Event: Individual Safe Caching (Never throws red console errors)
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          fetch(url).then(response => {
            if (response && response.status === 200) {
              return cache.put(url, response);
            }
          }).catch(err => console.warn(`[PWA Skip File]: ${url}`, err))
        )
      );
    })
  );
});

// 2. Activate Event: Clean old legacy caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event Handler: Bypass API requests and serve static assets smoothly
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass API requests to Cloudflare Worker
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached asset & update in background
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    }).catch(() => fetch(event.request))
  );
});
