/* sw.js - Sāsana ERP Progressive Web App (PWA) Service Worker */

const CACHE_NAME = 'sasana-erp-v3.0.0';

// Offline အသုံးပြုနိုင်ရန် Cache လုပ်ထားမည့် ဖိုင်များ စာရင်း
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './avicon.svg',
  './css/tailwind.build.css',
  './css/fontawesome.min.css',
  './css/style.css',
  './view/Dashboard.html',
  './view/Banks.html',
  './view/Books.html',
  './view/Inventory.html',
  './view/yogi.html',
  './view/report-system.html',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/Dashboard.js',
  './js/Banks.js',
  './js/Books.js',
  './js/Inventory.js',
  './js/yogi.js',
  './js/report-system.js',
  './js/app.js'
];

// 1. Service Worker Install Event - Assets များကို Cache ထဲသို့ သိမ်းဆည်းခြင်း
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Sāsana ERP SW] Caching all core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Service Worker Activate Event - Cache အဟောင်းများကို သန့်ရှင်းရေးလုပ်ခြင်း
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Sāsana ERP SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Service Worker Fetch Event - Network First with Cache Fallback Strategy
self.addEventListener('fetch', (event) => {
  // GET မဟုတ်သော Request များ သို့မဟုတ် External API Call များကို ကျော်မည်
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Network မှ ရရှိပါက Cache ထဲတွင်လည်း အသစ်ပြန်လည် အစားထိုးမည်
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Network မရပါက (Offline ဖြစ်နေပါက) Cache ထဲမှ ဖိုင်ကို ယူသုံးမည်
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Page Navigation ဖြစ်ပါက index.html သို့ ပြန်ညွှန်းမည်
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
