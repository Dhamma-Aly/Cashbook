// js/books.js - Ledger Group (4GB, 5FB, 6HB, 7PB, 8EB, 9MB, 10GB)
//
// 💡 This file also hosts the SHARED ledger engine (renderLedgerEngine,
// renderTable, the #entry-modal Add/Edit handlers, CSV export). Both the
// Ledger Group ("books", handled directly below) and the Bank Group
// (js/banks.js, sheets 1CB/2CB/3CB) use it, because both groups share the
// exact same 13-column row schema and the same modal markup in
// index.html. Keeping one engine avoids duplicating the table/modal
// logic across two files while still giving each group its own
// view/*.html partial (view/books.html vs view/bank.html) and its own
// entry point (renderBooksView vs renderBankView) to switch on later.

// 💡 PAGINATION: first load only renders 50 rows for speed; search runs
// over the FULL dataset, and a Previous/Next bar below the table pages
// through the (possibly search-filtered) results 50 at a time.
let ledgerPage = 1;
const LEDGER_PAGE_SIZE = 50;

async function renderBooksView() {
  await renderLedgerEngine("Books");
}

async function renderLedgerEngine(viewName) {
  const requestedSheet = currentSheet;
  ledgerPage = 1; // reset to page 1 every time the tab is (re)opened

  await loadView(viewName);

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

// 💡 Search input calls this (not renderTable directly) so a new search
// term always jumps back to page 1.
function onLedgerSearchInput() {
  ledgerPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return; // Safely exit if table-body doesn't exist

  const searchInput = document.getElementById("search-input");
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const auth = getAuthUser();

  // 💡 Search-filter + running-balance accumulation always run over the
  // FULL dataset in order (so the balance column and totals stay correct
  // regardless of which 50-row page is currently shown).
  let totIncome = 0;
  let totExpense = 0;
  let runningBalance = 0;
  const filtered = [];

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

    totIncome += income;
    totExpense += expense;
    runningBalance += (income - expense);

    filtered.push({ date, category, subCat, voucher, desc, receiver, income, expense, monthYear, bookName, uniqueId, balance: runningBalance });
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
  if (ledgerPage > totalPages) ledgerPage = totalPages;
  if (ledgerPage < 1) ledgerPage = 1;

  const startIdx = (ledgerPage - 1) * LEDGER_PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + LEDGER_PAGE_SIZE);

  let html = "";
  pageRows.forEach((r, i) => {
    const count = startIdx + i + 1;
    const editable = canEditRecord(r.date);

    html += `
      <tr>
        <td class="text-center font-mono">${count}</td>
        <td class="font-mono">${r.date}</td>
        <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.category === 'ဝင်ငွေ' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950 text-rose-400 border border-rose-800/40'}">${r.category}</span></td>
        <td>${r.subCat}</td>
        <td class="font-mono text-amber-300">${r.voucher}</td>
        <td>${r.desc}</td>
        <td>${r.receiver}</td>
        <td class="text-right font-mono text-emerald-400 font-bold">${r.income ? r.income.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-rose-400 font-bold">${r.expense ? r.expense.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-amber-300 font-bold">${r.balance.toLocaleString()}</td>
        <td class="font-mono text-amber-500/80">${r.monthYear}</td>
        <td class="text-amber-200/80">${r.bookName}</td>
        <td class="text-center right-0 sticky">
          ${auth && auth.role !== "Viewer" && editable ? `
            <button onclick="openEditModal('${r.uniqueId}')" class="text-amber-400 hover:text-amber-200 mr-2" title="ပြင်ဆင်မည်"><i class="fa-solid fa-pen-to-square"></i></button>
            ${auth.role === "Admin" ? `<button onclick="handleDelete('${r.uniqueId}')" class="text-rose-400 hover:text-rose-200" title="ဖျက်မည်"><i class="fa-solid fa-trash"></i></button>` : ''}
          ` : `<span class="text-amber-700/50 text-[10px] italic">Locked</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || `<tr><td colspan="13" class="text-center py-6 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;

  setText("kpi-income", totIncome.toLocaleString() + " MMK");
  setText("kpi-expense", totExpense.toLocaleString() + " MMK");
  setText("kpi-balance", runningBalance.toLocaleString() + " MMK");
  setText("kpi-count", filtered.length);

  renderLedgerPaginationBar(filtered.length, totalPages);
}

// 💡 Row-pagination bar (50 rows/page), shown below the table.
function renderLedgerPaginationBar(totalFiltered, totalPages) {
  const bar = document.getElementById("ledger-pagination-bar");
  if (!bar) return;

  const startIdx = totalFiltered === 0 ? 0 : (ledgerPage - 1) * LEDGER_PAGE_SIZE + 1;
  const endIdx = totalFiltered === 0 ? 0 : Math.min(ledgerPage * LEDGER_PAGE_SIZE, totalFiltered);
  const hasPrev = ledgerPage > 1;
  const hasNext = ledgerPage < totalPages;

  bar.innerHTML = `
    <div class="flex justify-between items-center gap-3 bg-[#14110d] border border-amber-900/30 px-5 py-4 rounded-xl">
      <span class="text-sm font-bold text-amber-100">Showing <span class="text-amber-400 font-black">${startIdx}</span> to <span class="text-amber-400 font-black">${endIdx}</span> of <span class="text-amber-400 font-black">${totalFiltered.toLocaleString()}</span> entries</span>
      <div class="flex items-center gap-2.5">
        <button onclick="goLedgerPage(${ledgerPage - 1})" ${hasPrev ? '' : 'disabled'}
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold border transition-all ${hasPrev ? 'border-amber-500/50 bg-transparent hover:bg-amber-500/10 text-amber-100 cursor-pointer' : 'border-amber-900/30 text-amber-800/40 cursor-not-allowed'}">
          <i class="fa-solid fa-chevron-left text-[10px]"></i> Previous
        </button>
        <button onclick="goLedgerPage(${ledgerPage + 1})" ${hasNext ? '' : 'disabled'}
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold border transition-all ${hasNext ? 'border-amber-500/50 bg-transparent hover:bg-amber-500/10 text-amber-100 cursor-pointer' : 'border-amber-900/30 text-amber-800/40 cursor-not-allowed'}">
          Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
        </button>
      </div>
    </div>
  `;
}

function goLedgerPage(page) {
  ledgerPage = page;
  renderTable();
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
  if (CONFIG.BANK_GROUP.includes(currentSheet)) {
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