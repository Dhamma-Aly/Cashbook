// js/api.js - SWR & IndexedDB Engine
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

// SWR Fetcher
window.fetchSheetData = async function(sheetName, onLocalLoaded = null) {
  // 1. Return Local Cache instantly
  const localData = await window.cacheEngine.getSheet(sheetName);
  if (localData && typeof onLocalLoaded === "function") {
    onLocalLoaded(localData);
  }

  // 2. Fetch Fresh Data from Worker
  try {
    const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/data?sheet=${encodeURIComponent(sheetName)}`);
    const json = await res.json();
    if (json.success && json.values) {
      await window.cacheEngine.setSheet(sheetName, json.values);
      return json.values;
    }
  } catch (err) {
    console.warn("Network fetch failed, using local cache", err);
  }
  return localData || [];
};

window.fetchAllSheetsData = async function() {
  try {
    const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/all-data`);
    const json = await res.json();
    if (json.success && json.data) {
      for (const sheetName of Object.keys(json.data)) {
        await window.cacheEngine.setSheet(sheetName, json.data[sheetName]);
      }
      return json.data;
    }
  } catch (err) {
    console.error("Fetch all sheets error", err);
  }
  return null;
};

window.saveSheetEntry = async function(sheet, rowData, rowIndex = null) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet, rowData, rowIndex })
  });
  return await res.json();
};

window.deleteSheetEntry = async function(sheet, rowIndex) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/entry`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet, rowIndex })
  });
  return await res.json();
};