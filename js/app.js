// js/app.js - Enhanced with Be Mindful splash, pagination, and Report page
// 💡 Note: USERS constant is defined in js/auth.js - NOT here to avoid conflicts

let currentSheet = "Home";
let rawData = [];
let currentPageIndex = 0;
let pageSize = 20;

let sheetCache = {};
let homeCache = null;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function formatNum(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString();
}

// ============================================================
// BE MINDFUL SPLASH SCREEN
// ============================================================
function showMindfulSplash() {
  const splash = document.getElementById("mindful-splash");
  if (splash) {
    splash.classList.remove("hidden");
    setTimeout(() => {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 0.8s ease-out";
      setTimeout(() => {
        splash.classList.add("hidden");
        splash.style.opacity = "1";
        splash.style.transition = "none";
      }, 800);
    }, 2500);
  }
}

function hideMindfulSplash() {
  const splash = document.getElementById("mindful-splash");
  if (splash) splash.classList.add("hidden");
}

// ============================================================
// DATE & USER DISPLAY IN HEADER
// ============================================================
function updateHeaderInfo() {
  const auth = getAuthUser();
  if (!auth) return;

  // Format current date as "Sat 1 Aug 26"
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayName = days[now.getDay()];
  const monthName = months[now.getMonth()];
  const date = now.getDate();
  const year = String(now.getFullYear()).slice(-2);

  const dateStr = `${dayName} ${date} ${monthName} ${year}`;
  const userRole = auth.role;

  setText("current-date-display", `Date: ${dateStr}`);
  
  const userDisplay = document.getElementById("current-user-display");
  if (userDisplay) {
    userDisplay.innerHTML = `<i class="fa-solid fa-user-shield text-amber-400"></i> <span>${userRole}</span>`;
  }
}

// ============================================================
// PAGINATION CONTROLS
// ============================================================
function showPaginationFooter(show = true) {
  const footer = document.getElementById("pagination-footer");
  if (footer) {
    if (show) {
      footer.classList.remove("hidden");
    } else {
      footer.classList.add("hidden");
    }
  }
}

function updatePaginationInfo() {
  const totalPages = Math.ceil(rawData.length / pageSize);
  const currentPage = Math.floor(currentPageIndex / pageSize) + 1;
  setText("pagination-info", `Page ${currentPage} of ${totalPages}`);
}

function goToPreviousPage() {
  if (currentPageIndex > 0) {
    currentPageIndex -= pageSize;
    loadSheetView();
  }
}

function goToNextPage() {
  const totalPages = Math.ceil(rawData.length / pageSize);
  const currentPage = Math.floor(currentPageIndex / pageSize) + 1;
  if (currentPage < totalPages) {
    currentPageIndex += pageSize;
    loadSheetView();
  }
}

// ============================================================
// INIT APP
// ============================================================
function initApp() {
  const auth = getAuthUser();
  if (!auth) {
    hideMindfulSplash();
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("erp-workspace").classList.add("hidden");
    return;
  }

  // Show Be Mindful splash and then initialize
  showMindfulSplash();

  setTimeout(() => {
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("erp-workspace").classList.remove("hidden");
    
    updateHeaderInfo();
    switchTab("Home");
  }, 3300);
}

function switchTab(sheetName) {
  currentSheet = sheetName;
  currentPageIndex = 0;

  // Sidebar Nav Active Highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + sheetName);
  if (activeBtn) activeBtn.classList.add("active");

  const titleText = CONFIG.SHEETS[sheetName] ? `${sheetName} - ${CONFIG.SHEETS[sheetName]}` : sheetName;
  
  if (sheetName === "Home") {
    document.getElementById("page-title").innerText = "Home Dashboard";
  } else if (sheetName === "Report") {
    document.getElementById("page-title").innerText = "ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်";
  } else {
    document.getElementById("page-title").innerText = titleText;
  }

  loadSheetView();
}

async function loadSheetView() {
  const container = document.getElementById("view-container");
  if (!container) return;

  if (currentSheet === "Home") { 
    showPaginationFooter(false);
    await renderHomeDashboard(container); 
    return; 
  }
  if (currentSheet === "Report") {
    showPaginationFooter(false);
    await renderReportPage(container); 
    return;
  }
  if (currentSheet === "System") {
    showPaginationFooter(false);
    renderPlaceholderView(container); 
    return;
  }
  if (currentSheet === "11Inv") { 
    showPaginationFooter(true);
    await renderInventoryView(container); 
    return;
  }

  // Ledger sheets - show pagination
  showPaginationFooter(true);
  await renderLedgerView(container);
}

