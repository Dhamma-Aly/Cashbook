// ===================================================================
// js/Inventory.js - Inventory (11Inv) Logic
// Backend returns { success, data: [ {entry objects} ], kpis } via
// GET /api/inventory (see cashbook-api/handlers-inventory.js).
// Each entry object has: id, uniqueId, entry_date, location, category,
// unit, qty, item_desc (or item_name), note (or remark), month_year, book_name.
// ===================================================================

const INV_ROWS_PER_PAGE = 30;
let currentInvPage = 1;
let invAllEntries = [];
let invFilteredEntries = [];

window.renderInventoryView = async function() {
  currentInvPage = 1;
  window.currentSheetKey = "11Inv";

  try {
    const res = await window.fetchInventoryDataAPI();
    if (res && res.success) {
      invAllEntries = (res.data || []).slice().reverse(); // newest first
      updateInventoryKPIs(res.kpis);
    } else {
      invAllEntries = [];
      updateInventoryKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching inventory data:", error);
    invAllEntries = [];
    updateInventoryKPIs(null);
  }

  applyInventoryFilter();
};

function updateInventoryKPIs(kpis) {
  const k = kpis || { kitchen: 0, dhammaHall: 0, sim: 0, store: 0 };
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val || 0).toLocaleString();
  };
  setText("kpi-inv-kitchen", k.kitchen);
  setText("kpi-inv-dhammahall", k.dhammaHall);
  setText("kpi-inv-sim", k.sim);
  setText("kpi-inv-store", k.store);
}

function applyInventoryFilter() {
  const searchInput = document.getElementById("inv-search-input");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) {
    invFilteredEntries = invAllEntries;
  } else {
    invFilteredEntries = invAllEntries.filter(e => {
      const name = e.item_desc || e.item_name || "";
      const remark = e.note || e.remark || "";
      return [e.entry_date, e.location, e.category, name, e.unit, e.qty, remark, e.book_name]
        .some(v => (v || "").toString().toLowerCase().includes(query));
    });
  }

  renderInventoryTable();
}

function renderInventoryTable() {
  const tbody = document.getElementById("inv-table-body");
  if (!tbody) return;

  const total = invFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / INV_ROWS_PER_PAGE));
  if (currentInvPage > maxPage) currentInvPage = maxPage;
  if (currentInvPage < 1) currentInvPage = 1;

  const start = (currentInvPage - 1) * INV_ROWS_PER_PAGE;
  const end = Math.min(start + INV_ROWS_PER_PAGE, total);
  const pageRows = invFilteredEntries.slice(start, end);

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-amber-500/50 font-bold"><i class="fa-solid fa-boxes-packing mr-2"></i> ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    let html = "";
    pageRows.forEach((entry, idx) => {
      const uid = entry.uniqueId || entry.id || "";
      const srNo = start + idx + 1;
      const qty = parseInt(entry.qty) || 0;
      const itemName = entry.item_desc || entry.item_name || "-";
      const remark = entry.note || entry.remark || "-";

      html += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3">${srNo}</td>
          <td class="font-mono text-xs">${entry.entry_date || "-"}</td>
          <td class="font-bold text-amber-300">${entry.location || "-"}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">${entry.category || "-"}</span></td>
          <td class="font-semibold text-amber-100">${itemName}</td>
          <td class="text-slate-300">${entry.unit || "-"}</td>
          <td class="text-right font-mono font-bold text-emerald-400">${qty.toLocaleString()}</td>
          <td class="text-xs text-amber-200/70">${remark}</td>
          <td class="font-mono text-xs text-amber-500/60">${entry.month_year || "-"}</td>
          <td class="text-xs text-amber-500/70 font-semibold">${entry.book_name || "11Inv - ပစ္စည်းစာရင်း"}</td>
          <td class="text-center right-0 sticky bg-[#0a0806] px-3">
            <div class="flex items-center justify-center gap-2">
              <button onclick="editInvEntry('${uid}')" class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteInvEntry('${uid}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  const invStartEl = document.getElementById("inv-page-start");
  const invEndEl = document.getElementById("inv-page-end");
  const invTotalEl = document.getElementById("inv-total-entries");
  if (invStartEl) invStartEl.textContent = total ? start + 1 : 0;
  if (invEndEl) invEndEl.textContent = end;
  if (invTotalEl) invTotalEl.textContent = total;

  const btnPrev = document.getElementById("btn-inv-prev-page");
  const btnNext = document.getElementById("btn-inv-next-page");
  if (btnPrev) btnPrev.disabled = currentInvPage <= 1;
  if (btnNext) btnNext.disabled = end >= total;
}

// ===================================================================
// Search & Pagination
// ===================================================================
window.onInvSearchInput = function() {
  currentInvPage = 1;
  applyInventoryFilter();
};

window.nextInvPage = function() {
  const maxPage = Math.max(1, Math.ceil(invFilteredEntries.length / INV_ROWS_PER_PAGE));
  if (currentInvPage < maxPage) {
    currentInvPage++;
    renderInventoryTable();
  }
};

window.prevInvPage = function() {
  if (currentInvPage > 1) {
    currentInvPage--;
    renderInventoryTable();
  }
};

// ===================================================================
// Add / Edit Modal Controllers
// ===================================================================
window.openAddInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  const form = document.getElementById("inv-entry-form");
  if (form) form.reset();

  const idInput = document.getElementById("inv-id");
  if (idInput) idInput.value = "";

  const dateInput = document.getElementById("inv-date");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်းအသစ် သွင်းယူရန်";

  if (modal) modal.classList.remove("hidden");
};

window.closeInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.add("hidden");
};

