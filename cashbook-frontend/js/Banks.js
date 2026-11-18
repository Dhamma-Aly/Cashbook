// ===================================================================
// js/Banks.js - Bank & Ledger Table Renderer & Cascading Controller (v5.0)
// Features: Anti-Jitter DOM, Versioned Cache Sync, Role-Guarded Actions,
// XSS Safe, Double-Submit Lock, Offline Pending Badge & Atomic Transfers
// ===================================================================

const LEDGER_ROWS_PER_PAGE = 20;
let ledgerCurrentPage = 1;
let bankAllEntries = [];
let bankFilteredEntries = [];
let isEditingMode = false;
let isFormSubmitting = false;

let lastRenderedTableHTML = '';
let lastRenderedTableId = '';
let activeLedgerFetchToken = 0;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notify(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
}

function getIsRealEditMode() {
  const entryIdEl = document.getElementById("entry-id");
  const hasId = !!(entryIdEl && String(entryIdEl.value || '').trim());
  return isEditingMode && hasId;
}

function setSelectValueSafe(selectEl, value) {
  if (!selectEl) return;
  const val = String(value ?? '').trim();
  if (!val) return;
  const exists = Array.from(selectEl.options).some(opt => opt.value === val);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    selectEl.appendChild(opt);
  }
  selectEl.value = val;
}

function setReceiverDropdownState(recSelect, mode) {
  if (!recSelect) return;
  const users = (window.CONFIG?.AVAILABLE_USERS) || ['User 1', 'User 2', 'User 3'];

  if (mode === 'BANK_LOCKED') {
    if (!Array.from(recSelect.options).some(o => o.value === 'Bank')) {
      const bankOpt = document.createElement('option');
      bankOpt.value = 'Bank';
      bankOpt.textContent = 'Bank';
      recSelect.appendChild(bankOpt);
    }
    recSelect.value = 'Bank';
    recSelect.style.pointerEvents = 'none';
    recSelect.style.opacity = '0.85';
  } else {
    const currentVal = recSelect.value;
    const bankOpt = Array.from(recSelect.options).find(o => o.value === 'Bank');
    if (bankOpt) bankOpt.remove();

    recSelect.style.pointerEvents = 'auto';
    recSelect.style.opacity = '1';

    if (currentVal && currentVal !== 'Bank') {
      setSelectValueSafe(recSelect, currentVal);
    } else if (users.length > 0 && !recSelect.value) {
      recSelect.value = users[0];
    }
  }
}

window.toEnglishDigits = function (str) {
  if (str === null || str === undefined) return '';
  const myanmarDigits = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
  return String(str).replace(/[၀-၉]/g, (ch) => myanmarDigits.indexOf(ch));
};

window.parseAmount = function (val) {
  if (val === null || val === undefined || val === '') return 0;
  const eng = window.toEnglishDigits(val);
  const clean = String(eng).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : 0;
};

function resolveD1Table(nameOrKey) {
  const k = String(nameOrKey || '').trim();
  const shortMap = {
    '1CB': '1CB Bank (General)', '2CB': '2CB Bank (Meal)', '3CB': '3CB Bank (UZ)',
    '4GB': '1General Book', '5FB': '2Meal Book', '6HB': '3Hall Book',
    '7PB': '4Pagoda Book', '8EB': '5Electronic Book', '9MB': '6Medical Book', '10GB': '7Other Book'
  };
  return shortMap[k] || k || '1CB Bank (General)';
}

function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function normalizeEntryType(typeStr) {
  const s = String(typeStr || '').trim();
  if (s.includes('ဝင်ငွေ')) return 'ဝင်ငွေ';
  if (s.includes('ထွက်ငွေ')) return 'ထွက်ငွေ';
  if (s.includes('စာရင်းပြောင်း')) return 'စာရင်းပြောင်း';
  return s || 'ဝင်ငွေ';
}

function resolveEntryTypeFromRecord(entry) {
  if (!entry) return 'ဝင်ငွေ';
  const uid = String(entry.unique_id || entry.uniqueId || '');
  const title = String(entry.title || '').trim();
  const subTitle = String(entry.sub_title || '').trim();
  const inc = parseFloat(entry.income) || 0;
  const exp = parseFloat(entry.expense) || 0;

  if (title === 'ဘဏ်ထုတ်ငွေ') {
    return exp > 0 ? 'ထွက်ငွေ' : 'ဝင်ငွေ';
  }
  if (title === 'စာရင်းပြောင်း' || uid.endsWith('_OUT') || uid.endsWith('_IN') || subTitle.includes('လွှဲပြောင်း')) {
    return 'စာရင်းပြောင်း';
  }
  if (exp > 0 && inc === 0) return 'ထွက်ငွေ';
  if (inc > 0 && exp === 0) return 'ဝင်ငွေ';
  if (title.includes('ထွက်ငွေ')) return 'ထွက်ငွေ';
  return 'ဝင်ငွေ';
}

