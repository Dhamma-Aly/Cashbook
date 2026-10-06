// ===================================================================
// js/Inventory.js - Inventory Management Logic & Controller
// 100% Aligned with D1 "Inventory" Schema (date, description, remark, etc.)
// Features: Instant 0-Second Cache, Natural Typography & Polished Sticky Actions
// ===================================================================

const INV_ROWS_PER_PAGE = 30;
const INV_CACHE_KEY = 'sasana_inventory_cache';
let currentInvPage = 1;
let invAllEntries = [];
let invFilteredEntries = [];

function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

window.renderInventoryView = async function(isSilent = false) {
  currentInvPage = 1;
  window.currentTable = "Inventory";
  window.currentSheet = "Inventory";
  window.currentSheetKey = "Inventory";

  try {
    const cachedStr = localStorage.getItem(INV_CACHE_KEY);
    if (cachedStr) {
      const cachedRes = JSON.parse(cachedStr);
      if (cachedRes && cachedRes.data) {
        invAllEntries = (cachedRes.data || []).slice().reverse();
        updateInventoryKPIs(cachedRes.kpis);
        applyInventoryFilter();
      }
    }
  } catch (_) {}

  if (!isSilent && invAllEntries.length === 0 && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const res = await window.fetchInventoryDataAPI();
    if (res && res.success) {
      localStorage.setItem(INV_CACHE_KEY, JSON.stringify(res));
      invAllEntries = (res.data || []).slice().reverse();
      updateInventoryKPIs(res.kpis);
      applyInventoryFilter();
    }
  } catch (error) {
    console.error("Error fetching inventory data from D1:", error);
  } finally {
    if (!isSilent && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }
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
      const desc = e.description || e.item_desc || e.item_name || "";
      const remark = e.remark || e.note || "";
      const my = e.month_year || formatMonthYear(e.date || e.entry_date);
      const d = e.date || e.entry_date || "";
      return [d, e.location, e.category, desc, e.unit, e.qty, remark, my, e.book_name]
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
  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-amber-500/50 font-bold"><i class="fa-solid fa-boxes-packing mr-2"></i> ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    let html = "";
    pageRows.forEach((entry, idx) => {
      const uid = entry.unique_id || entry.uniqueId || entry.id || "";
      const srNo = entry.no || (start + idx + 1);
      const qty = parseFloat(entry.qty) || 0;
      const dateText = entry.date || entry.entry_date || "-";
      const monthYearFormatted = entry.month_year || formatMonthYear(dateText);

      const rawDesc = entry.description || entry.item_desc || entry.item_name || "";
      const escapedDesc = rawDesc.replace(/"/g, '&quot;');
      const descHtml = rawDesc
        ? `<div class="min-w-[240px] max-w-[420px] text-slate-100 text-xs leading-relaxed font-semibold whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" title="${escapedDesc}">${rawDesc}</div>`
        : '<span class="text-slate-600 font-mono">-</span>';

      const rawRemark = entry.remark || entry.note || "";
      const escapedRemark = rawRemark.replace(/"/g, '&quot;');
      const remarkHtml = rawRemark
        ? `<div class="min-w-[160px] max-w-[280px] text-amber-200/80 text-xs leading-relaxed whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" title="${escapedRemark}">${rawRemark}</div>`
        : '<span class="text-slate-600 font-mono">-</span>';

      html += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20 text-xs">
          <td class="text-center font-bold text-amber-500/70 py-3 font-mono">${srNo}</td>
          <td class="font-mono text-xs text-slate-300 whitespace-nowrap px-2">${dateText}</td>
          <td class="font-bold text-amber-300 whitespace-nowrap px-2">${entry.location || "-"}</td>
          <td class="whitespace-nowrap px-2"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">${entry.category || "-"}</span></td>
          <td class="py-2.5 px-3 align-middle text-left">${descHtml}</td>
          <td class="text-slate-300 font-semibold whitespace-nowrap px-2">${entry.unit || "-"}</td>
          <td class="text-right font-mono font-bold text-emerald-400 whitespace-nowrap px-3">${qty.toLocaleString()}</td>
          <td class="py-2.5 px-2 align-middle text-left">${remarkHtml}</td>
          <td class="font-mono text-xs text-sky-200 font-bold whitespace-nowrap px-2">${monthYearFormatted}</td>
          <td class="text-xs text-amber-500/70 font-semibold whitespace-nowrap px-2">${entry.book_name || "Inventory"}</td>
          <td class="text-center right-0 sticky bg-[#080d1a] px-3 z-10 border-l border-amber-500/20 shadow-[-8px_0_12px_rgba(0,0,0,0.5)]">
            <div class="flex items-center justify-center gap-2">
              <button onclick="editInvEntry('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs cursor-pointer"'} title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteInvEntry('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs cursor-pointer"'} title="Delete"><i class="fa-solid fa-trash"></i></button>
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

window.openAddInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  const form = document.getElementById("inv-entry-form");
  if (form) form.reset();

  const idInput = document.getElementById("inv-id");
  if (idInput) idInput.value = "";

  const dateInput = document.getElementById("inv-date");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const unitSelect = document.getElementById("inv-unit");
  if (unitSelect) unitSelect.value = "ခု";

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်းအသစ် သွင်းယူရန်";

  if (modal) modal.classList.remove("hidden");
};

window.closeInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.add("hidden");
};

window.saveInventoryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const unique_id = document.getElementById("inv-id").value;
  const date = document.getElementById("inv-date").value;
  const location = document.getElementById("inv-location").value;
  const category = document.getElementById("inv-category").value;
  const description = document.getElementById("inv-item-name").value.trim();
  const unit = document.getElementById("inv-unit").value;
  const qty = parseFloat(document.getElementById("inv-qty").value) || 0;
  const remark = document.getElementById("inv-remark").value.trim();

  const month_year = formatMonthYear(date);
  const isEdit = !!unique_id;

  const payload = {
    unique_id: unique_id || crypto.randomUUID(),
    date, location, category, description, unit, qty, remark, month_year, book_name: "Inventory",
    uniqueId: unique_id, entry_date: date, item_desc: description, item_name: description, note: remark
  };

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.saveInventoryEntryAPI(payload, isEdit);
    if (res && res.success) {
      window.closeInvModal();
      await window.renderInventoryView();
    } else if (res && res.status !== 401) { // 🌟 Added 401 Check
      alert("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Save Inventory Error:", err);
    alert("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.saveInvEntryForm = window.saveInventoryForm;

window.editInvEntry = function(uid) {
  const entry = invAllEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.remove("hidden");

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း ပြင်ဆင်ရန်";

  document.getElementById("inv-id").value = uid;
  document.getElementById("inv-date").value = entry.date || entry.entry_date || "";
  
  const locSelect = document.getElementById("inv-location");
  if (locSelect) locSelect.value = entry.location || "မီးဖိုဆောင်";
  
  const catSelect = document.getElementById("inv-category");
  if (catSelect) catSelect.value = entry.category || "ပရိဘောဂ";
  
  document.getElementById("inv-item-name").value = entry.description || entry.item_desc || entry.item_name || "";
  
  const unitSelect = document.getElementById("inv-unit");
  if (unitSelect) unitSelect.value = entry.unit || "ခု";

  document.getElementById("inv-qty").value = parseFloat(entry.qty) || 1;
  document.getElementById("inv-remark").value = entry.remark || entry.note || "";
};

window.deleteInvEntry = async function(uid) {
  if (!confirm("ဤပစ္စည်းစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.deleteInventoryEntryAPI(uid);
    if (res && res.success) {
      await window.renderInventoryView();
    } else if (res && res.status !== 401) { // 🌟 Added 401 Check
      alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res.error ? res.error : ""));
    }
  } catch (err) {
    console.error("Delete Inventory Error:", err);
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
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
    const desc = e.description || e.item_desc || e.item_name || "";
    const remark = e.remark || e.note || "";
    const dateText = e.date || e.entry_date || "";
    const my = e.month_year || formatMonthYear(dateText);

    csv += [
      e.no || (idx + 1), esc(dateText), esc(e.location), esc(e.category), 
      esc(desc), esc(e.unit), e.qty || 0, esc(remark), 
      esc(my), esc(e.book_name || "Inventory")
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Inventory_Export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
