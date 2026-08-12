// ===================================================================
// js/Banks.js - Bank & Book Ledger Table Renderer (1CB~3CB, 4GB~10GB)
// Backend returns { success, data: [ {entry objects} ], kpis } via
// GET /api/entries?sheet=... (see cashbook-api/handlers-books.js).
// Each entry object has: id, uniqueId, sheet_name, entry_date, category
// (ဝင်ငွေ/ထွက်ငွေ), subcategory, voucher_no, description, receiver,
// income, expense, balance (running), month_year, book_name.
// ===================================================================

const LEDGER_ROWS_PER_PAGE = 30;
let ledgerCurrentPage = 1;
let ledgerAllEntries = [];      // Full dataset for the current sheet (latest first)
let ledgerFilteredEntries = []; // After search filter

// Render Function Main Entry
window.renderBankView = async function(sheetKey) {
  window.currentSheetKey = sheetKey || window.currentSheet || '1CB';
  ledgerCurrentPage = 1;

  try {
    const res = await window.fetchSheetData(window.currentSheetKey);
    if (res && res.success) {
      // Show most recent entries first
      ledgerAllEntries = (res.data || []).slice().reverse();
      updateLedgerKPIs(res.kpis);
    } else {
      ledgerAllEntries = [];
      updateLedgerKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching ledger data:", error);
    ledgerAllEntries = [];
    updateLedgerKPIs(null);
  }

  applyLedgerSearchFilter();
};

// 🚨 Alias Link for app.js and HTML refresh buttons
window.loadSheetView = window.renderBankView;

function updateLedgerKPIs(kpis) {
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

function applyLedgerSearchFilter() {
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) {
    ledgerFilteredEntries = ledgerAllEntries;
  } else {
    ledgerFilteredEntries = ledgerAllEntries.filter(e => {
      return [
        e.entry_date, e.category, e.subcategory, e.voucher_no, 
        e.description, e.receiver, e.book_name, e.income, e.expense
      ].some(v => (v || "").toString().toLowerCase().includes(query));
    });
  }

  renderLedgerTable();
}

function renderLedgerTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const total = ledgerFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage > maxPage) ledgerCurrentPage = maxPage;
  if (ledgerCurrentPage < 1) ledgerCurrentPage = 1;

  const start = (ledgerCurrentPage - 1) * LEDGER_ROWS_PER_PAGE;
  const end = Math.min(start + LEDGER_ROWS_PER_PAGE, total);
  const pageRows = ledgerFilteredEntries.slice(start, end);

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

      tableHTML += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3">${srNo}</td>
          <td class="font-mono text-xs">${entry.entry_date || "-"}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${isIncome ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">${entry.category || "-"}</span></td>
          <td class="font-semibold text-amber-200">${entry.subcategory || "-"}</td>
          <td class="font-mono text-xs text-amber-300/80">${entry.voucher_no || "-"}</td>
          <td class="whitespace-normal max-w-xs text-slate-200">${entry.description || "-"}</td>
          <td class="text-slate-300">${entry.receiver || "-"}</td>
          <td class="text-right font-mono text-emerald-400 font-bold">${income ? income.toLocaleString() : '-'}</td>
          <td class="text-right font-mono text-rose-400 font-bold">${expense ? expense.toLocaleString() : '-'}</td>
          <td class="text-right font-mono font-black text-amber-300">${balance.toLocaleString()}</td>
          <td class="font-mono text-xs text-amber-500/60">${entry.month_year || "-"}</td>
          <td class="text-xs text-amber-500/70 font-semibold">${entry.book_name || "-"}</td>
          <td class="text-center right-0 sticky bg-[#0a0806] px-3">
            <div class="flex items-center justify-center gap-2">
              <button onclick="editEntry('${uid}')" class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteEntry('${uid}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs" title="Delete"><i class="fa-solid fa-trash"></i></button>
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
  if (btnPrev) btnPrev.disabled = ledgerCurrentPage <= 1;
  if (btnNext) btnNext.disabled = end >= total;
}

// ===================================================================
// Search & Pagination Controls
// ===================================================================
window.onLedgerSearchInput = function() {
  ledgerCurrentPage = 1;
  applyLedgerSearchFilter();
};

window.prevPage = function() {
  if (ledgerCurrentPage > 1) {
    ledgerCurrentPage--;
    renderLedgerTable();
  }
};

window.nextPage = function() {
  const maxPage = Math.max(1, Math.ceil(ledgerFilteredEntries.length / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage < maxPage) {
    ledgerCurrentPage++;
    renderLedgerTable();
  }
};

// ===================================================================
// Dynamic Category Dropdown (ဝင်ငွေ / ထွက်ငွေ အလိုက် Auto ပြောင်းရန်)
// ===================================================================
window.populateCategories = function(type = 'ဝင်ငွေ', selectedCat = '') {
  const catSelect = document.getElementById("entry-category");
  if (!catSelect) return;

  const subcats = (window.CONFIG && window.CONFIG.SUBCATEGORIES && window.CONFIG.SUBCATEGORIES[type]) 
    || (type === 'ဝင်ငွေ' ? ['လှူဒါန်းငွေ', 'အသင်းဝင်ကြေး', 'ပဒေသာပင်လှူငွေ', 'အခြားဝင်ငွေ'] : ['ဆွမ်းစရိတ်', 'လျှပ်စစ်ဖိုး', 'ဆေးဝါးစရိတ်', 'ပြုပြင်ထိန်းသိမ်းစရိတ်', 'အထွေထွေစရိတ်']);

  catSelect.innerHTML = subcats.map(c => `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`).join('');
};

// ===================================================================
// Add / Edit Modal Openers & Reset
// ===================================================================
window.openAddEntryModal = function() {
  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (!modal) return;

  // Clear Form for NEW Entry
  const form = document.getElementById('entry-form');
  if (form) form.reset();

  const idInput = document.getElementById("entry-id");
  if (idInput) idInput.value = "";

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်းအသစ် သွင်းယူရန်";

  // Default Today's Date
  const dateInput = document.getElementById("entry-date");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // Default Categories for "ဝင်ငွေ"
  window.populateCategories('ဝင်ငွေ');

  modal.classList.remove('hidden');
};

// Event Listener for Entry Type Change (ဝင်ငွေ/ထွက်ငွေ)
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'entry-type') {
    window.populateCategories(e.target.value);
  }
});

