// worker.js - Cloudflare Worker Backend API (D1 Database Direct Engine)
// Completely removes Google Sheets API / Service Account.
// Uses Cloudflare D1 Serverless SQLite Database directly.
// Maintains 100% backward compatibility with the frontend (js/api.js).

const SHEET_SCHEMAS = {
  "11Inv": { dateCol: 1, monthYearCol: 8, uniqueIdCol: 10, numCols: 11 },
  DEFAULT: { dateCol: 1, monthYearCol: 10, uniqueIdCol: 12, numCols: 13 }
};

function getSchema(sheetName) {
  return SHEET_SCHEMAS[sheetName] || SHEET_SCHEMAS.DEFAULT;
}

function isLedgerSheet(sheetName) {
  return sheetName !== "Home" && sheetName !== "12Rep";
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      ...corsHeaders(env)
    },
  });
}

function getYearFromDateValue(val) {
  if (!val) return null;
  const parts = String(val).split("-");
  if (parts.length === 3) {
    return parts[0].length === 4 ? parts[0] : parts[2];
  }
  return null;
}

// Compute FY-aware incrementing index
function getNextFYIndex(existingRows, entryDateStr) {
  if (!existingRows || existingRows.length === 0) return 1;

  const lastRow = existingRows[existingRows.length - 1];
  const lastDateVal = lastRow.date;
  const lastIndexVal = lastRow.serial_no;

  const lastYear = getYearFromDateValue(lastDateVal);
  const newYear = getYearFromDateValue(entryDateStr);

  if (lastYear && newYear && lastYear === newYear) {
    return (parseInt(lastIndexVal) || 0) + 1;
  }
  return 1;
}

// Convert D1 database record -> 13-column Ledger Array expected by Frontend
function ledgerRecordToArray(row) {
  const isIncome = row.type === "ဝင်ငွေ";
  return [
    row.serial_no || 1,
    row.date || "",
    row.type || "",
    row.subcategory || "",
    row.voucher_no || "",
    row.description || "",
    row.receiver || "",
    isIncome ? (row.amount || 0) : 0,
    !isIncome ? (row.amount || 0) : 0,
    0, // Running Balance (Calculated on Frontend)
    row.month_year || "",
    row.book_code || "",
    row.unique_id || ""
  ];
}

// Convert D1 database record -> 11-column Inventory Array expected by Frontend
function invRecordToArray(row) {
  return [
    row.serial_no || 1,
    row.date || "",
    row.location || "",
    row.category || "",
    row.description || "",
    row.unit || "",
    row.quantity || 0,
    row.note || "",
    row.month_year || "",
    "11Inv",
    row.unique_id || ""
  ];
}

// Mock Header Rows (5 rows) so frontend `data.slice(5)` index matching works seamlessly
function getHeaderRows(sheetName) {
  if (sheetName === "11Inv") {
    return [
      ["စဉ်", "ရက်စွဲ", "နေရာ", "အမျိုးအစား", "အကြောင်းအရာ", "ရေတွက်ပုံ", "အရေအတွက်", "မှတ်ချက်", "လနှစ်", "စာအုပ်အမည်", "UNIQUEID"],
      ["", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", ""]
    ];
  }
  return [
    ["စဉ်", "ရက်စွဲ", "ခေါင်းစဉ်", "ခေါင်းစဉ်ခွဲ", "ဘောင်ချာ", "အကြောင်းအရာ", "လက်ခံသူ", "ဝင်ငွေ", "ထွက်ငွေ", "လက်ကျန်", "လနှစ်", "စာအုပ်အမည်", "UNIQUEID"],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""]
  ];
}

// ────────────────────────────────────────────────────────────────────────
// Action Handlers
// ────────────────────────────────────────────────────────────────────────

// 💡 1. LOGIN HANDLER
async function handleLogin(env, contents) {
  const { username, password } = contents || {};
  if (!username || !password) {
    return json({ success: false, message: "အသုံးပြုသူအမည် နှင့် လျှို့ဝှက်နံပါတ် ဖြည့်ပါခင်ဗျာ။" }, env);
  }

  // D1 Database ထဲရှိ users Table တွင် စစ်ဆေးခြင်း
  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE username = ? AND password = ?"
  ).bind(username, password).first();

  if (user) {
    return json({ success: true, user: { username: user.username, role: user.role } }, env);
  } else {
    return json({ success: false, message: "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။" }, env);
  }
}

