// ===================================================================
// js/api.js - Standardized API Client & Function Mappings
// Fixes "TypeError: window.fetchSheetData is not a function" & Sidebar Crash
// ===================================================================

const getApiBaseUrl = () => {
  if (typeof window.CONFIG !== 'undefined' && window.CONFIG.API_BASE_URL) {
    return window.CONFIG.API_BASE_URL;
  }
  if (typeof window.APP_CONFIG !== 'undefined' && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return 'https://cashbook-api.dhamma-aly.workers.dev';
};

// Safe API Fetch Helper (Prevents JS Execution Crash on Network Error)
async function safeApiRequest(endpoint, options = {}) {
  const url = `${getApiBaseUrl()}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (res.ok) {
      return await res.json();
    }
    return { success: false, data: [], kpis: {}, error: `HTTP ${res.status}` };
  } catch (err) {
    console.warn(`API Connection Warning [${endpoint}]:`, err.message);
    // Return safe empty data structure so UI & Sidebar routing never crash!
    return { success: false, data: [], kpis: {}, error: err.message };
  }
}

// ==========================================
// 1. Cashbook & Bank Ledgers API (1CB ~ 10GB)
// ==========================================
window.fetchSheetData = async function(sheetName = '1CB') {
  return await safeApiRequest(`/api/entries?sheet=${encodeURIComponent(sheetName)}`);
};
window.fetchSheetDataAPI = window.fetchSheetData;

window.saveCashbookEntryAPI = async function(entryData, isEdit = false) {
  return await safeApiRequest('/api/entries', {
    method: isEdit ? 'PUT' : 'POST',
    body: JSON.stringify(entryData)
  });
};

window.deleteCashbookEntryAPI = async function(uniqueId) {
  return await safeApiRequest(`/api/entries?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};

// ==========================================
// 2. Home Dashboard Summary API
// ==========================================
window.fetchHomeSummary = async function() {
  return await safeApiRequest('/api/home-summary');
};
window.fetchHomeSummaryAPI = window.fetchHomeSummary;

// ==========================================
// 3. Yogi Management API (12Yogi & 13Yogi)
// ==========================================
window.fetchYogiDataAPI = async function(sheetType = '12Yogi', statusFilter = null) {
  let ep = `/api/yogi?sheet=${encodeURIComponent(sheetType)}`;
  if (statusFilter) ep += `&status=${encodeURIComponent(statusFilter)}`;
  return await safeApiRequest(ep);
};

window.saveYogiAPI = async function(data, isEdit = false) {
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

window.deleteYogiAPI = async function(uniqueId) {
  return await safeApiRequest(`/api/yogi?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};

// ==========================================
// 4. Inventory API (11Inv)
// ==========================================
window.fetchInventoryDataAPI = async function() {
  return await safeApiRequest('/api/inventory');
};

window.saveInventoryEntryAPI = async function(entryData, isEdit = false) {
  return await safeApiRequest('/api/inventory', {
    method: isEdit ? 'PUT' : 'POST',
    body: JSON.stringify(entryData)
  });
};

window.deleteInventoryEntryAPI = async function(uniqueId) {
  return await safeApiRequest(`/api/inventory?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};

// ==========================================
// 5. Summary Report API (14Rep)
// ==========================================
window.fetchReportDataAPI = async function() {
  return await safeApiRequest('/api/report');
};
