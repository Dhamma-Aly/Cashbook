// ===================================================================
// js/report-system.js - Annual & Summary Expense Report Renderer (v4.1)
// Features: Calm Eye-Comfort Palette, Dynamic Future-Proof Years,
// Anti-Jitter Hash, XSS Safe, Race-Condition Guard & Versioned Sync
// ===================================================================

const REPORT_CACHE_PREFIX = 'sasana_report_cache_';
let currentReportMode = 'Annual'; // 'Annual' or 'Summary'
let currentReportYear = String(new Date().getFullYear());
let currentReportBook = '1General Book';
let rawReportData = null;
let lastRenderedReportHash = '';
let activeReportFetchToken = 0;

function escapeReportHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toEngDigitsReport(str) {
  if (typeof window.toEnglishDigits === 'function') return window.toEnglishDigits(str);
  if (str === null || str === undefined) return '';
  const mm = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
  return String(str).replace(/[၀-၉]/g, ch => mm.indexOf(ch));
}

function notifyReport(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
}

function syncReportModeButtons() {
  const btnAnnual = document.getElementById("btn-report-annual");
  const btnSummary = document.getElementById("btn-report-summary");

  if (currentReportMode === 'Annual') {
    if (btnAnnual) {
      btnAnnual.style.backgroundColor = "#1e293b";
      btnAnnual.style.color = "#fbbf24";
      btnAnnual.style.border = "1px solid rgba(245, 158, 11, 0.3)";
    }
    if (btnSummary) {
      btnSummary.style.backgroundColor = "transparent";
      btnSummary.style.color = "#94a3b8";
      btnSummary.style.border = "none";
    }
  } else {
    if (btnSummary) {
      btnSummary.style.backgroundColor = "#1e293b";
      btnSummary.style.color = "#fbbf24";
      btnSummary.style.border = "1px solid rgba(245, 158, 11, 0.3)";
    }
    if (btnAnnual) {
      btnAnnual.style.backgroundColor = "transparent";
      btnAnnual.style.color = "#94a3b8";
      btnAnnual.style.border = "none";
    }
  }
}

function populateReportYears() {
  const yearSelect = document.getElementById("report-year-select");
  if (!yearSelect || yearSelect.dataset.populated === '1') return;

  const thisYear = new Date().getFullYear();
  const minYear = 2023;
  const maxYear = Math.max(thisYear + 1, 2026);
  const years = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  yearSelect.innerHTML = years
    .map(y => `<option value="${y}" ${String(y) === String(currentReportYear) ? 'selected' : ''}>${y}</option>`)
    .join('');
  yearSelect.value = String(currentReportYear);
  yearSelect.dataset.populated = '1';
}

// -------------------------------------------------------------------
// 1. Core View Renderer
// -------------------------------------------------------------------
window.renderReportView = async function (isSilent = false) {
  const fetchToken = ++activeReportFetchToken;
  const container = document.getElementById("view-container");

  if (container && !document.getElementById("report-matrix-table")) {
    try {
      const fetchFn = window.fetchTemplate || (async (p) => { const r = await fetch(p); return await r.text(); });
      container.innerHTML = await fetchFn("view/report-system.html");
    } catch (e) {
      console.warn("Could not fetch view/report-system.html:", e);
    }
  }

  populateReportYears();
  syncReportModeButtons();

  const yearSelect = document.getElementById("report-year-select");
  if (yearSelect && yearSelect.value) {
    currentReportYear = yearSelect.value;
  }

  const cacheKey = `${REPORT_CACHE_PREFIX}${currentReportBook}_${currentReportYear}`;

  if (!isSilent) {
    rawReportData = null;
    lastRenderedReportHash = '';
    try {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && cached.incomeRows) {
          rawReportData = cached;
          applyReportFilters();
        }
      }
    } catch (_) {}
  }

  const shouldShowOverlay = !isSilent && !rawReportData;
  if (shouldShowOverlay && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const res = await window.fetchReportDataAPI(currentReportYear, currentReportBook);
    if (fetchToken !== activeReportFetchToken) return;

    if (res && res.success && res.data) {
      rawReportData = res.data;
      try { localStorage.setItem(cacheKey, JSON.stringify(res.data)); } catch (_) {}
      applyReportFilters();
    } else if (!isSilent && !rawReportData) {
      applyReportFilters();
    }
  } catch (err) {
    if (fetchToken !== activeReportFetchToken) return;
    if (!isSilent) console.error("Report Fetch Error from D1:", err);
  } finally {
    if (shouldShowOverlay && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }
};

window.loadReportView = window.renderReportView;

// -------------------------------------------------------------------
// 2. Mode & Year Switchers
// -------------------------------------------------------------------
window.switchReportMode = function (mode) {
  currentReportMode = mode;
  syncReportModeButtons();
  lastRenderedReportHash = '';
  applyReportFilters();
};

window.onReportYearChange = function (year) {
  currentReportYear = String(year || new Date().getFullYear());
  lastRenderedReportHash = '';
  window.renderReportView(false);
};

