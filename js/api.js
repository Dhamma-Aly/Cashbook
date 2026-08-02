// js/api.js

// 💡 SHARED REQUEST HELPER: every endpoint used to call fetch()+res.json()
// on its own, which meant a non-JSON response (Apps Script returning an
// HTML sign-in/error page instead of JSON — the classic cause of
// "SyntaxError: unexpected character at line 1 column 1") surfaced as a
// confusing crash instead of a clear, actionable message. This helper
// reads the body as text first, tries to parse it, and throws a
// descriptive error if that fails, so every caller below gets the same
// safe, well-diagnosed behavior for free.
async function apiRequest(url, options) {
  const res = await fetch(url, options);
  const raw = await res.text();

  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    // Log the actual response so it's possible to diagnose the real cause
    // (usually: the Apps Script deployment needs a "New version" after a
    // code change, or its "Who has access" setting isn't "Anyone").
    console.error("Non-JSON response from API:", raw.slice(0, 300));
    throw new Error("Server returned an invalid (non-JSON) response. The Apps Script deployment may need to be redeployed, or its access permission may not be set to \"Anyone\".");
  }
}

async function fetchSheetData(sheetName) {
  try {
    const url = `${CONFIG.API_BASE_URL}?action=read&sheet=${sheetName}`;
    const json = await apiRequest(url);
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
    const json = await apiRequest(url);
    if (json.status === "success") {
      return { cards: json.cards || [], table: json.table || [] };
    }
    return { cards: [], table: [] };
  } catch (err) {
    console.error("API Home Error:", err);
    return { cards: [], table: [] };
  }
}

// 💡 Fetch the fixed A1:P15 range of the "12Rep" report summary sheet.
async function fetchReportData() {
  try {
    const url = `${CONFIG.API_BASE_URL}?action=report`;
    const json = await apiRequest(url);
    return json.status === "success" ? json.data : [];
  } catch (err) {
    console.error("API Report Error:", err);
    // Re-throw so renderReportSystemView's own catch can show the
    // dedicated error row instead of silently rendering an empty table.
    throw err;
  }
}

async function createSheetEntry(sheetName, rowArray) {
  try {
    return await apiRequest(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "create", sheet: sheetName, data: rowArray })
    });
  } catch (err) {
    console.error("API Create Error:", err);
    return { status: "error", message: err.toString() };
  }
}

async function updateSheetEntry(sheetName, uniqueId, rowArray) {
  try {
    return await apiRequest(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update", sheet: sheetName, uniqueId: uniqueId, data: rowArray })
    });
  } catch (err) {
    console.error("API Update Error:", err);
    return { status: "error", message: err.toString() };
  }
}

async function deleteSheetEntry(sheetName, uniqueId) {
  try {
    return await apiRequest(CONFIG.API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "delete", sheet: sheetName, uniqueId: uniqueId })
    });
  } catch (err) {
    console.error("API Delete Error:", err);
    return { status: "error", message: err.toString() };
  }
}
