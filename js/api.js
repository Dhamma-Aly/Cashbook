// ===================================================================
// js/api.js - Frontend API Client for Sāsana ERP
// Handles all HTTP requests (GET, POST, PUT, DELETE) to Cloudflare Worker
// ===================================================================

// Generic Request Helper
async function apiRequest(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json'
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    return { success: false, error: err.message || 'ကွန်ရက် သို့မဟုတ် ပရိုဂရမ် အမှားရှိပါသည်' };
  }
}

// ==========================================
// 1. Yogi Management API Functions (12Yogi & 13Yogi)
// ==========================================

async function fetchYogiDataAPI(sheetType = '12Yogi', statusFilter = null) {
  let endpoint = `/api/yogi?sheet=${encodeURIComponent(sheetType)}`;
  if (statusFilter) {
    endpoint += `&status=${encodeURIComponent(statusFilter)}`;
  }
  return await apiRequest(endpoint, { method: 'GET' });
}

async function saveYogiAPI(data, isEdit = false) {
  const method = isEdit ? 'PUT' : 'POST';
  return await apiRequest('/api/yogi', {
    method,
    body: JSON.stringify(data)
  });
}

async function checkoutYogiAPI(payload) {
  // payload: { uniqueId, end_date }
  return await apiRequest('/api/yogi/checkout', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

async function deleteYogiAPI(uniqueId) {
  return await apiRequest(`/api/yogi?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
}

// ==========================================
// 2. Cashbook & Bank Ledgers API Functions (1CB ~ 10GB)
// ==========================================

async function fetchSheetDataAPI(sheetName = '1CB') {
  return await apiRequest(`/api/entries?sheet=${encodeURIComponent(sheetName)}`, {
    method: 'GET'
  });
}

async function saveCashbookEntryAPI(entryData, isEdit = false) {
  const method = isEdit ? 'PUT' : 'POST';
  return await apiRequest('/api/entries', {
    method,
    body: JSON.stringify(entryData)
  });
}

async function deleteCashbookEntryAPI(uniqueId) {
  return await apiRequest(`/api/entries?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
}

// ==========================================
// 3. Inventory API Functions (11Inv)
// ==========================================

async function fetchInventoryDataAPI() {
  return await apiRequest('/api/inventory', { method: 'GET' });
}

async function saveInventoryEntryAPI(entryData, isEdit = false) {
  const method = isEdit ? 'PUT' : 'POST';
  return await apiRequest('/api/inventory', {
    method,
    body: JSON.stringify(entryData)
  });
}

async function deleteInventoryEntryAPI(uniqueId) {
  return await apiRequest(`/api/inventory?uniqueId=${encodeURIComponent(uniqueId)}`, {
    method: 'DELETE'
  });
}

// ==========================================
// 4. Home Dashboard & Report Summary API Functions
// ==========================================

async function fetchHomeSummaryAPI() {
  return await apiRequest('/api/home-summary', { method: 'GET' });
}

async function fetchReportDataAPI() {
  return await apiRequest('/api/report', { method: 'GET' });
}
