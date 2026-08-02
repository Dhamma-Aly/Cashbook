// worker.js - Google Apps Script Backend Server API
const SPREADSHEET_ID = "1qDqkqnvP2gPutGlU2lxd753iBZW0O-o_TVxPV-DmVZ4";

// 💡 CACHE STRATEGY: Google Apps Script's CacheService is used so that
// re-opening a tab (or the whole app) doesn't have to pay the cost of a
// fresh SpreadsheetApp read every time. Reads are cached for a short TTL;
// any write (create/update/delete) surgically removes only the affected
// keys so the very next read is always fresh, not stale.
const CACHE_TTL_SECONDS = 90;      // ledger / inventory table reads
const HOME_CACHE_TTL_SECONDS = 60; // Home dashboard summary

// 💡 SHEET SCHEMAS: different sheets keep the "date" / "month-year" /
// "unique id" columns in different positions, so every place that needs
// to know a column index goes through this lookup instead of a hardcoded
// magic number. This is what lets the same read/create/update/delete code
// serve both the 13-column Ledger sheets (A..M) and the 11-column
// Inventory sheet (A..K) correctly.
const SHEET_SCHEMAS = {
  //                 A=စဉ်(0) is always the auto-index, B=ရက်စွဲ(1) is always the date
  "11Inv": { dateCol: 1, monthYearCol: 8, uniqueIdCol: 10 }, // A..K (11 cols)
  DEFAULT: { dateCol: 1, monthYearCol: 10, uniqueIdCol: 12 } // A..M (13 cols) - all ledger/bank sheets
};
function getSchema(sheetName) {
  return SHEET_SCHEMAS[sheetName] || SHEET_SCHEMAS.DEFAULT;
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// 💡 Extract the year (as string) from a date value that may be
// formatted as "dd-mm-yyyy", "yyyy-mm-dd", or a native Date object.
function getYearFromDateValue(val) {
  if (!val) return null;
  if (Object.prototype.toString.call(val) === "[object Date]") {
    return String(val.getFullYear());
  }
  const parts = String(val).split("-");
  if (parts.length === 3) {
    return parts[0].length === 4 ? parts[0] : parts[2];
  }
  return null;
}

// 💡 FY-aware auto index: continues incrementing while the new entry's
// date falls in the same year (Jan-Dec) as the sheet's last row; resets
// to 1 the moment the year changes (i.e. when the FY rolls over).
function getNextFYIndex(sheet, entryDateStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return 1;

  const lastDateVal = sheet.getRange(lastRow, 2).getValue(); // Column B: ရက်စွဲ
  const lastIndexVal = sheet.getRange(lastRow, 1).getValue(); // Column A: စဉ်

  const lastYear = getYearFromDateValue(lastDateVal);
  const newYear = getYearFromDateValue(entryDateStr);

  if (lastYear && newYear && lastYear === newYear) {
    return (parseInt(lastIndexVal) || 0) + 1;
  }
  return 1; // FY changed (or undetermined) -> restart numbering
}

// 💡 If Sheets auto-converted a text value (date or month-year) into a real
// Date object, reformat it back into the expected display string instead of
// letting JSON.stringify turn it into an ugly ISO timestamp.
function formatCellForOutput(val, pattern) {
  if (Object.prototype.toString.call(val) === "[object Date]") {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), pattern);
  }
  return val;
}

// 💡 Write a row (append or update) while forcing the date & month-year
// columns to Plain Text format FIRST. This stops Google Sheets from
// auto-detecting "08-01-2026" or "Aug-26" as dates and silently converting
// them into Date serial values. Column positions come from the sheet's
// schema so this works for both Ledger (13-col) and Inventory (11-col) rows.
function writeRowSafely(sheet, rowIndex, rowArray, sheetName) {
  const schema = getSchema(sheetName);
  sheet.getRange(rowIndex, schema.dateCol + 1, 1, 1).setNumberFormat("@");
  sheet.getRange(rowIndex, schema.monthYearCol + 1, 1, 1).setNumberFormat("@");
  sheet.getRange(rowIndex, 1, 1, rowArray.length).setValues([rowArray]);
}

