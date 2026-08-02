// js/inventory.js - Inventory (11Inv) ပစ္စည်းစာရင်း

// 💡 PAGINATION: first load only renders 50 rows for speed; search still
// runs over the FULL dataset, and a Previous/Next bar below the table
// pages through the (possibly search-filtered) results 50 at a time.
let invPage = 1;
const INV_PAGE_SIZE = 50;

async function renderInventoryView() {
  const requestedSheet = currentSheet; // "11Inv"
  invPage = 1; // reset to page 1 every time the tab is (re)opened

  await loadView("Inventory");

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

// 💡 Search input calls this (not renderInventoryTable directly) so a
// new search term always jumps back to page 1.
function onInvSearchInput() {
  invPage = 1;
  renderInventoryTable();
}

function renderInventoryTable() {
  const tbody = document.getElementById("inv-table-body");
  if (!tbody) return;

  const searchInput = document.getElementById("inv-search-input");
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const auth = getAuthUser();

  // KPI tallies always run over the FULL dataset — not affected by
  // search or pagination.
  const counts = { kitchen: 0, dhammahall: 0, sim: 0, store: 0 };
  rawData.forEach((row) => {
    const location = row[2] || "";
    const qty = parseFloat(row[6]) || 0;
    if (location === "မီးဖိုဆောင်") counts.kitchen += qty;
    else if (location === "ဓမ္မာရုံ") counts.dhammahall += qty;
    else if (location === "သိမ်") counts.sim += qty;
    else if (CONFIG.INVENTORY.STORAGE_LOCATIONS.includes(location)) counts.store += qty;
  });
  setText("kpi-inv-kitchen", counts.kitchen.toLocaleString());
  setText("kpi-inv-dhammahall", counts.dhammahall.toLocaleString());
  setText("kpi-inv-sim", counts.sim.toLocaleString());
  setText("kpi-inv-store", counts.store.toLocaleString());

  // 💡 Search filters over the FULL dataset first, then the current
  // 50-row page window is sliced out of the filtered results.
  const filtered = rawData.filter((row) => {
    if (!search) return true;
    const rowStr = `${row[1] || ""} ${row[2] || ""} ${row[3] || ""} ${row[4] || ""} ${row[7] || ""} ${row[9] || ""}`.toLowerCase();
    return rowStr.includes(search);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / INV_PAGE_SIZE));
  if (invPage > totalPages) invPage = totalPages;
  if (invPage < 1) invPage = 1;

  const startIdx = (invPage - 1) * INV_PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + INV_PAGE_SIZE);

  let html = "";
  pageRows.forEach((row, i) => {
    const count = startIdx + i + 1;
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

  renderInvPaginationBar(filtered.length, totalPages);
}

// 💡 Row-pagination bar (50 rows/page), shown below the table.
function renderInvPaginationBar(totalFiltered, totalPages) {
  const bar = document.getElementById("inv-pagination-bar");
  if (!bar) return;

  const startIdx = totalFiltered === 0 ? 0 : (invPage - 1) * INV_PAGE_SIZE + 1;
  const endIdx = totalFiltered === 0 ? 0 : Math.min(invPage * INV_PAGE_SIZE, totalFiltered);
  const hasPrev = invPage > 1;
  const hasNext = invPage < totalPages;

  bar.innerHTML = `
    <div class="flex justify-between items-center gap-3 bg-[#14110d] border border-amber-900/30 px-5 py-4 rounded-xl">
      <span class="text-sm font-bold text-amber-100">Showing <span class="text-amber-400 font-black">${startIdx}</span> to <span class="text-amber-400 font-black">${endIdx}</span> of <span class="text-amber-400 font-black">${totalFiltered.toLocaleString()}</span> entries</span>
      <div class="flex items-center gap-2.5">
        <button onclick="goInvPage(${invPage - 1})" ${hasPrev ? '' : 'disabled'}
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold border transition-all ${hasPrev ? 'border-amber-500/50 bg-transparent hover:bg-amber-500/10 text-amber-100 cursor-pointer' : 'border-amber-900/30 text-amber-800/40 cursor-not-allowed'}">
          <i class="fa-solid fa-chevron-left text-[10px]"></i> Previous
        </button>
        <button onclick="goInvPage(${invPage + 1})" ${hasNext ? '' : 'disabled'}
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold border transition-all ${hasNext ? 'border-amber-500/50 bg-transparent hover:bg-amber-500/10 text-amber-100 cursor-pointer' : 'border-amber-900/30 text-amber-800/40 cursor-not-allowed'}">
          Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
        </button>
      </div>
    </div>
  `;
}

function goInvPage(page) {
  invPage = page;
  renderInventoryTable();
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