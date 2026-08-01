// js/app.js - Home Dashboard + Inventory (11Inv) + instant tab-switch caching

let currentSheet = "Home"; // 💡 Default to Home Dashboard on App Start
let rawData = [];

// 💡 IN-MEMORY CACHE: keyed by sheet name. When the user re-opens a tab
// they already visited, we render the cached rows immediately (no
// spinner, no wait) and silently refetch in the background to keep the
// numbers fresh. This is what makes "switch away and come back" feel
// instant, on top of the server-side CacheService layer in worker.js.
let sheetCache = {};   // { sheetName: { data, ts } }
let homeCache = null;  // { cards, table, ts }

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
function formatNum(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString();
}

// 💡 Top-right badge: "Date: Sat 1 Aug 26 | Admin" — date always today,
// role reflects whoever is actually logged in (Admin / Account / Viewer).
function updateHeaderBadge() {
  const auth = getAuthUser();
  const el = document.getElementById("current-user-display");
  if (!el) return;

  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const dateStr = `${weekday} ${d.getDate()} ${month} ${String(d.getFullYear()).slice(-2)}`;

  el.innerText = `Date: ${dateStr}  |  ${auth ? auth.role : ""}`;
}

// 💡 PREVIOUS / NEXT page navigation (every ledger + inventory page,
// i.e. everything except Home / Report / System).
function renderPrevNextBar() {
  const order = CONFIG.NAV_ORDER;
  const idx = order.indexOf(currentSheet);
  if (idx === -1) return "";

  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx < order.length - 1 ? order[idx + 1] : null;

  const prevLabel = prev ? (CONFIG.SHEETS[prev] || prev) : "";
  const nextLabel = next ? (CONFIG.SHEETS[next] || next) : "";

  return `
    <div class="flex justify-between items-center gap-3 pt-1">
      <button ${prev ? `onclick="switchTab('${prev}')"` : 'disabled'}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border border-amber-900/30 transition-all ${prev ? 'bg-[#1f1913] hover:bg-[#2a2118] text-amber-200 cursor-pointer' : 'bg-[#14110d] text-amber-800/40 cursor-not-allowed'}">
        <i class="fa-solid fa-chevron-left text-[10px]"></i>
        <span class="truncate max-w-[220px]">${prev ? `${prev} - ${prevLabel}` : 'Previous'}</span>
      </button>
      <button ${next ? `onclick="switchTab('${next}')"` : 'disabled'}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border border-amber-900/30 transition-all ${next ? 'bg-[#1f1913] hover:bg-[#2a2118] text-amber-200 cursor-pointer' : 'bg-[#14110d] text-amber-800/40 cursor-not-allowed'}">
        <span class="truncate max-w-[220px]">${next ? `${next} - ${nextLabel}` : 'Next'}</span>
        <i class="fa-solid fa-chevron-right text-[10px]"></i>
      </button>
    </div>
  `;
}

function initApp() {
  const auth = getAuthUser();
  if (!auth) {
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("erp-workspace").classList.add("hidden");
    return;
  }

  document.getElementById("login-overlay").classList.add("hidden");
  document.getElementById("erp-workspace").classList.remove("hidden");
  updateHeaderBadge();

  // 💡 Open Home Dashboard by Default
  switchTab("Home");
}

function switchTab(sheetName) {
  currentSheet = sheetName;

  // Sidebar Nav Active Highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + sheetName);
  if (activeBtn) activeBtn.classList.add("active");

  const titleText = CONFIG.SHEETS[sheetName] ? `${sheetName} - ${CONFIG.SHEETS[sheetName]}` : sheetName;
  const specialTitles = { Home: "Home Dashboard", Report: "Reporting Center", System: "System Settings" };
  document.getElementById("page-title").innerText = specialTitles[sheetName] || titleText;

  updateHeaderBadge();
  loadSheetView();
}

async function loadSheetView() {
  const container = document.getElementById("view-container");
  if (!container) return;

  if (currentSheet === "Home") { await renderHomeDashboard(container); return; }
  if (currentSheet === "Report") { await renderReportView(container); return; }
  if (currentSheet === "System") { renderPlaceholderView(container); return; }
  if (currentSheet === "11Inv") { await renderInventoryView(container); return; }
  await renderLedgerView(container);
}

