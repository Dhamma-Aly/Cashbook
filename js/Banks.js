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
let ledgerAllEntries = [];   // Full dataset for the current sheet (latest first)
let ledgerFilteredEntries = []; // After search filter

// Note: the actual HTML template (view/Banks.html or view/Books.html) is
// already injected into #view-container by app.js's switchTab() before
// this function runs - so we must NOT re-fetch/overwrite it here.
window.renderBankView = async function(sheetKey) {
  window.currentSheetKey = sheetKey;
  ledgerCurrentPage = 1;

  try {
    const res = await window.fetchSheetData(sheetKey);
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
      return [e.entry_date, e.category, e.subcategory, e.voucher_no, e.description, e.receiver, e.book_name]
        .some(v => (v || "").toString().toLowerCase().includes(query));
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
    tableHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    pageRows.forEach((entry, idx) => {
      const uid = entry.uniqueId || "";
      const srNo = start + idx + 1;
      const income = parseFloat(entry.income) || 0;
      const expense = parseFloat(entry.expense) || 0;
      const balance = parseFloat(entry.balance) || 0;
      const isIncome = entry.category === "ဝင်ငွေ";

      tableHTML += `
        <tr>
          <td class="text-center font-bold text-amber-500/70">${srNo}</td>
          <td class="font-mono text-xs">${entry.entry_date || "-"}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">${entry.category || "-"}</span></td>
          <td class="font-semibold text-amber-200">${entry.subcategory || "-"}</td>
          <td class="font-mono text-xs">${entry.voucher_no || "-"}</td>
          <td class="whitespace-normal max-w-xs">${entry.description || "-"}</td>
          <td>${entry.receiver || "-"}</td>
          <td class="text-right font-mono text-emerald-400 font-semibold">${income ? income.toLocaleString() : '-'}</td>
          <td class="text-right font-mono text-rose-400 font-semibold">${expense ? expense.toLocaleString() : '-'}</td>
          <td class="text-right font-mono font-bold text-amber-300">${balance.toLocaleString()}</td>
          <td class="font-mono text-xs">${entry.month_year || "-"}</td>
          <td class="text-xs text-amber-500/70">${entry.book_name || "-"}</td>
          <td class="text-center right-0 sticky px-3">
            <div class="flex items-center justify-center gap-2.5">
              <button onclick="editEntry('${uid}')" class="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-sm" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteEntry('${uid}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
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
// Search, Pagination
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
// Add / Edit Entry Form
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
  const sheet_name = window.currentSheetKey || window.currentSheet;
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

window.editEntry = function(uid) {
  const entry = ledgerAllEntries.find(e => String(e.uniqueId) === String(uid));
  if (!entry) return;

  window.openAddEntryModal();
  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန်";

  document.getElementById("entry-id").value = entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.entry_date || "";
  document.getElementById("entry-type").value = entry.category || "ဝင်ငွေ";
  const catSelect = document.getElementById("entry-category");
  if (catSelect) catSelect.value = entry.subcategory || "";
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
// Export to CSV (exports the currently filtered/full dataset, not just
// the visible page)
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
