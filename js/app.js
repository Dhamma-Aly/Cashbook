// js/api.js - IndexedDB Local Cache & SWR Network Fetcher
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

// 💡 Every request talks to worker.js's single action-based endpoint:
//    GET  ?action=read&sheet=NAME
//    POST { action: "create" | "update" | "delete", sheet, data, uniqueId }
// worker.js responds with { status: "success"|"error", data / message }.
window.fetchSheetData = async function(sheetName, onLocalLoaded = null) {
  const localData = await window.cacheEngine.getSheet(sheetName);
  if (localData && typeof onLocalLoaded === "function") {
    onLocalLoaded(localData);
  }

  try {
    const url = `${window.APP_CONFIG.API_BASE_URL}?action=read&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "success" && json.data) {
      await window.cacheEngine.setSheet(sheetName, json.data);
      return json.data;
    }
    console.warn("Read failed:", json.message);
  } catch (err) {
    console.warn("Network fetch failed, using local cache", err);
  }
  return localData || [];
};

// 💡 uniqueId: pass null/empty to create a new row, or the row's real
// Unique-ID text (last column of the row) to update that existing row.
// 💡 Content-Type "text/plain" is intentional, NOT a bug: Google Apps
// Script Web Apps have no doOptions() handler, so any request that
// triggers a CORS preflight (e.g. Content-Type "application/json") gets
// silently blocked by the browser before it ever reaches the server.
// "text/plain" is a CORS-safelisted content type, so no preflight is
// sent - worker.js still parses the body as JSON regardless of the
// header (it reads e.postData.contents directly), so nothing is lost.
window.saveSheetEntry = async function(sheet, rowData, uniqueId = null) {
  const action = uniqueId ? "update" : "create";
  const res = await fetch(window.APP_CONFIG.API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, sheet, data: rowData, uniqueId })
  });
  return await res.json();
};

window.deleteSheetEntry = async function(sheet, uniqueId) {
  const res = await fetch(window.APP_CONFIG.API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "delete", sheet, uniqueId })
  });
  return await res.json();
};
