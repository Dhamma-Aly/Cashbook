// ===================================================================
// js/Dashboard.js - Home Dashboard View Renderer
// Renders the object-shaped { kpis, sheetBalances } response from
// GET /api/home-summary (see cashbook-api/handlers-books.js)
// ===================================================================

window.renderDashboardView = async function() {
  const container = document.getElementById("view-container");

  // If view template is not yet loaded into container, fetch and inject it safely
  if (container && !document.getElementById("home-bank-table")) {
    try {
      const fetchFn = window.fetchTemplate || (async (p) => { const r = await fetch(p); return await r.text(); });
      container.innerHTML = await fetchFn("view/Dashboard.html");
    } catch (e) {
      console.warn("Could not fetch view/Dashboard.html:", e);
    }
  }

  const BANK_SHEETS = ['1CB', '2CB', '3CB'];

  const renderHomeData = (raw) => {
    const tableElem = document.getElementById("home-bank-table");
    if (!tableElem) return;

    const kpis = (raw && raw.kpis) || { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 };
    const sheetBalances = (raw && raw.sheetBalances) || {};

    const setKpi = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${(val || 0).toLocaleString()} MMK`;
    };
    setKpi("kpi-home-fund", kpis.totalFund);
    setKpi("kpi-home-bank", kpis.totalBank);
    setKpi("kpi-home-cash", kpis.totalCash);
    
    const countEl = document.getElementById("kpi-home-count");
    if (countEl) countEl.textContent = (kpis.totalCount || 0).toLocaleString();

    const sheetNames = Object.keys(sheetBalances);
    if (sheetNames.length === 0) {
      tableElem.innerHTML = `<div class="p-8 text-center text-amber-500/50 text-sm font-bold"><i class="fa-solid fa-folder-open mr-2"></i> ဒေတာ မရှိသေးပါ။</div>`;
      return;
    }

    // Sort sheets into a stable, meaningful order (Banks first, then Books)
    const titles = (window.CONFIG && window.CONFIG.SHEET_TITLES) || {};
    const knownOrder = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
    sheetNames.sort((a, b) => {
      const ia = knownOrder.indexOf(a);
      const ib = knownOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let tableHtml = `
    <div class="overflow-x-auto rounded-xl border border-amber-900/30 shadow-2xl">
      <table class="table-lg w-full text-left border-collapse min-w-[700px]">
        <thead>
          <tr class="bg-[#1a1410] border-b border-amber-500/40 text-amber-300 text-xs uppercase font-extrabold tracking-wider">
            <th class="w-14 text-center py-4 px-3 text-amber-400">စဉ်</th>
            <th class="min-w-[220px] py-4 px-4 text-amber-200">ဘဏ် / စာအုပ် စာရင်း</th>
            <th class="w-32 text-center py-4 px-4 text-amber-400/80">အမျိုးအစား</th>
            <th class="text-right min-w-[160px] py-4 px-4 text-emerald-400 bg-emerald-950/40 border-x border-emerald-500/20 font-black">လက်ကျန်ငွေ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-amber-900/20 text-xs">`;

    sheetNames.forEach((sheet, idx) => {
      const bal = sheetBalances[sheet] || 0;
      const isBank = BANK_SHEETS.includes(sheet);
      const name = titles[sheet] || sheet;

      tableHtml += `
      <tr class="hover:bg-amber-500/10 transition-all duration-200 group">
        <td class="text-center font-bold text-amber-500/70 py-3.5 px-3 font-mono">${idx + 1}</td>
        <td class="font-bold text-amber-200 group-hover:text-amber-100 py-3.5 px-4">${name}</td>
        <td class="text-center py-3.5 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isBank ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}">${isBank ? 'ဘဏ်' : 'စာအုပ်'}</span>
        </td>
        <td class="text-right font-mono text-emerald-400 font-bold py-3.5 px-4 bg-emerald-950/20 border-x border-emerald-500/10 group-hover:bg-emerald-950/30">${bal.toLocaleString()} MMK</td>
      </tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    tableElem.innerHTML = tableHtml;
  };

  // Safe Data Fetching
  try {
    const fetchFunc = window.fetchHomeSummary || window.fetchHomeSummaryAPI;
    if (typeof fetchFunc === 'function') {
      const data = await fetchFunc();
      renderHomeData(data);
    } else {
      renderHomeData(null);
    }
  } catch (error) {
    console.error("Error fetching home dashboard data:", error);
    renderHomeData(null);
  }
};

// Safety Aliases
window.loadDashboardView = window.renderDashboardView;
window.renderHomeView = window.renderDashboardView;
