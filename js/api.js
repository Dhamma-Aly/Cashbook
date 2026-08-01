async function fetchSheetData(sheetName) {
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}?action=read&sheet=${sheetName}`);
    const json = await res.json();
    return json.status === "success" ? json.data : [];
  } catch (err) {
    console.error("Error reading sheet:", err);
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
    console.error("Error creating entry:", err);
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
    console.error("Error updating entry:", err);
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
    console.error("Error deleting entry:", err);
    return { status: "error", message: err.toString() };
  }
}