function getTreeGroupKey(tableName) {
  const tbl = resolveD1Table(tableName);
  return window.CONFIG?.TABLE_GROUP_MAP?.[tbl] || window.CONFIG?.SHEET_GROUP_MAP?.[tbl] || 'PADETHA_BOOKS';
}

// ===================================================================
// 🌟 VIEW RENDERER (Anti-Jitter + Race-Condition Guard)
// ===================================================================
window.renderBankView = async function (tableIdentifier, isSilent = false) {
  const currentTable = resolveD1Table(tableIdentifier || window.currentSheet || window.currentTable || '1CB Bank (General)');
  const fetchToken = ++activeLedgerFetchToken;

  const isTableChanged = (window.currentTable !== currentTable);
  window.currentTable = currentTable;
  window.currentSheet = currentTable;

  if (isTableChanged) {
    ledgerCurrentPage = 1;
    lastRenderedTableHTML = '';
    lastRenderedTableId = currentTable;
  }

  if (!isSilent && isTableChanged) {
    const tbody = document.getElementById("table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>`;
    }
  }

  try {
    const res = await window.fetchSheetData(currentTable);
    if (fetchToken !== activeLedgerFetchToken) return;

    if (res && res.success) {
      bankAllEntries = (res.data || []).slice().reverse();
      updateLedgerKPIs(res.kpis);
    } else if (!isSilent) {
      bankAllEntries = [];
      updateLedgerKPIs(null);
    }
  } catch (error) {
    if (fetchToken !== activeLedgerFetchToken) return;
    console.error("Error fetching D1 ledger data:", error);
    if (!isSilent) {
      bankAllEntries = [];
      updateLedgerKPIs(null);
      const tbody = document.getElementById("table-body");
      if (tbody) {
        lastRenderedTableHTML = '';
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-rose-400 font-bold"><i class="fa-solid fa-triangle-exclamation mr-2"></i> ဒေတာဆွဲယူရာတွင် အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။</td></tr>`;
      }
      return;
    }
  }

  applyLedgerSearchFilter(isSilent);
};

window.loadSheetView = function (isSilent = false) {
  window.renderBankView(window.currentTable || window.currentSheet, isSilent);
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

function applyLedgerSearchFilter(isSilent = false) {
  const searchInput = document.getElementById("search-input");
  const rawQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!rawQuery) {
    bankFilteredEntries = bankAllEntries;
  } else {
    const engQuery = window.toEnglishDigits(rawQuery);
    const cleanNumQuery = engQuery.replace(/,/g, '');

    bankFilteredEntries = bankAllEntries.filter(e => {
      const inc = parseFloat(e.income) || 0;
      const exp = parseFloat(e.expense) || 0;
      const bal = parseFloat(e.balance) || 0;

      const incStr = inc.toString();
      const incFmt = inc.toLocaleString().toLowerCase();
      const expStr = exp.toString();
      const expFmt = exp.toLocaleString().toLowerCase();
      const balStr = bal.toString();
      const balFmt = bal.toLocaleString().toLowerCase();

      const voucherEng = window.toEnglishDigits(e.voucher_no || '').toLowerCase();
      const dateText = (e.date || '').toLowerCase();
      const titleText = (e.title || '').toLowerCase();
      const subTitleText = (e.sub_title || '').toLowerCase();
      const descText = (e.description || '').toLowerCase();
      const receiverText = (e.receiver || '').toLowerCase();
      const bookText = (e.book_name || '').toLowerCase();
      const myText = (e.month_year || formatMonthYear(e.date)).toLowerCase();

      const textMatches = [
        dateText, titleText, subTitleText, descText,
        receiverText, bookText, myText, (e.voucher_no || '').toLowerCase(), voucherEng
      ].some(t => t.includes(rawQuery) || t.includes(engQuery));

      if (textMatches) return true;

      return [incStr, incFmt, expStr, expFmt, balStr, balFmt]
        .some(n => n.includes(cleanNumQuery) || n.includes(rawQuery) || n.includes(engQuery));
    });
  }

  renderLedgerTable(isSilent);
}