// ============================================================
// PLACEHOLDER VIEW (Report / System)
// ============================================================
function renderPlaceholderView(container) {
  const title = "System Settings";
  const subtitle = "စနစ်ထိန်းချုပ်မှု ပြင်ဆင်ချက်များ";
  const icon = "fa-gears";

  container.innerHTML = `
    <div class="p-10 text-center border border-amber-900/30 bg-[#14110d] rounded-2xl shadow-2xl my-6 max-w-2xl mx-auto space-y-4">
      <div class="inline-flex items-center justify-center p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
        <i class="fa-solid ${icon} text-4xl"></i>
      </div>
      <h2 class="text-xl font-black text-gold-gradient">${title}</h2>
      <p class="text-xs text-amber-200/70">${subtitle}</p>
      <p class="text-[11px] text-amber-500/50 italic pt-3 border-t border-amber-900/20">
        (ဤအပိုင်းအတွက် သီးသန့် အချက်အလက်များကို အနီးကပ် ထပ်မံဖြည့်သွင်းပေးပါမည်)
      </p>
    </div>
  `;
}

// ============================================================
// REPORT VIEW — "ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်" (12Rep!A1:P15)
// ============================================================
async function renderReportView(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row justify-between items-center bg-[#14110d] border border-amber-900/30 p-4 rounded-xl gap-4">
        <h3 class="text-sm font-black text-amber-300 uppercase tracking-wider flex items-center gap-2.5">
          <i class="fa-solid fa-chart-pie text-amber-400"></i> ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်
        </h3>
        <button onclick="loadSheetView()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-rotate text-xs"></i> Refresh</button>
      </div>

      <div class="bg-[#14110d] border border-amber-900/30 rounded-xl overflow-x-auto shadow-2xl">
        <table class="table-lg w-full text-left border-collapse min-w-[1200px] text-sm">
          <tbody id="report-table-body">
            <tr><td class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const rows = await fetchReportData();
    if (currentSheet === requestedSheet) renderReportTable(rows);
  } catch (err) {
    console.error("Report load error:", err);
    const tbody = document.getElementById("report-table-body");
    if (tbody) tbody.innerHTML = `<tr><td class="text-center py-6 text-rose-400 font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</td></tr>`;
  }
}

function renderReportTable(rows) {
  const tbody = document.getElementById("report-table-body");
  if (!tbody) return;
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td class="text-center py-6 text-amber-500/50">ဒေတာ မရှိသေးပါ။</td></tr>`;
    return;
  }

  // Row indices (0-based) with special meaning per spreadsheet layout:
  //   row 0        -> header
  //   row 4 (R5)   -> ဝင်ငွေ စုစုပေါင်း (income total)
  //   row 11 (R12) -> ထွက်ငွေ စုစုပေါင်း (expense total)
  //   row 12 (R13) -> လက်ကျန်ငွေ စုစုပေါင်း (balance total)
  const INCOME_TOTAL = 4, EXPENSE_TOTAL = 11, BALANCE_TOTAL = 12;

  let html = "";
  rows.forEach((row, ri) => {
    let rowClass, cellClass, borderClass = "border-b border-amber-900/10";

    if (ri === 0) {
      rowClass = "bg-[#1a1410] sticky top-0";
      cellClass = "px-4 py-3 font-black text-amber-400 uppercase text-xs tracking-wide";
    } else if (ri === INCOME_TOTAL) {
      rowClass = "bg-emerald-500/10 font-black text-emerald-300";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-emerald-600/50 border-b border-amber-900/10";
    } else if (ri === EXPENSE_TOTAL) {
      rowClass = "bg-rose-500/10 font-black text-rose-300";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-rose-600/50 border-b border-amber-900/10";
    } else if (ri === BALANCE_TOTAL) {
      rowClass = "bg-amber-500/10 font-black text-amber-300 text-base";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-amber-600/60 border-b-2 border-amber-600/60";
    } else if (ri < INCOME_TOTAL) {
      rowClass = "bg-emerald-500/[0.03] text-emerald-100/90 hover:bg-emerald-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    } else if (ri < EXPENSE_TOTAL) {
      rowClass = "bg-rose-500/[0.03] text-rose-100/90 hover:bg-rose-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    } else {
      rowClass = "text-amber-100/90 hover:bg-amber-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    }

    html += `<tr class="${rowClass} ${borderClass}">`;
    row.forEach((cell) => {
      const display = cell !== "" && cell !== null && !isNaN(cell) && cell !== "" ? (typeof cell === "number" ? cell.toLocaleString() : cell) : (cell || "");
      html += `<td class="${cellClass}">${display}</td>`;
    });
    html += `</tr>`;
  });

  tbody.innerHTML = html;
}

// ============================================================
// HOME DASHBOARD
// ============================================================
async function renderHomeDashboard(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="h-full flex flex-col space-y-5">
      <!-- "Be Mindful" hero banner -->
      <div class="shrink-0 bg-gradient-to-br from-[#1c1510] to-[#100c09] border border-amber-600/25 rounded-2xl shadow-2xl px-8 py-6 relative overflow-hidden">
        <div class="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <i class="fa-solid fa-dharmachakra text-amber-500/10 text-8xl absolute -bottom-3 right-6"></i>
        <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 class="text-3xl md:text-4xl font-black text-gold-gradient tracking-wide">Be Mindful</h2>
            <p class="text-sm text-amber-200/70 italic mt-1">အမြဲသတိ ထားပါလေ ... — stay mindful —</p>
          </div>
          <div class="text-left md:text-right border-t md:border-t-0 md:border-l border-amber-700/20 pt-3 md:pt-0 md:pl-6">
            <p class="text-sm text-amber-400/80 italic">"Appamādena sampādetha"</p>
            <p class="text-[11px] text-amber-500/50 uppercase tracking-widest mt-1">— The Buddha</p>
          </div>
        </div>
      </div>

      <!-- Fund Summary Table -->
      <div class="flex-1 flex flex-col bg-[#14110d] border border-amber-900/30 rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-amber-900/30 bg-[#1a1410] shrink-0">
          <h3 class="text-base font-black text-amber-300 uppercase tracking-wider flex items-center gap-2.5">
            <i class="fa-solid fa-building-columns text-amber-400"></i> ရိပ်သာ ရန်ပုံငွေစာရင်း အကျဉ်းချုပ်
          </h3>
        </div>
        <div id="home-bank-table" class="flex-1 overflow-auto">
          <div class="p-8 text-center text-amber-500/50 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</div>
        </div>
      </div>
    </div>
  `;

  const applyData = (data) => {
    renderHomeBankTable(data.table || []);
  };

  if (homeCache) applyData(homeCache);

  try {
    const fresh = await fetchHomeDashboard();
    homeCache = fresh;
    if (currentSheet === requestedSheet) applyData(fresh);
  } catch (err) {
    console.error("Home dashboard load error:", err);
    if (!homeCache) {
      const box = document.getElementById("home-bank-table");
      if (box) box.innerHTML = `<div class="p-8 text-center text-rose-400 text-xs font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</div>`;
    }
  }
}

