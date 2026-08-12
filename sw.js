// ===================================================================
// sw.js - Service Worker with Proper GET-only Caching & API Bypass
// ===================================================================

const CACHE_NAME = 'sasana-erp-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './css/tailwind.min.css',
  './css/fontawesome.min.css',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/app.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => console.warn('Cache addAll error:', err));
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
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

// Fetch Event (FIXES: Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported)
self.addEventListener('fetch', (event) => {
  // 💡 1. POST, PUT, DELETE Request များကို Cache ထဲ မသိမ်းဘဲ Network သို့ တိုက်ရိုက် ပို့မည်
  if (event.request.method !== 'GET') {
    return; // Bypass service worker cache for POST requests
  }

  // 💡 2. Cloudflare Worker API Request များကို Cache မသိမ်းဘဲ တိုက်ရိုက် ပို့မည်
  const url = new URL(event.request.url);
  if (url.origin.includes('workers.dev')) {
    return; // Do not cache API calls
  }

  // 💡 3. GET Static Files များအတွက်သာ Cache သုံးမည်
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Cache API supports GET requests only
          if (event.request.method === 'GET') {
            cache.put(event.request, responseToCache);
          }
        });
        return networkResponse;
      }).catch(() => {
        // Fallback or offline support
      });
    })
  );
});