// ===================================================================
// 🌟 TABLE RENDERER (Anti-Jitter + Role Guards)
// ===================================================================
function renderLedgerTable(isSilent = false) {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  const total = bankFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage > maxPage) ledgerCurrentPage = maxPage;
  if (ledgerCurrentPage < 1) ledgerCurrentPage = 1;

  const start = (ledgerCurrentPage - 1) * LEDGER_ROWS_PER_PAGE;
  const end = Math.min(start + LEDGER_ROWS_PER_PAGE, total);
  const pageRows = bankFilteredEntries.slice(start, end);

  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : canEdit;

  let tableHTML = "";

  if (total === 0) {
    tableHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50 font-bold"><i class="fa-solid fa-folder-open mr-2"></i> စာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    pageRows.forEach((entry, idx) => {
      const uid = String(entry.unique_id || entry.uniqueId || "");
      const safeUidAttr = escapeHtml(uid);
      const srNo = (start + idx + 1);

      const income = parseFloat(entry.income) || 0;
      const expense = parseFloat(entry.expense) || 0;
      const balance = parseFloat(entry.balance) || 0;

      const titleText = entry.title || (income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ');
      const isIncome = income > 0;

      const isTransferIn = uid.endsWith('_IN');
      const isTransferOut = uid.endsWith('_OUT');
      const isTransfer = isTransferIn || isTransferOut || titleText === "စာရင်းပြောင်း" || titleText === "ဘဏ်ထုတ်ငွေ" || (entry.sub_title && entry.sub_title.includes("လွှဲပြောင်း"));

      let badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      if (isIncome && !isTransfer) badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      if (isTransfer) {
        badgeClass = isIncome
          ? 'bg-purple-500/15 text-purple-300 border border-purple-400/40'
          : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
      }

      const pendingBadge = entry.pending
        ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-bold" title="Offline မှ Server သို့ ပို့ရန် စောင့်ဆိုင်းနေပါသည်">Pending</span>`
        : '';

      const monthYearFormatted = escapeHtml(entry.month_year || formatMonthYear(entry.date));
      const incomeHtml = income ? `<span class="text-emerald-400 font-mono font-bold">${income.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const expenseHtml = expense ? `<span class="text-rose-400 font-mono font-bold">${expense.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const balanceHtml = `<span class="text-amber-300 font-mono font-black">${balance.toLocaleString()}</span>`;

      const displayReceiver = entry.receiver || (isBankTable ? "Bank" : "-");
      const safeReceiver = escapeHtml(displayReceiver);
      const receiverBadge = displayReceiver !== "-"
        ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold text-[11px] whitespace-nowrap">${safeReceiver}</span>`
        : '<span class="text-slate-600 font-mono">-</span>';

      const escapedDesc = escapeHtml(entry.description || '');
      const descHtml = entry.description
        ? `<div class="text-slate-100 text-[13px] leading-relaxed font-medium whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" title="${escapedDesc}">${escapedDesc}</div>`
        : '<span class="text-slate-600 font-mono">-</span>';

      let actionButtons = '';
      if (isTransferIn) {
        actionButtons = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 border border-amber-500/30 text-[11px] font-bold shadow-sm" title="ဤစာရင်းသည် လက်ခံစာရင်း ဖြစ်သောကြောင့် မူရင်းလွှဲပို့ခဲ့သည့် စာအုပ်မှသာ ပြင်ဆင်/ဖျက်ပစ်နိုင်ပါသည်">
            <i class="fa-solid fa-lock text-[10px] text-amber-400"></i>
            <span>လက်ခံစာရင်း</span>
          </span>
        `;
      } else {
        actionButtons = `
          <button type="button" onclick="editEntry('${safeUidAttr}')" ${!canEdit ? 'disabled class="p-1.5 rounded-lg opacity-30 cursor-not-allowed text-slate-500 text-xs"' : 'class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs cursor-pointer"'} title="ပြင်ဆင်မည် (Edit)"><i class="fa-solid fa-pen-to-square"></i></button>
          <button type="button" onclick="deleteEntry('${safeUidAttr}')" ${!canDelete ? 'disabled class="p-1.5 rounded-lg opacity-30 cursor-not-allowed text-slate-500 text-xs"' : 'class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs cursor-pointer"'} title="ဖျက်မည် (Delete)"><i class="fa-solid fa-trash"></i></button>
        `;
      }

      tableHTML += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3 font-mono">${srNo}</td>
          <td class="font-mono text-xs text-slate-300 whitespace-nowrap px-2">${escapeHtml(entry.date || "-")}</td>
          <td class="whitespace-nowrap px-2"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${badgeClass}">${escapeHtml(titleText)}</span>${pendingBadge}</td>
          <td class="py-2.5 px-3 align-middle text-left">${descHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${incomeHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${expenseHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${balanceHtml}</td>
          <td class="font-medium text-amber-200/90 whitespace-nowrap px-2 text-[12.5px]">${escapeHtml(entry.sub_title || "-")}</td>
          <td class="font-mono text-xs text-amber-300/80 whitespace-nowrap px-2">${escapeHtml(entry.voucher_no || "-")}</td>
          <td class="whitespace-nowrap px-2">${receiverBadge}</td>
          <td class="font-mono text-xs text-sky-200 font-bold whitespace-nowrap px-2">${monthYearFormatted}</td>
          <td class="text-xs text-amber-500/70 font-semibold whitespace-nowrap px-3">${escapeHtml(entry.book_name || currentTable)}</td>
          <td class="text-center right-0 sticky bg-[#080d1a] px-3 z-10 border-l border-amber-500/20 shadow-[-10px_0_15px_rgba(0,0,0,0.6)]">
            <div class="flex items-center justify-center gap-2">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    });
  }

  if (lastRenderedTableHTML === tableHTML && lastRenderedTableId === currentTable) {
    updatePaginationNumbers(total, start, end);
    return;
  }

  lastRenderedTableHTML = tableHTML;
  lastRenderedTableId = currentTable;
  tbody.innerHTML = tableHTML;

  updatePaginationNumbers(total, start, end);
}

function updatePaginationNumbers(total, start, end) {
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

window.onLedgerSearchInput = function () {
  ledgerCurrentPage = 1;
  lastRenderedTableHTML = '';
  applyLedgerSearchFilter(false);
};

window.prevPage = function () {
  if (ledgerCurrentPage > 1) {
    ledgerCurrentPage--;
    lastRenderedTableHTML = '';
    renderLedgerTable(false);
  }
};

window.nextPage = function () {
  const maxPage = Math.max(1, Math.ceil(bankFilteredEntries.length / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage < maxPage) {
    ledgerCurrentPage++;
    lastRenderedTableHTML = '';
    renderLedgerTable(false);
  }
};

// ===================================================================
// Transfer Targets Generator
// ===================================================================
function updateTransferTargets(preselectedTarget = null) {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const recSelect = document.getElementById("entry-receiver");
  const currentSender = recSelect ? (recSelect.value || 'User 1') : 'User 1';
  const currentSelectedVal = preselectedTarget || (subSelect ? subSelect.value : null);

  const subLabel = document.getElementById("label-entry-subcategory");
  if (subLabel) subLabel.textContent = "လွှဲပြောင်းမည့် ပစ်မှတ် (Target)";

  const allUsers = (window.CONFIG?.AVAILABLE_USERS) || ['User 1', 'User 2', 'User 3'];
  const allBanks = (window.CONFIG?.AVAILABLE_BANKS) || [
    { id: '1CB Bank (General)', name: '1CB Bank (General) - အထွေထွေ ရန်ပုံငွေ' },
    { id: '2CB Bank (Meal)', name: '2CB Bank (Meal) - ဆွမ်းပဒေသာပင်' },
    { id: '3CB Bank (UZ)', name: '3CB Bank (UZ) - တစ်ဦးတည်းစာရင်း' }
  ];

  const isBankTable = currentTable.includes('Bank');
  let optGroups = '';

  if (!isBankTable) {
    const targetUsers = allUsers.filter(u => u !== currentSender);
    optGroups += `<optgroup label="-- Users အချင်းချင်း လွှဲပြောင်းရန် --">`;
    targetUsers.forEach(u => {
      optGroups += `<option value="${escapeHtml(u)}">${escapeHtml(u)} ထံ လွှဲပြောင်း</option>`;
    });
    optGroups += `</optgroup>`;

    optGroups += `<optgroup label="-- ဘဏ်စာရင်းများသို့ အပ်နှံရန် --">`;
    allBanks.forEach(b => {
      optGroups += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} သို့ လွှဲပြောင်း</option>`;
    });
    optGroups += `</optgroup>`;
  } else {
    optGroups += `<optgroup label="-- အခြားဘဏ်စာရင်းသို့ လွှဲပြောင်းရန် --">`;
    allBanks.filter(b => b.id !== currentTable).forEach(b => {
      optGroups += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} သို့ လွှဲပြောင်း</option>`;
    });
    optGroups += `</optgroup>`;

    optGroups += `<optgroup label="-- Users ထံ အသုံးစရိတ် ထုတ်ပေးရန် --">`;
    allUsers.forEach(u => {
      optGroups += `<option value="${escapeHtml(u)}">${escapeHtml(u)} ထံ အသုံးစရိတ် ထုတ်ပေးခြင်း</option>`;
    });
    optGroups += `</optgroup>`;
  }

  if (subSelect) {
    subSelect.innerHTML = optGroups;
    if (currentSelectedVal) {
      for (const opt of subSelect.options) {
        if (opt.value === currentSelectedVal || opt.text === currentSelectedVal || opt.text.includes(currentSelectedVal)) {
          opt.selected = true;
          break;
        }
      }
    }
  }

  if (!getIsRealEditMode()) {
    updateTransferDescriptionText();
  }
}
window.update4GBTransferTargets = updateTransferTargets;

function updateTransferDescriptionText() {
  if (getIsRealEditMode()) return;
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const descInput = document.getElementById("entry-description");
  if (!subSelect || !descInput) return;

  const selectedTarget = subSelect.value;
  if (selectedTarget.includes('Bank') || selectedTarget.includes('ဘဏ်')) {
    descInput.value = `${selectedTarget} သို့ ဘဏ်အပ်နှံခြင်း`;
  } else {
    descInput.value = `${selectedTarget} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
  }
}

window.onEntryReceiverChange = function () {
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType === 'စာရင်းပြောင်း') {
    const subSelect = document.getElementById("entry-subcategory");
    const currentTarget = subSelect ? subSelect.value : null;
    updateTransferTargets(currentTarget);
  }
};

