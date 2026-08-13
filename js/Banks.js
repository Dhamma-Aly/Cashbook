// ===================================================================
// js/Banks.js - Bank Group Table Renderer & Controller EXCLUSIVELY for (1CB, 2CB, 3CB)
// ===================================================================

const BANK_ROWS_PER_PAGE = 30;
let bankCurrentPage = 1;
let bankAllEntries = [];      // Dataset for active bank sheet (latest first)
let bankFilteredEntries = []; // Filtered by search query

// Helper: Format YYYY-MM-DD or YYYY-MM to Aug-26, Sep-26, etc.
function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[d.getMonth()];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}`;
}

// -------------------------------------------------------------------
// 1. Render Bank View Entry Point (Only for 1CB, 2CB, 3CB)
// -------------------------------------------------------------------
window.renderBankView = async function(sheetKey) {
  let targetSheet = String(sheetKey || window.currentSheetKey || window.currentSheet || '1CB').trim();
  
  // Safeguard: Force valid Bank sheets (1CB, 2CB, 3CB)
  if (!['1CB', '2CB', '3CB'].includes(targetSheet)) {
    targetSheet = '1CB';
  }
  
  window.currentSheetKey = targetSheet;
  bankCurrentPage = 1;

  try {
    const res = await window.fetchSheetData(window.currentSheetKey);
    if (res && res.success) {
      bankAllEntries = (res.data || []).slice().reverse();
      updateBankKPIs(res.kpis);
    } else {
      bankAllEntries = [];
      updateBankKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching Bank ledger data:", error);
    bankAllEntries = [];
    updateBankKPIs(null);
  }

  applyBankSearchFilter();
};

// Alias Link for app.js and HTML refresh button
window.loadSheetView = window.renderBankView;

// -------------------------------------------------------------------
// 2. Update Bank KPI Cards
// -------------------------------------------------------------------
function updateBankKPIs(kpis) {
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
window.onLedgerSearchInput = function() {
  bankCurrentPage = 1;
  applyBankSearchFilter();
};

function applyBankSearchFilter() {
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) {
    bankFilteredEntries = bankAllEntries;
  } else {
    bankFilteredEntries = bankAllEntries.filter(e => {
      const my = formatMonthYear(e.entry_date || e.month_year);
      return [
        e.entry_date, e.category, e.subcategory, e.voucher_no, 
        e.description, e.receiver, e.book_name, e.income, e.expense, my
      ].some(v => (v || "").toString().toLowerCase().includes(query));
    });
  }

  renderBankTable();
}

function renderBankTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const total = bankFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / BANK_ROWS_PER_PAGE));
  if (bankCurrentPage > maxPage) bankCurrentPage = maxPage;
  if (bankCurrentPage < 1) bankCurrentPage = 1;

  const start = (bankCurrentPage - 1) * BANK_ROWS_PER_PAGE;
  const end = Math.min(start + BANK_ROWS_PER_PAGE, total);
  const pageRows = bankFilteredEntries.slice(start, end);

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
      const monthYearFormatted = formatMonthYear(entry.entry_date || entry.month_year);

      // Distinct Font Color Formatting for Financial Figures & Metadata
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
              <button onclick="editEntry('${uid}')" class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs cursor-pointer" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteEntry('${uid}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs cursor-pointer" title="Delete"><i class="fa-solid fa-trash"></i></button>
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
  if (btnPrev) btnPrev.disabled = bankCurrentPage <= 1;
  if (btnNext) btnNext.disabled = end >= total;
}

window.prevPage = function() {
  if (bankCurrentPage > 1) {
    bankCurrentPage--;
    renderBankTable();
  }
};

window.nextPage = function() {
  const maxPage = Math.max(1, Math.ceil(bankFilteredEntries.length / BANK_ROWS_PER_PAGE));
  if (bankCurrentPage < maxPage) {
    bankCurrentPage++;
    renderBankTable();
  }
};

// -------------------------------------------------------------------
// 4. Bank Dynamic Subcategories Handler (စာရင်းဖွင့်, ဘဏ်အပ်ငွေ, ဘဏ်ထုတ်ငွေ)
// -------------------------------------------------------------------
window.onBankCategoryChange = function(cat) {
  const subSelect = document.getElementById("entry-subcategory");
  if (!subSelect) return;

  const bankSubcats = (window.CONFIG && window.CONFIG.BANK_SUBCATEGORIES && window.CONFIG.BANK_SUBCATEGORIES[cat])
    || ['အထွေထွေ စာရင်းဖွင့်', 'အခြား'];

  subSelect.innerHTML = bankSubcats.map(s => `<option value="${s}">${s}</option>`).join('');
};

// Open Add Entry Modal for Bank
window.openAddEntryModal = function() {
  const modal = document.getElementById('entry-modal');
  if (!modal) return;

  const form = document.getElementById('entry-form');
  if (form) form.reset();

  const idInput = document.getElementById("entry-id");
  if (idInput) idInput.value = "";

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "ဘဏ်စာရင်းအသစ် သွင်းယူရန်";

  const dateInput = document.getElementById("entry-date");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const catSelect = document.getElementById("entry-category");
  if (catSelect) catSelect.value = "စာရင်းဖွင့်";
  window.onBankCategoryChange("စာရင်းဖွင့်");

  modal.classList.remove('hidden');
};

// -------------------------------------------------------------------
// 5. Save Entry Form Submission
// -------------------------------------------------------------------
window.saveEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const uniqueId = document.getElementById("entry-id").value;
  const entry_date = document.getElementById("entry-date").value;
  const category = document.getElementById("entry-type").value; // ဝင်ငွေ / ထွက်ငွေ
  const subcategory = document.getElementById("entry-category").value;
  
  const subcatEl = document.getElementById("entry-subcategory");
  const extraNote = subcatEl ? subcatEl.value : "";
  
  const voucher_no = document.getElementById("entry-voucher").value;
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  
  // 💡 မူရင်း ရိုက်ထည့်လိုက်သည့် အကြောင်းအရာ သီးသန့်ကိုသာ သိမ်းဆည်းမည်
  const description = document.getElementById("entry-description").value.trim();

  const income = category === "ဝင်ငွေ" ? amount : 0;
  const expense = category === "ထွက်ငွေ" ? amount : 0;
  const month_year = formatMonthYear(entry_date);

  const sheet_name = window.currentSheetKey || '1CB';
  const bookName = (window.CONFIG && window.CONFIG.SHEET_TITLES && window.CONFIG.SHEET_TITLES[sheet_name]) || sheet_name;

  const isEdit = !!uniqueId;
  const payload = {
    uniqueId: uniqueId || `${sheet_name}-${Date.now()}`,
    sheet_name,
    entry_date,
    category,
    subcategory,
    subcategory_detail: extraNote,
    voucher_no,
    description,
    receiver,
    income,
    expense,
    month_year,
    book_name: bookName
  };

  window.showLoading(true);
  try {
    const res = await window.saveCashbookEntryAPI(payload, isEdit);
    if (res && res.success) {
      window.closeEntryModal();
      await window.renderBankView(sheet_name);
    } else {
      alert("ဘဏ်စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Save Bank Entry Error:", err);
    alert("ဘဏ်စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

// Edit Entry
window.editEntry = function(uid) {
  const entry = bankAllEntries.find(e => String(e.uniqueId) === String(uid));
  if (!entry) return;

  const modal = document.getElementById('entry-modal');
  if (modal) modal.classList.remove('hidden');

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "ဘဏ်စာရင်း ပြင်ဆင်ရန်";

  const type = entry.category || "ဝင်ငွေ";

  document.getElementById("entry-id").value = entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.entry_date || "";
  document.getElementById("entry-type").value = type;

  const catSelect = document.getElementById("entry-category");
  if (catSelect) catSelect.value = entry.subcategory || "စာရင်းဖွင့်";
  window.onBankCategoryChange(entry.subcategory || "စာရင်းဖွင့်");

  document.getElementById("entry-voucher").value = entry.voucher_no || "";
  document.getElementById("entry-amount").value = (entry.income || entry.expense || 0);
  
  const recSelect = document.getElementById("entry-receiver");
  if (recSelect) recSelect.value = entry.receiver || "";

  document.getElementById("entry-description").value = entry.description || "";
};

// Delete Entry
window.deleteEntry = async function(uid) {
  if (!confirm("ဤဘဏ်စာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  window.showLoading(true);
  try {
    const res = await window.deleteCashbookEntryAPI(uid);
    if (res && res.success) {
      await window.renderBankView(window.currentSheetKey);
    } else {
      alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Delete Bank Entry Error:", err);
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

// Export to CSV
window.exportCSV = function() {
  if (!bankFilteredEntries || bankFilteredEntries.length === 0) {
    alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");
    return;
  }

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,အကြောင်းအရာ,လက်ခံသူ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,လနှစ်,စာအုပ်အမည်\n";

  bankFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const my = formatMonthYear(e.entry_date || e.month_year);
    csv += [
      idx + 1, esc(e.entry_date), esc(e.category), esc(e.subcategory), esc(e.voucher_no),
      esc(e.description), esc(e.receiver), e.income || 0, e.expense || 0, e.balance || 0,
      esc(my), esc(e.book_name)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${window.currentSheetKey || 'bank'}_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