function renderHomeBankTable(rows) {
  const box = document.getElementById("home-bank-table");
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = `<div class="p-8 text-center text-amber-500/50 text-xs">စာရင်း မရှိသေးပါ။</div>`;
    return;
  }
  const header = rows[0];
  const body = rows.slice(1);

  let html = `<table class="table-lg w-full text-left border-collapse text-sm"><thead><tr>`;
  header.forEach((h, i) => {
    html += `<th class="px-4 py-3.5 sticky top-0 bg-[#1a1410] text-amber-400/90 font-bold uppercase text-xs tracking-wide ${i >= 2 ? 'text-right' : ''}">${h}</th>`;
  });
  html += `</tr></thead><tbody>`;

  body.forEach((row, ri) => {
    const isTotal = ri === body.length - 1;
    html += `<tr class="${isTotal ? 'font-black text-amber-300 bg-amber-500/5 border-t-2 border-amber-600/40 text-base' : 'border-b border-amber-900/10 hover:bg-amber-500/5'}">`;
    row.forEach((cell, ci) => {
      const isNumeric = ci >= 2;
      const display = isNumeric && cell !== "" && !isNaN(cell) ? Number(cell).toLocaleString() : cell;
      html += `<td class="px-4 py-3 font-mono ${isNumeric ? 'text-right' : ''} ${!isNumeric ? 'font-sans' : ''}">${display}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  box.innerHTML = html;
}

// ============================================================
// LEDGER TABLE VIEW (1CB..10GB) - with instant-return caching
// ============================================================
async function renderLedgerView(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="space-y-5">
      <!-- Top 4 KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i class="fa-solid fa-arrow-trend-up text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စုစုပေါင်းဝင်ငွေ</p><h3 id="kpi-income" class="text-base font-extrabold text-emerald-400 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-rose-500/10 text-rose-400"><i class="fa-solid fa-arrow-trend-down text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စုစုပေါင်းထွက်ငွေ</p><h3 id="kpi-expense" class="text-base font-extrabold text-rose-400 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-amber-500/10 text-amber-400"><i class="fa-solid fa-scale-balanced text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">လက်ကျန်ငွေ</p><h3 id="kpi-balance" class="text-base font-extrabold text-amber-300 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-sky-500/10 text-sky-400"><i class="fa-solid fa-list-check text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စာကြောင်းရေ</p><h3 id="kpi-count" class="text-base font-extrabold text-amber-100 mt-1">0</h3></div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row justify-between items-center bg-[#14110d] border border-amber-900/30 p-4 rounded-xl gap-4">
        <div class="relative w-full sm:w-64">
          <input type="text" id="search-input" oninput="renderTable()" placeholder="ရှာဖွေရန်..." class="w-full pl-3 pr-4 py-2 text-xs rounded-lg bg-[#0a0806] border border-amber-900/40 text-amber-100 outline-none focus:border-amber-400">
        </div>
        <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button onclick="loadSheetView()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-rotate text-xs"></i> Refresh</button>
          <button onclick="exportCSV()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-file-export text-xs"></i> Export</button>
          <button id="btn-add-entry" onclick="openAddModal()" class="p-2 bg-amber-600 hover:bg-amber-500 text-amber-950 rounded-lg text-xs font-black transition-all"><i class="fa-solid fa-plus text-xs"></i> + စာရင်းအသစ်ထည့်ရန်</button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="bg-[#14110d] border border-amber-900/30 rounded-xl overflow-x-auto shadow-2xl">
        <table class="w-full text-left border-collapse min-w-[1400px]">
          <thead>
            <tr>
              <th class="w-12 text-center">စဉ်</th>
              <th class="w-28">ရက်စွဲ</th>
              <th class="w-24">ခေါင်းစဉ်</th>
              <th class="w-36">ခေါင်းစဉ်ခွဲ</th>
              <th class="w-28">ဘောင်ချာ</th>
              <th class="min-w-[200px]">အကြောင်းအရာ</th>
              <th class="w-28">လက်ခံသူ</th>
              <th class="w-32 text-right">ဝင်ငွေ</th>
              <th class="w-32 text-right">ထွက်ငွေ</th>
              <th class="w-32 text-right">လက်ကျန်</th>
              <th class="w-24">လနှစ်</th>
              <th class="w-36">စာအုပ်အမည်</th>
              <th class="w-24 text-center right-0 sticky">လုပ်ဆောင်ချက်</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="13" class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>
          </tbody>
        </table>
      </div>

      ${renderPrevNextBar()}
    </div>
  `;

  // Hide Add button for Viewer
  const auth = getAuthUser();
  if (auth && auth.role === "Viewer") {
    const addBtn = document.getElementById("btn-add-entry");
    if (addBtn) addBtn.style.display = "none";
  }

  // 💡 Instant render from cache (if this tab was visited before), then
  // silently refresh from the server so the numbers stay accurate.
  const cached = sheetCache[requestedSheet];
  if (cached) {
    rawData = cached.data;
    renderTable();
  }

  try {
    const fresh = await fetchSheetData(requestedSheet);
    sheetCache[requestedSheet] = { data: fresh, ts: Date.now() };
    if (currentSheet === requestedSheet) {
      rawData = fresh;
      renderTable();
    }
  } catch (err) {
    console.error("Sheet load error:", err);
    if (!cached) {
      const tbody = document.getElementById("table-body");
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-6 text-rose-400 font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။ မကြာမီ ပြန်လည် ကြိုးစားပါ။</td></tr>`;
      }
    }
  }
}

function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return; // Safely exit if table-body doesn't exist

  const searchInput = document.getElementById("search-input");
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const auth = getAuthUser();

  let totIncome = 0;
  let totExpense = 0;
  let runningBalance = 0;
  let html = "";
  let count = 0;

  rawData.forEach((row) => {
    const date = row[1] || "";
    const category = row[2] || "";
    const subCat = row[3] || "";
    const voucher = row[4] || "";
    const desc = row[5] || "";
    const receiver = row[6] || "";
    const income = parseFloat(row[7]) || 0;
    const expense = parseFloat(row[8]) || 0;
    const monthYear = row[10] || "";
    const bookName = row[11] || "";
    const uniqueId = row[12] || "";

    const rowStr = `${date} ${category} ${subCat} ${voucher} ${desc} ${receiver} ${bookName}`.toLowerCase();
    if (search && !rowStr.includes(search)) return;

    count++;
    totIncome += income;
    totExpense += expense;
    runningBalance += (income - expense);

    const editable = canEditRecord(date);

    html += `
      <tr>
        <td class="text-center font-mono">${count}</td>
        <td class="font-mono">${date}</td>
        <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${category === 'ဝင်ငွေ' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950 text-rose-400 border border-rose-800/40'}">${category}</span></td>
        <td>${subCat}</td>
        <td class="font-mono text-amber-300">${voucher}</td>
        <td>${desc}</td>
        <td>${receiver}</td>
        <td class="text-right font-mono text-emerald-400 font-bold">${income ? income.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-rose-400 font-bold">${expense ? expense.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-amber-300 font-bold">${runningBalance.toLocaleString()}</td>
        <td class="font-mono text-amber-500/80">${monthYear}</td>
        <td class="text-amber-200/80">${bookName}</td>
        <td class="text-center right-0 sticky">
          ${auth && auth.role !== "Viewer" && editable ? `
            <button onclick="openEditModal('${uniqueId}')" class="text-amber-400 hover:text-amber-200 mr-2" title="ပြင်ဆင်မည်"><i class="fa-solid fa-pen-to-square"></i></button>
            ${auth.role === "Admin" ? `<button onclick="handleDelete('${uniqueId}')" class="text-rose-400 hover:text-rose-200" title="ဖျက်မည်"><i class="fa-solid fa-trash"></i></button>` : ''}
          ` : `<span class="text-amber-700/50 text-[10px] italic">Locked</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || `<tr><td colspan="13" class="text-center py-6 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;

  setText("kpi-income", totIncome.toLocaleString() + " MMK");
  setText("kpi-expense", totExpense.toLocaleString() + " MMK");
  setText("kpi-balance", runningBalance.toLocaleString() + " MMK");
  setText("kpi-count", count);
}

function openAddModal() {
  document.getElementById("modal-form-title").innerText = "စာရင်းအသစ် ထည့်သွင်းရန်";
  document.getElementById("entry-uniqueId").value = "";
  document.getElementById("entry-date").value = new Date().toISOString().split('T')[0];
  document.getElementById("entry-type").value = "ဝင်ငွေ";
  document.getElementById("entry-amount").value = "";
  document.getElementById("entry-voucher").value = "";
  document.getElementById("entry-description").value = "";

  document.getElementById("entry-receiver").value = "None";

  onTypeChange();
  document.getElementById("entry-modal").classList.remove("hidden");
}

function openEditModal(uniqueId) {
  const row = rawData.find(r => String(r[12]) === String(uniqueId));
  if (!row) return;

  document.getElementById("modal-form-title").innerText = "စာရင်း ပြန်လည်ပြင်ဆင်ရန်";
  document.getElementById("entry-uniqueId").value = uniqueId;

  let dVal = row[1];
  if (dVal && dVal.includes("-")) {
    const parts = dVal.split("-");
    if (parts[0].length === 2) {
      dVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  document.getElementById("entry-date").value = dVal;
  document.getElementById("entry-type").value = row[2];

  onTypeChange();
  document.getElementById("entry-subcategory").value = row[3];
  document.getElementById("entry-voucher").value = row[4];
  document.getElementById("entry-description").value = row[5];
  document.getElementById("entry-receiver").value = row[6];

  const amt = row[2] === "ဝင်ငွေ" ? row[7] : row[8];
  document.getElementById("entry-amount").value = amt;

  document.getElementById("entry-modal").classList.remove("hidden");
}

function closeEntryModal() {
  document.getElementById("entry-modal").classList.add("hidden");
}

function onTypeChange() {
  const type = document.getElementById("entry-type").value;
  const subSelect = document.getElementById("entry-subcategory");
  const amountInput = document.getElementById("entry-amount");

  let subMap = CONFIG.SUB_CATEGORIES[currentSheet] || CONFIG.SUB_CATEGORIES["DefaultLedger"];
  if (["1CB", "2CB", "3CB"].includes(currentSheet)) {
    subMap = CONFIG.SUB_CATEGORIES["BankGroup"];
  }

  const options = subMap[type] || [];
  subSelect.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join("");

  // 💡 Color the Amount field: green = ဝင်ငွေ (income/credit), red = ထွက်ငွေ (expense/debit)
  // Using inline styles so it always wins over the Tailwind CDN's default classes.
  if (type === "ဝင်ငွေ") {
    amountInput.style.color = "#34d399";        // emerald-400
    amountInput.style.borderColor = "rgba(16, 185, 129, 0.5)";
  } else {
    amountInput.style.color = "#fb7185";        // rose-400
    amountInput.style.borderColor = "rgba(244, 63, 94, 0.5)";
  }
}

async function saveEntryForm(e) {
  e.preventDefault();
  const uniqueId = document.getElementById("entry-uniqueId").value;
  const dateStr = document.getElementById("entry-date").value;
  const type = document.getElementById("entry-type").value;
  const subCat = document.getElementById("entry-subcategory").value;
  const voucher = document.getElementById("entry-voucher").value;
  const amt = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  const desc = document.getElementById("entry-description").value;

  const dParts = dateStr.split("-");
  const formattedDate = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;

  const dObj = new Date(dateStr);
  const mName = dObj.toLocaleString('en-US', { month: 'short' });
  const yName = dObj.getFullYear().toString().slice(-2);
  const monthYear = `${mName}-${yName}`;

  const bookName = CONFIG.SHEETS[currentSheet] || currentSheet;
  const recId = uniqueId || ("ID-" + new Date().getTime());

  const rowArray = [
    0,
    formattedDate,
    type,
    subCat,
    voucher,
    desc,
    receiver,
    type === "ဝင်ငွေ" ? amt : 0,
    type === "ထွက်ငွေ" ? amt : 0,
    0,
    monthYear,
    bookName,
    recId
  ];

  document.getElementById("loading-overlay").classList.remove("hidden");
  closeEntryModal();

  if (uniqueId) {
    await updateSheetEntry(currentSheet, uniqueId, rowArray);
  } else {
    await createSheetEntry(currentSheet, rowArray);
  }

  delete sheetCache[currentSheet]; // invalidate so the reload is guaranteed fresh
  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

async function handleDelete(uniqueId) {
  if (!confirm("ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  document.getElementById("loading-overlay").classList.remove("hidden");
  await deleteSheetEntry(currentSheet, uniqueId);
  delete sheetCache[currentSheet];
  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

function exportCSV() {
  let csv = "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,အကြောင်းအရာ,လက်ခံသူ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,လနှစ်,စာအုပ်အမည်\n";
  rawData.forEach((r, i) => {
    csv += `"${i + 1}","${r[1]}","${r[2]}","${r[3]}","${r[4]}","${r[5]}","${r[6]}","${r[7]}","${r[8]}","${r[9]}","${r[10]}","${r[11]}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentSheet}_Export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// ============================================================
// INVENTORY VIEW (11Inv) - ပစ္စည်းစာရင်း
// ============================================================
async function renderInventoryView(container) {
  const requestedSheet = currentSheet; // "11Inv"

  container.innerHTML = `
    <div class="space-y-5">
      <!-- Top 4 KPI Cards: item counts by location group -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-amber-500/10 text-amber-400"><i class="fa-solid fa-kitchen-set text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">မီးဖိုဆောင်</p><h3 id="kpi-inv-kitchen" class="text-base font-extrabold text-amber-200 mt-1">0</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-sky-500/10 text-sky-400"><i class="fa-solid fa-om text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">ဓမ္မာရုံ</p><h3 id="kpi-inv-dhammahall" class="text-base font-extrabold text-sky-200 mt-1">0</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i class="fa-solid fa-gopuram text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">သိမ်</p><h3 id="kpi-inv-sim" class="text-base font-extrabold text-emerald-200 mt-1">0</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-rose-500/10 text-rose-400"><i class="fa-solid fa-warehouse text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စတို (၁-၅ ပေါင်း)</p><h3 id="kpi-inv-store" class="text-base font-extrabold text-rose-200 mt-1">0</h3></div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row justify-between items-center bg-[#14110d] border border-amber-900/30 p-4 rounded-xl gap-4">
        <div class="relative w-full sm:w-64">
          <input type="text" id="inv-search-input" oninput="renderInventoryTable()" placeholder="ရှာဖွေရန်..." class="w-full pl-3 pr-4 py-2 text-xs rounded-lg bg-[#0a0806] border border-amber-900/40 text-amber-100 outline-none focus:border-amber-400">
        </div>
        <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button onclick="loadSheetView()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-rotate text-xs"></i> Refresh</button>
          <button onclick="exportInventoryCSV()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-file-export text-xs"></i> Export</button>
          <button id="btn-add-inv" onclick="openAddInvModal()" class="p-2 bg-amber-600 hover:bg-amber-500 text-amber-950 rounded-lg text-xs font-black transition-all"><i class="fa-solid fa-plus text-xs"></i> + စာရင်းအသစ်ထည့်ရန်</button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="bg-[#14110d] border border-amber-900/30 rounded-xl overflow-x-auto shadow-2xl">
        <table class="w-full text-left border-collapse min-w-[1300px]">
          <thead>
            <tr>
              <th class="w-12 text-center">စဉ်</th>
              <th class="w-28">ရက်စွဲ</th>
              <th class="w-28">နေရာ</th>
              <th class="w-32">အမျိုးအစား</th>
              <th class="min-w-[180px]">အကြောင်းအရာ</th>
              <th class="w-24">ရေတွက်ပုံ</th>
              <th class="w-24 text-right">အရေအတွက်</th>
              <th class="min-w-[140px]">မှတ်ချက်</th>
              <th class="w-24">လနှစ်</th>
              <th class="w-36">စာအုပ်အမည်</th>
              <th class="w-24 text-center right-0 sticky">လုပ်ဆောင်ချက်</th>
            </tr>
          </thead>
          <tbody id="inv-table-body">
            <tr><td colspan="11" class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>
          </tbody>
        </table>
      </div>

      ${renderPrevNextBar()}
    </div>
  `;

  const auth = getAuthUser();
  if (auth && auth.role === "Viewer") {
    const addBtn = document.getElementById("btn-add-inv");
    if (addBtn) addBtn.style.display = "none";
  }

  const cached = sheetCache["11Inv"];
  if (cached) {
    rawData = cached.data;
    renderInventoryTable();
  }

  try {
    const fresh = await fetchSheetData("11Inv");
    sheetCache["11Inv"] = { data: fresh, ts: Date.now() };
    if (currentSheet === requestedSheet) {
      rawData = fresh;
      renderInventoryTable();
    }
  } catch (err) {
    console.error("Inventory load error:", err);
    if (!cached) {
      const tbody = document.getElementById("inv-table-body");
      if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-6 text-rose-400 font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။ မကြာမီ ပြန်လည် ကြိုးစားပါ။</td></tr>`;
    }
  }
}

function renderInventoryTable() {
  const tbody = document.getElementById("inv-table-body");
  if (!tbody) return;

  const searchInput = document.getElementById("inv-search-input");
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const auth = getAuthUser();

  const counts = { kitchen: 0, dhammahall: 0, sim: 0, store: 0 };
  let html = "";
  let count = 0;

  rawData.forEach((row) => {
    const date = row[1] || "";
    const location = row[2] || "";
    const category = row[3] || "";
    const desc = row[4] || "";
    const unit = row[5] || "";
    const qty = parseFloat(row[6]) || 0;
    const note = row[7] || "";
    const monthYear = row[8] || "";
    const bookName = row[9] || "";
    const uniqueId = row[10] || "";

    // KPI tallies always run over the full dataset (not affected by search filter)
    if (location === "မီးဖိုဆောင်") counts.kitchen += qty;
    else if (location === "ဓမ္မာရုံ") counts.dhammahall += qty;
    else if (location === "သိမ်") counts.sim += qty;
    else if (CONFIG.INVENTORY.STORAGE_LOCATIONS.includes(location)) counts.store += qty;

    const rowStr = `${date} ${location} ${category} ${desc} ${note} ${bookName}`.toLowerCase();
    if (search && !rowStr.includes(search)) return;

    count++;
    const editable = canEditRecord(date);

    html += `
      <tr>
        <td class="text-center font-mono">${count}</td>
        <td class="font-mono">${date}</td>
        <td>${location}</td>
        <td>${category}</td>
        <td>${desc}</td>
        <td class="text-amber-300/80">${unit}</td>
        <td class="text-right font-mono text-amber-300 font-bold">${qty ? qty.toLocaleString() : '-'}</td>
        <td class="text-amber-200/70">${note}</td>
        <td class="font-mono text-amber-500/80">${monthYear}</td>
        <td class="text-amber-200/80">${bookName}</td>
        <td class="text-center right-0 sticky">
          ${auth && auth.role !== "Viewer" && editable ? `
            <button onclick="openEditInvModal('${uniqueId}')" class="text-amber-400 hover:text-amber-200 mr-2" title="ပြင်ဆင်မည်"><i class="fa-solid fa-pen-to-square"></i></button>
            ${auth.role === "Admin" ? `<button onclick="handleInvDelete('${uniqueId}')" class="text-rose-400 hover:text-rose-200" title="ဖျက်မည်"><i class="fa-solid fa-trash"></i></button>` : ''}
          ` : `<span class="text-amber-700/50 text-[10px] italic">Locked</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || `<tr><td colspan="11" class="text-center py-6 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;

  setText("kpi-inv-kitchen", counts.kitchen.toLocaleString());
  setText("kpi-inv-dhammahall", counts.dhammahall.toLocaleString());
  setText("kpi-inv-sim", counts.sim.toLocaleString());
  setText("kpi-inv-store", counts.store.toLocaleString());
}

function populateInvDropdowns() {
  const locSel = document.getElementById("inv-location");
  const catSel = document.getElementById("inv-category");
  const unitSel = document.getElementById("inv-unit");
  if (locSel && !locSel.options.length) {
    locSel.innerHTML = CONFIG.INVENTORY.LOCATIONS.map(o => `<option value="${o}">${o}</option>`).join("");
  }
  if (catSel && !catSel.options.length) {
    catSel.innerHTML = CONFIG.INVENTORY.CATEGORIES.map(o => `<option value="${o}">${o}</option>`).join("");
  }
  if (unitSel && !unitSel.options.length) {
    unitSel.innerHTML = CONFIG.INVENTORY.UNITS.map(o => `<option value="${o}">${o}</option>`).join("");
  }
}

function openAddInvModal() {
  populateInvDropdowns();
  document.getElementById("inv-modal-title").innerText = "ပစ္စည်း အသစ် ထည့်သွင်းရန်";
  document.getElementById("inv-uniqueId").value = "";
  document.getElementById("inv-date").value = new Date().toISOString().split('T')[0];
  document.getElementById("inv-location").value = CONFIG.INVENTORY.LOCATIONS[0];
  document.getElementById("inv-category").value = CONFIG.INVENTORY.CATEGORIES[0];
  document.getElementById("inv-desc").value = "";
  document.getElementById("inv-unit").value = CONFIG.INVENTORY.UNITS[0];
  document.getElementById("inv-qty").value = "";
  document.getElementById("inv-note").value = "";
  document.getElementById("inv-entry-modal").classList.remove("hidden");
}

function openEditInvModal(uniqueId) {
  const row = rawData.find(r => String(r[10]) === String(uniqueId));
  if (!row) return;

  populateInvDropdowns();
  document.getElementById("inv-modal-title").innerText = "ပစ္စည်း စာရင်း ပြင်ဆင်ရန်";
  document.getElementById("inv-uniqueId").value = uniqueId;

  let dVal = row[1];
  if (dVal && dVal.includes("-")) {
    const parts = dVal.split("-");
    if (parts[0].length === 2) {
      dVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  document.getElementById("inv-date").value = dVal;
  document.getElementById("inv-location").value = row[2];
  document.getElementById("inv-category").value = row[3];
  document.getElementById("inv-desc").value = row[4];
  document.getElementById("inv-unit").value = row[5];
  document.getElementById("inv-qty").value = row[6];
  document.getElementById("inv-note").value = row[7];

  document.getElementById("inv-entry-modal").classList.remove("hidden");
}

function closeInvModal() {
  document.getElementById("inv-entry-modal").classList.add("hidden");
}

async function saveInvEntryForm(e) {
  e.preventDefault();
  const uniqueId = document.getElementById("inv-uniqueId").value;
  const dateStr = document.getElementById("inv-date").value;
  const location = document.getElementById("inv-location").value;
  const category = document.getElementById("inv-category").value;
  const desc = document.getElementById("inv-desc").value;
  const unit = document.getElementById("inv-unit").value;
  const qty = parseFloat(document.getElementById("inv-qty").value) || 0;
  const note = document.getElementById("inv-note").value;

  const dParts = dateStr.split("-");
  const formattedDate = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;

  const dObj = new Date(dateStr);
  const mName = dObj.toLocaleString('en-US', { month: 'short' });
  const yName = dObj.getFullYear().toString().slice(-2);
  const monthYear = `${mName}-${yName}`;

  const bookName = CONFIG.SHEETS["11Inv"] || "11Inv";
  const recId = uniqueId || ("INV-" + new Date().getTime());

  const rowArray = [
    0,             // A: စဉ် (auto-indexed on the backend)
    formattedDate, // B: ရက်စွဲ
    location,      // C: နေရာ
    category,      // D: အမျိုးအစား
    desc,          // E: အကြောင်းအရာ
    unit,          // F: ရေတွက်ပုံ
    qty,           // G: အရေအတွက်
    note,          // H: မှတ်ချက်
    monthYear,     // I: လနှစ်
    bookName,      // J: စာအုပ်အမည်
    recId          // K: UNIQUEID
  ];

  document.getElementById("loading-overlay").classList.remove("hidden");
  closeInvModal();

  if (uniqueId) {
    await updateSheetEntry("11Inv", uniqueId, rowArray);
  } else {
    await createSheetEntry("11Inv", rowArray);
  }

  delete sheetCache["11Inv"];
  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

async function handleInvDelete(uniqueId) {
  if (!confirm("ဤပစ္စည်းစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  document.getElementById("loading-overlay").classList.remove("hidden");
  await deleteSheetEntry("11Inv", uniqueId);
  delete sheetCache["11Inv"];
  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

function exportInventoryCSV() {
  let csv = "စဉ်,ရက်စွဲ,နေရာ,အမျိုးအစား,အကြောင်းအရာ,ရေတွက်ပုံ,အရေအတွက်,မှတ်ချက်,လနှစ်,စာအုပ်အမည်\n";
  rawData.forEach((r, i) => {
    csv += `"${i + 1}","${r[1]}","${r[2]}","${r[3]}","${r[4]}","${r[5]}","${r[6]}","${r[7]}","${r[8]}","${r[9]}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Inventory_Export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

window.onload = initApp;