// 💡 Cache helpers - centralised so every action invalidates consistently.
function getCache() {
  return CacheService.getScriptCache();
}
function readCacheKey(sheetName) {
  return "read_" + sheetName;
}
function invalidateSheetCache(sheetName) {
  getCache().remove(readCacheKey(sheetName));
}
function invalidateHomeCache() {
  getCache().remove("home_dashboard");
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    let contents = {};
    if (e.postData && e.postData.contents) {
      contents = JSON.parse(e.postData.contents);
    }

    const action = e.parameter.action || contents.action;
    const sheetName = e.parameter.sheet || contents.sheet;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 💡 HOME DASHBOARD: single lightweight call that returns both the 4
    // KPI numbers (Home!B2:E2) and the bank-summary mini table
    // (Home!A3:G12) so the frontend only needs one round trip.
    if (action === "home") {
      const cache = getCache();
      const cacheKey = "home_dashboard";
      const cached = cache.get(cacheKey);
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }

      const sheet = ss.getSheetByName("Home");
      if (!sheet) {
        return responseJSON({ status: "error", message: "Sheet not found: Home" });
      }

      const cards = sheet.getRange("B2:E2").getValues()[0];
      const table = sheet.getRange("A3:G12").getValues();

      const payload = JSON.stringify({ status: "success", cards: cards, table: table });
      cache.put(cacheKey, payload, HOME_CACHE_TTL_SECONDS);
      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "read") {
      const cache = getCache();
      const cacheKey = readCacheKey(sheetName);
      const cached = cache.get(cacheKey);
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }

      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        return responseJSON({ status: "error", message: "Sheet not found: " + sheetName });
      }
      const data = sheet.getDataRange().getValues();
      if (data.length < 6) {
        return responseJSON({ status: "success", data: [] });
      }

      const schema = getSchema(sheetName);
      const rows = data.slice(5).map(row => {
        const r = row.slice();
        r[schema.dateCol] = formatCellForOutput(r[schema.dateCol], "dd-MM-yyyy");
        r[schema.monthYearCol] = formatCellForOutput(r[schema.monthYearCol], "MMM-yy");
        return r;
      });

      const payload = JSON.stringify({ status: "success", data: rows });
      cache.put(cacheKey, payload, CACHE_TTL_SECONDS);
      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "create") {
      const sheet = ss.getSheetByName(sheetName);
      const entry = contents.data; // Array of columns (13 for ledgers, 11 for 11Inv)

      // Auto Indexing (FY-aware: resets to 1 when the entry's year changes)
      entry[0] = getNextFYIndex(sheet, entry[1]); // Column A: စဉ်

      const newRowIndex = sheet.getLastRow() + 1;
      writeRowSafely(sheet, newRowIndex, entry, sheetName);
      invalidateSheetCache(sheetName);
      invalidateHomeCache();

      // 💡 INTER-SHEET AUTO TRANSFER RULE:
      // If adding in any Ledger sheet that offers "ဘဏ်ထည့်ငွေ" as a subcategory
      // (5FB, 7PB, 8EB, 9MB, 10GB) and Action == "ထွက်ငွေ" -> mirror into 2CB
      if (["5FB", "7PB", "8EB", "9MB", "10GB"].includes(sheetName) && entry[2] === "ထွက်ငွေ" && entry[3] === "ဘဏ်ထည့်ငွေ") {
        const bankSheet = ss.getSheetByName("2CB");
        if (bankSheet) {
          const bankIndex = getNextFYIndex(bankSheet, entry[1]);

          const mirrorEntry = [
            bankIndex,                   // A: စဉ်
            entry[1],                    // B: ရက်စွဲ
            "ဝင်ငွေ",                   // C: ခေါင်းစဉ်
            "ဘဏ်ထည့်ငွေ",                // D: ခေါင်းစဉ်ခွဲ
            entry[4],                    // E: ဘောင်ချာ
            entry[11] + " မှ ဘဏ်ထည့်ငွေ", // F: အကြောင်းအရာ
            entry[6],                    // G: လက်ခံသူ
            entry[8],                    // H: ဝင်ငွေ (Origin Expense)
            0,                           // I: ထွက်ငွေ
            0,                           // J: လက်ကျန် (Calculated on frontend)
            entry[10],                   // K: လနှစ်
            entry[11],                   // L: စာအုပ်အမည်
            "TRF-" + new Date().getTime()// M: UNIQUEID
          ];
          const newBankRowIndex = bankSheet.getLastRow() + 1;
          writeRowSafely(bankSheet, newBankRowIndex, mirrorEntry, "2CB");
          invalidateSheetCache("2CB");
        }
      }

      return responseJSON({ status: "success", message: "Entry saved successfully" });
    }

    if (action === "update") {
      const sheet = ss.getSheetByName(sheetName);
      const uniqueId = contents.uniqueId;
      const updatedRow = contents.data;
      const schema = getSchema(sheetName);

      const data = sheet.getDataRange().getValues();
      let targetRowIndex = -1;
      for (let i = 5; i < data.length; i++) {
        if (String(data[i][schema.uniqueIdCol]) === String(uniqueId)) {
          targetRowIndex = i + 1; // 1-based index
          break;
        }
      }

      if (targetRowIndex !== -1) {
        writeRowSafely(sheet, targetRowIndex, updatedRow, sheetName);
        invalidateSheetCache(sheetName);
        invalidateHomeCache();
        return responseJSON({ status: "success", message: "Entry updated successfully" });
      } else {
        return responseJSON({ status: "error", message: "Record not found with Unique ID" });
      }
    }

    if (action === "delete") {
      const sheet = ss.getSheetByName(sheetName);
      const uniqueId = contents.uniqueId;
      const schema = getSchema(sheetName);
      const data = sheet.getDataRange().getValues();
      let targetRowIndex = -1;
      for (let i = 5; i < data.length; i++) {
        if (String(data[i][schema.uniqueIdCol]) === String(uniqueId)) {
          targetRowIndex = i + 1;
          break;
        }
      }

      if (targetRowIndex !== -1) {
        sheet.deleteRow(targetRowIndex);
        invalidateSheetCache(sheetName);
        invalidateHomeCache();
        return responseJSON({ status: "success", message: "Entry deleted successfully" });
      } else {
        return responseJSON({ status: "error", message: "Record not found" });
      }
    }

    return responseJSON({ status: "error", message: "Invalid action" });

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}