async function handleHome(env) {
  const { results: allEntries } = await env.DB.prepare("SELECT * FROM cashbook_entries").all();
  const entries = allEntries || [];

  let totalFund = 0;
  let totalBank = 0;
  let totalCash = 0;
  let totalCount = entries.length;

  const bookTotals = {};
  entries.forEach(row => {
    const amt = row.type === "ဝင်ငွေ" ? row.amount : -row.amount;
    totalFund += amt;
    bookTotals[row.book_code] = (bookTotals[row.book_code] || 0) + amt;
    if (["1CB", "2CB", "3CB"].includes(row.book_code)) {
      totalBank += amt;
    } else {
      totalCash += amt;
    }
  });

  const cards = [totalFund, totalBank, totalCash, totalCount];
  const table = [
    ["၁", "အထွေထွေ ရန်ပုံငွေ (Bank)", bookTotals["1CB"] || 0, 0, 0, 0, bookTotals["1CB"] || 0, "Active"],
    ["၂", "ဆွမ်းပဒေသာပင် ရန်ပုံငွေ", bookTotals["2CB"] || 0, 0, 0, 0, bookTotals["2CB"] || 0, "Active"],
    ["၃", "တစ်ဦးတည်းစာရင်း ရန်ပုံငွေ", bookTotals["3CB"] || 0, 0, 0, 0, bookTotals["3CB"] || 0, "Active"],
    ["၄", "ကျောင်းရန်ပုံငွေ", bookTotals["4GB"] || 0, 0, 0, 0, bookTotals["4GB"] || 0, "Active"],
    ["၅", "ဆွမ်းပဒေသာပင် စာအုပ်", bookTotals["5FB"] || 0, 0, 0, 0, bookTotals["5FB"] || 0, "Active"],
    ["၆", "ဓမ္မာရုံငွေစာရင်း စာအုပ်", bookTotals["6HB"] || 0, 0, 0, 0, bookTotals["6HB"] || 0, "Active"],
    ["၇", "စေတီငွေစာရင်း စာအုပ်", bookTotals["7PB"] || 0, 0, 0, 0, bookTotals["7PB"] || 0, "Active"],
    ["၈", "လျှပ်စစ်ပဒေသာပင် စာအုပ်", bookTotals["8EB"] || 0, 0, 0, 0, bookTotals["8EB"] || 0, "Active"],
    ["၉", "ဆေးပဒေသာပင် စာအုပ်", bookTotals["9MB"] || 0, 0, 0, 0, bookTotals["9MB"] || 0, "Active"],
    ["၁၀", "အထွေထွေရန်ပုံငွေစာအုပ်", bookTotals["10GB"] || 0, 0, 0, 0, bookTotals["10GB"] || 0, "Active"]
  ];

  const fullRows = [
    ["", "", "", "", "", "", "", ""],
    cards,
    ...table
  ];

  return json({ status: "success", data: fullRows, cards, table }, env);
}

async function handleReport(env) {
  const { results } = await env.DB.prepare("SELECT * FROM cashbook_entries").all();
  const reportMatrix = [
    ["စဉ်", "ခေါင်းစဉ်ခွဲ", "ဝင်ငွေ", "ထွက်ငွေ", "လက်ကျန်"],
    ["1", "အထွေထွေ", 0, 0, 0]
  ];
  return json({ status: "success", data: reportMatrix }, env);
}

async function handleRead(env, sheetName) {
  if (sheetName === "11Inv") {
    const { results } = await env.DB.prepare("SELECT * FROM inventory_entries ORDER BY date ASC, id ASC").all();
    const dataRows = (results || []).map(invRecordToArray);
    return json({ status: "success", data: [...getHeaderRows("11Inv"), ...dataRows] }, env);
  }

  const { results } = await env.DB.prepare("SELECT * FROM cashbook_entries WHERE book_code = ? ORDER BY date ASC, id ASC").bind(sheetName).all();
  const dataRows = (results || []).map(ledgerRecordToArray);
  return json({ status: "success", data: [...getHeaderRows(sheetName), ...dataRows] }, env);
}

