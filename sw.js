// ===================================================================
// sw.js - Sāsana ERP PWA Service Worker (Bulletproof Offline Cache)
// ===================================================================

const CACHE_NAME = 'sasana-erp-v3.0-bulletproof-cache';

// Cache သိမ်းဆည်းမည့် အဓိက ဖိုင်များ စာရင်း
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './avicon.svg',
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
// 1. Install Event: Safe Pre-caching (Promise.allSettled)
// -------------------------------------------------------------------
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          fetch(url, { cache: 'reload' })
            .then(response => {
              if (response && response.status === 200) {
                return cache.put(url, response);
              }
            })
            .catch(err => console.warn(`[PWA Skip Asset]: ${url}`, err))
        )
      );
    })
  );
});

// -------------------------------------------------------------------
// 2. Activate Event: Clean up older cache versions immediately
// -------------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------
// 3. Fetch Event Handler: Stale-While-Revalidate + Safe API Bypass
// -------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 🛡️ ၁။ GET Request မဟုတ်ပါက (POST/PUT/DELETE) Cache မလုပ်ဘဲ Network သို့ တိုက်ရိုက်လွှဲပေးခြင်း
  if (req.method !== 'GET') return;

  // 🛡️ ၂။ HTTP/HTTPS မဟုတ်သော Schemes (ဥပမာ- chrome-extension://) များကို Bypass လုပ်ခြင်း
  if (!url.protocol.startsWith('http')) return;

  // 🛡️ ၃။ Cloudflare Worker API ခေါ်ယူမှုများကို Cache မလုပ်ဘဲ တိုက်ရိုက် bypass ပြုလုပ်ခြင်း
  if (url.hostname.includes('workers.dev') || url.pathname.includes('/api/')) {
    return;
  }

  // ⚡ ၄။ Static Assets များကို Stale-While-Revalidate မူဝါဒဖြင့် လျင်မြန်စွာ ပြသခြင်း
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      // Network မှ အသစ်ယူပြီး Cache ကို Background တွင် Update လုပ်မည့် Fetch Promise
      const fetchPromise = fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(err => {
          // Offline ဖြစ်နေချိန်တွင် Network ကျရှုံးပါက Cached Response ပြန်ပေးမည်
          return cachedResponse;
        });

      // Cache ထဲတွင် ရှိပြီးသားဖြစ်ပါက ချက်ချင်းပြသပြီး Background တွင် Update ပြုလုပ်မည်
      return cachedResponse || fetchPromise;
    })
  );
});
