// ===================================================================
// sw.js - Sāsana ERP PWA Service Worker (V3.0 Final Cache Fix)
// ===================================================================

const CACHE_NAME = 'sasana-erp-v3.0-final-cache';
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

// Install Event - Precache all view templates and core assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('PWA Precache Error:', err));
    })
  );
});

// Activate Event - Clean old legacy caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event Handler (Bypass /api/ calls & Cache-First for Views)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Bypass API Requests (Always go to Cloudflare Worker API)
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ success: false, error: 'Network Error' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // 2. Static Assets & HTML View Templates Cache Strategy
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached asset & update cache in background
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
    }).catch(err => {
      console.warn('PWA Fetch fallback error:', err);
      return fetch(event.request);
    })
  );
});
