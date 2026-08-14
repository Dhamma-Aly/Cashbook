// ===================================================================
// js/report-system.js - Annual & Summary Expense Report Renderer
// ===================================================================

let currentReportMode = 'Annual'; // 'Annual' or 'Summary'
let currentReportYear = new Date().getFullYear().toString(); // Auto Current Year
let rawReportData = null;

// -------------------------------------------------------------------
// 1. Core View Renderer
// -------------------------------------------------------------------
window.renderReportView = async function(isSilent = false) {
  const container = document.getElementById("view-container");

  if (container && !document.getElementById("report-matrix-table")) {
    try {
      const fetchFn = window.fetchTemplate || (async (p) => { const r = await fetch(p); return await r.text(); });
      container.innerHTML = await fetchFn("view/report-system.html");
    } catch (e) {
      console.warn("Could not fetch view/report-system.html:", e);
    }
  }

  // Populate dynamic years in select dropdown
  populateReportYears();

  const yearSelect = document.getElementById("report-year-select");
  if (yearSelect) currentReportYear = yearSelect.value || new Date().getFullYear().toString();

  if (!isSilent && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const res = await window.fetchReportDataAPI("4GB", currentReportYear, currentReportMode);
    if (res && res.success && res.data) {
      rawReportData = res.data;
    } else {
      rawReportData = null;
    }
  } catch (err) {
    console.error("Report Fetch Error:", err);
    rawReportData = null;
  } finally {
    if (!isSilent && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }

  applyReportFilters();
};

window.loadReportView = window.renderReportView;

// Populate Dynamic Year Options in Selector
function populateReportYears() {
  const yearSelect = document.getElementById("report-year-select");
  if (!yearSelect || yearSelect.options.length > 1) return;

  const thisYear = new Date().getFullYear();
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  yearSelect.innerHTML = years.map(y => `<option value="${y}" ${String(y) === String(currentReportYear) ? 'selected' : ''}>${y}</option>`).join('');
}

// -------------------------------------------------------------------
// 2. Mode & Year Switchers
// -------------------------------------------------------------------
window.switchReportMode = function(mode) {
  currentReportMode = mode;

  const btnAnnual = document.getElementById("btn-report-annual");
  const btnSummary = document.getElementById("btn-report-summary");

  if (mode === 'Annual') {
    if (btnAnnual) btnAnnual.className = 'px-4 py-2 rounded-lg font-extrabold text-amber-300 bg-[#1e293b] border border-amber-500/30 transition-all flex items-center gap-2 cursor-pointer shadow-sm';
    if (btnSummary) btnSummary.className = 'px-4 py-2 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-2 cursor-pointer';
  } else {
    if (btnSummary) btnSummary.className = 'px-4 py-2 rounded-lg font-extrabold text-amber-300 bg-[#1e293b] border border-amber-500/30 transition-all flex items-center gap-2 cursor-pointer shadow-sm';
    if (btnAnnual) btnAnnual.className = 'px-4 py-2 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-2 cursor-pointer';
  }

  window.renderReportView(false);
};

window.onReportYearChange = function(year) {
  currentReportYear = year;
  window.renderReportView(false);
};

window.onReportSearchInput = function() {
  applyReportFilters();
};

// -------------------------------------------------------------------
// 3. Filter & Render Matrix Table
// -------------------------------------------------------------------
function applyReportFilters() {
  const searchInput = document.getElementById("report-search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  renderReportTableHeader();
  renderReportTableBody(query);
}

// Render Dynamic Table Header (Jan-26 vs Jan)
function renderReportTableHeader() {
  const thead = document.getElementById("report-table-header");
  if (!thead) return;

  const shortYear = String(currentReportYear).slice(-2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let headerHtml = `
    <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 uppercase font-extrabold">
      <th class="w-20 py-3.5 px-3">Head</th>
      <th class="min-w-[160px] py-3.5 px-3">Category</th>
      <th class="min-w-[180px] py-3.5 px-3">Sub Category</th>`;

  months.forEach(m => {
    const colName = (currentReportMode === 'Annual') ? `${m}-${shortYear}` : m;
    headerHtml += `<th class="text-right w-24 py-3.5 px-2">${colName}</th>`;
  });

  headerHtml += `<th class="text-right w-28 py-3.5 px-3 bg-amber-500/10 text-amber-300 font-black">Total</th></tr>`;
  thead.innerHTML = headerHtml;
}

// Render Matrix Body Rows
function renderReportTableBody(query) {
  const tbody = document.getElementById("report-table-body");
  if (!tbody) return;

  if (!rawReportData) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center py-12 text-amber-500/60 font-bold"><i class="fa-solid fa-folder-open mr-2"></i> အစီရင်ခံစာ ဒေတာ မရှိသေးပါ။</td></tr>`;
    return;
  }

  const { incomeRows, incomeTotals, grandIncomeTotal, expenseRows, expenseTotals, grandExpenseTotal, balanceTotals, grandNetBalance } = rawReportData;

  const fmt = (v) => v ? Number(v).toLocaleString() : '';

  let html = '';

  // A. INCOME SECTION
  let filteredIncome = (incomeRows || []).filter(r => {
    if (!query) return true;
    return [r.type, r.category, r.subcategory].some(v => (v || '').toLowerCase().includes(query));
  });

  if (filteredIncome.length > 0) {
    filteredIncome.forEach(r => {
      html += `
        <tr class="hover:bg-amber-500/5 transition border-b border-amber-900/10 text-xs">
          <td class="py-2.5 px-3 font-bold text-emerald-400 bg-emerald-500/5 border-r border-emerald-500/10">${r.type || 'ဝင်ငွေ'}</td>
          <td class="py-2.5 px-3 font-bold text-amber-200">${r.category || '-'}</td>
          <td class="py-2.5 px-3 font-semibold text-slate-200">${r.subcategory || '-'}</td>`;

      (r.months || []).forEach(mVal => {
        html += `<td class="text-right py-2.5 px-2 font-mono text-emerald-300">${fmt(mVal)}</td>`;
      });

      html += `<td class="text-right py-2.5 px-3 font-mono font-black text-emerald-400 bg-emerald-500/10">${fmt(r.total)}</td></tr>`;
    });
  }

  // Income Total Row
  html += `
    <tr class="bg-emerald-950/40 border-t-2 border-b-2 border-emerald-500/40 font-extrabold text-emerald-300">
      <td colspan="3" class="py-3 px-4 text-emerald-300 font-black text-xs uppercase tracking-wider">ဝင်ငွေပေါင်း</td>`;

  (incomeTotals || []).forEach(amt => {
    html += `<td class="text-right py-3 px-2 font-mono font-black text-emerald-300">${fmt(amt)}</td>`;
  });

  html += `<td class="text-right py-3 px-3 font-mono font-black text-emerald-300 bg-emerald-500/20">${fmt(grandIncomeTotal)}</td></tr>`;

  // B. EXPENSE SECTION
  let filteredExpense = (expenseRows || []).filter(r => {
    if (!query) return true;
    return [r.type, r.category, r.subcategory].some(v => (v || '').toLowerCase().includes(query));
  });

  if (filteredExpense.length > 0) {
    filteredExpense.forEach(r => {
      html += `
        <tr class="hover:bg-amber-500/5 transition border-b border-amber-900/10 text-xs">
          <td class="py-2.5 px-3 font-bold text-rose-400 bg-rose-500/5 border-r border-rose-500/10">${r.type || 'ထွက်ငွေ'}</td>
          <td class="py-2.5 px-3 font-bold text-amber-200">${r.category || '-'}</td>
          <td class="py-2.5 px-3 font-semibold text-slate-200">${r.subcategory || '-'}</td>`;

      (r.months || []).forEach(mVal => {
        html += `<td class="text-right py-2.5 px-2 font-mono text-rose-300">${fmt(mVal)}</td>`;
      });

      html += `<td class="text-right py-2.5 px-3 font-mono font-black text-rose-400 bg-rose-500/10">${fmt(r.total)}</td></tr>`;
    });
  }

  // Expense Total Row
  html += `
    <tr class="bg-rose-950/40 border-t-2 border-b-2 border-rose-500/40 font-extrabold text-rose-300">
      <td colspan="3" class="py-3 px-4 text-rose-300 font-black text-xs uppercase tracking-wider">ထွက်ငွေပေါင်း</td>`;

  (expenseTotals || []).forEach(amt => {
    html += `<td class="text-right py-3 px-2 font-mono font-black text-rose-300">${fmt(amt)}</td>`;
  });

  html += `<td class="text-right py-3 px-3 font-mono font-black text-rose-300 bg-rose-500/20">${fmt(grandExpenseTotal)}</td></tr>`;

  // C. NET BALANCE ROW
  html += `
    <tr class="bg-[#080d1a] border-t-2 border-b-2 border-amber-500/50 font-black text-amber-300 text-xs">
      <td colspan="3" class="py-3.5 px-4 text-amber-300 font-black uppercase tracking-wider">လက်ကျန်</td>`;

  (balanceTotals || []).forEach(amt => {
    html += `<td class="text-right py-3.5 px-2 font-mono font-black text-amber-300">${fmt(amt)}</td>`;
  });

  html += `<td class="text-right py-3.5 px-3 font-mono font-black text-amber-300 bg-amber-500/25">${fmt(grandNetBalance)}</td></tr>`;

  tbody.innerHTML = html;
}

// -------------------------------------------------------------------
// 4. Export Matrix Data to CSV
// -------------------------------------------------------------------
window.exportReportCSV = function() {
  if (!rawReportData) {
    alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");
    return;
  }

  const { incomeRows, incomeTotals, grandIncomeTotal, expenseRows, expenseTotals, grandExpenseTotal, balanceTotals, grandNetBalance } = rawReportData;
  const shortYear = String(currentReportYear).slice(-2);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let csv = "\uFEFF"; // UTF-8 BOM

  const monthHeaders = months.map(m => (currentReportMode === 'Annual') ? `${m}-${shortYear}` : m);
  csv += ["Head", "Category", "Sub Category", ...monthHeaders, "Total"].map(v => `"${v}"`).join(",") + "\n";

  const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;

  // Income Rows
  (incomeRows || []).forEach(r => {
    const rowVals = [esc(r.type), esc(r.category), esc(r.subcategory), ...(r.months || []).map(v => v || 0), r.total || 0];
    csv += rowVals.join(",") + "\n";
  });

  csv += [esc("ဝင်ငွေပေါင်း"), "", "", ...(incomeTotals || []).map(v => v || 0), grandIncomeTotal || 0].join(",") + "\n";

  // Expense Rows
  (expenseRows || []).forEach(r => {
    const rowVals = [esc(r.type), esc(r.category), esc(r.subcategory), ...(r.months || []).map(v => v || 0), r.total || 0];
    csv += rowVals.join(",") + "\n";
  });

  csv += [esc("ထွက်ငွေပေါင်း"), "", "", ...(expenseTotals || []).map(v => v || 0), grandExpenseTotal || 0].join(",") + "\n";

  csv += [esc("လက်ကျန်"), "", "", ...(balanceTotals || []).map(v => v || 0), grandNetBalance || 0].join(",") + "\n";

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `4GB_Report_${currentReportMode}_${currentReportYear}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
