// ===================================================================
// js/Books.js - Cashbook Books Table Renderer EXCLUSIVELY for (4GB ~ 10GB)
// ===================================================================

const BOOK_ROWS_PER_PAGE = 30;
let bookCurrentPage = 1;
let bookAllEntries = [];      // Dataset for active book sheet (latest first)
let bookFilteredEntries = []; // Filtered by search query

// Helper: Format YYYY-MM-DD or YYYY-MM to Aug-26, Sep-26, etc.
function formatBookMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[d.getMonth()];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}`;
}

// -------------------------------------------------------------------
// 1. Render Book View Entry Point (Only for 4GB to 10GB)
// -------------------------------------------------------------------
window.renderBookView = async function(sheetKey) {
  let targetSheet = String(sheetKey || window.currentSheetKey || window.currentSheet || '4GB').trim();
  
  // Safeguard: Force valid Book sheets (4GB to 10GB)
  if (!['4GB','5FB','6HB','7PB','8EB','9MB','10GB'].includes(targetSheet)) {
    targetSheet = '4GB';
  }
  
  window.currentSheetKey = targetSheet;
  bookCurrentPage = 1;

  try {
    const res = await window.fetchSheetData(window.currentSheetKey);
    if (res && res.success) {
      bookAllEntries = (res.data || []).slice().reverse();
      updateBookKPIs(res.kpis);
    } else {
      bookAllEntries = [];
      updateBookKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching Book ledger data:", error);
    bookAllEntries = [];
    updateBookKPIs(null);
  }

  applyBookSearchFilter();
};

// -------------------------------------------------------------------
// 2. Update Book KPI Cards
// -------------------------------------------------------------------
function updateBookKPIs(kpis) {
  const k = kpis || { totalIncome: 0, totalExpense: 0, balance: 0, count: 0 };
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText("kpi-income", `${(k.totalIncome || 0).toLocaleString()} MMK`);
  setText("kpi-expense", `${(k.totalExpense || 0).toLocaleString()} MMK`);
  setText("kpi-balance", `${(k.balance || 0).toLocaleString()} MMK`);
  setText("kpi-count", (k.count || 0).toLocaleString());
}

// -------------------------------------------------------------------
// 3. Search Filter & Table Rendering
// -------------------------------------------------------------------
function applyBookSearchFilter() {
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) {
    bookFilteredEntries = bookAllEntries;
  } else {
    bookFilteredEntries = bookAllEntries.filter(e => {
      const my = formatBookMonthYear(e.entry_date || e.month_year);
      return [
        e.entry_date, e.category, e.subcategory, e.voucher_no, 
        e.description, e.receiver, e.book_name, e.income, e.expense, my
      ].some(v => (v || "").toString().toLowerCase().includes(query));
    });
  }

  renderBookTable();
}

function renderBookTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const total = bookFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / BOOK_ROWS_PER_PAGE));
  if (bookCurrentPage > maxPage) bookCurrentPage = maxPage;
  if (bookCurrentPage < 1) bookCurrentPage = 1;

  const start = (bookCurrentPage - 1) * BOOK_ROWS_PER_PAGE;
  const end = Math.min(start + BOOK_ROWS_PER_PAGE, total);
  const pageRows = bookFilteredEntries.slice(start, end);

  let tableHTML = "";

  if (total === 0) {
    tableHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50 font-bold"><i class="fa-solid fa-folder-open mr-2"></i> စာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    pageRows.forEach((entry, idx) => {
      const uid = entry.uniqueId || "";
      const srNo = start + idx + 1;
      const income = parseFloat(entry.income) || 0;
      const expense = parseFloat(entry.expense) || 0;
      const balance = parseFloat(entry.balance) || 0;
      const isIncome = entry.category === "ဝင်ငွေ";
      const monthYearFormatted = formatBookMonthYear(entry.entry_date || entry.month_year);

      const incomeHtml = income ? `<span class="text-emerald-400 font-mono font-bold">${income.toLocaleString()}</span>` : '<span class="text-slate-600">-</span>';
      const expenseHtml = expense ? `<span class="text-rose-400 font-mono font-bold">${expense.toLocaleString()}</span>` : '<span class="text-slate-600">-</span>';
      const balanceHtml = `<span class="text-amber-300 font-mono font-black">${balance.toLocaleString()}</span>`;
      
      const receiverBadge = entry.receiver 
        ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold text-[11px]">${entry.receiver}</span>` 
        : '<span class="text-slate-600">-</span>';

      tableHTML += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3">${srNo}</td>
          <td class="font-mono text-xs text-slate-300">${entry.entry_date || "-"}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${isIncome ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">${entry.category || "-"}</span></td>
          <td class="font-semibold text-amber-200">${entry.subcategory || "-"}</td>
          <td class="font-mono text-xs text-amber-300/80">${entry.voucher_no || "-"}</td>
          <td class="whitespace-normal max-w-xs text-slate-200">${entry.description || "-"}</td>
          <td>${receiverBadge}</td>
          <td class="text-right py-3">${incomeHtml}</td>
          <td class="text-right py-3">${expenseHtml}</td>
          <td class="text-right py-3">${balanceHtml}</td>
          <td class="font-mono text-xs text-sky-200 font-bold">${monthYearFormatted}</td>
          <td class="text-xs text-amber-500/70 font-semibold">${entry.book_name || "-"}</td>
          <td class="text-center right-0 sticky bg-[#080d1a] px-3">
            <div class="flex items-center justify-center gap-2">
              <button onclick="editBookEntry('${uid}')" class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs cursor-pointer" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteBookEntry('${uid}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs cursor-pointer" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  tbody.innerHTML = tableHTML;

  const pageStartEl = document.getElementById("page-start");
  const pageEndEl = document.getElementById("page-end");
  const totalEntriesEl = document.getElementById("total-entries");
  if (pageStartEl) pageStartEl.textContent = total ? start + 1 : 0;
  if (pageEndEl) pageEndEl.textContent = end;
  if (totalEntriesEl) totalEntriesEl.textContent = total;

  const btnPrev = document.getElementById("btn-prev-page");
  const btnNext = document.getElementById("btn-next-page");
  if (btnPrev) btnPrev.disabled = bookCurrentPage <= 1;
  if (btnNext) btnNext.disabled = end >= total;
}

// -------------------------------------------------------------------
// 4. Book Dynamic Subcategories Handler (SUBCATEGORIES driven by Type)
// -------------------------------------------------------------------
window.onBookTypeChange = function(type) {
  const subSelect = document.getElementById("entry-subcategory");
  if (!subSelect) return;

  const subcats = (window.CONFIG && window.CONFIG.SUBCATEGORIES && window.CONFIG.SUBCATEGORIES[type])
    || (type === 'ဝင်ငွေ' ? ['လှူဒါန်းငွေ', 'အသင်းဝင်ကြေး', 'အခြားဝင်ငွေ'] : ['ဆွမ်းစရိတ်', 'လျှပ်စစ်ဖိုး', 'အထွေထွေစရိတ်']);

  subSelect.innerHTML = subcats.map(s => `<option value="${s}">${s}</option>`).join('');
};