// Save Inventory Submission
window.saveInventoryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const uniqueId = document.getElementById("inv-id").value;
  const entry_date = document.getElementById("inv-date").value;
  const location = document.getElementById("inv-location").value;
  const category = document.getElementById("inv-category").value;
  const item_desc = document.getElementById("inv-item-name").value;
  const unit = document.getElementById("inv-unit").value;
  const qty = parseInt(document.getElementById("inv-qty").value) || 0;
  const note = document.getElementById("inv-remark").value;

  const month_year = entry_date ? entry_date.substring(0, 7) : "";
  const isEdit = !!uniqueId;

  const payload = {
    uniqueId: uniqueId || `INV-${Date.now()}`,
    entry_date,
    location,
    category,
    unit,
    qty,
    item_desc,
    item_name: item_desc, // Dual naming support
    note,
    remark: note,         // Dual naming support
    month_year,
    book_name: "11Inv - ပစ္စည်းစာရင်း"
  };

  window.showLoading(true);
  try {
    const res = await window.saveInventoryEntryAPI(payload, isEdit);
    if (res && res.success) {
      window.closeInvModal();
      await window.renderInventoryView();
    } else {
      alert("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Save Inventory Error:", err);
    alert("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

window.saveInvEntryForm = window.saveInventoryForm;

window.editInvEntry = function(uid) {
  const entry = invAllEntries.find(e => String(e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.remove("hidden");

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း ပြင်ဆင်ရန်";

  document.getElementById("inv-id").value = uid;
  document.getElementById("inv-date").value = entry.entry_date || "";
  
  const locSelect = document.getElementById("inv-location");
  if (locSelect) locSelect.value = entry.location || "";
  
  const catSelect = document.getElementById("inv-category");
  if (catSelect) catSelect.value = entry.category || "";
  
  document.getElementById("inv-item-name").value = entry.item_desc || entry.item_name || "";
  document.getElementById("inv-unit").value = entry.unit || "";
  document.getElementById("inv-qty").value = parseInt(entry.qty) || 0;
  document.getElementById("inv-remark").value = entry.note || entry.remark || "";
};

window.deleteInvEntry = async function(uid) {
  if (!confirm("ဤပစ္စည်းစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  window.showLoading(true);
  try {
    const res = await window.deleteInventoryEntryAPI(uid);
    if (res && res.success) {
      await window.renderInventoryView();
    } else {
      alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res && res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Delete Inventory Error:", err);
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

window.exportInventoryCSV = function() {
  if (!invFilteredEntries || invFilteredEntries.length === 0) {
    alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");
    return;
  }

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,နေရာ,အမျိုးအစား,အကြောင်းအရာ,ရေတွက်ပုံ,အရေအတွက်,မှတ်ချက်,လနှစ်,စာအုပ်အမည်\n";

  invFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const name = e.item_desc || e.item_name || "";
    const remark = e.note || e.remark || "";
    csv += [
      idx + 1, esc(e.entry_date), esc(e.location), esc(e.category), 
      esc(name), esc(e.unit), e.qty || 0, esc(remark), 
      esc(e.month_year), esc(e.book_name)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `11Inv_Export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