window.onEntrySubcategoryChange = function () {
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType === 'စာရင်းပြောင်း' && !getIsRealEditMode()) {
    updateTransferDescriptionText();
  }
};

// ===================================================================
// Entry Type Change & Dynamic Labeling
// ===================================================================
window.onEntryTypeChange = function (selectedType) {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');
  const cleanType = normalizeEntryType(selectedType);

  const typeSelect = document.getElementById("entry-type");
  if (typeSelect && !getIsRealEditMode()) {
    typeSelect.disabled = false;
    typeSelect.style.opacity = '1';
  }

  const catSelect = document.getElementById("entry-category");
  const subSelect = document.getElementById("entry-subcategory");
  const subLabel = document.getElementById("label-entry-subcategory");
  const recSelect = document.getElementById("entry-receiver");
  const recLabel = document.getElementById("label-entry-receiver");
  const descInput = document.getElementById("entry-description");

  if (cleanType === 'စာရင်းပြောင်း') {
    if (catSelect) catSelect.innerHTML = `<option value="စာရင်းပြောင်း">စာရင်းပြောင်း</option>`;
    if (recLabel) recLabel.textContent = "လွှဲပို့သူ (Sender)";
    setReceiverDropdownState(recSelect, 'USERS');
    updateTransferTargets();
    return;
  }

  if (isBankTable && cleanType === 'ထွက်ငွေ') {
    if (subLabel) subLabel.textContent = "ခေါင်းစဉ်ခွဲ (Sub-Category)";
    if (recLabel) recLabel.textContent = "ငွေထုတ်ယူသူ (Receiver)";

    if (catSelect) {
      catSelect.innerHTML = `<option value="ဘဏ်ထုတ်ငွေ">ဘဏ်ထုတ်ငွေ</option>`;
      catSelect.value = "ဘဏ်ထုတ်ငွေ";
    }
    if (subSelect) {
      subSelect.innerHTML = `<option value="ကျောင်းရန်ပုံငွေ စာအုပ်">ကျောင်းရန်ပုံငွေ စာအုပ်</option>`;
      subSelect.value = "ကျောင်းရန်ပုံငွေ စာအုပ်";
    }
    setReceiverDropdownState(recSelect, 'USERS');
    if (recSelect) recSelect.value = "User 1";

    if (descInput && !getIsRealEditMode() && (!descInput.value || descInput.value.includes('ဘဏ်အပ်နှံခြင်း') || descInput.value.includes('ကျောင်းအသုံးစရိတ်'))) {
      descInput.value = "ကျောင်းအသုံးစရိတ် ထုတ်ပေးခြင်း (ဘဏ်မှရရှိငွေ)";
    }
    return;
  }

  if (recLabel) recLabel.textContent = "လက်ခံသူ / တာဝန်ခံ (User/Receiver)";

  if (isBankTable && cleanType === 'ဝင်ငွေ') {
    setReceiverDropdownState(recSelect, 'BANK_LOCKED');
  } else {
    setReceiverDropdownState(recSelect, 'USERS');
  }

  if (subLabel) subLabel.textContent = "ခေါင်းစဉ်ခွဲ (Sub-Category)";

  const groupKey = getTreeGroupKey(currentTable);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  const typeData = tree[cleanType] || tree[selectedType] || {};
  const categories = Object.keys(typeData);

  if (catSelect) {
    if (categories.length > 0) {
      catSelect.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      window.onEntryCategoryChange(categories[0]);
    } else {
      catSelect.innerHTML = `<option value="အထွေထွေ">အထွေထွေ</option>`;
      if (subSelect) subSelect.innerHTML = `<option value="ပုံမှန်">ပုံမှန်</option>`;
    }
  }
};