window.onReportSearchInput = function () {
  lastRenderedReportHash = '';
  applyReportFilters();
};

// -------------------------------------------------------------------
// 3. Filter & Render Matrix Table
// -------------------------------------------------------------------
function applyReportFilters() {
  const searchInput = document.getElementById("report-search-input");
  const rawQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const query = toEngDigitsReport(rawQuery);

  const renderSig = `${currentReportMode}|${currentReportYear}|${rawQuery}|${JSON.stringify(rawReportData || {})}`;
  if (renderSig === lastRenderedReportHash) return;
  lastRenderedReportHash = renderSig;

  renderReportTableHeader();
  renderReportTableBody(rawQuery, query);
}

function renderReportTableHeader() {
  const thead = document.getElementById("report-table-header");
  if (!thead) return;

  const shortYear = String(currentReportYear).slice(-2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let headerHtml = `
    <tr class="uppercase font-bold text-xs">
      <th class="w-24 py-3.5 px-3">အမျိုးအစား</th>
      <th class="min-w-[160px] py-3.5 px-3">ခေါင်းစဉ်</th>
      <th class="min-w-[180px] py-3.5 px-3">ခေါင်းစဉ်ခွဲ</th>`;

  months.forEach(m => {
    const colName = (currentReportMode === 'Annual') ? `${m}-${shortYear}` : m;
    headerHtml += `<th class="text-right w-24 py-3.5 px-2">${colName}</th>`;
  });

  headerHtml += `<th class="text-right w-28 py-3.5 px-3 font-bold" style="color:#cbd5e1;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.04);">စုစုပေါင်း</th></tr>`;
  thead.innerHTML = headerHtml;
}

function renderReportTableBody(rawQuery, engQuery) {
  const tbody = document.getElementById("report-table-body");
  if (!tbody) return;

  if (!rawReportData) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-12 font-bold" style="color:#64748b;"><i class="fa-solid fa-folder-open mr-2"></i> အစီရင်ခံစာ ဒေတာ မရှိသေးပါ။</td></tr>`;
    return;
  }

  const {
    incomeRows, incomeTotals, grandIncomeTotal,
    expenseRows, expenseTotals, grandExpenseTotal,
    balanceTotals, grandNetBalance
  } = rawReportData;

  const fmt = (v) => (v !== 0 && v !== null && v !== undefined) ? Number(v).toLocaleString() : '';
  const fmtBal = (v, isGrand = false) => {
    const n = Number(v || 0);
    if (n === 0) return `<span style="color:#475569;">-</span>`;
    if (n < 0) return `<span style="color:#fda4af;">${n.toLocaleString()}</span>`;
    return `<span style="color:${isGrand ? '#fde68a' : '#f8fafc'};">${n.toLocaleString()}</span>`;
  };

  const rowMatches = (r) => {
    if (!rawQuery) return true;
    return [r.type, r.category, r.subcategory].some(v => {
      const s = (v || '').toLowerCase();
      return s.includes(rawQuery) || s.includes(engQuery);
    });
  };

  let html = '';

  // A. ဝင်ငွေ ကဏ္ဍ
  const filteredIncome = (incomeRows || []).filter(rowMatches);
  filteredIncome.forEach(r => {
    html += `
      <tr class="transition text-xs">
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="inline-flex items-center gap-2 font-medium" style="color:#cbd5e1;">
            <span style="width:7px;height:7px;border-radius:9999px;background-color:#34d399;display:inline-block;flex-shrink:0;"></span>
            <span>${escapeReportHtml(r.type || 'ဝင်ငွေ')}</span>
          </span>
        </td>
        <td class="py-2.5 px-3 font-medium" style="color:#e2e8f0;">${escapeReportHtml(r.category || '-')}</td>
        <td class="py-2.5 px-3" style="color:#94a3b8;">${escapeReportHtml(r.subcategory || '-')}</td>`;

    (r.months || []).forEach(mVal => {
      html += `<td class="text-right py-2.5 px-2 font-mono" style="color:#6ee7b7;">${fmt(mVal)}</td>`;
    });

    html += `<td class="text-right py-2.5 px-3 font-mono font-bold" style="color:#a7f3d0;border-left:1px solid rgba(148,163,184,0.12);background:rgba(16,185,129,0.04);">${fmt(r.total)}</td></tr>`;
  });

  // ဝင်ငွေပေါင်း စာကြောင်း
  html += `
    <tr style="background:#141c28;border-top:1px solid rgba(148,163,184,0.2);border-bottom:1px solid rgba(148,163,184,0.2);">
      <td colspan="3" class="py-3 px-4 font-bold text-xs uppercase tracking-wider" style="color:#a7f3d0;">ဝင်ငွေပေါင်း</td>`;
  (incomeTotals || []).forEach(amt => {
    html += `<td class="text-right py-3 px-2 font-mono font-bold" style="color:#6ee7b7;">${fmt(amt)}</td>`;
  });
  html += `<td class="text-right py-3 px-3 font-mono font-extrabold" style="color:#a7f3d0;border-left:1px solid rgba(148,163,184,0.16);background:rgba(16,185,129,0.08);">${fmt(grandIncomeTotal)}</td></tr>`;

  // B. ထွက်ငွေ ကဏ္ဍ
  const filteredExpense = (expenseRows || []).filter(rowMatches);
  filteredExpense.forEach(r => {
    html += `
      <tr class="transition text-xs">
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="inline-flex items-center gap-2 font-medium" style="color:#cbd5e1;">
            <span style="width:7px;height:7px;border-radius:9999px;background-color:#fb7185;display:inline-block;flex-shrink:0;"></span>
            <span>${escapeReportHtml(r.type || 'ထွက်ငွေ')}</span>
          </span>
        </td>
        <td class="py-2.5 px-3 font-medium" style="color:#e2e8f0;">${escapeReportHtml(r.category || '-')}</td>
        <td class="py-2.5 px-3" style="color:#94a3b8;">${escapeReportHtml(r.subcategory || '-')}</td>`;

    (r.months || []).forEach(mVal => {
      html += `<td class="text-right py-2.5 px-2 font-mono" style="color:#fda4af;">${fmt(mVal)}</td>`;
    });

    html += `<td class="text-right py-2.5 px-3 font-mono font-bold" style="color:#fecdd3;border-left:1px solid rgba(148,163,184,0.12);background:rgba(244,63,94,0.04);">${fmt(r.total)}</td></tr>`;
  });

  // ထွက်ငွေပေါင်း စာကြောင်း
  html += `
    <tr style="background:#141c28;border-top:1px solid rgba(148,163,184,0.2);border-bottom:1px solid rgba(148,163,184,0.2);">
      <td colspan="3" class="py-3 px-4 font-bold text-xs uppercase tracking-wider" style="color:#fecdd3;">ထွက်ငွေပေါင်း</td>`;
  (expenseTotals || []).forEach(amt => {
    html += `<td class="text-right py-3 px-2 font-mono font-bold" style="color:#fda4af;">${fmt(amt)}</td>`;
  });
  html += `<td class="text-right py-3 px-3 font-mono font-extrabold" style="color:#fecdd3;border-left:1px solid rgba(148,163,184,0.16);background:rgba(244,63,94,0.08);">${fmt(grandExpenseTotal)}</td></tr>`;

  // C. လက်ကျန် စာကြောင်း
  html += `
    <tr style="background:#161e2c;border-top:1px solid rgba(148,163,184,0.25);" class="font-bold text-xs">
      <td colspan="3" class="py-3.5 px-4 font-bold uppercase tracking-wider" style="color:#f8fafc;">လက်ကျန်ငွေ</td>`;
  (balanceTotals || []).forEach(amt => {
    html += `<td class="text-right py-3.5 px-2 font-mono font-bold">${fmtBal(amt, false)}</td>`;
  });
  html += `<td class="text-right py-3.5 px-3 font-mono font-extrabold text-sm" style="border-left:1px solid rgba(148,163,184,0.18);background:rgba(245,158,11,0.06);">${fmtBal(grandNetBalance, true)}</td></tr>`;

  tbody.innerHTML = html;
}

