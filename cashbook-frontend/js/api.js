// ===================================================================
// js/api.js - Offline-First API Client & Sync Engine  — v4.1 (Optimized)
//
// ပြင်ဆင်ချက်များ:
//  1. Entry သိမ်း/ပြင်/ဖျက် တိုင်းတွင် ?sheet=<စာအုပ်> ပါစေခြင်း
//  2. Server က ပယ်ချသော error (400/403/404) ကို queue ထဲမထည့်ဘဲ အမှန်တကယ် error ပြခြင်း
//  3. Sync လုပ်ပြီး "synced / deleted" ဖြစ်သော item များကိုသာ queue မှ ဖျက်ခြင်း
//  4. Offline မှာ သိမ်းထားသော စာရင်းများကို Cache ထဲ ချက်ချင်းထည့်ပြီး (pending) ပြသခြင်း
//  5. unique_id ကို request မပို့ခင် payload ထဲ ထည့်ခြင်း
//  6. Yogi offline table အမှား ပြင်ခြင်း၊ Transfer API (atomic) ထည့်ခြင်း
//  7. Request timeout (10s) သို့လျှော့ချခြင်း (UX ပိုကောင်းစေရန်)
//  8. 401 Error ဖြစ်ပါက Data မပျက်စေရန် Soft Re-Auth Modal ပြသပေးခြင်း
//  9. ရက် ၃၀ ကျော်နေသော Offline Sync Failed Data များအား ရှင်းလင်းပေးခြင်း (Pruning)
// ===================================================================
(function () {
  'use strict';

  const API_FALLBACK = 'https://cashbook-api.dhammaaly.workers.dev';
  const REQUEST_TIMEOUT_MS = 10000; // 🌟 Timeout ကို 10s သို့ လျှော့ချထားသည်
  const MAX_SYNC_ATTEMPTS = 5;

  const getApiBaseUrl = () =>
    (window.CONFIG && window.CONFIG.API_BASE_URL) ||
    (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || API_FALLBACK;

  const getToken = () => localStorage.getItem('sasana_auth_token') || localStorage.getItem('yogi_auth_token');

  // -----------------------------------------------------------------
  // Table name helpers
  // -----------------------------------------------------------------
  const LEDGER_CODES = {
    '1CB': '1CB Bank (General)', '2CB': '2CB Bank (Meal)', '3CB': '3CB Bank (UZ)',
    '4GB': '1General Book', '5FB': '2Meal Book', '6HB': '3Hall Book', '7PB': '4Pagoda Book',
    '8EB': '5Electronic Book', '9MB': '6Medical Book', '10GB': '7Other Book',
  };
  const ledgerTableName = (x) => {
    const k = String(x || '').trim();
    return LEDGER_CODES[k] || k;
  };
  const yogiTableName = (x) => {
    const k = String(x || '').trim();
    return (k === '13Yogi' || k === 'Camp Yogi' || k.includes('စခန်းဝင်')) ? 'Camp Yogi' : 'Permanent Yogi';
  };
  const yogiCode = (table) => (table === 'Camp Yogi' ? '13Yogi' : '12Yogi');

  const cacheKeyOf = (endpoint) => `api_cache_${endpoint}`;
  const ledgerEndpoint = (table) => `/api/entries?sheet=${encodeURIComponent(table)}`;
  const yogiEndpoint = (table) => `/api/yogi?sheet=${yogiCode(table)}`;

  // ===================================================================
  // 1. INDEXEDDB (cache + sync_queue)
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
          if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
          if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { idbInstance = null; reject(request.error); };
      });
    }
    return idbInstance;
  }

  async function idbRun(store, mode, fn) {
    try {
      const db = await getIDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(store, mode);
        let result = null;
        const req = fn(tx.objectStore(store));
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result === undefined ? null : result);
        tx.onerror = tx.onabort = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  const idbGet = (store, key) => idbRun(store, 'readonly', s => s.get(key));
  const idbSet = async (store, key, value) => (await idbRun(store, 'readwrite', s => s.put(value, key)), true);
  const idbClear = (store) => idbRun(store, 'readwrite', s => s.clear());
  const idbQueuePush = async (item) => {
    const id = await idbRun('sync_queue', 'readwrite', s => s.add({ ...item, attempts: 0, failed: false, timestamp: Date.now() }));
    return id !== null;
  };
  const idbQueuePut = (item) => idbRun('sync_queue', 'readwrite', s => s.put(item));
  const idbQueueGetAll = async () => (await idbRun('sync_queue', 'readonly', s => s.getAll())) || [];
  const idbQueueDelete = (ids) => ids.length
    ? idbRun('sync_queue', 'readwrite', s => { ids.forEach(id => s.delete(id)); return null; })
    : Promise.resolve(null);

  window.clearOfflineCache = async function () {
    await idbClear('cache');
    try {
      Object.keys(localStorage).filter(k => k.startsWith('sasana_yogi_cache_')).forEach(k => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  };

  // 🌟 Auto-Cleanup for IndexedDB Sync Queue (၃၀ ရက်အထက်ဟောင်းသော Failed Data များ ဖျက်ရန်)
  window.pruneOldSyncQueue = async function () {
    try {
      const queue = await idbQueueGetAll();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const toDelete = queue.filter(q => (now - (q.timestamp || now)) > THIRTY_DAYS_MS).map(q => q.id);
      if (toDelete.length > 0) {
        await idbQueueDelete(toDelete);
        console.log(`[Pruning] Deleted ${toDelete.length} old failed sync items.`);
      }
    } catch (e) {
      console.warn('Pruning error:', e);
    }
  };

  // ===================================================================
  // 2. SAFE API REQUEST
  // ===================================================================
  async function safeApiRequest(endpoint, options = {}) {
    const { noCache, ...fetchOpts } = options;
    const isGet = !fetchOpts.method || fetchOpts.method === 'GET';
    const cacheKey = cacheKeyOf(endpoint);
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOpts.headers || {}),
    };

    const fromCache = async (extra = {}) => {
      if (!isGet || noCache) return null;
      const cached = await idbGet('cache', cacheKey);
      return cached ? { ...cached, success: true, fromCache: true, ...extra } : null;
    };

    if (!navigator.onLine && isGet) {
      const c = await fromCache({ offline: true });
      if (c) return c;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${getApiBaseUrl()}${endpoint}`, { ...fetchOpts, headers, signal: ctrl.signal });
      clearTimeout(timer);

      let body = null;
      try { body = await res.json(); } catch (_) { /* non-JSON */ }

      if (res.ok && body) {
        if (isGet && !noCache && body.success) await idbSet('cache', cacheKey, body);
        return body;
      }

      if (res.status === 401) {
        // 🌟 Token Expired ဖြစ်ပါက Data မပျက်စေရန် Soft Re-Auth Modal ပြမည်
        if (typeof window.showReAuthModal === 'function') {
          window.showReAuthModal();
        } else {
          await window.clearOfflineCache();
          if (typeof window.handleLogoutSilent === 'function') window.handleLogoutSilent();
        }
      }
      if (res.status >= 500) {                       
        const c = await fromCache();
        if (c) return c;
      }
      return {
        success: false, status: res.status, data: [], kpis: {},
        error: (body && body.error) || `HTTP ${res.status}`,
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[Network] ${endpoint}:`, err.message);
      const c = await fromCache({ offline: true });
      if (c) return c;
      return { success: false, offline: true, data: [], kpis: {}, error: err.name === 'AbortError' ? 'Server မှ အဖြေ နှောင့်နှေးနေပါသည်' : err.message };
    }
  }
  window.safeApiRequest = safeApiRequest;

  const isRetryable = (res) => !!res && (res.offline === true || (res.status >= 500));

  // ===================================================================
  // 3. OPTIMISTIC CACHE PATCH 
  // ===================================================================
  const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

  function toLedgerRow(d, table) {
    const uid = d.unique_id;
    const income = toNum(d.income), expense = toNum(d.expense);
    const date = d.date || d.entry_date || '';
    return {
      unique_id: uid, uniqueId: uid, book_name: table, sheet_name: table,
      date, entry_date: date, title: d.title || '', category: d.title || (income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ'),
      sub_title: d.sub_title || '', subcategory: d.sub_title || '-',
      voucher_no: d.voucher_no || '', description: d.description || '', receiver: d.receiver || '',
      income, expense, month_year: d.month_year || '',
    };
  }
  function toInvRow(d) {
    const uid = d.unique_id, date = d.date || d.entry_date || '';
    const desc = d.description || d.item_name || d.item_desc || '';
    return {
      unique_id: uid, uniqueId: uid, date, entry_date: date, location: d.location || 'စတို',
      category: d.category || 'အထွေထွေ', description: desc, item_name: desc, item_desc: desc,
      unit: d.unit || 'ခု', qty: toNum(d.qty), remark: d.remark || d.note || '', note: d.remark || d.note || '',
      month_year: date.slice(0, 7), book_name: 'Inventory',
    };
  }
  function toYogiRow(d, table) {
    const uid = d.unique_id, end = d.end_date || '';
    return {
      unique_id: uid, uniqueId: uid, sheet_type: yogiCode(table), book_name: table,
      start_date: d.start_date || '', end_date: end, yogi_type: d.yogi_type || d.category || '', category: d.yogi_type || d.category || '',
      name: d.name || '', father_name: d.father_name || '', nrc: d.nrc || d.full_nrc || '', full_nrc: d.nrc || d.full_nrc || '',
      dob: d.dob || '', age: d.age || 0, gender: d.gender || 'ကျား',
      yogi_phone: d.yogi_phone || d.phone || '', phone: d.yogi_phone || d.phone || '',
      home_phone: d.home_phone || '', address: d.address || '', status: end ? 'Inactive' : 'Active',
    };
  }

  function recomputeLedger(rows) {
    const sorted = rows.map((r, i) => [r, i])
      .sort((a, b) => String(a[0].date || '').localeCompare(String(b[0].date || '')) || a[1] - b[1])
      .map(x => x[0]);
    let bal = 0, ti = 0, te = 0;
    sorted.forEach(r => { ti += r.income || 0; te += r.expense || 0; bal += (r.income || 0) - (r.expense || 0); r.balance = bal; });
    return { rows: sorted, kpis: { totalIncome: ti, totalExpense: te, balance: bal, count: sorted.length } };
  }
  function recomputeInventory(rows) {
    const k = { kitchen: 0, dhammaHall: 0, sim: 0, store: 0, totalQty: 0, totalItems: rows.length };
    rows.forEach(r => {
      const q = r.qty || 0, loc = r.location || '';
      k.totalQty += q;
      if (loc.includes('မီးဖို')) k.kitchen += q; else if (loc.includes('ဓမ္မာရုံ')) k.dhammaHall += q;
      else if (loc.includes('သိမ်')) k.sim += q; else if (loc.includes('စတို')) k.store += q;
    });
    return k;
  }

  async function patchCachedList(endpoint, action, row, kind) {
    try {
      const key = cacheKeyOf(endpoint);
      const cached = await idbGet('cache', key);
      if (!cached || !Array.isArray(cached.data)) return;
      let rows = cached.data.slice();
      const idx = rows.findIndex(r => (r.unique_id || r.uniqueId) === row.unique_id);
      if (action === 'DELETE') { if (idx >= 0) rows.splice(idx, 1); }
      else if (idx >= 0) rows[idx] = { ...rows[idx], ...row, pending: true };
      else rows.push({ ...row, pending: true });

      let kpis = cached.kpis;
      if (kind === 'ledger') { const r = recomputeLedger(rows); rows = r.rows; kpis = r.kpis; }
      else if (kind === 'inventory') kpis = recomputeInventory(rows);
      await idbSet('cache', key, { ...cached, data: rows, kpis });
    } catch (e) { console.warn('[Cache patch]', e); }
  }

  // ===================================================================
  // 4. WRITE WITH QUEUE
  // ===================================================================
  async function enqueue(queueItem, patch, message) {
    const ok = await idbQueuePush(queueItem);
    if (!ok) return { success: false, error: 'Offline queue ထဲ သိမ်းမရပါ (browser storage စစ်ပါ)' };
    if (patch) await patch();
    return { success: true, offline: true, queued: true, message };
  }

  async function writeWithQueue({ method, endpoint, payload, queueItem, patch, message }) {
    if (!navigator.onLine) return enqueue(queueItem, patch, message);
    const res = await safeApiRequest(endpoint, { method, body: JSON.stringify(payload) });
    if (res && res.success) return res;
    if (isRetryable(res)) return enqueue(queueItem, patch, message);
    return res || { success: false, error: 'Unknown error' };       
  }

  // ===================================================================
  // 5. BACKGROUND SYNC ENGINE
  // ===================================================================
  let isSyncing = false;

  window.getPendingSyncCount = async () => (await idbQueueGetAll()).filter(q => !q.failed).length;
  window.getFailedSyncItems = async () => (await idbQueueGetAll()).filter(q => q.failed);
  window.retryFailedSync = async function () {
    const failed = await window.getFailedSyncItems();
    for (const q of failed) await idbQueuePut({ ...q, failed: false, attempts: 0 });
    return window.triggerBackgroundSync();
  };
  window.discardFailedSync = async function () {
    const failed = await window.getFailedSyncItems();
    await idbQueueDelete(failed.map(q => q.id));
    
    // UI Update လေး လုပ်ပေးရန်
    window.dispatchEvent(new CustomEvent('sasana-sync-complete', { detail: { synced: 0, failed: 0 } }));
    return failed.length;
  };

  window.triggerBackgroundSync = async function () {
    if (isSyncing || !navigator.onLine || !getToken()) return;
    const queue = (await idbQueueGetAll()).filter(q => !q.failed).sort((a, b) => a.id - b.id);
    if (!queue.length) {
      window.dispatchEvent(new CustomEvent('sasana-sync-complete', { detail: { synced: 0, failed: (await window.getFailedSyncItems()).length } }));
      return;
    }

    isSyncing = true;
    let synced = 0, failed = 0;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          queue: queue.map(q => ({ qid: q.id, action: q.action, table: q.table, data: q.data, unique_id: q.unique_id })),
        }),
      });

      if (res.status === 401) {                       
        if (typeof window.showReAuthModal === 'function') {
          window.showReAuthModal();
        } else {
          await window.clearOfflineCache();
          if (typeof window.handleLogoutSilent === 'function') window.handleLogoutSilent();
        }
        return;
      }
      if (!res.ok) return;                            

      const result = await res.json();
      const byQid = new Map((result.results || []).map(r => [r.qid, r]));
      const done = [];
      for (const q of queue) {
        const r = byQid.get(q.id);
        if (r && (r.status === 'synced' || r.status === 'deleted')) { done.push(q.id); synced++; continue; }
        const attempts = (q.attempts || 0) + 1;
        const isFailed = attempts >= MAX_SYNC_ATTEMPTS;
        if (isFailed) failed++;
        await idbQueuePut({ ...q, attempts, failed: isFailed, lastError: (r && r.error) || 'No result from server' });
      }
      await idbQueueDelete(done);
      console.log(`[Auto-Sync] synced ${synced}, failed ${failed}, remaining ${queue.length - synced}`);
    } catch (err) {
      console.warn('[Auto-Sync] will retry later:', err.message);
    } finally {
      isSyncing = false;
    }

    // 🌟 Update UI for Failed Syncs
    const totalFailed = (await window.getFailedSyncItems()).length;
    window.dispatchEvent(new CustomEvent('sasana-sync-complete', { detail: { synced, failed: totalFailed } }));
    
    if (synced && typeof window.refreshCurrentTabSilent === 'function') window.refreshCurrentTabSilent();
  };

  window.addEventListener('online', () => window.triggerBackgroundSync());
  setInterval(() => { if (navigator.onLine) window.triggerBackgroundSync(); }, 30000);

  // ===================================================================
  // 6. BOOTSTRAP PRELOAD
  // ===================================================================
  window.bootstrapAppData = async function () {
    if (!navigator.onLine || !getToken()) return;
    try {
      // 🌟 DB Cleanup
      await window.pruneOldSyncQueue();

      await window.triggerBackgroundSync();
      if ((await idbQueueGetAll()).some(q => !q.failed)) return;

      const res = await safeApiRequest('/api/bootstrap', { noCache: true });
      if (!res || !res.success) return;

      for (const [code, payload] of Object.entries(res.books || {})) {
        const full = { ...payload, success: true };
        await idbSet('cache', cacheKeyOf(ledgerEndpoint(code)), full);
        if (payload.book) await idbSet('cache', cacheKeyOf(ledgerEndpoint(payload.book)), full);
      }
      if (res.inventory) {
        await idbSet('cache', cacheKeyOf('/api/inventory'), { success: true, data: res.inventory, kpis: res.inventoryKpis || {} });
      }
      if (res.yogi) {
        for (const code of ['12Yogi', '13Yogi']) {
          await idbSet('cache', cacheKeyOf(`/api/yogi?sheet=${code}`),
            { success: true, data: res.yogi[code] || [], kpis: (res.yogiKpis && res.yogiKpis[code]) || {} });
        }
      }
    } catch (err) {
      console.warn('[Bootstrap] deferred:', err.message);
    }
  };

  // ===================================================================
  // 7. CASHBOOK & BANK LEDGERS
  // ===================================================================
  window.fetchSheetData = async function (tableOrSheetName = '1CB Bank (General)') {
    return safeApiRequest(ledgerEndpoint(tableOrSheetName));
  };
  window.fetchSheetDataAPI = window.fetchSheetData;

  window.saveCashbookEntryAPI = async function (entryData, isEdit = false) {
    const table = ledgerTableName(entryData.book_name || entryData.sheet_name || entryData.sheet_code);
    if (!table) return { success: false, error: 'စာအုပ်အမည် (book_name) မသိရပါ' };
    const unique_id = entryData.unique_id || entryData.uniqueId || crypto.randomUUID();
    const payload = { ...entryData, book_name: table, unique_id };

    return writeWithQueue({
      method: isEdit ? 'PUT' : 'POST',
      endpoint: ledgerEndpoint(table),
      payload,
      queueItem: { action: isEdit ? 'UPDATE' : 'CREATE', table, data: payload, unique_id },
      patch: () => patchCachedList(ledgerEndpoint(table), isEdit ? 'UPDATE' : 'CREATE', toLedgerRow(payload, table), 'ledger'),
      message: 'လိုင်းမရှိ/ဆာဗာမရနိုင်သဖြင့် မှတ်တမ်းတင်ထားပါသည် (လိုင်းရပါက အလိုအလျောက် သိမ်းပေးပါမည်)',
    });
  };
  window.saveEntryAPI = window.saveCashbookEntryAPI;

  window.deleteCashbookEntryAPI = async function (uniqueId, tableName = null) {
    const table = ledgerTableName(tableName || window.currentTable || window.currentSheet);
    if (!table || !uniqueId) return { success: false, error: 'စာအုပ်အမည် သို့မဟုတ် unique_id မသိရပါ' };

    return writeWithQueue({
      method: 'DELETE',
      endpoint: `${ledgerEndpoint(table)}&unique_id=${encodeURIComponent(uniqueId)}`,
      payload: undefined,
      queueItem: { action: 'DELETE', table, data: {}, unique_id: uniqueId },
      patch: async () => {
        await patchCachedList(ledgerEndpoint(table), 'DELETE', { unique_id: uniqueId }, 'ledger');
        const m = /^(TRF_.+)_(OUT|IN)$/.exec(uniqueId);
        if (m) await patchCachedList(ledgerEndpoint(table), 'DELETE', { unique_id: `${m[1]}_${m[2] === 'OUT' ? 'IN' : 'OUT'}` }, 'ledger');
      },
      message: 'ဖျက်သိမ်းစာရင်းအား မှတ်သားထားပါသည် (လိုင်းရပါက ဖျက်ပေးပါမည်)',
    });
  };
  window.deleteEntryAPI = window.deleteCashbookEntryAPI;

  // -----------------------------------------------------------------
  // Transfer API
  // -----------------------------------------------------------------
  const TRANSFER_OFFLINE = { success: false, offline: true, error: 'စာရင်းပြောင်း (Transfer) လုပ်ရန် အင်တာနက် လိုအပ်ပါသည်။ လိုင်းရပြီးမှ ပြန်လုပ်ပါ။' };

  window.saveTransferAPI = async function (payload, isEdit = false) {
    const table = ledgerTableName(payload.book_name || payload.sheet_name);
    if (!table) return { success: false, error: 'စာအုပ်အမည် (book_name) မသိရပါ' };
    if (!navigator.onLine) return TRANSFER_OFFLINE;
    const res = await safeApiRequest(`/api/transfer?sheet=${encodeURIComponent(table)}`, {
      method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, book_name: table }),
    });
    return res.offline ? TRANSFER_OFFLINE : res;
  };

  window.deleteTransferAPI = async function (groupIdOrUniqueId) {
    if (!navigator.onLine) return TRANSFER_OFFLINE;
    const v = String(groupIdOrUniqueId || '');
    const q = /_(OUT|IN)$/.test(v) ? `unique_id=${encodeURIComponent(v)}` : `group_id=${encodeURIComponent(v)}`;
    const res = await safeApiRequest(`/api/transfer?${q}`, { method: 'DELETE' });
    return res.offline ? TRANSFER_OFFLINE : res;
  };

  // ===================================================================
  // 8. HOME DASHBOARD
  // ===================================================================
  window.fetchHomeSummary = async function () {
    const res = await safeApiRequest('/api/home-summary');
    if (!res || !res.success) {
      return {
        success: false, error: res && res.error,
        kpis: { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 },
        fundSummary: {}, padethaSummary: [], yogiSummary: {},
      };
    }
    return res;
  };
  window.fetchHomeSummaryAPI = window.fetchHomeSummary;

  // ===================================================================
  // 9. YOGI
  // ===================================================================
  window.fetchYogiDataAPI = async function (sheetType = '12Yogi') {
    return safeApiRequest(yogiEndpoint(yogiTableName(sheetType)));
  };

  window.saveYogiAPI = async function (data, isEdit = false) {
    const table = yogiTableName(data.sheet_type || data.book_name || data.sheet);
    const unique_id = data.unique_id || data.uniqueId || `YOGI-${crypto.randomUUID()}`;
    const payload = { ...data, sheet_type: table, unique_id };

    return writeWithQueue({
      method: isEdit ? 'PUT' : 'POST',
      endpoint: yogiEndpoint(table),
      payload,
      queueItem: { action: isEdit ? 'UPDATE' : 'CREATE', table, data: payload, unique_id },
      patch: () => patchCachedList(yogiEndpoint(table), isEdit ? 'UPDATE' : 'CREATE', toYogiRow(payload, table), 'yogi'),
      message: 'ယောဂီစာရင်းအား Offline အဖြစ် သိမ်းဆည်းထားပါသည် (လိုင်းရပါက အလိုအလျောက် ပို့ပေးပါမည်)',
    });
  };

  const YOGI_OFFLINE = { success: false, offline: true, error: 'ဤလုပ်ဆောင်ချက်အတွက် အင်တာနက် လိုအပ်ပါသည်။' };
  const yogiOnly = async (endpoint, method, payload) => {
    if (!navigator.onLine) return YOGI_OFFLINE;
    const res = await safeApiRequest(endpoint, { method, body: payload ? JSON.stringify(payload) : undefined });
    return res.offline ? YOGI_OFFLINE : res;
  };

  window.checkoutYogiAPI = (payload) => yogiOnly('/api/yogi/checkout', 'PUT', payload);
  window.reactivateYogiAPI = (payload) => yogiOnly('/api/yogi/reactivate', 'PUT', payload);

  window.deleteYogiAPI = async function (uniqueId, sheetType = '12Yogi') {
    const table = yogiTableName(sheetType);
    if (!uniqueId) return { success: false, error: 'unique_id မသိရပါ' };
    return writeWithQueue({
      method: 'DELETE',
      endpoint: `${yogiEndpoint(table)}&unique_id=${encodeURIComponent(uniqueId)}`,
      payload: undefined,
      queueItem: { action: 'DELETE', table, data: {}, unique_id: uniqueId },
      patch: () => patchCachedList(yogiEndpoint(table), 'DELETE', { unique_id: uniqueId }, 'yogi'),
      message: 'ဖျက်သိမ်းစာရင်းအား မှတ်သားထားပါသည်',
    });
  };

  // ===================================================================
  // 10. INVENTORY
  // ===================================================================
  window.fetchInventoryDataAPI = async function () {
    return safeApiRequest('/api/inventory');
  };

  window.saveInventoryEntryAPI = async function (entryData, isEdit = false) {
    const unique_id = entryData.unique_id || entryData.uniqueId || `INV-${crypto.randomUUID()}`;
    const payload = { ...entryData, unique_id };
    return writeWithQueue({
      method: isEdit ? 'PUT' : 'POST',
      endpoint: '/api/inventory',
      payload,
      queueItem: { action: isEdit ? 'UPDATE' : 'CREATE', table: 'Inventory', data: payload, unique_id },
      patch: () => patchCachedList('/api/inventory', isEdit ? 'UPDATE' : 'CREATE', toInvRow(payload), 'inventory'),
      message: 'ပစ္စည်းစာရင်းအား Offline အဖြစ် သိမ်းဆည်းထားပါသည် (လိုင်းရပါက အလိုအလျောက် ပို့ပေးပါမည်)',
    });
  };

  window.deleteInventoryEntryAPI = async function (uniqueId) {
    if (!uniqueId) return { success: false, error: 'unique_id မသိရပါ' };
    return writeWithQueue({
      method: 'DELETE',
      endpoint: `/api/inventory?unique_id=${encodeURIComponent(uniqueId)}`,
      payload: undefined,
      queueItem: { action: 'DELETE', table: 'Inventory', data: {}, unique_id: uniqueId },
      patch: () => patchCachedList('/api/inventory', 'DELETE', { unique_id: uniqueId }, 'inventory'),
      message: 'ဖျက်သိမ်းစာရင်းအား မှတ်သားထားပါသည်',
    });
  };

  // ===================================================================
  // 11. ANNUAL REPORT & ACCOUNT
  // ===================================================================
  window.fetchReportDataAPI = async function (year = String(new Date().getFullYear()), sheet = '1General Book') {
    return safeApiRequest(`/api/report?year=${encodeURIComponent(year)}&sheet=${encodeURIComponent(sheet)}`);
  };

  window.changePasswordAPI = async function (oldPassword, newPassword) {
    return safeApiRequest('/api/change-password', {
      method: 'POST', body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  };
})();