async function handleCreate(env, sheetName, entryData) {
  if (!entryData || !Array.isArray(entryData)) {
    return json({ status: "error", message: "Invalid payload data" }, env);
  }

  if (sheetName === "11Inv") {
    const { results: existing } = await env.DB.prepare("SELECT * FROM inventory_entries ORDER BY id ASC").all();
    const nextSerial = getNextFYIndex(existing, entryData[1]);
    const uniqueId = entryData[10] || "INV-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);

    const query = `
      INSERT INTO inventory_entries 
        (unique_id, serial_no, date, location, category, description, unit, quantity, note, month_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await env.DB.prepare(query).bind(
      uniqueId,
      nextSerial,
      entryData[1] || "",
      entryData[2] || "",
      entryData[3] || "",
      entryData[4] || "",
      entryData[5] || "",
      parseInt(entryData[6]) || 0,
      entryData[7] || "",
      entryData[8] || ""
    ).run();

    return json({ status: "success", message: "Inventory entry saved successfully" }, env);
  }

  // Standard Ledger Sheets (1CB - 10GB)
  const { results: existing } = await env.DB.prepare("SELECT * FROM cashbook_entries WHERE book_code = ? ORDER BY id ASC").bind(sheetName).all();
  const nextSerial = getNextFYIndex(existing, entryData[1]);
  const uniqueId = entryData[12] || "CB-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);

  const type = entryData[2] || "ဝင်ငွေ";
  const incomeAmt = parseFloat(entryData[7]) || 0;
  const expenseAmt = parseFloat(entryData[8]) || 0;
  const amount = type === "ဝင်ငွေ" ? incomeAmt : expenseAmt;

  const query = `
    INSERT INTO cashbook_entries 
      (unique_id, book_code, serial_no, date, type, subcategory, voucher_no, amount, receiver, description, month_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await env.DB.prepare(query).bind(
    uniqueId,
    sheetName,
    nextSerial,
    entryData[1] || "",
    type,
    entryData[3] || "",
    entryData[4] || "",
    amount,
    entryData[6] || "",
    entryData[5] || "",
    entryData[10] || ""
  ).run();

  // Auto transfer to 2CB
  if (["5FB", "7PB", "8EB", "9MB", "10GB"].includes(sheetName) && type === "ထွက်ငွေ" && entryData[3] === "ဘဏ်ထည့်ငွေ") {
    const { results: bank2CB } = await env.DB.prepare("SELECT * FROM cashbook_entries WHERE book_code = '2CB' ORDER BY id ASC").all();
    const bankSerial = getNextFYIndex(bank2CB, entryData[1]);
    const mirrorUniqueId = "TRF-" + Date.now();

    await env.DB.prepare(query).bind(
      mirrorUniqueId,
      "2CB",
      bankSerial,
      entryData[1] || "",
      "ဝင်ငွေ",
      "ဘဏ်ထည့်ငွေ",
      entryData[4] || "",
      amount,
      entryData[6] || "",
      (entryData[11] || sheetName) + " မှ ဘဏ်ထည့်ငွေ",
      entryData[10] || ""
    ).run();
  }

  return json({ status: "success", message: "Entry saved successfully" }, env);
}

async function handleUpdate(env, sheetName, uniqueId, updatedRow) {
  if (sheetName === "11Inv") {
    const query = `
      UPDATE inventory_entries SET 
        date = ?, location = ?, category = ?, description = ?, unit = ?, quantity = ?, note = ?, month_year = ?
      WHERE unique_id = ?
    `;
    await env.DB.prepare(query).bind(
      updatedRow[1], updatedRow[2], updatedRow[3], updatedRow[4], updatedRow[5],
      parseInt(updatedRow[6]) || 0, updatedRow[7], updatedRow[8], uniqueId
    ).run();

    return json({ status: "success", message: "Inventory entry updated successfully" }, env);
  }

  const type = updatedRow[2] || "ဝင်ငွေ";
  const amount = type === "ဝင်ငွေ" ? (parseFloat(updatedRow[7]) || 0) : (parseFloat(updatedRow[8]) || 0);

  const query = `
    UPDATE cashbook_entries SET 
      date = ?, type = ?, subcategory = ?, voucher_no = ?, amount = ?, receiver = ?, description = ?, month_year = ?
    WHERE unique_id = ?
  `;
  await env.DB.prepare(query).bind(
    updatedRow[1], type, updatedRow[3], updatedRow[4], amount, updatedRow[6], updatedRow[5], updatedRow[10], uniqueId
  ).run();

  return json({ status: "success", message: "Entry updated successfully" }, env);
}

async function handleDelete(env, sheetName, uniqueId) {
  if (sheetName === "11Inv") {
    await env.DB.prepare("DELETE FROM inventory_entries WHERE unique_id = ?").bind(uniqueId).run();
  } else {
    await env.DB.prepare("DELETE FROM cashbook_entries WHERE unique_id = ?").bind(uniqueId).run();
  }
  return json({ status: "success", message: "Entry deleted successfully" }, env);
}

// ────────────────────────────────────────────────────────────────────────
// Entry Point
// ────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (!env || !env.DB) {
        return json({ status: "error", message: "Cloudflare Worker Settings ထဲတွင် D1 Database 'DB' Binding မကျေသေးပါခင်ဗျာ!" }, env);
      }

      const url = new URL(request.url);
      let contents = {};
      if (request.method === "POST") {
        const raw = await request.text();
        if (raw) {
          try { contents = JSON.parse(raw); } catch (e) {
            return json({ status: "error", message: "Invalid request body: " + e.toString() }, env);
          }
        }
      }

      const action = url.searchParams.get("action") || contents.action;
      const sheetName = url.searchParams.get("sheet") || contents.sheet;

      // 💡 LOGIN ROUTE ( /api/login သို့မဟုတ် action === "login" )
      if (action === "login" || url.pathname === "/api/login") {
        return handleLogin(env, contents);
      }

      if (action === "home" || sheetName === "Home") return handleHome(env);
      if (action === "report" || sheetName === "12Rep" || sheetName === "Report") return handleReport(env);
      if (action === "read") {
        if (!sheetName) return json({ status: "error", message: "Missing sheet parameter" }, env);
        return handleRead(env, sheetName);
      }
      if (action === "create") return handleCreate(env, sheetName, contents.data);
      if (action === "update") return handleUpdate(env, sheetName, contents.uniqueId, contents.data);
      if (action === "delete") return handleDelete(env, sheetName, contents.uniqueId);

      return json({ status: "error", message: "Invalid action" }, env);
    } catch (err) {
      return json({ status: "error", message: "Worker Engine Error: " + (err.stack || err.toString()) }, env);
    }
  },
};