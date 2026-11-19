// ===================================================================
// js/Inventory.js - Inventory Management Logic & Controller (v4.3)
// Features: Event-Delegated XSS Safe Actions, Cursor-Safe MM->Eng Qty,
// Calendar Date Check, CSV Formula Guard, Role Guards & Calm Eye-Comfort UI
// ===================================================================

const INV_ROWS_PER_PAGE = 30;
const INV_CACHE_KEY = 'sasana_inventory_cache';
let currentInvPage = 1;
let invAllEntries = [];
let invFilteredEntries = [];
let isInvSubmitting = false;
let lastRenderedInvHTML = '';
let activeInvFetchToken = 0;

function escapeInvHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invCsvCell(val) {
  let s = (val === null || val === undefined) ? '' : String(val);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

function toEngDigitsInv(str) {
  if (typeof window.toEnglishDigits === 'function') return window.toEnglishDigits(str);
  if (str === null || str === undefined) return '';
  const mm = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
  return String(str).replace(/[၀-၉]/g, ch => mm.indexOf(ch));
}

function isValidInvDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

function notifyInv(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
}

function setInvSelectSafe(selectEl, val) {
  if (!selectEl) return;
  const v = String(val ?? '').trim();
  if (!v) return;
  if (!Array.from(selectEl.options).some(o => o.value === v)) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  selectEl.value = v;
}

function bindInvCursorSafeQtyInput(el) {
  if (!el || el.dataset.engBound === '1') return;
  el.dataset.engBound = '1';

  const transform = (strict) => {
    const pos = el.selectionStart;
    const raw = el.value;
    let next = toEngDigitsInv(raw).replace(/,/g, '').replace(/[^0-9.]/g, '');
    const parts = next.split('.');
    if (parts.length > 2) next = `${parts[0]}.${parts.slice(1).join('')}`;
    if (strict && next.endsWith('.')) next = next.slice(0, -1);

    if (next !== raw) {
      el.value = next;
      if (typeof pos === 'number' && document.activeElement === el) {
        const diff = raw.length - next.length;
        const nextPos = Math.max(0, pos - diff);
        try { el.setSelectionRange(nextPos, nextPos); } catch (_) {}
      }
    }
  };

  el.addEventListener('input', () => transform(false));
  el.addEventListener('blur', () => transform(true));
}

function initInventoryViewListeners() {
  const tbody = document.getElementById("inv-table-body");
  if (tbody && tbody.dataset.delegated !== '1') {
    tbody.dataset.delegated = '1';
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action][data-uid]');
      if (!btn || btn.disabled) return;
      const uid = btn.dataset.uid;
      if (!uid) return;
      if (btn.dataset.action === 'edit') {
        window.editInvEntry(uid);
      } else if (btn.dataset.action === 'delete') {
        window.deleteInvEntry(uid);
      }
    });
  }

  bindInvCursorSafeQtyInput(document.getElementById("inv-qty"));
}

function getTodayInvISO() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatInvMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function getInventoryCategoryDotColor(category) {
  const cat = String(category || '');
  if (cat.includes('လျှပ်စစ်')) return '#38bdf8';
  if (cat.includes('မီးဖို')) return '#34d399';
  if (cat.includes('ဆေး') || cat.includes('ကျန်းမာ')) return '#fb7185';
  if (cat.includes('အဝတ်') || cat.includes('အခင်း')) return '#a78bfa';
  if (cat.includes('ပရိဘောဂ')) return '#fbbf24';
  return '#94a3b8';
}

