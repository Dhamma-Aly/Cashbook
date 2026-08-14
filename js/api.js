// ===================================================================
// js/api.js - Standardized API Client & Function Mappings
// Automatically attaches Authorization Bearer Token to all requests
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

// Safe API Fetch Helper with Authorization Token Header
async function safeApiRequest(endpoint, options = {}) {
  const url = `${getApiBaseUrl()}${endpoint}`;
  
  // 🔒 LocalStorage မှ Auth Token ကို ဆွဲယူခြင်း
  const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");

  // Headers အား လုံခြုံစွာ ရောစပ်ခြင်း
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.ok) {
      return await res.json();
    }

    // Token သက်တမ်းကုန်/မမှန်ပါက Auto Logout ပြုလုပ်ရန်
    if (res.status === 401) {
      if (typeof window.handleLogoutSilent === 'function') {
        window.handleLogoutSilent();
      }
    }

    return { 
      success: false, 
      data: [], 
      kpis: {}, 
      sheetBalances: {}, 
      error: `HTTP ${res.status}` 
    };
  } catch (err) {
    console.warn(`API Connection Warning [${endpoint}]:`, err.message);
    return { 
      success: false, 
      data: [], 
      kpis: {}, 
      sheetBalances: {}, 
      error: err.message 
    };
  }
}

// -------------------------------------------------------------------
// 1. Cashbook & Bank Ledgers API (1CB ~ 10GB)
// -------------------------------------------------------------------
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
window.saveEntryAPI = window.saveCashbookEntryAPI;

window.deleteCashbookEntryAPI = async function(uniqueId) {
  return await safeApiRequest(`/api/entries?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};
window.deleteEntryAPI = window.deleteCashbookEntryAPI;

// -------------------------------------------------------------------
// 2. Home Dashboard Summary API
// -------------------------------------------------------------------
window.fetchHomeSummary = async function() {
  const res = await safeApiRequest('/api/home-summary');
  if (!res || !res.success) {
    return {
      success: false,
      kpis: { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 },
      sheetBalances: {},
      fundSummary: {},
      yogiSummary: {}
    };
  }
  return res;
};
window.fetchHomeSummaryAPI = window.fetchHomeSummary;

// -------------------------------------------------------------------
// 3. Yogi Management API (12Yogi & 13Yogi)
// -------------------------------------------------------------------
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

window.reactivateYogiAPI = async function(payload) {
  return await safeApiRequest('/api/yogi/reactivate', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};

window.deleteYogiAPI = async function(uniqueId) {
  return await safeApiRequest(`/api/yogi?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
};

// -------------------------------------------------------------------
// 4. Inventory API (11Inv)
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// 5. Summary Report API (14Rep) - Year Query ထည့်သွင်းထားပါသည်
// -------------------------------------------------------------------
window.fetchReportDataAPI = async function(year = '2026') {
  const ep = year ? `/api/report?year=${encodeURIComponent(year)}` : '/api/report';
  return await safeApiRequest(ep);
};