window.onEntryCategoryChange = function (selectedCategory) {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : 'ဝင်ငွေ');

  if (cleanType === 'စာရင်းပြောင်း') {
    updateTransferTargets();
    return;
  }

  if (isBankTable && cleanType === 'ထွက်ငွေ' && selectedCategory === 'ဘဏ်ထုတ်ငွေ') {
    const subSelect = document.getElementById("entry-subcategory");
    if (subSelect) {
      subSelect.innerHTML = `<option value="ကျောင်းရန်ပုံငွေ စာအုပ်">ကျောင်းရန်ပုံငွေ စာအုပ်</option>`;
      subSelect.value = "ကျောင်းရန်ပုံငွေ စာအုပ်";
    }
    return;
  }

  const groupKey = getTreeGroupKey(currentTable);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  const subcategories = tree[cleanType]?.[selectedCategory] || ['ပုံမှန်'];

  const subSelect = document.getElementById("entry-subcategory");
  if (subSelect) {
    subSelect.innerHTML = subcategories.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }
};

window.onBankCategoryChange = window.onEntryCategoryChange;
window.onBookTypeChange = window.onEntryTypeChange;

// -------------------------------------------------------------------
// 🌟 SAVE & SUBMIT LOGIC
// -------------------------------------------------------------------
window.saveEntryForm = async function (event) {
  if (event && event.preventDefault) event.preventDefault();
  if (isFormSubmitting) return;

  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notify("ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ စာရင်းသိမ်းဆည်းခွင့် မရှိပါ။", "warning");
    return;
  }

  const dateEl = document.getElementById("entry-date");
  const date = dateEl ? dateEl.value.trim() : "";
  if (!date) {
    alert("ရက်စွဲ (Date) အား မဖြစ်မနေ ရွေးချယ်ပေးပါခင်ဗျာ။");
    if (dateEl) dateEl.focus();
    return;
  }

  const amountEl = document.getElementById("entry-amount");
  const rawAmount = amountEl ? amountEl.value.trim() : "";
  const amount = window.parseAmount(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("ငွေပမာဏ (Amount) ကို ၀ ထက်ကြီးသော ဂဏန်း မှန်ကန်စွာ ထည့်သွင်းပေးပါခင်ဗျာ။");
    if (amountEl) amountEl.focus();
    return;
  }

  const descInput = document.getElementById("entry-description");
  const description = descInput ? descInput.value.trim() : "";
  if (!description) {
    alert("အကြောင်းအရာ (Description) အား မဖြစ်မနေ ထည့်သွင်းပေးပါခင်ဗျာ။");
    if (descInput) descInput.focus();
    return;
  }

  const entryIdEl = document.getElementById("entry-id");
  let unique_id = entryIdEl ? entryIdEl.value.trim() : "";
  const rawType = document.getElementById("entry-type")?.value || "ဝင်ငွေ";
  const cleanType = normalizeEntryType(rawType);
  const title = document.getElementById("entry-category")?.value || cleanType;
  const subcatEl = document.getElementById("entry-subcategory");
  const sub_title = subcatEl ? subcatEl.value : "";

  const rawVoucher = (document.getElementById("entry-voucher")?.value || "").trim();
  const voucher_no = window.toEnglishDigits(rawVoucher);

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  const rawReceiver = document.getElementById("entry-receiver")?.value || "User 1";
  const receiver = (isBankTable && cleanType === 'ဝင်ငွေ') ? "Bank" : rawReceiver;
  const month_year = formatMonthYear(date);
  const isEdit = !!unique_id;

  const income = cleanType === 'ဝင်ငွေ' ? amount : 0;
  const expense = cleanType === 'ထွက်ငွေ' ? amount : 0;

  const saveBtn = document.getElementById("btn-entry-save");
  const saveBtnText = document.getElementById("btn-entry-save-text");
  const originalBtnHtml = saveBtnText ? saveBtnText.innerHTML : "Save";

  isFormSubmitting = true;
  if (saveBtn) saveBtn.disabled = true;
  if (saveBtnText) saveBtnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> သိမ်းဆည်းနေပါသည်...';

  window.showLoading(true);

  try {
    const isBankWithdrawal = isBankTable && cleanType === 'ထွက်ငွေ' &&
      (title === 'ဘဏ်ထုတ်ငွေ' || sub_title.includes('ကျောင်းရန်ပုံငွေ'));

    if (isBankWithdrawal) {
      const destUser = receiver !== 'Bank' ? receiver : 'User 1';
      const groupId = isEdit
        ? String(unique_id).replace(/_(OUT|IN)$/, '')
        : `TRF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (!isEdit && entryIdEl) {
        entryIdEl.value = `${groupId}_OUT`;
      }

      const payload = {
        group_id: groupId,
        unique_id: isEdit ? `${groupId}_OUT` : undefined,
        book_name: currentTable,
        sheet_name: currentTable,
        date,
        amount,
        target: '1General Book',
        receiver: destUser,
        voucher_no,
        description: description || 'ကျောင်းအသုံးစရိတ် ထုတ်ပေးခြင်း (ဘဏ်မှရရှိငွေ)'
      };

      const res = await window.saveTransferAPI(payload, isEdit);
      if (res && res.success) {
        lastRenderedTableHTML = '';
        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        notify('ဘဏ်ထုတ်ငွေနှင့် ကျောင်းရန်ပုံငွေစာအုပ် ၂ ခုလုံးသို့ သိမ်းဆည်းပြီးပါပြီ', 'success');
        await window.renderBankView(currentTable, false);
      } else if (!res || res.status !== 401) {
        notify("ဘဏ်ထုတ်ငွေ သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
      }
      return;
    }

    if (cleanType === 'စာရင်းပြောင်း') {
      const target = sub_title;
      if (!target) {
        alert("လွှဲပြောင်းမည့် ပစ်မှတ် (Target) ကို ရွေးချယ်ပေးပါခင်ဗျာ။");
        return;
      }

      const groupId = isEdit
        ? String(unique_id).replace(/_(OUT|IN)$/, '')
        : `TRF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (!isEdit && entryIdEl) {
        entryIdEl.value = `${groupId}_OUT`;
      }

      const payload = {
        group_id: groupId,
        unique_id: isEdit ? `${groupId}_OUT` : undefined,
        book_name: currentTable,
        sheet_name: currentTable,
        date,
        amount,
        target: target,
        receiver,
        voucher_no,
        description
      };

      const res = await window.saveTransferAPI(payload, isEdit);
      if (res && res.success) {
        lastRenderedTableHTML = '';
        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        notify('စာရင်းပြောင်း လွှဲပြောင်းမှု အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ', 'success');
        await window.renderBankView(currentTable, false);
      } else if (!res || res.status !== 401) {
        notify("စာရင်းပြောင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
      }
      return;
    }

    if (!unique_id) {
      unique_id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `CB_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (entryIdEl) entryIdEl.value = unique_id;
    }

    const payload = {
      unique_id,
      book_name: currentTable,
      date,
      title: title || cleanType,
      sub_title: sub_title || '-',
      voucher_no,
      description,
      receiver,
      income,
      expense,
      month_year
    };

    const res = await window.saveCashbookEntryAPI(payload, isEdit);
    if (res && res.success) {
      lastRenderedTableHTML = '';
      if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
      notify(res.message || (isEdit ? 'စာရင်း ပြင်ဆင်ပြီးပါပြီ' : 'စာရင်း အသစ်သိမ်းဆည်းပြီးပါပြီ'), res.offline ? 'warning' : 'success');
      await window.renderBankView(currentTable, false);
    } else if (!res || res.status !== 401) {
      notify("စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
    }
  } catch (err) {
    console.error("Save Entry Error:", err);
    notify("စာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + (err?.message || "Unknown error"), "error");
  } finally {
    isFormSubmitting = false;
    isEditingMode = false;
    if (saveBtn) saveBtn.disabled = false;
    if (saveBtnText) saveBtnText.innerHTML = originalBtnHtml;
    window.showLoading(false);
  }
};

// ===================================================================
// EDIT ENTRY
// ===================================================================
window.editEntry = function (uid) {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notify("ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ ပြင်ဆင်ခွင့် မရှိပါ။", "warning");
    return;
  }

  const entry = bankAllEntries.find(e => String(e.unique_id || e.uniqueId) === String(uid));
  if (!entry) return;

  if (String(uid).endsWith('_IN')) {
    notify("ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့ခဲ့သော စာအုပ်မှသာ ပြင်ဆင်ခွင့် ရှိပါသည်ခင်ဗျာ။", "warning");
    return;
  }

  isEditingMode = true;
  isFormSubmitting = false;

  const saveBtn = document.getElementById("btn-entry-save");
  const saveBtnText = document.getElementById("btn-entry-save-text");
  if (saveBtn) saveBtn.disabled = false;
  if (saveBtnText) saveBtnText.innerHTML = "Save";

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.remove('hidden');

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန် (Edit Entry)";

  const cleanType = resolveEntryTypeFromRecord(entry);
  const isLinkedTransfer = String(uid).startsWith('TRF_');

  document.getElementById("entry-id").value = entry.unique_id || entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.date || "";
  document.getElementById("entry-voucher").value = window.toEnglishDigits(entry.voucher_no || "");
  document.getElementById("entry-amount").value = (parseFloat(entry.income) || parseFloat(entry.expense) || 0);

  const recSelect = document.getElementById("entry-receiver");
  const recLabel = document.getElementById("label-entry-receiver");
  const typeSelect = document.getElementById("entry-type");
  const catSelect = document.getElementById("entry-category");
  const subcatSelect = document.getElementById("entry-subcategory");

  if (typeSelect) {
    typeSelect.value = cleanType;
    typeSelect.disabled = isLinkedTransfer;
    typeSelect.style.opacity = isLinkedTransfer ? '0.75' : '1';
  }

  if (isBankTable && entry.title === 'ဘဏ်ထုတ်ငွေ') {
    if (recLabel) recLabel.textContent = "ငွေထုတ်ယူသူ (Receiver)";
    setReceiverDropdownState(recSelect, 'USERS');
    setSelectValueSafe(recSelect, entry.receiver || "User 1");

    if (catSelect) {
      catSelect.innerHTML = `<option value="ဘဏ်ထုတ်ငွေ">ဘဏ်ထုတ်ငွေ</option>`;
      catSelect.value = "ဘဏ်ထုတ်ငွေ";
    }
    if (subcatSelect) {
      subcatSelect.innerHTML = `<option value="ကျောင်းရန်ပုံငွေ စာအုပ်">ကျောင်းရန်ပုံငွေ စာအုပ်</option>`;
      subcatSelect.value = "ကျောင်းရန်ပုံငွေ စာအုပ်";
    }
  } else if (cleanType === 'စာရင်းပြောင်း') {
    if (recLabel) recLabel.textContent = "လွှဲပို့သူ (Sender)";
    setReceiverDropdownState(recSelect, 'USERS');
    setSelectValueSafe(recSelect, entry.receiver || "User 1");

    if (catSelect) catSelect.innerHTML = `<option value="စာရင်းပြောင်း">စာရင်းပြောင်း</option>`;
    let savedTarget = entry.sub_title || '';
    const knownUsers = (window.CONFIG?.AVAILABLE_USERS) || ['User 1', 'User 2', 'User 3'];
    const knownBanks = ((window.CONFIG?.AVAILABLE_BANKS) || [
      { id: '1CB Bank (General)' },
      { id: '2CB Bank (Meal)' },
      { id: '3CB Bank (UZ)' }
    ]).map(b => b.id);

    for (const k of [...knownUsers, ...knownBanks]) {
      if (savedTarget.includes(k)) {
        savedTarget = k;
        break;
      }
    }
    updateTransferTargets(savedTarget);
  } else {
    if (recLabel) recLabel.textContent = "လက်ခံသူ / တာဝန်ခံ (User/Receiver)";

    window.onEntryTypeChange(cleanType);

    if (isBankTable && cleanType === 'ဝင်ငွေ') {
      setReceiverDropdownState(recSelect, 'BANK_LOCKED');
    } else {
      setReceiverDropdownState(recSelect, 'USERS');
      setSelectValueSafe(recSelect, entry.receiver || "User 1");
    }

    if (catSelect && entry.title) {
      setSelectValueSafe(catSelect, entry.title);
      window.onEntryCategoryChange(entry.title);
    }
    if (subcatSelect && entry.sub_title) {
      setSelectValueSafe(subcatSelect, entry.sub_title);
    }
  }

  document.getElementById("entry-description").value = entry.description || "";
};

// ===================================================================
// DELETE ENTRY
// ===================================================================
window.deleteEntry = async function (uid) {
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : true;
  if (!canDelete) {
    notify("သင့်ရာထူးအဆင့်တွင် စာရင်းဖျက်သိမ်းခွင့် မရှိပါ။", "warning");
    return;
  }

  if (String(uid).endsWith('_IN')) {
    notify("ဤစာရင်းသည် လက်ခံစာရင်း (Incoming Transfer) ဖြစ်သောကြောင့် မူရင်းလွှဲပို့ခဲ့သော စာအုပ်မှသာ ဖျက်ပစ်ခွင့် ရှိပါသည်ခင်ဗျာ။", "warning");
    return;
  }

  const isTransfer = String(uid).includes('TRF_');
  const confirmMsg = isTransfer
    ? "ဤစာရင်းသည် ချိတ်ဆက်ထားသော (Transfer/Withdrawal) စာရင်းဖြစ်သဖြင့် အခြားစာအုပ်ရှိ စာရင်းပါ တစ်ပါတည်း ပျက်သွားပါမည်။ ဖျက်ရန် သေချာပါသလား?"
    : "ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?";

  if (!confirm(confirmMsg)) return;

  window.showLoading(true);
  try {
    let res;
    if (isTransfer) {
      const groupId = String(uid).replace(/_(OUT|IN)$/, '');
      res = await window.deleteTransferAPI(groupId);
    } else {
      res = await window.deleteCashbookEntryAPI(uid);
    }

    if (res && res.success) {
      notify(res.message || 'စာရင်း ဖျက်သိမ်းပြီးပါပြီ', res.offline ? 'warning' : 'success');
      lastRenderedTableHTML = '';
      await window.renderBankView(window.currentTable || window.currentSheet, false);
    } else if (!res || res.status !== 401) {
      notify("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + (res?.error || ""), "error");
    }
  } catch (err) {
    console.error("Delete Entry Error:", err);
    notify("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။", "error");
  } finally {
    window.showLoading(false);
  }
};

window.exportCSV = function () {
  if (!bankFilteredEntries || bankFilteredEntries.length === 0) {
    notify("Export လုပ်ရန် ဒေတာ မရှိပါ။", "warning");
    return;
  }

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,အကြောင်းအရာ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,လက်ခံသူ,လနှစ်,စာအုပ်အမည်\n";

  bankFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const my = e.month_year || formatMonthYear(e.date);
    const receiverText = isBankTable ? (e.receiver || "Bank") : (e.receiver || "");

    csv += [
      (idx + 1), esc(e.date), esc(e.title),
      esc(e.description), e.income || 0, e.expense || 0, e.balance || 0,
      esc(e.sub_title),
      esc(window.toEnglishDigits(e.voucher_no)), esc(receiverText), esc(my), esc(e.book_name || currentTable)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentTable}_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
