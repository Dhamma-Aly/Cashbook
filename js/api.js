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
