// js/api.js

async function fetchSheetData(sheetName) {
  try {
    const url = `${CONFIG.API_BASE_URL}?action=read&sheet=${sheetName}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.status === "success" ? json.data : [];
  } catch (err) {
    console.error("API Read Error:", err);
    return [];
  }
}

// 💡 Single round-trip fetch of the Home Dashboard: the 4 summary cards
// (Home!B2:E2) plus the bank-summary mini table (Home!A3:G12).
async function fetchHomeDashboard() {
  try {
    const url = `${CONFIG.API_BASE_URL}?action=home`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "success") {
      return { cards: json.cards || [], table: json.table || [] };
    }
    return { cards: [], table: [] };
  } catch (err) {
    console.error("API Home Error:", err);
    return { cards: [], table: [] };
  }
}

async function createSheetEntry(sheetName, rowArray) {
  try {
    const res = await fetch(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "create", sheet: sheetName, data: rowArray })
    });
    return await res.json();
  } catch (err) {
    console.error("API Create Error:", err);
    return { status: "error", message: err.toString() };
  }
}

async function updateSheetEntry(sheetName, uniqueId, rowArray) {
  try {
    const res = await fetch(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update", sheet: sheetName, uniqueId: uniqueId, data: rowArray })
    });
    return await res.json();
  } catch (err) {
    console.error("API Update Error:", err);
    return { status: "error", message: err.toString() };
  }
}

async function deleteSheetEntry(sheetName, uniqueId) {
  try {
    const res = await fetch(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "delete", sheet: sheetName, uniqueId: uniqueId })
    });
    return await res.json();
  } catch (err) {
    console.error("API Delete Error:", err);
    return { status: "error", message: err.toString() };
  }
}