// ===================================================================
// Save Entry Form Submission
// ===================================================================
window.saveEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const uniqueId = document.getElementById("entry-id").value;
  const entry_date = document.getElementById("entry-date").value;
  const category = document.getElementById("entry-type").value; // ဝင်ငွေ / ထွက်ငွေ
  const subcategory = document.getElementById("entry-category").value;
  const extraNote = document.getElementById("entry-subcategory") ? document.getElementById("entry-subcategory").value : "";
  const voucher_no = document.getElementById("entry-voucher").value;
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  let description = document.getElementById("entry-description").value;
  if (extraNote) description = description ? `${description} (${extraNote})` : extraNote;

  const income = category === "ဝင်ငွေ" ? amount : 0;
  const expense = category === "ထွက်ငွေ" ? amount : 0;
  const month_year = entry_date ? entry_date.substring(0, 7) : "";
  const sheet_name = window.currentSheetKey || window.currentSheet || '1CB';
  const bookName = (window.CONFIG && window.CONFIG.SHEET_TITLES && window.CONFIG.SHEET_TITLES[sheet_name]) || sheet_name;

  const isEdit = !!uniqueId;
  const payload = {
    uniqueId: uniqueId || `${sheet_name}-${Date.now()}`,
    sheet_name,
    entry_date,
    category,
    subcategory,
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
      alert("စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Save Entry Error:", err);
    alert("စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

// ===================================================================
// Edit & Delete Actions
// ===================================================================
window.editEntry = function(uid) {
  const entry = ledgerAllEntries.find(e => String(e.uniqueId) === String(uid));
  if (!entry) return;

  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.remove('hidden');

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန်";

  const type = entry.category || "ဝင်ငွေ";

  document.getElementById("entry-id").value = entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.entry_date || "";
  document.getElementById("entry-type").value = type;

  // Populate dynamic category dropdown first
  window.populateCategories(type, entry.subcategory || "");

  const subcatInput = document.getElementById("entry-subcategory");
  if (subcatInput) subcatInput.value = "";

  document.getElementById("entry-voucher").value = entry.voucher_no || "";
  document.getElementById("entry-amount").value = (entry.income || entry.expense || 0);
  document.getElementById("entry-receiver").value = entry.receiver || "";
  document.getElementById("entry-description").value = entry.description || "";
};

window.deleteEntry = async function(uid) {
  if (!confirm("ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  window.showLoading(true);
  try {
    const res = await window.deleteCashbookEntryAPI(uid);
    if (res && res.success) {
      await window.renderBankView(window.currentSheetKey || window.currentSheet);
    } else {
      alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Delete Entry Error:", err);
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

// ===================================================================
// Export to CSV
// ===================================================================
window.exportCSV = function() {
  if (!ledgerFilteredEntries || ledgerFilteredEntries.length === 0) {
    alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");
    return;
  }

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,အကြောင်းအရာ,လက်ခံသူ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,လနှစ်,စာအုပ်အမည်\n";

  ledgerFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    csv += [
      idx + 1, esc(e.entry_date), esc(e.category), esc(e.subcategory), esc(e.voucher_no),
      esc(e.description), esc(e.receiver), e.income || 0, e.expense || 0, e.balance || 0,
      esc(e.month_year), esc(e.book_name)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${window.currentSheetKey || 'ledger'}_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
