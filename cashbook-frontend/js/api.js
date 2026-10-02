// ===================================================================
// js/api.js - Enterprise Offline-First API Client & Sync Engine
// Features: IndexedDB Caching, Background Sync Queue & Auto-Bootstrap
// 100% Aligned with Cloudflare D1 Database & All-in-One Worker
// ===================================================================

const getApiBaseUrl = () => {
  if (typeof window.CONFIG !== 'undefined' && window.CONFIG.API_BASE_URL) {
    return window.CONFIG.API_BASE_URL;
  }
  if (typeof window.APP_CONFIG !== 'undefined' && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return 'https://cashbook-api.dhammaaly.workers.dev';
};

// ===================================================================
// 📦 1. BROWSER INDEXEDDB STORAGE ENGINE (Pure Vanilla JS)
// ===================================================================
const IDB_NAME = 'SasanaERP_Offline_DB';
const IDB_VERSION = 1;
let idbInstance = null;

function getIDB() {
  if (!idbInstance) {
    idbInstance = new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return idbInstance;
}

async function idbGet(storeName, key) {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function idbSet(storeName, key, value) {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (_) { return false; }
}

async function idbQueuePush(item) {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      tx.objectStore('sync_queue').add({ ...item, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (_) { return false; }
}

async function idbQueueGetAll() {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const req = tx.objectStore('sync_queue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (_) { return []; }
}

async function idbQueueDelete(ids) {
  try {
    const db = await getIDB();
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    for (const id of ids) {
      store.delete(id);
    }
  } catch (_) {}
}

// ===================================================================
// 🌐 2. SAFE API REQUEST WITH TOKEN & OFFLINE RESILIENCE
// ===================================================================
async function safeApiRequest(endpoint, options = {}) {
  const url = `${getApiBaseUrl()}${endpoint}`;
  const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const isGet = !options.method || options.method === 'GET';
  const cacheKey = `api_cache_${endpoint}`;

  // အင်တာနက် မရှိပါက GET Request များအား Cache မှ ချက်ချင်း ထုတ်ယူပြသခြင်း
  if (!navigator.onLine && isGet) {
    const cachedData = await idbGet('cache', cacheKey);
    if (cachedData) {
      return { ...cachedData, fromCache: true, offline: true };
    }
  }

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.ok) {
      const data = await res.json();
      // GET ဖြစ်ပါက နောက်နောင် ၀ စက္ကန့်ဖြင့် ချက်ချင်းပြသနိုင်ရန် Cache ထဲ သိမ်းခြင်း
      if (isGet && data && data.success) {
        await idbSet('cache', cacheKey, data);
      }
      return data;
    }

    if (res.status === 401) {
      if (typeof window.handleLogoutSilent === 'function') {
        window.handleLogoutSilent();
      }
    }

    // ဆာဗာ Error ဖြစ်ပါက Cache ရှိလျှင် Fallback အနေဖြင့် ထုတ်ပြခြင်း
    if (isGet) {
      const cachedData = await idbGet('cache', cacheKey);
      if (cachedData) return { ...cachedData, fromCache: true };
    }

    return { success: false, data: [], kpis: {}, error: `HTTP ${res.status}` };
  } catch (err) {
    console.warn(`[Network Offline / Server Warning - ${endpoint}]:`, err.message);

    // အင်တာနက် လိုင်းကျသွားသည့်အခါ Cache ထဲမှ အချက်အလက်များဖြင့် အလုပ်လုပ်စေခြင်း
    if (isGet) {
      const cachedData = await idbGet('cache', cacheKey);
      if (cachedData) return { ...cachedData, fromCache: true, offline: true };
    }

    return { success: false, data: [], kpis: {}, error: err.message, offline: true };
  }
}

// ===================================================================
// 🔄 3. BACKGROUND AUTO-SYNC ENGINE (နောက်ကွယ်မှ အလိုအလျောက် ပို့ပေးခြင်း)
// ===================================================================
let isSyncing = false;

window.triggerBackgroundSync = async function() {
  if (isSyncing || !navigator.onLine) return;

  const queue = await idbQueueGetAll();
  if (!queue || queue.length === 0) return;

  isSyncing = true;
  console.log(`[Auto-Sync Engine]: Processing ${queue.length} offline operations...`);

  try {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    const res = await fetch(`${getApiBaseUrl()}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        queue: queue.map(q => ({
          action: q.action,
          table: q.table,
          data: q.data,
          unique_id: q.unique_id
        }))
      })
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.success) {
        const syncedIds = queue.map(q => q.id);
        await idbQueueDelete(syncedIds);
        console.log(`[Auto-Sync Engine]: Successfully synced ${result.count} items to D1.`);
      }
    }
  } catch (err) {
    console.warn('[Auto-Sync Engine Warning]: Could not complete sync, will retry later.', err.message);
  } finally {
    isSyncing = false;
  }
};

// အင်တာနက် လိုင်းပြန်ရသည်နှင့် နောက်ကွယ်မှ အလိုအလျောက် Sync လုပ်ခိုင်းခြင်း
window.addEventListener('online', () => {
  console.log('[Network Online]: Internet re-connected. Triggering sync...');
  window.triggerBackgroundSync();
});

// စက္ကန့် ၃၀ လျှင် တစ်ကြိမ် နောက်ကွယ်မှ Queue ရှိ/မရှိ စစ်ဆေးခြင်း
setInterval(() => {
  if (navigator.onLine) window.triggerBackgroundSync();
}, 30000);

// ===================================================================
// 🚀 4. BOOTSTRAP PRELOAD API (App ဖွင့်ချိန်တွင် ဒေတာအားလုံး ဆွဲယူထားခြင်း)
// ===================================================================
window.bootstrapAppData = async function() {
  if (!navigator.onLine) return;

  try {
    console.log('[Bootstrap Engine]: Pre-loading all ledger books, inventory and yogis...');
    const res = await safeApiRequest('/api/bootstrap');
    if (res && res.success) {
      // ၁။ စာအုပ် ၁၀ အုပ်လုံးအား Cache ထဲသို့ တစ်ခါတည်း ထည့်သွင်းခြင်း
      if (res.books) {
        for (const [code, bookPayload] of Object.entries(res.books)) {
          await idbSet('cache', `api_cache_/api/entries?sheet=${encodeURIComponent(code)}`, bookPayload);
          if (bookPayload.book) {
            await idbSet('cache', `api_cache_/api/entries?sheet=${encodeURIComponent(bookPayload.book)}`, bookPayload);
          }
        }
      }

      // ၂။ ပစ္စည်းစာရင်း Cache
      if (res.inventory) {
        await idbSet('cache', 'api_cache_/api/inventory', { success: true, data: res.inventory, kpis: {} });
      }

      // ၃။ ယောဂီစာရင်း Cache
      if (res.yogi) {
        await idbSet('cache', 'api_cache_/api/yogi?sheet=12Yogi', { success: true, data: res.yogi['12Yogi'] || [], kpis: {} });
        await idbSet('cache', 'api_cache_/api/yogi?sheet=13Yogi', { success: true, data: res.yogi['13Yogi'] || [], kpis: {} });
      }

      console.log('[Bootstrap Engine]: Pre-load complete. All tabs ready for 0-second instant loading!');
    }
  } catch (err) {
    console.warn('[Bootstrap Engine]: Preload deferred.', err.message);
  }
};

// ===================================================================
// 🏛️ 5. CASHBOOK & BANK LEDGERS API (1CB Bank, 1General Book, etc.)
// ===================================================================
window.fetchSheetData = async function(tableOrSheetName = '1CB Bank (General)') {
  return await safeApiRequest(`/api/entries?sheet=${encodeURIComponent(tableOrSheetName)}`);
};
window.fetchSheetDataAPI = window.fetchSheetData;

window.saveCashbookEntryAPI = async function(entryData, isEdit = false) {
  const table = entryData.book_name || entryData.sheet_name || '1CB Bank (General)';
  const unique_id = entryData.unique_id || entryData.uniqueId || crypto.randomUUID();

  // အင်တာနက် မရှိပါက Queue ထဲ သိမ်းဆည်းပြီး အောင်မြင်ကြောင်း ချက်ချင်း ပြန်ပေးခြင်း
  if (!navigator.onLine) {
    await idbQueuePush({
      action: isEdit ? 'UPDATE' : 'CREATE',
      table,
      data: entryData,
      unique_id
    });
    return { success: true, offline: true, message: "လိုင်းမရှိသဖြင့် မှတ်တမ်းတင်ထားပါသည် (လိုင်းရပါက အလိုအလျောက် သိမ်းပေးပါမည်)" };
  }

  const res = await safeApiRequest('/api/entries', {
    method: isEdit ? 'PUT' : 'POST',
    body: JSON.stringify(entryData)
  });

  // ကွန်ရက် Error ကြောင့် မအောင်မြင်ပါကလည်း Queue ထဲသို့ ထည့်ပေးခြင်း
  if (!res || !res.success) {
    await idbQueuePush({
      action: isEdit ? 'UPDATE' : 'CREATE',
      table,
      data: entryData,
      unique_id
    });
    return { success: true, offline: true, message: "သိမ်းဆည်းထားပါသည် (နောက်ကွယ်မှ အလိုအလျောက် ပို့ပေးပါမည်)" };
  }

  return res;
};
window.saveEntryAPI = window.saveCashbookEntryAPI;

window.deleteCashbookEntryAPI = async function(uniqueId, tableName = null) {
  const table = tableName || window.currentTable || window.currentSheet || '1CB Bank (General)';

  if (!navigator.onLine) {
    await idbQueuePush({
      action: 'DELETE',
      table,
      data: {},
      unique_id: uniqueId
    });
    return { success: true, offline: true, message: "ဖျက်သိမ်းစာရင်းအား မှတ်သားထားပါသည်" };
  }

  return await safeApiRequest(`/api/entries?unique_id=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};
window.deleteEntryAPI = window.deleteCashbookEntryAPI;

// ===================================================================
// 📊 6. HOME DASHBOARD SUMMARY API
// ===================================================================
window.fetchHomeSummary = async function() {
  const res = await safeApiRequest('/api/home-summary');
  if (!res || !res.success) {
    return {
      success: false,
      kpis: { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 },
      fundSummary: {},
      yogiSummary: {}
    };
  }
  return res;
};
window.fetchHomeSummaryAPI = window.fetchHomeSummary;

// ===================================================================
// 🧘 7. YOGI MANAGEMENT API (Permanent Yogi & Camp Yogi)
// ===================================================================
window.fetchYogiDataAPI = async function(sheetType = '12Yogi') {
  return await safeApiRequest(`/api/yogi?sheet=${encodeURIComponent(sheetType)}`);
};

window.saveYogiAPI = async function(data, isEdit = false) {
  const table = (data.sheet_type === '13Yogi' || data.yogi_type === 'စခန်းဝင်') ? 'Camp Yogi' : 'Permanent Yogi';
  const unique_id = data.unique_id || data.uniqueId || `YOGI-${crypto.randomUUID()}`;

  if (!navigator.onLine) {
    await idbQueuePush({
      action: isEdit ? 'UPDATE' : 'CREATE',
      table,
      data,
      unique_id
    });
    return { success: true, offline: true, message: "ယောဂီစာရင်းအား Offline အဖြစ် သိမ်းဆည်းထားပါသည်" };
  }

  return await safeApiRequest('/api/yogi', {
    method: isEdit ? 'PUT' : 'POST',
    body: JSON.stringify(data)
  });
};

window.checkoutYogiAPI = async function(payload) {
  return await safeApiRequest('/api/yogi/checkout', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};

window.reactivateYogiAPI = async function(payload) {
  return await safeApiRequest('/api/yogi/reactivate', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};

window.deleteYogiAPI = async function(uniqueId, sheetType = '12Yogi') {
  const table = (sheetType === '13Yogi') ? 'Camp Yogi' : 'Permanent Yogi';

  if (!navigator.onLine) {
    await idbQueuePush({
      action: 'DELETE',
      table,
      data: {},
      unique_id: uniqueId
    });
    return { success: true, offline: true };
  }

  return await safeApiRequest(`/api/yogi?unique_id=${encodeURIComponent(uniqueId)}&sheet=${encodeURIComponent(sheetType)}`, {
    method: 'DELETE'
  });
};

// ===================================================================
// 📦 8. INVENTORY API (Inventory Table)
// ===================================================================
window.fetchInventoryDataAPI = async function() {
  return await safeApiRequest('/api/inventory');
};

window.saveInventoryEntryAPI = async function(entryData, isEdit = false) {
  const unique_id = entryData.unique_id || entryData.uniqueId || `INV-${crypto.randomUUID()}`;

  if (!navigator.onLine) {
    await idbQueuePush({
      action: isEdit ? 'UPDATE' : 'CREATE',
      table: 'Inventory',
      data: entryData,
      unique_id
    });
    return { success: true, offline: true, message: "ပစ္စည်းစာရင်းအား Offline အဖြစ် သိမ်းဆည်းထားပါသည်" };
  }

  return await safeApiRequest('/api/inventory', {
    method: isEdit ? 'PUT' : 'POST',
    body: JSON.stringify(entryData)
  });
};

window.deleteInventoryEntryAPI = async function(uniqueId) {
  if (!navigator.onLine) {
    await idbQueuePush({
      action: 'DELETE',
      table: 'Inventory',
      data: {},
      unique_id: uniqueId
    });
    return { success: true, offline: true };
  }

  return await safeApiRequest(`/api/inventory?unique_id=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};

// ===================================================================
// 📈 9. ANNUAL EXPENSE REPORT API (1General Book)
// ===================================================================
window.fetchReportDataAPI = async function(year = '2026', sheet = '1General Book') {
  return await safeApiRequest(`/api/report?year=${encodeURIComponent(year)}&sheet=${encodeURIComponent(sheet)}`);
};