window.renderInventoryView = async function (isSilent = false) {
  initInventoryViewListeners();

  const fetchToken = ++activeInvFetchToken;
  if (!isSilent) {
    currentInvPage = 1;
    lastRenderedInvHTML = '';
  }

  window.currentTable = "Inventory";
  window.currentSheet = "Inventory";
  window.currentSheetKey = "Inventory";

  if (!isSilent && invAllEntries.length === 0) {
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
  }

  const shouldShowOverlay = !isSilent && invAllEntries.length === 0;
  if (shouldShowOverlay && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const res = await window.fetchInventoryDataAPI();
    if (fetchToken !== activeInvFetchToken) return;

    if (res && res.success) {
      try { localStorage.setItem(INV_CACHE_KEY, JSON.stringify(res)); } catch (_) {}
      invAllEntries = (res.data || []).slice().reverse();
      updateInventoryKPIs(res.kpis);
      applyInventoryFilter();
    }
  } catch (error) {
    if (fetchToken !== activeInvFetchToken) return;
    console.error("Error fetching inventory data from D1:", error);
  } finally {
    if (shouldShowOverlay && typeof window.showLoading === 'function') {
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
  const rawQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const engQuery = toEngDigitsInv(rawQuery);

  if (!rawQuery) {
    invFilteredEntries = invAllEntries;
  } else {
    invFilteredEntries = invAllEntries.filter(e => {
      const desc = e.description || e.item_desc || e.item_name || "";
      const remark = e.remark || e.note || "";
      const my = e.month_year || formatInvMonthYear(e.date || e.entry_date);
      const d = e.date || e.entry_date || "";
      return [d, e.location, e.category, desc, e.unit, e.qty, remark, my, e.book_name]
        .some(v => {
          const s = (v ?? "").toString().toLowerCase();
          return s.includes(rawQuery) || s.includes(engQuery);
        });
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
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : canEdit;

  let html = "";
  if (total === 0) {
    html = `<tr><td colspan="11" class="text-center py-8 font-bold" style="color:#64748b;"><i class="fa-solid fa-boxes-packing mr-2"></i> ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    pageRows.forEach((entry, idx) => {
      const uid = String(entry.unique_id || entry.uniqueId || entry.id || "");
      const safeUidAttr = escapeInvHtml(uid);
      const srNo = (start + idx + 1);
      const qty = parseFloat(entry.qty) || 0;
      const dateText = entry.date || entry.entry_date || "-";
      const monthYearFormatted = escapeInvHtml(entry.month_year || formatInvMonthYear(dateText));

      const catName = entry.category || "-";
      const catDot = getInventoryCategoryDotColor(catName);
      const categoryHtml = `
        <span class="inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap" style="color: #e2e8f0;">
          <span style="width: 7px; height: 7px; border-radius: 9999px; background-color: ${catDot}; flex-shrink: 0; display: inline-block;"></span>
          <span>${escapeInvHtml(catName)}</span>
        </span>
      `;

      const rawDesc = entry.description || entry.item_desc || entry.item_name || "";
      const escapedDesc = escapeInvHtml(rawDesc);
      const pendingBadge = entry.pending
        ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold" style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.28);">Pending</span>`
        : '';
      const descHtml = rawDesc
        ? `<div class="min-w-[240px] max-w-[420px] text-[13px] leading-relaxed font-normal whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" style="color:#e2e8f0;" title="${escapedDesc}">${escapedDesc}${pendingBadge}</div>`
        : '<span class="font-mono" style="color:#475569;">-</span>';

      const rawRemark = entry.remark || entry.note || "";
      const escapedRemark = escapeInvHtml(rawRemark);
      const remarkHtml = rawRemark
        ? `<div class="min-w-[160px] max-w-[280px] text-xs leading-relaxed whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" style="color:#94a3b8;" title="${escapedRemark}">${escapedRemark}</div>`
        : '<span class="font-mono" style="color:#475569;">-</span>';

      html += `
        <tr class="transition-colors text-xs">
          <td class="text-center font-mono text-xs py-3" style="color:#64748b;">${srNo}</td>
          <td class="font-mono text-xs whitespace-nowrap px-2" style="color:#94a3b8;">${escapeInvHtml(dateText)}</td>
          <td class="font-medium whitespace-nowrap px-2" style="color:#cbd5e1;">${escapeInvHtml(entry.location || "-")}</td>
          <td class="whitespace-nowrap px-3">${categoryHtml}</td>
          <td class="py-2.5 px-3 align-middle text-left">${descHtml}</td>
          <td class="whitespace-nowrap px-2" style="color:#94a3b8;">${escapeInvHtml(entry.unit || "-")}</td>
          <td class="text-right font-mono font-semibold whitespace-nowrap px-3" style="color:${qty > 0 ? '#6ee7b7' : '#64748b'};">${qty.toLocaleString()}</td>
          <td class="py-2.5 px-2 align-middle text-left">${remarkHtml}</td>
          <td class="font-mono text-xs whitespace-nowrap px-2" style="color:#94a3b8;">${monthYearFormatted}</td>
          <td class="text-xs whitespace-nowrap px-2" style="color:#64748b;">${escapeInvHtml(entry.book_name || "Inventory")}</td>
          <td class="text-center right-0 sticky px-3 z-10">
            <div class="flex items-center justify-center gap-1.5">
              <button type="button" data-action="edit" data-uid="${safeUidAttr}" ${!canEdit ? 'disabled class="p-1.5 rounded-lg opacity-30 cursor-not-allowed text-xs" style="color:#64748b;"' : 'class="p-1.5 rounded-lg hover:bg-slate-800 transition-all text-xs cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#fbbf24\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="ပြင်ဆင်မည် (Edit)"><i class="fa-solid fa-pen-to-square"></i></button>
              <button type="button" data-action="delete" data-uid="${safeUidAttr}" ${!canDelete ? 'disabled class="p-1.5 rounded-lg opacity-30 cursor-not-allowed text-xs" style="color:#64748b;"' : 'class="p-1.5 rounded-lg hover:bg-slate-800 transition-all text-xs cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#fda4af\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="ဖျက်မည် (Delete)"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  if (lastRenderedInvHTML !== html) {
    lastRenderedInvHTML = html;
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

window.onInvSearchInput = function () {
  currentInvPage = 1;
  lastRenderedInvHTML = '';
  applyInventoryFilter();
};

window.nextInvPage = function () {
  const maxPage = Math.max(1, Math.ceil(invFilteredEntries.length / INV_ROWS_PER_PAGE));
  if (currentInvPage < maxPage) {
    currentInvPage++;
    lastRenderedInvHTML = '';
    renderInventoryTable();
  }
};

window.prevInvPage = function () {
  if (currentInvPage > 1) {
    currentInvPage--;
    lastRenderedInvHTML = '';
    renderInventoryTable();
  }
};

window.openAddInvModal = function () {
  initInventoryViewListeners();
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyInv("ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ ပစ္စည်းအသစ်ထည့်ခွင့် မရှိပါ။", "warning");
    return;
  }

  const modal = document.getElementById("inv-entry-modal");
  const form = document.getElementById("inv-entry-form");
  if (form) form.reset();

  const idInput = document.getElementById("inv-id");
  if (idInput) idInput.value = "";

  const dateInput = document.getElementById("inv-date");
  if (dateInput) dateInput.value = getTodayInvISO();

  const unitSelect = document.getElementById("inv-unit");
  if (unitSelect) unitSelect.value = "ခု";

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်းအသစ် သွင်းယူရန်";

  if (modal) modal.classList.remove("hidden");
};

window.closeInvModal = function () {
  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.add("hidden");
};

window.saveInventoryForm = async function (event) {
  if (event && event.preventDefault) event.preventDefault();
  if (isInvSubmitting) return;

  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyInv("ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ သိမ်းဆည်းခွင့် မရှိပါ။", "warning");
    return;
  }

  const dateEl = document.getElementById("inv-date");
  const date = toEngDigitsInv(dateEl ? dateEl.value.trim() : "");
  if (!isValidInvDate(date)) {
    alert("ရက်စွဲ (Date) အား မှန်ကန်စွာ ရွေးချယ်ပေးပါခင်ဗျာ။");
    if (dateEl) dateEl.focus();
    return;
  }

  const descEl = document.getElementById("inv-item-name");
  const description = descEl ? descEl.value.trim() : "";
  if (!description) {
    alert("ပစ္စည်းအမည် / အကြောင်းအရာ အား ထည့်သွင်းပေးပါခင်ဗျာ။");
    if (descEl) descEl.focus();
    return;
  }

  const qtyEl = document.getElementById("inv-qty");
  const rawQty = toEngDigitsInv(qtyEl ? qtyEl.value : "").replace(/,/g, "").replace(/[^0-9.]/g, "").trim();
  const qty = parseFloat(rawQty);
  if (qtyEl) qtyEl.value = (rawQty !== "" && Number.isFinite(qty) && qty >= 0) ? String(qty) : "";
  if (rawQty === "" || !Number.isFinite(qty) || qty < 0) {
    alert("အရေအတွက် (Quantity) ကို ၀ သို့မဟုတ် ၀ ထက်ကြီးသော ဂဏန်း မှန်ကန်စွာ ထည့်သွင်းပေးပါခင်ဗျာ။");
    if (qtyEl) qtyEl.focus();
    return;
  }

  const existingUid = (document.getElementById("inv-id")?.value || "").trim();
  const location = document.getElementById("inv-location")?.value || "စတို";
  const category = document.getElementById("inv-category")?.value || "အထွေထွေ";
  const unit = document.getElementById("inv-unit")?.value || "ခု";
  const remark = (document.getElementById("inv-remark")?.value || "").trim();

  const month_year = formatInvMonthYear(date);
  const isEdit = !!existingUid;
  const finalUid = existingUid || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? `INV-${crypto.randomUUID()}`
    : `INV_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  const payload = {
    unique_id: finalUid,
    date, location, category, description, unit, qty, remark, month_year, book_name: "Inventory",
    uniqueId: finalUid, entry_date: date, item_desc: description, item_name: description, note: remark
  };

  const form = document.getElementById("inv-entry-form");
  const submitBtn = form ? form.querySelector("button[type='submit']") : null;
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "Save";

  isInvSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
  }
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const res = await window.saveInventoryEntryAPI(payload, isEdit);
    if (res && res.success) {
      try { localStorage.removeItem(INV_CACHE_KEY); } catch (_) {}
      lastRenderedInvHTML = '';
      window.closeInvModal();
      notifyInv(res.message || (isEdit ? 'ပစ္စည်းစာရင်း ပြင်ဆင်ပြီးပါပြီ' : 'ပစ္စည်းစာရင်း သိမ်းဆည်းပြီးပါပြီ'), res.offline ? 'warning' : 'success');
      await window.renderInventoryView(false);
    } else if (!res || res.status !== 401) {
      notifyInv("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
    }
  } catch (err) {
    console.error("Save Inventory Error:", err);
    notifyInv("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။", "error");
  } finally {
    isInvSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.saveInvEntryForm = window.saveInventoryForm;

window.editInvEntry = function (uid) {
  initInventoryViewListeners();
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyInv("ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ ပြင်ဆင်ခွင့် မရှိပါ။", "warning");
    return;
  }

  const entry = invAllEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById("inv-entry-modal");
  if (modal) modal.classList.remove("hidden");

  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း ပြင်ဆင်ရန်";

  document.getElementById("inv-id").value = entry.unique_id || entry.uniqueId || uid;
  document.getElementById("inv-date").value = entry.date || entry.entry_date || "";

  setInvSelectSafe(document.getElementById("inv-location"), entry.location || "မီးဖိုဆောင်");
  setInvSelectSafe(document.getElementById("inv-category"), entry.category || "ပရိဘောဂ");
  document.getElementById("inv-item-name").value = entry.description || entry.item_desc || entry.item_name || "";
  setInvSelectSafe(document.getElementById("inv-unit"), entry.unit || "ခု");

  document.getElementById("inv-qty").value = parseFloat(entry.qty) ?? 1;
  document.getElementById("inv-remark").value = entry.remark || entry.note || "";
};

window.deleteInvEntry = async function (uid) {
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : true;
  if (!canDelete) {
    notifyInv("သင့်ရာထူးအဆင့်တွင် ပစ္စည်းစာရင်း ဖျက်သိမ်းခွင့် မရှိပါ။", "warning");
    return;
  }

  if (!confirm("ဤပစ္စည်းစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.deleteInventoryEntryAPI(uid);
    if (res && res.success) {
      try { localStorage.removeItem(INV_CACHE_KEY); } catch (_) {}
      lastRenderedInvHTML = '';
      notifyInv(res.message || 'ပစ္စည်းစာရင်း ဖျက်သိမ်းပြီးပါပြီ', res.offline ? 'warning' : 'success');
      await window.renderInventoryView(false);
    } else if (!res || res.status !== 401) {
      notifyInv("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
    }
  } catch (err) {
    console.error("Delete Inventory Error:", err);
    notifyInv("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။", "error");
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.exportInventoryCSV = function () {
  if (!invFilteredEntries || invFilteredEntries.length === 0) {
    notifyInv("Export လုပ်ရန် ဒေတာ မရှိပါ။", "warning");
    return;
  }

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,နေရာ,အမျိုးအစား,အကြောင်းအရာ,ရေတွက်ပုံ,အရေအတွက်,မှတ်ချက်,လနှစ်,စာအုပ်အမည်\n";

  invFilteredEntries.forEach((e, idx) => {
    const desc = e.description || e.item_desc || e.item_name || "";
    const remark = e.remark || e.note || "";
    const dateText = e.date || e.entry_date || "";
    const my = e.month_year || formatInvMonthYear(dateText);

    csv += [
      (idx + 1),
      invCsvCell(dateText),
      invCsvCell(e.location),
      invCsvCell(e.category),
      invCsvCell(desc),
      invCsvCell(e.unit),
      e.qty || 0,
      invCsvCell(remark),
      invCsvCell(my),
      invCsvCell(e.book_name || "Inventory")
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Inventory_Export_${getTodayInvISO()}.csv`;
  link.click();
};
// === END OF Inventory.js ===
