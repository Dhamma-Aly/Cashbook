// js/api.js - IndexedDB Local Cache & Cloudflare D1 API Fetcher
const DB_NAME = "CashbookLocalDB";
const DB_VERSION = 1;

class LocalCacheEngine {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("sheets")) {
          db.createObjectStore("sheets", { keyPath: "name" });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async getSheet(name) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction("sheets", "readonly");
      const store = tx.objectStore("sheets");
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  }

  async setSheet(name, data) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction("sheets", "readwrite");
      const store = tx.objectStore("sheets");
      store.put({ name, data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
    });
  }
}

window.cacheEngine = new LocalCacheEngine();

// 💡 Every request talks to Cloudflare Worker's API endpoints:
//    Home: ?action=home
//    Report: ?action=report
//    Ledgers: ?action=read&sheet=NAME
window.fetchSheetData = async function(sheetName, onLocalLoaded = null) {
  const localData = await window.cacheEngine.getSheet(sheetName);
  if (localData && typeof onLocalLoaded === "function") {
    onLocalLoaded(localData);
  }

  try {
    const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "https://cashbook.dhammaaly.workers.dev";
    let url;

    // Home နှင့် Report တို့အတွက် သီးသန့် action သို့ ခွဲခေါ်ပေးရန်
    if (sheetName === "Home") {
      url = `${baseUrl}?action=home`;
    } else if (sheetName === "12Rep" || sheetName === "Report") {
      url = `${baseUrl}?action=report`;
    } else {
      url = `${baseUrl}?action=read&sheet=${encodeURIComponent(sheetName)}`;
    }

    const res = await fetch(url);
    const json = await res.json();

    if (json.status === "success") {
      // Home အတွက် json တစ်ခုလုံး (cards + table) ကို သိမ်းရန်၊ စာအုပ်များအတွက် json.data ကို သိမ်းရန်
      const resultData = (sheetName === "Home") ? json : json.data;
      if (resultData) {
        await window.cacheEngine.setSheet(sheetName, resultData);
        return resultData;
      }
    }
    console.warn("Read failed:", json.message || "No data returned");
  } catch (err) {
    console.warn("Network fetch failed, using local cache", err);
  }
  return localData || [];
};

window.saveSheetEntry = async function(sheet, rowData, uniqueId = null) {
  const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "https://cashbook.dhammaaly.workers.dev";
  const action = uniqueId ? "update" : "create";
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, sheet, data: rowData, uniqueId })
  });
  return await res.json();
};

window.deleteSheetEntry = async function(sheet, uniqueId) {
  const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "https://cashbook.dhammaaly.workers.dev";
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", sheet, uniqueId })
  });
  return await res.json();
};
