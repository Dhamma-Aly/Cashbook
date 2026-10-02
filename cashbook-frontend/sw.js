// ===================================================================
// sw.js - Sāsana ERP PWA Service Worker (Enterprise Offline Engine)
// Features: Full Offline Navigation, Font/Icon Caching, Auto Cache Purge
// ===================================================================

const CACHE_NAME = 'sasana-erp-v3.1-enterprise-d1';

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
// 1. Install Event: Safe Pre-caching (Promise.allSettled)
// -------------------------------------------------------------------
self.addEventListener('install', event => {
  self.skipWaiting(); // တန်းပြီး Activate ဖြစ်စေရန်
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker]: Pre-caching Static Shell Assets...');
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
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[Service Worker]: Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------
// 3. Fetch Event Handler: Offline Navigation Fallback + Stale-While-Revalidate
// -------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 🛡️ ၁။ GET Request မဟုတ်ပါက (POST/PUT/DELETE) Service Worker က ကြားမဖြတ်ပါ
  if (req.method !== 'GET') return;

  // 🛡️ ၂။ HTTP/HTTPS မဟုတ်သော Schemes (chrome-extension:// စသည်) ကို Bypass လုပ်ခြင်း
  if (!url.protocol.startsWith('http')) return;

  // 🛡️ ၃။ Cloudflare Worker API ခေါ်ယူမှုများကို Cache မလုပ်ဘဲ api.js ၏ IndexedDB စနစ်သို့ တိုက်ရိုက်လွှဲပေးခြင်း
  if (url.hostname.includes('workers.dev') || url.pathname.includes('/api/')) {
    return;
  }

  // 📱 ၄။ SPA Navigation Fallback (လိုင်းမရှိချိန် Refresh နှိပ်ပါက index.html သို့ တန်းပို့ခြင်း)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('./index.html') || await cache.match('./');
        return cachedIndex || new Response('Offline: Sāsana ERP is ready in offline mode.', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      })
    );
    return;
  }

  // ⚡ ၅။ Static Assets, CDN Fonts (FontAwesome, Google Fonts) စသည်တို့အား Cache ပေးခြင်း
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const fetchPromise = fetch(req)
        .then(networkResponse => {
          // CDN ဖောင့်များ (status 200 သို့မဟုတ် opaque status 0) ကိုပါ Cache ထဲ ထည့်သွင်းသိမ်းဆည်းခြင်း
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Cache ရှိပါက ချက်ချင်းပြသပြီး Background မှ Update ပြုလုပ်မည်
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
