// ===================================================================
// js/Banks.js - Bank & Book Ledger Table Renderer & Cascading Controller
// Fixed: 1. Clean Type Parser (Category Dropdown never empty)
//        2. Universal 2-Way Double-Entry Transfer (4GB, 5FB, 8EB, 9MB, 10GB -> Bank)
//        3. Synchronized Double-Row Edit & Delete via transfer_group_id
//        4. Auto "Bank" Receiver & "ဘဏ်အပ်ငွေ" Subcategory in Bank Ledgers
// ===================================================================

const LEDGER_ROWS_PER_PAGE = 20;
let ledgerCurrentPage = 1;
let bankAllEntries = [];      
let bankFilteredEntries = []; 

function formatMonthYear(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[d.getMonth()];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}-${y}`;
}

// 💡 Helper: Type စာသားအား 'ဝင်ငွေ (Income)' မှ 'ဝင်ငွေ' သို့ သန့်စင်ပေးခြင်း
function normalizeEntryType(typeStr) {
  const s = String(typeStr || '').trim();
  if (s.includes('ဝင်ငွေ')) return 'ဝင်ငွေ';
  if (s.includes('ထွက်ငွေ')) return 'ထွက်ငွေ';
  if (s.includes('စာရင်းပြောင်း')) return 'စာရင်းပြောင်း';
  return s || 'ဝင်ငွေ';
}

function getTreeGroupKey(sheetCode) {
  const sheet = String(sheetCode || '1CB').trim();
  if (window.CONFIG?.SHEET_GROUP_MAP?.[sheet]) {
    return window.CONFIG.SHEET_GROUP_MAP[sheet];
  }
  if (['1CB', '2CB', '3CB'].includes(sheet)) return 'BANKS';
  if (sheet === '4GB') return '4GB';
  if (['6HB', '7PB'].includes(sheet)) return 'BUILDING_BOOKS';
  return 'PADETHA_BOOKS';
}

window.renderBankView = async function(sheetKey, isSilent = false) {
  let targetSheet = String(sheetKey || window.currentSheet || window.currentSheetKey || '1CB').trim();
  if (targetSheet === 'true' || targetSheet === 'false' || targetSheet === '1' || targetSheet === '1.0') {
    targetSheet = String(window.currentSheet || '1CB').trim();
  }
  
  window.currentSheetKey = targetSheet;
  window.currentSheet = targetSheet;
  ledgerCurrentPage = 1;

  bankAllEntries = [];
  bankFilteredEntries = [];

  if (!isSilent) {
    const tbody = document.getElementById("table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>`;
    }
  }

  try {
    const res = await window.fetchSheetData(window.currentSheetKey);
    if (res && res.success) {
      bankAllEntries = (res.data || []).slice().reverse();
      updateLedgerKPIs(res.kpis);
    } else {
      bankAllEntries = [];
      updateLedgerKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching ledger data:", error);
    bankAllEntries = [];
    updateLedgerKPIs(null);
  }

  applyLedgerSearchFilter();
};

window.loadSheetView = function(isSilent = false) {
  window.renderBankView(window.currentSheet || window.currentSheetKey, isSilent);
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
    bankFilteredEntries = bankAllEntries;
  } else {
    bankFilteredEntries = bankAllEntries.filter(e => {
      const my = formatMonthYear(e.entry_date || e.month_year);
      return [
        e.entry_date, e.category, e.subcategory, e.subcategory_detail, e.voucher_no, 
        e.description, e.receiver, e.book_name, e.income, e.expense, my
      ].some(v => (v || "").toString().toLowerCase().includes(query));
    });
  }

  renderLedgerTable();
}

function renderLedgerTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const currentSheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const isBankSheet = ['1CB', '2CB', '3CB'].includes(currentSheet);

  const total = bankFilteredEntries.length;
  const maxPage = Math.max(1, Math.ceil(total / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage > maxPage) ledgerCurrentPage = maxPage;
  if (ledgerCurrentPage < 1) ledgerCurrentPage = 1;

  const start = (ledgerCurrentPage - 1) * LEDGER_ROWS_PER_PAGE;
  const end = Math.min(start + LEDGER_ROWS_PER_PAGE, total);
  const pageRows = bankFilteredEntries.slice(start, end);
  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;

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

      const isTransfer = entry.category === "စာရင်းပြောင်း" || (entry.subcategory && entry.subcategory.includes("လွှဲပြောင်း"));
      const isIncome = income > 0;

      let badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      if (isIncome && !isTransfer) badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      if (isTransfer) {
        badgeClass = isIncome 
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40' 
          : 'bg-purple-500/10 text-purple-300 border border-purple-500/20';
      }

      const monthYearFormatted = formatMonthYear(entry.entry_date || entry.month_year);
      const incomeHtml = income ? `<span class="text-emerald-400 font-mono font-bold">${income.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const expenseHtml = expense ? `<span class="text-rose-400 font-mono font-bold">${expense.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const balanceHtml = `<span class="text-amber-300 font-mono font-black">${balance.toLocaleString()}</span>`;
      
      // 💡 Bank စာအုပ်များ ဖြစ်ပါက လက်ခံသူအား အလိုအလျောက် "Bank" အဖြစ် ပြသခြင်း
      const displayReceiver = isBankSheet ? "Bank" : (entry.receiver || "-");
      const receiverBadge = displayReceiver !== "-"
        ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold text-[11px] whitespace-nowrap">${displayReceiver}</span>` 
        : '<span class="text-slate-600 font-mono">-</span>';

      const descHtml = entry.description 
        ? `<div class="max-w-[280px] min-w-[200px] break-words whitespace-normal text-slate-200 text-xs leading-relaxed" style="word-break: break-word; overflow-wrap: anywhere;">${entry.description}</div>`
        : '<span class="text-slate-600 font-mono">-</span>';

      const catBadgeText = isTransfer ? 'စာရင်းပြောင်း' : (entry.category || '-');
      const subcatText = entry.subcategory_detail || entry.subcategory || '-';

      tableHTML += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3 font-mono">${srNo}</td>
          <td class="font-mono text-xs text-slate-300 whitespace-nowrap px-2">${entry.entry_date || "-"}</td>
          <td class="whitespace-nowrap px-2"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${badgeClass}">${catBadgeText}</span></td>
          <td class="font-semibold text-amber-200 whitespace-nowrap px-2">${subcatText}</td>
          <td class="font-mono text-xs text-amber-300/80 whitespace-nowrap px-2">${entry.voucher_no || "-"}</td>
          <td class="py-3 px-3">${descHtml}</td>
          <td class="whitespace-nowrap px-2">${receiverBadge}</td>
          <td class="text-right py-3 whitespace-nowrap px-2">${incomeHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2">${expenseHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2">${balanceHtml}</td>
          <td class="font-mono text-xs text-sky-200 font-bold whitespace-nowrap px-2">${monthYearFormatted}</td>
          <td class="text-xs text-amber-500/70 font-semibold whitespace-nowrap px-2">${entry.book_name || "-"}</td>
          <td class="text-center right-0 sticky bg-[#080d1a] px-3 z-10">
            <div class="flex items-center justify-center gap-2">
              <button onclick="editEntry('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-xs cursor-pointer"'} title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteEntry('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-xs cursor-pointer"'} title="Delete"><i class="fa-solid fa-trash"></i></button>
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
  const maxPage = Math.max(1, Math.ceil(bankFilteredEntries.length / LEDGER_ROWS_PER_PAGE));
  if (ledgerCurrentPage < maxPage) {
    ledgerCurrentPage++;
    renderLedgerTable();
  }
};

// -------------------------------------------------------------------
// 4. DYNAMIC TRANSFER TARGET HELPERS (4GB, 5FB, 8EB, 9MB, 10GB Universal)
// -------------------------------------------------------------------
function updateTransferTargets() {
  const sheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const recSelect = document.getElementById("entry-receiver");
  const currentSender = recSelect ? (recSelect.value || 'User 1') : 'User 1';

  const subLabel = document.getElementById("label-entry-subcategory");
  if (subLabel) subLabel.textContent = "လွှဲပြောင်းမည့် ပစ်မှတ် (Target)";

  if (sheet === '4GB') {
    const allUsers = ['User 1', 'User 2', 'User 3'];
    const targetUsers = allUsers.filter(u => u !== currentSender);

    let optionsHtml = '';
    targetUsers.forEach(u => {
      optionsHtml += `<option value="${u}">${u} ထံ လွှဲပြောင်း</option>`;
    });
    optionsHtml += `<option value="1CB">အထွေထွေ ရန်ပုံငွေ (Bank) သို့ လွှဲပြောင်း</option>`;

    if (subSelect) {
      subSelect.innerHTML = optionsHtml;
      updateTransferDescriptionText();
    }
  } else {
    // 💡 5FB, 8EB, 9MB, 10GB စသည်တို့အတွက် သက်ဆိုင်ရာ Target Bank စာရင်း
    const transferMap = window.CONFIG?.TRANSFER_MAPPING?.[sheet];
    const targetBankCode = transferMap?.targetBank || '2CB';
    const bankTitle = transferMap?.bankTitle || 'ဆွမ်းပဒေသာပင် (Bank)';

    if (subSelect) {
      subSelect.innerHTML = `<option value="${targetBankCode}">${bankTitle} သို့ လွှဲပြောင်း</option>`;
    }
    updateTransferDescriptionText();
  }
}
window.update4GBTransferTargets = updateTransferTargets;

function updateTransferDescriptionText() {
  const sheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const descInput = document.getElementById("entry-description");
  if (!subSelect || !descInput) return;

  const selectedTarget = subSelect.value;
  if (sheet === '4GB') {
    if (selectedTarget === '1CB' || selectedTarget.includes('Bank') || selectedTarget.includes('ဘဏ်')) {
      descInput.value = "အထွေထွေ ရန်ပုံငွေ (Bank) သို့ ဘဏ်အပ်နှံခြင်း";
    } else {
      descInput.value = `${selectedTarget} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
    }
  } else {
    const transferMap = window.CONFIG?.TRANSFER_MAPPING?.[sheet];
    const bankTitle = transferMap?.bankTitle || 'ဆွမ်းပဒေသာပင် (Bank)';
    descInput.value = `${bankTitle} သို့ ဘဏ်အပ်နှံခြင်း`;
  }
}

window.onEntryReceiverChange = function(val) {
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType === 'စာရင်းပြောင်း') {
    updateTransferTargets();
  }
};

window.onEntrySubcategoryChange = function(val) {
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType === 'စာရင်းပြောင်း') {
    updateTransferDescriptionText();
  }
};

// 💡 FIX 1: Type ရွေးလိုက်သည်နှင့် Category အလွတ်မဖြစ်ဘဲ ချက်ချင်း တန်းပေါ်စေခြင်း
window.onEntryTypeChange = function(selectedType) {
  const sheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const cleanType = normalizeEntryType(selectedType);

  const catSelect = document.getElementById("entry-category");
  const subLabel = document.getElementById("label-entry-subcategory");

  if (cleanType === 'စာရင်းပြောင်း') {
    if (catSelect) {
      catSelect.innerHTML = `<option value="စာရင်းပြောင်း">စာရင်းပြောင်း</option>`;
    }
    updateTransferTargets();
    return;
  }

  if (subLabel) subLabel.textContent = "ခေါင်းစဉ်ခွဲ (Sub-Category)";

  const groupKey = getTreeGroupKey(sheet);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  
  // 💡 cleanType ('ဝင်ငွေ' သို့မဟုတ် 'ထွက်ငွေ') ဖြင့် တိုက်ရိုက်ယူသဖြင့် ဘယ်တော့မှ မလွဲပါ
  const typeData = tree[cleanType] || tree[selectedType] || {};
  const categories = Object.keys(typeData);

  if (catSelect) {
    if (categories.length > 0) {
      catSelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
      window.onEntryCategoryChange(categories[0]);
    } else {
      catSelect.innerHTML = `<option value="အထွေထွေ">အထွေထွေ</option>`;
      const subSelect = document.getElementById("entry-subcategory");
      if (subSelect) subSelect.innerHTML = `<option value="ပုံမှန်">ပုံမှန်</option>`;
    }
  }
};

window.onEntryCategoryChange = function(selectedCategory) {
  const sheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : 'ဝင်ငွေ');

  if (cleanType === 'စာရင်းပြောင်း') {
    updateTransferTargets();
    return;
  }

  const groupKey = getTreeGroupKey(sheet);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  const subcategories = tree[cleanType]?.[selectedCategory] || ['ပုံမှန်'];

  const subSelect = document.getElementById("entry-subcategory");
  if (subSelect) {
    subSelect.innerHTML = subcategories.map(s => `<option value="${s}">${s}</option>`).join('');
  }
};

window.onBankCategoryChange = window.onEntryCategoryChange;
window.onBookTypeChange = window.onEntryTypeChange;

// -------------------------------------------------------------------
// 5. Save Form (Synchronized 2-Row Transfer with transfer_group_id)
// -------------------------------------------------------------------
window.saveEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const uniqueId = document.getElementById("entry-id").value;
  const entry_date = document.getElementById("entry-date").value;
  const rawType = document.getElementById("entry-type").value;
  const cleanType = normalizeEntryType(rawType);
  const category = document.getElementById("entry-category").value;
  const subcatEl = document.getElementById("entry-subcategory");
  const subcategory = subcatEl ? subcatEl.value : "";
  const voucher_no = document.getElementById("entry-voucher").value.trim();
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  
  let sheet_name = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const isBankSheet = ['1CB', '2CB', '3CB'].includes(sheet_name);

  // Bank စာအုပ်ဖြစ်ပါက လက်ခံသူသည် အမြဲတမ်း 'Bank' ဖြစ်ရမည်
  const rawReceiver = document.getElementById("entry-receiver")?.value || "User 1";
  const receiver = isBankSheet ? "Bank" : rawReceiver;

  const description = document.getElementById("entry-description").value.trim();
  const month_year = formatMonthYear(entry_date);

  const bookName = (window.CONFIG && window.CONFIG.SHEET_TITLES && window.CONFIG.SHEET_TITLES[sheet_name]) || sheet_name;
  const isEdit = !!uniqueId;

  window.showLoading(true);
  try {
    // 🌟 စာရင်းပြောင်း (Transfer) ဖြစ်ပါက 4GB ရော ပဒေသာပင်စာအုပ်များပါ ၂ ကြောင်း အလိုအလျောက် ခွဲထုတ်သိမ်းဆည်းခြင်း
    if (cleanType === 'စာရင်းပြောင်း') {
      const target = subcategory;
      
      // ချိတ်ဆက်မှုနံပါတ် (Edit / Delete တွင် ၂ ကြောင်းစလုံး ပြိုင်တူအလုပ်လုပ်စေရန်)
      const existingEntry = isEdit ? bankAllEntries.find(e => String(e.uniqueId) === String(uniqueId)) : null;
      const transferGroupId = existingEntry?.transfer_group_id || `TRF_${Date.now()}`;

      // A. 4GB အချင်းချင်း User လွှဲပြောင်းမှု (User 1 -> User 2 / User 3)
      if (sheet_name === '4GB' && (target.includes('User 1') || target.includes('User 2') || target.includes('User 3'))) {
        let targetUser = 'User 2';
        if (target.includes('User 1')) targetUser = 'User 1';
        else if (target.includes('User 3')) targetUser = 'User 3';

        const senderDesc = description || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
        const recipientDesc = `${receiver} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`;

        const payload1 = {
          uniqueId: `${transferGroupId}_OUT`,
          transfer_group_id: transferGroupId,
          sheet_name: '4GB',
          entry_date,
          category: 'ထွက်ငွေ',
          subcategory: 'စာရင်းပြောင်း',
          subcategory_detail: `${targetUser} သို့ လွှဲပြောင်း`,
          voucher_no,
          description: senderDesc,
          receiver: receiver,
          income: 0,
          expense: amount,
          amount: amount,
          month_year,
          book_name: bookName
        };

        const payload2 = {
          uniqueId: `${transferGroupId}_IN`,
          transfer_group_id: transferGroupId,
          sheet_name: '4GB',
          entry_date,
          category: 'ဝင်ငွေ',
          subcategory: 'လွှဲပြောင်းရရှိ',
          subcategory_detail: `${receiver} ထံမှ လွှဲပြောင်းရရှိ`,
          voucher_no,
          description: recipientDesc,
          receiver: targetUser,
          income: amount,
          expense: 0,
          amount: amount,
          month_year,
          book_name: bookName
        };

        await window.saveCashbookEntryAPI(payload1, isEdit);
        await window.saveCashbookEntryAPI(payload2, isEdit);

        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        await window.renderBankView('4GB');
        return;
      } 
      else {
        // B. သက်ဆိုင်ရာ Bank စာအုပ်သို့ ဘဏ်အပ်နှံ လွှဲပြောင်းမှု (4GB -> 1CB, 5FB/8EB/9MB/10GB -> 2CB)
        const transferMap = window.CONFIG?.TRANSFER_MAPPING?.[sheet_name];
        const targetBankCode = (sheet_name === '4GB') ? '1CB' : (transferMap?.targetBank || '2CB');
        const targetBankTitle = (sheet_name === '4GB') ? 'အထွေထွေ ရန်ပုံငွေ (Bank)' : (transferMap?.bankTitle || 'ဆွမ်းပဒေသာပင် (Bank)');

        const currentBookTitle = window.CONFIG?.SHEET_TITLES?.[sheet_name] || sheet_name;
        const bankDesc = description || `${targetBankTitle} သို့ ဘဏ်အပ်နှံခြင်း`;
        const bankIncomeDesc = `${currentBookTitle} [${receiver}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`;

        // ၁။ မူရင်းစာအုပ် ထွက်ငွေ
        const payload1 = {
          uniqueId: `${transferGroupId}_OUT`,
          transfer_group_id: transferGroupId,
          sheet_name: sheet_name,
          entry_date,
          category: 'ထွက်ငွေ',
          subcategory: 'စာရင်းပြောင်း',
          subcategory_detail: 'ဘဏ်အပ်နှံခြင်း',
          voucher_no,
          description: bankDesc,
          receiver: receiver,
          income: 0,
          expense: amount,
          amount: amount,
          month_year,
          book_name: currentBookTitle
        };

        // ၂။ သက်ဆိုင်ရာ Bank ဝင်ငွေ (Auto "ဘဏ်အပ်ငွေ" & "Bank")
        const payload2 = {
          uniqueId: `${transferGroupId}_IN`,
          transfer_group_id: transferGroupId,
          sheet_name: targetBankCode,
          entry_date,
          category: 'ဝင်ငွေ',
          subcategory: 'ဘဏ်အပ်ငွေ',
          subcategory_detail: 'ဘဏ်အပ်နှံခြင်း',
          voucher_no,
          description: bankIncomeDesc,
          receiver: 'Bank', // 💡 Bank တွင် အမြဲတမ်း 'Bank' ဖြစ်သည်
          income: amount,
          expense: 0,
          amount: amount,
          month_year,
          book_name: targetBankTitle
        };

        await window.saveCashbookEntryAPI(payload1, isEdit);
        await window.saveCashbookEntryAPI(payload2, isEdit);

        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        await window.renderBankView(sheet_name);
        return;
      }
    }

    // ပုံမှန် ဝင်ငွေ / ထွက်ငွေ စာရင်းသွင်းမှု
    const income = cleanType === "ဝင်ငွေ" ? amount : 0;
    const expense = cleanType === "ထွက်ငွေ" ? amount : 0;

    const payload = {
      uniqueId: uniqueId || `${sheet_name}-${Date.now()}`,
      sheet_name,
      entry_date,
      category: cleanType,
      subcategory: category,
      subcategory_detail: subcategory,
      voucher_no,
      description,
      receiver: receiver,
      income,
      expense,
      amount,
      month_year,
      book_name: bookName
    };

    const res = await window.saveCashbookEntryAPI(payload, isEdit);
    if (res && res.success) {
      if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
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
  const entry = bankAllEntries.find(e => String(e.uniqueId) === String(uid));
  if (!entry) return;

  const currentSheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const isBankSheet = ['1CB', '2CB', '3CB'].includes(currentSheet);

  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.remove('hidden');

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန်";

  const cleanType = normalizeEntryType(entry.category);

  document.getElementById("entry-id").value = entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.entry_date || "";
  
  // Bank စာအုပ်ဖြစ်ပါက 'Bank' ဟု ပုံသေထားပြီး Lock ချခြင်း
  const recSelect = document.getElementById("entry-receiver");
  if (recSelect) {
    if (isBankSheet) {
      let hasBankOpt = Array.from(recSelect.options).some(opt => opt.value === 'Bank');
      if (!hasBankOpt) {
        const opt = document.createElement('option');
        opt.value = 'Bank';
        opt.textContent = 'Bank';
        recSelect.prepend(opt);
      }
      recSelect.value = "Bank";
      recSelect.style.pointerEvents = 'none';
      recSelect.style.opacity = '0.85';
    } else {
      recSelect.value = entry.receiver || "User 1";
      recSelect.style.pointerEvents = 'auto';
      recSelect.style.opacity = '1';
    }
  }

  const typeSelect = document.getElementById("entry-type");
  if (typeSelect) {
    typeSelect.value = cleanType;
    window.onEntryTypeChange(cleanType);
  }

  const catSelect = document.getElementById("entry-category");
  if (catSelect && entry.subcategory) {
    catSelect.value = entry.subcategory;
    window.onEntryCategoryChange(entry.subcategory);
  }

  const subcatSelect = document.getElementById("entry-subcategory");
  if (subcatSelect && (entry.subcategory_detail || entry.subcategory)) {
    subcatSelect.value = entry.subcategory_detail || entry.subcategory;
  }

  document.getElementById("entry-voucher").value = entry.voucher_no || "";
  document.getElementById("entry-amount").value = (entry.income || entry.expense || entry.amount || 0);
  document.getElementById("entry-description").value = entry.description || "";
};

// 💡 2-Way Synchronized Delete: စာရင်းပြောင်း ဖြစ်ပါက ချိတ်ဆက်ထားသော ဒုတိယစာကြောင်းပါ တစ်ပါတည်း ဖျက်ပေးခြင်း
window.deleteEntry = async function(uid) {
  const entry = bankAllEntries.find(e => String(e.uniqueId) === String(uid));
  const isTransfer = entry?.category === "စာရင်းပြောင်း" || entry?.subcategory === "စာရင်းပြောင်း" || entry?.transfer_group_id || String(uid).includes('TRF_');

  const confirmMsg = isTransfer 
    ? "ဤစာရင်းသည် စာရင်းပြောင်း (Transfer) စာရင်းဖြစ်သဖြင့် ချိတ်ဆက်ထားသော ဒုတိယစာကြောင်းပါ တစ်ပါတည်း ပျက်သွားပါမည်။ ဖျက်ရန် သေချာပါသလား?"
    : "ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?";

  if (!confirm(confirmMsg)) return;

  window.showLoading(true);
  try {
    // အကယ်၍ transfer ဖြစ်ပါက ချိတ်ဆက်ထားသော OUT ရော IN ပါ ဖျက်ရန်
    if (isTransfer) {
      const groupId = entry?.transfer_group_id || String(uid).replace(/_(OUT|IN)$/, '');
      await window.deleteCashbookEntryAPI(`${groupId}_OUT`).catch(() => {});
      await window.deleteCashbookEntryAPI(`${groupId}_IN`).catch(() => {});
      await window.deleteCashbookEntryAPI(uid).catch(() => {});
    } else {
      await window.deleteCashbookEntryAPI(uid);
    }

    await window.renderBankView(window.currentSheetKey || window.currentSheet);
  } catch (err) {
    console.error("Delete Entry Error:", err);
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ။");
  } finally {
    window.showLoading(false);
  }
};

window.exportCSV = function() {
  if (!bankFilteredEntries || bankFilteredEntries.length === 0) {
    alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");
    return;
  }

  const currentSheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const isBankSheet = ['1CB', '2CB', '3CB'].includes(currentSheet);

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,အကြောင်းအရာ,လက်ခံသူ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,လနှစ်,စာအုပ်အမည်\n";

  bankFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const my = formatMonthYear(e.entry_date || e.month_year);

    const receiverText = isBankSheet ? "Bank" : (e.receiver || "");

    csv += [
      idx + 1, esc(e.entry_date), esc(e.category), esc(e.subcategory), esc(e.voucher_no),
      esc(e.description), esc(receiverText), e.income || 0, e.expense || 0, e.balance || 0,
      esc(my), esc(e.book_name)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${window.currentSheetKey || 'ledger'}_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