// ============================================================
// PLACEHOLDER VIEW (System Settings)
// ============================================================
function renderPlaceholderView(container) {
  let title = "Home Dashboard";
  let subtitle = "ဓမ္မအလင်းရောင် တောရရိပ်သာ ငွေစာရင်း စီမံခန့်ခွဲမှုစနစ် မှ ကြိုဆိုပါသည်";
  let icon = "fa-gauge-high";

  if (currentSheet === "System") {
    title = "System Settings";
    subtitle = "စနစ်ထိန်းချုပ်မှု ပြင်ဆင်ချက်များ";
    icon = "fa-gears";
  }

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
// HOME DASHBOARD
// ============================================================
async function renderHomeDashboard(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="space-y-5">
      <!-- Top 4 KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-amber-500/10 text-amber-400"><i class="fa-solid fa-vault text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">ရန်ပုံငွေစုစုပေါင်း</p><h3 id="kpi-home-fund" class="text-base font-extrabold text-amber-300 mt-1">...</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-sky-500/10 text-sky-400"><i class="fa-solid fa-building-columns text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">ဘဏ်ရှိငွေစုစုပေါင်း</p><h3 id="kpi-home-bank" class="text-base font-extrabold text-sky-300 mt-1">...</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i class="fa-solid fa-sack-dollar text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">ငွေသားစုစုပေါင်း</p><h3 id="kpi-home-cash" class="text-base font-extrabold text-emerald-300 mt-1">...</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-rose-500/10 text-rose-400"><i class="fa-solid fa-list-check text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စာကြောင်းရေ စုစုပေါင်း</p><h3 id="kpi-home-count" class="text-base font-extrabold text-amber-100 mt-1">...</h3></div>
        </div>
      </div>

      <!-- Two Equal-Height Boxes -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <!-- Mindfulness Quote Box -->
        <div class="h-full flex flex-col justify-center bg-gradient-to-br from-[#1c1510] to-[#100c09] border border-amber-600/25 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          <div class="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <i class="fa-solid fa-dharmachakra text-amber-500/20 text-6xl absolute bottom-4 right-5"></i>
          <div class="relative space-y-2.5 text-center">
            <p class="text-[13px] leading-relaxed text-amber-100/90 font-medium">
              In every sight, <span class="text-amber-400/70 text-[11px]">ဘာပဲမြင်မြင်</span> ...<br>
              In every sound, <span class="text-amber-400/70 text-[11px]">ဘာပဲကြားကြား</span> ...<br>
              In every smell, <span class="text-amber-400/70 text-[11px]">ဘယ်လို အနံ့ပဲရရ</span> ...<br>
              In every taste, <span class="text-amber-400/70 text-[11px]">ဘာပဲစားစား</span> ...<br>
              In every touch, <span class="text-amber-400/70 text-[11px]">ဘာနဲ့ပဲ ထိတွေ့ရပါစေ</span> ...<br>
              In every thought, <span class="text-amber-400/70 text-[11px]">တွေးတွေး</span> ...
            </p>
            <p class="text-gold-gradient text-lg font-black tracking-wide pt-2">— stay mindful —</p>
            <p class="text-[12px] text-amber-200/60 italic">အမြဲသတိ ထားပါလေ ...</p>
            <div class="pt-3 mt-3 border-t border-amber-700/20">
              <p class="text-[11px] text-amber-400/80 italic">"Appamādena sampādetha"</p>
              <p class="text-[10px] text-amber-500/50 uppercase tracking-widest mt-1">— The Buddha</p>
            </div>
          </div>
        </div>

        <!-- Bank Summary Table Box -->
        <div class="h-full flex flex-col bg-[#14110d] border border-amber-900/30 rounded-2xl shadow-2xl overflow-hidden">
          <div class="px-5 py-3.5 border-b border-amber-900/30 bg-[#1a1410] shrink-0">
            <h3 class="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <i class="fa-solid fa-building-columns text-amber-400"></i> ရိပ်သာ ရန်ပုံငွေစာရင်း အကျဉ်းချုပ်
            </h3>
          </div>
          <div id="home-bank-table" class="flex-1 overflow-auto">
            <div class="p-8 text-center text-amber-500/50 text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const applyData = (data) => {
    const cards = data.cards || [];
    setText("kpi-home-fund", formatNum(cards[0]) + " MMK");
    setText("kpi-home-bank", formatNum(cards[1]) + " MMK");
    setText("kpi-home-cash", formatNum(cards[2]) + " MMK");
    setText("kpi-home-count", formatNum(cards[3]));
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

  let html = `<table class="w-full text-left border-collapse text-[11px]"><thead><tr>`;
  header.forEach((h, i) => {
    html += `<th class="px-3 py-2.5 sticky top-0 bg-[#1a1410] text-amber-400/90 font-bold uppercase text-[9.5px] tracking-wide ${i >= 2 ? 'text-right' : ''}">${h}</th>`;
  });
  html += `</tr></thead><tbody>`;
  body.forEach((row) => {
    html += `<tr class="hover:bg-amber-500/5">`;
    row.forEach((cell, i) => {
      html += `<td class="px-3 py-2 ${i >= 2 ? 'text-right font-mono text-amber-200' : 'text-amber-100/80'}">${cell}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

// ============================================================
// REPORT PAGE - Enhanced with styling
// ============================================================
async function renderReportPage(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-[#14110d] border border-amber-900/30 rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-amber-900/30 bg-[#1a1410]">
          <h2 class="text-sm font-black text-amber-300 uppercase tracking-wider">
            <i class="fa-solid fa-chart-line text-amber-400 mr-2"></i>
            ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်
          </h2>
        </div>
        
        <div id="report-content" class="overflow-x-auto">
          <div class="p-8 text-center text-amber-500/50 text-xs">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i> အစီရင်ခံစာ ပြင်ဆင်နေပါသည်...
          </div>
        </div>
      </div>

      <div class="text-[11px] text-amber-500/60 italic text-center border-t border-amber-900/20 pt-4">
        <i class="fa-solid fa-info-circle mr-2"></i>
        ရိပ်သာ အထွေထွေရန်ပုံငွေ ၏ အသေးစိတ် စာရင်း အကျဉ်းချုပ် ဖြစ်ပါသည်။
      </div>
    </div>
  `;

  try {
    // Simulate fetching report data (in production, this would come from the backend)
    const reportData = await generateReportData();
    renderReportTable(reportData);
  } catch (err) {
    console.error("Report load error:", err);
    document.getElementById("report-content").innerHTML = `
      <div class="p-8 text-center text-rose-400 text-xs font-bold">
        အစီရင်ခံစာ ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။
      </div>
    `;
  }
}

async function generateReportData() {
  // This simulates the report data structure
  // In production, fetch from backend: A1:P15 range
  return {
    title: "ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်",
    rows: [
      { date: "01-01-2026", type: "ဝင်ငွေ", category: "စာရင်းဖွင့်", amount: 50000, balance: 50000 },
      { date: "02-01-2026", type: "ထွက်ငွေ", category: "ဘဏ်ထုတ်", amount: 10000, balance: 40000 },
      { date: "03-01-2026", type: "ဝင်ငွေ", category: "အလှူ", amount: 75000, balance: 115000 },
      { date: "04-01-2026", type: "ထွက်ငွေ", category: "ကုန်ကျစရိတ်", amount: 20000, balance: 95000 },
      { date: "05-01-2026", type: "ဝင်ငွေ", category: "အလှူ", amount: 100000, balance: 195000 }
    ],
    totalIncome: 225000,
    totalExpense: 30000,
    totalBalance: 195000
  };
}

function renderReportTable(data) {
  const content = document.getElementById("report-content");
  if (!content) return;

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-[#1a1410] border-b-2 border-amber-700/50">
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide">စဉ်</th>
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide">ရက်စွဲ</th>
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide">အမျိုးအစား</th>
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide">ခေါင်းစဉ်ခွဲ</th>
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide text-right">ငွေပမာဏ</th>
            <th class="px-4 py-3 text-xs font-black text-amber-300 uppercase tracking-wide text-right">လက်ကျန်</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.rows.forEach((row, idx) => {
    html += `
      <tr class="border-b border-amber-900/10 hover:bg-amber-500/5">
        <td class="px-4 py-2.5 text-xs text-amber-100/80">${idx + 1}</td>
        <td class="px-4 py-2.5 text-xs text-amber-100/80 font-mono">${row.date}</td>
        <td class="px-4 py-2.5 text-xs text-amber-100/80">${row.type}</td>
        <td class="px-4 py-2.5 text-xs text-amber-100/80">${row.category}</td>
        <td class="px-4 py-2.5 text-xs text-right font-mono text-amber-200">${formatNum(row.amount)}</td>
        <td class="px-4 py-2.5 text-xs text-right font-mono text-amber-300">${formatNum(row.balance)}</td>
      </tr>
    `;
  });

  // Total Income Row
  html += `
    <tr class="total-row bg-amber-500/15 border-y-2 border-amber-700/40 font-bold">
      <td colspan="4" class="px-4 py-3 text-xs text-amber-300 uppercase tracking-wide">စုစုပေါင်း ဝင်ငွေ</td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-300">${formatNum(data.totalIncome)}</td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-300"></td>
    </tr>
  `;

  // Total Expense Row
  html += `
    <tr class="total-row bg-amber-500/15 border-b-2 border-amber-700/40 font-bold">
      <td colspan="4" class="px-4 py-3 text-xs text-amber-300 uppercase tracking-wide">စုစုပေါင်း ထွက်ငွေ</td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-300">${formatNum(data.totalExpense)}</td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-300"></td>
    </tr>
  `;

  // Total Balance Row
  html += `
    <tr class="total-row bg-amber-600/20 border-y-2 border-amber-600/50 font-bold">
      <td colspan="4" class="px-4 py-3 text-xs text-amber-200 uppercase tracking-wide font-extrabold">စုစုပေါင်း လက်ကျန်</td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-200"></td>
      <td class="px-4 py-3 text-xs text-right font-mono text-amber-200 font-extrabold">${formatNum(data.totalBalance)}</td>
    </tr>
  `;

  html += `</tbody></table></div>`;
  content.innerHTML = html;
}

// ============================================================
// LEDGER VIEW (with pagination)
// ============================================================
async function renderLedgerView(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <button onclick="openEntryModal()" class="px-4 py-2.5 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-amber-950 font-black rounded-lg text-xs shadow-lg transition-all flex items-center gap-2">
          <i class="fa-solid fa-plus"></i> အသစ် ထည့်သွင်းရန်
        </button>
      </div>

      <div id="ledger-table-container" class="bg-[#14110d] border border-amber-900/30 rounded-2xl overflow-hidden shadow-2xl">
        <div class="p-8 text-center text-amber-500/50 text-xs">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...
        </div>
      </div>
    </div>
  `;

  try {
    const data = await fetchSheetData(currentSheet);
    if (data && data.length > 0) {
      rawData = data;
      updatePaginationInfo();
    }
    if (currentSheet === requestedSheet) {
      renderLedgerTable(data || []);
    }
  } catch (err) {
    console.error("Ledger load error:", err);
    const container2 = document.getElementById("ledger-table-container");
    if (container2) container2.innerHTML = `<div class="p-8 text-center text-rose-400 text-xs font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</div>`;
  }
}

function renderLedgerTable(data) {
  const container = document.getElementById("ledger-table-container");
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-amber-500/50 text-xs">စာရင်း မရှိသေးပါ။</div>`;
    return;
  }

  const auth = getAuthUser();
  const pageStart = currentPageIndex;
  const pageEnd = Math.min(pageStart + pageSize, data.length);
  const pageData = data.slice(pageStart, pageEnd);

  let html = `<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-[10px]"><thead><tr class="bg-[#1a1410] border-b border-amber-700/40">`;
  
  // Headers - simplified for space
  const headers = ["စဉ်", "ရက်စွဲ", "ခေါင်းစဉ်", "ခွဲ", "ဘောင်ချာ", "ငွေပမာဏ", "လက်ခံ", "ဝင်", "ထွက်", "လက်ကျန်", "လနှစ်", "စာအုပ်", ""];
  headers.forEach((h) => {
    html += `<th class="px-2.5 py-2 font-bold text-amber-400/90 uppercase tracking-wide ${['ဝင်', 'ထွက်', 'လက်ကျန်', 'ငွေပမာဏ'].includes(h) ? 'text-right' : ''}">${h}</th>`;
  });
  
  html += `</tr></thead><tbody>`;

  pageData.forEach((row, idx) => {
    const isLocked = !canEditRecord(row[1]);
    const lockClass = isLocked ? 'opacity-60' : '';
    html += `<tr class="${lockClass} border-b border-amber-900/10 hover:bg-amber-500/5">`;
    
    row.forEach((cell, i) => {
      const isNumeric = [6, 7, 8, 9].includes(i);
      const isDate = [1, 10].includes(i);
      html += `<td class="px-2.5 py-2 text-amber-100/80 ${isNumeric ? 'text-right font-mono text-amber-200' : ''} ${isDate ? 'font-mono' : ''}">${cell}</td>`;
    });

    html += `<td class="px-2.5 py-2 text-right sticky right-0 bg-[#14100c] z-10">
      <button onclick="editEntry('${row[12]}', '${currentSheet}')" class="text-amber-500 hover:text-amber-300 transition text-xs" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
        <i class="fa-solid fa-edit"></i>
      </button>
      <button onclick="deleteEntry('${row[12]}', '${currentSheet}')" class="text-rose-500 hover:text-rose-300 transition text-xs ml-1" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
        <i class="fa-solid fa-trash"></i>
      </button>
    </td></tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ============================================================
// INVENTORY VIEW (with pagination)
// ============================================================
async function renderInventoryView(container) {
  const requestedSheet = currentSheet;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <button onclick="openInvModal()" class="px-4 py-2.5 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-amber-950 font-black rounded-lg text-xs shadow-lg transition-all flex items-center gap-2">
          <i class="fa-solid fa-plus"></i> ပစ္စည်းအသစ် ထည့်သွင်းရန်
        </button>
      </div>

      <div id="inv-table-container" class="bg-[#14110d] border border-amber-900/30 rounded-2xl overflow-hidden shadow-2xl">
        <div class="p-8 text-center text-amber-500/50 text-xs">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...
        </div>
      </div>
    </div>
  `;

  try {
    const data = await fetchSheetData(currentSheet);
    if (data && data.length > 0) {
      rawData = data;
      updatePaginationInfo();
    }
    if (currentSheet === requestedSheet) {
      renderInvTable(data || []);
    }
  } catch (err) {
    console.error("Inventory load error:", err);
    const container2 = document.getElementById("inv-table-container");
    if (container2) container2.innerHTML = `<div class="p-8 text-center text-rose-400 text-xs font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</div>`;
  }
}

function renderInvTable(data) {
  const container = document.getElementById("inv-table-container");
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-amber-500/50 text-xs">ပစ္စည်းစာရင်း မရှိသေးပါ။</div>`;
    return;
  }

  const pageStart = currentPageIndex;
  const pageEnd = Math.min(pageStart + pageSize, data.length);
  const pageData = data.slice(pageStart, pageEnd);

  let html = `<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-[10px]"><thead><tr class="bg-[#1a1410] border-b border-amber-700/40">`;
  
  const headers = ["စဉ်", "ရက်စွဲ", "နေရာ", "အမျိုးအစား", "ယူနစ်", "အရေအတွက်", "အကြောင်းအရာ", "မှတ်ချက်", "လနှစ်", "", ""];
  headers.forEach((h) => {
    html += `<th class="px-2.5 py-2 font-bold text-amber-400/90 uppercase tracking-wide ${h === 'အရေအတွက်' ? 'text-right' : ''}">${h}</th>`;
  });
  
  html += `</tr></thead><tbody>`;

  pageData.forEach((row) => {
    html += `<tr class="border-b border-amber-900/10 hover:bg-amber-500/5">`;
    row.forEach((cell, i) => {
      const isNumeric = i === 5;
      html += `<td class="px-2.5 py-2 text-amber-100/80 ${isNumeric ? 'text-right font-mono text-amber-200' : ''}">${cell}</td>`;
    });

    html += `<td class="px-2.5 py-2 text-right sticky right-0 bg-[#14100c] z-10">
      <button onclick="editInvEntry('${row[10]}', '${currentSheet}')" class="text-amber-500 hover:text-amber-300 transition text-xs">
        <i class="fa-solid fa-edit"></i>
      </button>
      <button onclick="deleteInvEntry('${row[10]}', '${currentSheet}')" class="text-rose-500 hover:text-rose-300 transition text-xs ml-1">
        <i class="fa-solid fa-trash"></i>
      </button>
    </td></tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ============================================================
// MODAL FUNCTIONS (entry)
// ============================================================
function openEntryModal(uniqueId = null, sheetName = null) {
  const modal = document.getElementById("entry-modal");
  if (!modal) return;

  const sheet = sheetName || currentSheet;
  document.getElementById("modal-form-title").innerText = uniqueId ? "စာရင်း ပြင်ဆင်ရန်" : "စာရင်းအသစ် ထည့်သွင်းရန်";
  document.getElementById("entry-uniqueId").value = uniqueId || "";

  // Reset form
  document.getElementById("entry-form").reset();
  document.getElementById("entry-date").valueAsDate = new Date();

  // Populate subcategory based on sheet
  populateSubcategories(sheet);

  if (uniqueId) {
    const row = rawData.find(r => r[12] === uniqueId);
    if (row) {
      document.getElementById("entry-date").value = row[1];
      document.getElementById("entry-type").value = row[2];
      document.getElementById("entry-subcategory").value = row[3];
      document.getElementById("entry-voucher").value = row[4];
      document.getElementById("entry-amount").value = row[6];
      document.getElementById("entry-receiver").value = row[7];
      document.getElementById("entry-description").value = row[11];
      onTypeChange();
    }
  }

  modal.classList.remove("hidden");
}

function closeEntryModal() {
  document.getElementById("entry-modal").classList.add("hidden");
}

async function saveEntryForm(e) {
  e.preventDefault();
  const uniqueId = document.getElementById("entry-uniqueId").value;
  const date = document.getElementById("entry-date").value;
  const type = document.getElementById("entry-type").value;
  const subcat = document.getElementById("entry-subcategory").value;
  const voucher = document.getElementById("entry-voucher").value;
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  const desc = document.getElementById("entry-description").value;

  const schema = getSchema(currentSheet);
  const row = new Array(13).fill("");
  row[0] = ""; // Will be auto-indexed
  row[1] = date;
  row[2] = type;
  row[3] = subcat;
  row[4] = voucher;
  row[5] = amount;
  row[6] = receiver;
  row[7] = amount;
  row[8] = 0;
  row[9] = 0;
  row[10] = "Aug-26"; // Auto month-year
  row[11] = currentSheet;
  row[12] = uniqueId || "TMP-" + new Date().getTime();

  const loading = document.getElementById("loading-overlay");
  if (loading) loading.classList.remove("hidden");

  try {
    const result = uniqueId 
      ? await updateSheetEntry(currentSheet, uniqueId, row)
      : await createSheetEntry(currentSheet, row);

    if (result.status === "success") {
      closeEntryModal();
      loadSheetView();
    } else {
      alert("Error: " + result.message);
    }
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

function editEntry(uniqueId, sheetName) {
  openEntryModal(uniqueId, sheetName);
}

async function deleteEntry(uniqueId, sheetName) {
  if (confirm("ဒီစာရင်းကို ဖျက်မလား?")) {
    const loading = document.getElementById("loading-overlay");
    if (loading) loading.classList.remove("hidden");

    try {
      await deleteSheetEntry(sheetName, uniqueId);
      loadSheetView();
    } finally {
      if (loading) loading.classList.add("hidden");
    }
  }
}

function onTypeChange() {
  const type = document.getElementById("entry-type").value;
  const sheet = currentSheet;
  const subCategories = CONFIG.SUB_CATEGORIES;

  let options = [];
  if (sheet === "1CB" || sheet === "2CB" || sheet === "3CB") {
    options = subCategories.BankGroup[type] || [];
  } else if (sheet === "4GB") {
    options = subCategories["4GB"][type] || [];
  } else if (sheet === "5FB") {
    options = subCategories["5FB"][type] || [];
  } else if (sheet === "6HB") {
    options = subCategories["6HB"][type] || [];
  } else {
    options = subCategories.DefaultLedger[type] || [];
  }

  const select = document.getElementById("entry-subcategory");
  select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function populateSubcategories(sheet) {
  const subCategories = CONFIG.SUB_CATEGORIES;
  let options = [];
  if (sheet === "1CB" || sheet === "2CB" || sheet === "3CB") {
    options = subCategories.BankGroup["ဝင်ငွေ"] || [];
  } else if (sheet === "4GB") {
    options = subCategories["4GB"]["ဝင်ငွေ"] || [];
  } else if (sheet === "5FB") {
    options = subCategories["5FB"]["ဝင်ငွေ"] || [];
  } else if (sheet === "6HB") {
    options = subCategories["6HB"]["ဝင်ငွေ"] || [];
  } else {
    options = subCategories.DefaultLedger["ဝင်ငွေ"] || [];
  }

  const select = document.getElementById("entry-subcategory");
  select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

// ============================================================
// MODAL FUNCTIONS (inventory)
// ============================================================
function openInvModal(uniqueId = null) {
  const modal = document.getElementById("inv-entry-modal");
  if (!modal) return;

  document.getElementById("inv-modal-title").innerText = uniqueId ? "ပစ္စည်း ပြင်ဆင်ရန်" : "ပစ္စည်း အသစ် ထည့်သွင်းရန်";
  document.getElementById("inv-uniqueId").value = uniqueId || "";

  // Populate dropdowns
  const locSelect = document.getElementById("inv-location");
  locSelect.innerHTML = CONFIG.INVENTORY.LOCATIONS.map(loc => `<option value="${loc}">${loc}</option>`).join("");

  const catSelect = document.getElementById("inv-category");
  catSelect.innerHTML = CONFIG.INVENTORY.CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join("");

  const unitSelect = document.getElementById("inv-unit");
  unitSelect.innerHTML = CONFIG.INVENTORY.UNITS.map(unit => `<option value="${unit}">${unit}</option>`).join("");

  document.getElementById("inv-entry-form").reset();
  document.getElementById("inv-date").valueAsDate = new Date();

  if (uniqueId) {
    const row = rawData.find(r => r[10] === uniqueId);
    if (row) {
      document.getElementById("inv-date").value = row[1];
      document.getElementById("inv-location").value = row[2];
      document.getElementById("inv-category").value = row[3];
      document.getElementById("inv-unit").value = row[4];
      document.getElementById("inv-qty").value = row[5];
      document.getElementById("inv-desc").value = row[6];
      document.getElementById("inv-note").value = row[7];
    }
  }

  modal.classList.remove("hidden");
}

function closeInvModal() {
  document.getElementById("inv-entry-modal").classList.add("hidden");
}

async function saveInvEntryForm(e) {
  e.preventDefault();
  const uniqueId = document.getElementById("inv-uniqueId").value;
  const date = document.getElementById("inv-date").value;
  const loc = document.getElementById("inv-location").value;
  const cat = document.getElementById("inv-category").value;
  const unit = document.getElementById("inv-unit").value;
  const qty = parseInt(document.getElementById("inv-qty").value) || 0;
  const desc = document.getElementById("inv-desc").value;
  const note = document.getElementById("inv-note").value;

  const row = new Array(11).fill("");
  row[0] = "";
  row[1] = date;
  row[2] = loc;
  row[3] = cat;
  row[4] = unit;
  row[5] = qty;
  row[6] = desc;
  row[7] = note;
  row[8] = "Aug-26";
  row[9] = "";
  row[10] = uniqueId || "INV-" + new Date().getTime();

  const loading = document.getElementById("loading-overlay");
  if (loading) loading.classList.remove("hidden");

  try {
    const result = uniqueId
      ? await updateSheetEntry("11Inv", uniqueId, row)
      : await createSheetEntry("11Inv", row);

    if (result.status === "success") {
      closeInvModal();
      loadSheetView();
    } else {
      alert("Error: " + result.message);
    }
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

function editInvEntry(uniqueId, sheetName) {
  openInvModal(uniqueId);
}

async function deleteInvEntry(uniqueId, sheetName) {
  if (confirm("ဒီပစ္စည်းကို ဖျက်မလား?")) {
    const loading = document.getElementById("loading-overlay");
    if (loading) loading.classList.remove("hidden");

    try {
      await deleteSheetEntry(sheetName, uniqueId);
      loadSheetView();
    } finally {
      if (loading) loading.classList.add("hidden");
    }
  }
}

// Auto initialize on load
document.addEventListener("DOMContentLoaded", initApp);