// -------------------------------------------------------------------
// 4. Export Matrix Data to CSV
// -------------------------------------------------------------------
window.exportReportCSV = function () {
  if (!rawReportData) {
    notifyReport("Export လုပ်ရန် ဒေတာ မရှိပါ။", "warning");
    return;
  }

  const {
    incomeRows, incomeTotals, grandIncomeTotal,
    expenseRows, expenseTotals, grandExpenseTotal,
    balanceTotals, grandNetBalance
  } = rawReportData;
  const shortYear = String(currentReportYear).slice(-2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let csv = "\uFEFF";
  const monthHeaders = months.map(m => (currentReportMode === 'Annual') ? `${m}-${shortYear}` : m);
  csv += ["အမျိုးအစား", "ခေါင်းစဉ်", "ခေါင်းစဉ်ခွဲ", ...monthHeaders, "စုစုပေါင်း"].map(v => `"${v}"`).join(",") + "\n";

  const esc = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;

  (incomeRows || []).forEach(r => {
    csv += [esc(r.type), esc(r.category), esc(r.subcategory), ...(r.months || []).map(v => v || 0), r.total || 0].join(",") + "\n";
  });
  csv += [esc("ဝင်ငွေပေါင်း"), "", "", ...(incomeTotals || []).map(v => v || 0), grandIncomeTotal || 0].join(",") + "\n";

  (expenseRows || []).forEach(r => {
    csv += [esc(r.type), esc(r.category), esc(r.subcategory), ...(r.months || []).map(v => v || 0), r.total || 0].join(",") + "\n";
  });
  csv += [esc("ထွက်ငွေပေါင်း"), "", "", ...(expenseTotals || []).map(v => v || 0), grandExpenseTotal || 0].join(",") + "\n";

  csv += [esc("လက်ကျန်ငွေ"), "", "", ...(balanceTotals || []).map(v => v || 0), grandNetBalance || 0].join(",") + "\n";

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentReportBook}_Report_${currentReportMode}_${currentReportYear}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
// === END OF report-system.js ===
