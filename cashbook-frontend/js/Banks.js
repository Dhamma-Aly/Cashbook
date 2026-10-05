// ===================================================================
// js/Banks.js - Bank & Ledger Table Renderer & Cascading Controller
// Clean Architecture: Fully driven by window.CONFIG & view/Banks.html
// Features: 100% Smart Omni-Search (Searches Date, Title, Desc, Income, Expense, Balance, Subtitle, Voucher, Receiver)
// Supports Myanmar Numerals & Comma-Free Fuzzy Number Search
// ===================================================================

const LEDGER_ROWS_PER_PAGE = 20;
let ledgerCurrentPage = 1;
let bankAllEntries = [];      
let bankFilteredEntries = []; 

// 🌟 မြန်မာဂဏန်း (၀-၉) အား အင်္ဂလိပ်ဂဏန်း (0-9) သို့ အလိုအလျောက် ပြောင်းပေးသော Engine
window.toEnglishDigits = function(str) {
  if (str === null || str === undefined) return '';
  const myanmarDigits = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
  return String(str).replace(/[၀-၉]/g, (ch) => myanmarDigits.indexOf(ch));
};

// 🌟 ငွေပမာဏ ကော်မာနှင့် မြန်မာဂဏန်းများ ရှင်းထုတ်ပြီး Float အဖြစ် ပြောင်းပေးခြင်း
window.parseAmount = function(val) {
  if (val === null || val === undefined || val === '') return 0;
  const eng = window.toEnglishDigits(val);
  const clean = String(eng).replace(/[^0-9.-]/g, '');
  return parseFloat(clean) || 0;
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

function getTreeGroupKey(tableName) {
  const tbl = resolveD1Table(tableName);
  return window.CONFIG?.TABLE_GROUP_MAP?.[tbl] || window.CONFIG?.SHEET_GROUP_MAP?.[tbl] || 'PADETHA_BOOKS';
}

window.renderBankView = async function(tableIdentifier, isSilent = false) {
  const currentTable = resolveD1Table(tableIdentifier || window.currentSheet || window.currentTable || '1CB Bank (General)');
  window.currentTable = currentTable;
  window.currentSheet = currentTable;
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
    const res = await window.fetchSheetData(currentTable);
    if (res && res.success) {
      bankAllEntries = (res.data || []).slice().reverse();
      updateLedgerKPIs(res.kpis);
    } else {
      bankAllEntries = [];
      updateLedgerKPIs(null);
    }
  } catch (error) {
    console.error("Error fetching D1 ledger data:", error);
    bankAllEntries = [];
    updateLedgerKPIs(null);
  }

  applyLedgerSearchFilter();
};

window.loadSheetView = function(isSilent = false) {
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

// -------------------------------------------------------------------
// 🔍 SMART OMNI-SEARCH FILTER ENGINE (အစွမ်းထက် ဘက်စုံ ရှာဖွေမှုစနစ်)
// -------------------------------------------------------------------
function applyLedgerSearchFilter() {
  const searchInput = document.getElementById("search-input");
  const rawQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!rawQuery) {
    bankFilteredEntries = bankAllEntries;
  } else {
    // ရှာဖွေသည့် စကားလုံးအား အင်္ဂလိပ်ဂဏန်း၊ ကော်မာမပါသော ဂဏန်းတို့ဖြင့် ပြောင်းလဲစစ်ဆေးခြင်း
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

      // စာသားစစ်ဆေးမှု
      const textMatches = [
        dateText, titleText, subTitleText, descText, 
        receiverText, bookText, myText, (e.voucher_no || '').toLowerCase(), voucherEng
      ].some(t => t.includes(rawQuery) || t.includes(engQuery));

      if (textMatches) return true;

      // ဝင်ငွေ၊ ထွက်ငွေ၊ လက်ကျန် ဂဏန်းများ စစ်ဆေးမှု (ကော်မာပါပါ မပါပါ ရှာဖွေနိုင်သည်)
      const numMatches = [
        incStr, incFmt, expStr, expFmt, balStr, balFmt
      ].some(n => n.includes(cleanNumQuery) || n.includes(rawQuery) || n.includes(engQuery));

      return numMatches;
    });
  }

  renderLedgerTable();
}

function renderLedgerTable() {
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

  let tableHTML = "";

  if (total === 0) {
    tableHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50 font-bold"><i class="fa-solid fa-folder-open mr-2"></i> စာရင်း မရှိသေးပါ။</td></tr>`;
  } else {
    pageRows.forEach((entry, idx) => {
      const uid = entry.unique_id || entry.uniqueId || "";
      const srNo = entry.no || (start + idx + 1);
      const income = parseFloat(entry.income) || 0;
      const expense = parseFloat(entry.expense) || 0;
      const balance = parseFloat(entry.balance) || 0;

      const titleText = entry.title || (income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ');
      const isTransfer = titleText === "စာရင်းပြောင်း" || (entry.sub_title && entry.sub_title.includes("လွှဲပြောင်း"));
      const isIncome = income > 0;

      let badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      if (isIncome && !isTransfer) badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      if (isTransfer) {
        badgeClass = isIncome 
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40' 
          : 'bg-purple-500/10 text-purple-300 border border-purple-500/20';
      }

      const monthYearFormatted = entry.month_year || formatMonthYear(entry.date);
      const incomeHtml = income ? `<span class="text-emerald-400 font-mono font-bold">${income.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const expenseHtml = expense ? `<span class="text-rose-400 font-mono font-bold">${expense.toLocaleString()}</span>` : '<span class="text-slate-600 font-mono">-</span>';
      const balanceHtml = `<span class="text-amber-300 font-mono font-black">${balance.toLocaleString()}</span>`;
      
      const displayReceiver = isBankTable ? "Bank" : (entry.receiver || "-");
      const receiverBadge = displayReceiver !== "-"
        ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold text-[11px] whitespace-nowrap">${displayReceiver}</span>` 
        : '<span class="text-slate-600 font-mono">-</span>';

      const escapedDesc = (entry.description || '').replace(/"/g, '&quot;');
      const descHtml = entry.description 
        ? `<div class="text-slate-200 text-xs leading-relaxed font-normal whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" title="${escapedDesc}">${entry.description}</div>`
        : '<span class="text-slate-600 font-mono">-</span>';

      tableHTML += `
        <tr class="hover:bg-amber-500/5 transition-colors border-b border-amber-900/20">
          <td class="text-center font-bold text-amber-500/70 py-3 font-mono">${srNo}</td>
          <td class="font-mono text-xs text-slate-300 whitespace-nowrap px-2">${entry.date || "-"}</td>
          <td class="whitespace-nowrap px-2"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${badgeClass}">${titleText}</span></td>
          <td class="py-2.5 px-3 align-middle text-left">${descHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${incomeHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${expenseHtml}</td>
          <td class="text-right py-3 whitespace-nowrap px-2 font-mono">${balanceHtml}</td>
          <td class="font-semibold text-amber-200 whitespace-nowrap px-2">${entry.sub_title || "-"}</td>
          <td class="font-mono text-xs text-amber-300/80 whitespace-nowrap px-2">${entry.voucher_no || "-"}</td>
          <td class="whitespace-nowrap px-2">${receiverBadge}</td>
          <td class="font-mono text-xs text-sky-200 font-bold whitespace-nowrap px-2">${monthYearFormatted}</td>
          <td class="text-xs text-amber-500/70 font-semibold whitespace-nowrap px-3">${entry.book_name || currentTable}</td>
          <td class="text-center right-0 sticky bg-[#080d1a] px-3 z-10 border-l border-amber-500/20 shadow-[-10px_0_15px_rgba(0,0,0,0.6)]">
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

function updateTransferTargets() {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const recSelect = document.getElementById("entry-receiver");
  const currentSender = recSelect ? (recSelect.value || 'User 1') : 'User 1';

  const subLabel = document.getElementById("label-entry-subcategory");
  if (subLabel) subLabel.textContent = "လွှဲပြောင်းမည့် ပစ်မှတ် (Target)";

  if (currentTable === '1General Book') {
    const allUsers = ['User 1', 'User 2', 'User 3'];
    const targetUsers = allUsers.filter(u => u !== currentSender);

    let optionsHtml = '';
    targetUsers.forEach(u => {
      optionsHtml += `<option value="${u}">${u} ထံ လွှဲပြောင်း</option>`;
    });

    const bankTarget = window.CONFIG?.TRANSFER_MAPPING?.['1General Book']?.targetBank || '1CB Bank (General)';
    const bankTitle = window.CONFIG?.TRANSFER_MAPPING?.['1General Book']?.bankTitle || 'အထွေထွေ ရန်ပုံငွေ (Bank)';
    optionsHtml += `<option value="${bankTarget}">${bankTitle} သို့ လွှဲပြောင်း</option>`;

    if (subSelect) {
      subSelect.innerHTML = optionsHtml;
      updateTransferDescriptionText();
    }
  } else {
    const mapping = window.CONFIG?.TRANSFER_MAPPING?.[currentTable];
    const targetBank = mapping?.targetBank || '2CB Bank (Meal)';
    const bankTitle = mapping?.bankTitle || 'ဆွမ်းပဒေသာပင် (Bank)';

    if (subSelect) {
      subSelect.innerHTML = `<option value="${targetBank}">${bankTitle} သို့ လွှဲပြောင်း</option>`;
    }
    updateTransferDescriptionText();
  }
}
window.update4GBTransferTargets = updateTransferTargets;

function updateTransferDescriptionText() {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : '');
  if (cleanType !== 'စာရင်းပြောင်း') return;

  const subSelect = document.getElementById("entry-subcategory");
  const descInput = document.getElementById("entry-description");
  if (!subSelect || !descInput) return;

  const selectedTarget = subSelect.value;
  if (currentTable === '1General Book') {
    if (selectedTarget.includes('Bank') || selectedTarget.includes('ဘဏ်')) {
      descInput.value = "အထွေထွေ ရန်ပုံငွေ (Bank) သို့ ဘဏ်အပ်နှံခြင်း";
    } else {
      descInput.value = `${selectedTarget} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
    }
  } else {
    const mapping = window.CONFIG?.TRANSFER_MAPPING?.[currentTable];
    const bankTitle = mapping?.bankTitle || 'ဆွမ်းပဒေသာပင် (Bank)';
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

window.onEntryTypeChange = function(selectedType) {
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const cleanType = normalizeEntryType(selectedType);

  const catSelect = document.getElementById("entry-category");
  const subLabel = document.getElementById("label-entry-subcategory");

  if (cleanType === 'စာရင်းပြောင်း') {
    if (catSelect) catSelect.innerHTML = `<option value="စာရင်းပြောင်း">စာရင်းပြောင်း</option>`;
    updateTransferTargets();
    return;
  }

  if (subLabel) subLabel.textContent = "ခေါင်းစဉ်ခွဲ (Sub-Category)";

  const groupKey = getTreeGroupKey(currentTable);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  
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
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const typeSelect = document.getElementById("entry-type");
  const cleanType = normalizeEntryType(typeSelect ? typeSelect.value : 'ဝင်ငွေ');

  if (cleanType === 'စာရင်းပြောင်း') {
    updateTransferTargets();
    return;
  }

  const groupKey = getTreeGroupKey(currentTable);
  const tree = window.CONFIG?.CATEGORY_TREE?.[groupKey] || {};
  const subcategories = tree[cleanType]?.[selectedCategory] || ['ပုံမှန်'];

  const subSelect = document.getElementById("entry-subcategory");
  if (subSelect) {
    subSelect.innerHTML = subcategories.map(s => `<option value="${s}">${s}</option>`).join('');
  }
};

window.onBankCategoryChange = window.onEntryCategoryChange;
window.onBookTypeChange = window.onEntryTypeChange;

window.saveEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const unique_id = document.getElementById("entry-id").value;
  const date = document.getElementById("entry-date").value;
  const rawType = document.getElementById("entry-type").value;
  const cleanType = normalizeEntryType(rawType);
  const title = document.getElementById("entry-category").value;
  const subcatEl = document.getElementById("entry-subcategory");
  const sub_title = subcatEl ? subcatEl.value : "";
  
  // ဘောက်ချာနံပါတ် (၆-၀၀၀၁ မှ 6-0001 သို့ အလိုအလျောက် ပြောင်းလဲခြင်း)
  const rawVoucher = document.getElementById("entry-voucher").value.trim();
  const voucher_no = window.toEnglishDigits(rawVoucher);

  // ငွေပမာဏ (၁၅,၀၀၀ မှ 15000 သို့ အလိုအလျောက် ပြောင်းလဲခြင်း)
  const rawAmount = document.getElementById("entry-amount").value.trim();
  const amount = window.parseAmount(rawAmount);
  
  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  const rawReceiver = document.getElementById("entry-receiver")?.value || "User 1";
  const receiver = isBankTable ? "Bank" : rawReceiver;

  const description = document.getElementById("entry-description").value.trim();
  const month_year = formatMonthYear(date);
  const isEdit = !!unique_id;

  window.showLoading(true);
  try {
    if (cleanType === 'စာရင်းပြောင်း') {
      const target = sub_title;
      const transferGroupId = `TRF_${Date.now()}`;

      if (currentTable === '1General Book' && (target.includes('User 1') || target.includes('User 2') || target.includes('User 3'))) {
        let targetUser = 'User 2';
        if (target.includes('User 1')) targetUser = 'User 1';
        else if (target.includes('User 3')) targetUser = 'User 3';

        const senderDesc = description || `${targetUser} ထံ စာရင်းပြောင်း ပေးပို့ခြင်း`;
        const recipientDesc = `${receiver} ထံမှ စာရင်းပြောင်း ရရှိခြင်း`;

        const payload1 = {
          unique_id: `${transferGroupId}_OUT`,
          book_name: '1General Book',
          date,
          title: 'စာရင်းပြောင်း',
          sub_title: `${targetUser} သို့ လွှဲပြောင်း`,
          voucher_no,
          description: senderDesc,
          receiver: receiver,
          income: 0,
          expense: amount,
          month_year
        };

        const payload2 = {
          unique_id: `${transferGroupId}_IN`,
          book_name: '1General Book',
          date,
          title: 'စာရင်းပြောင်း',
          sub_title: `${receiver} ထံမှ လွှဲပြောင်းရရှိ`,
          voucher_no,
          description: recipientDesc,
          receiver: targetUser,
          income: amount,
          expense: 0,
          month_year
        };

        await window.saveCashbookEntryAPI(payload1, isEdit);
        await window.saveCashbookEntryAPI(payload2, isEdit);

        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        await window.renderBankView('1General Book');
        return;
      } 
      else {
        const mapping = window.CONFIG?.TRANSFER_MAPPING?.[currentTable];
        const targetBank = mapping?.targetBank || (currentTable === '1General Book' ? '1CB Bank (General)' : '2CB Bank (Meal)');
        const bankDesc = description || `${targetBank} သို့ ဘဏ်အပ်နှံခြင်း`;
        const bankIncomeDesc = `${currentTable} [${receiver}] မှ ဘဏ်အပ်ငွေ ရရှိခြင်း`;

        const payload1 = {
          unique_id: `${transferGroupId}_OUT`,
          book_name: currentTable,
          date,
          title: 'စာရင်းပြောင်း',
          sub_title: 'ဘဏ်အပ်နှံခြင်း',
          voucher_no,
          description: bankDesc,
          receiver: receiver,
          income: 0,
          expense: amount,
          month_year
        };

        const payload2 = {
          unique_id: `${transferGroupId}_IN`,
          book_name: targetBank,
          date,
          title: 'ဘဏ်အပ်ငွေ',
          sub_title: 'ဘဏ်အပ်နှံခြင်း',
          voucher_no,
          description: bankIncomeDesc,
          receiver: 'Bank',
          income: amount,
          expense: 0,
          month_year
        };

        await window.saveCashbookEntryAPI(payload1, isEdit);
        await window.saveCashbookEntryAPI(payload2, isEdit);

        if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
        await window.renderBankView(currentTable);
        return;
      }
    }

    const income = cleanType === "ဝင်ငွေ" ? amount : 0;
    const expense = cleanType === "ထွက်ငွေ" ? amount : 0;

    const payload = {
      unique_id: unique_id || crypto.randomUUID(),
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
      if (typeof window.closeEntryModal === 'function') window.closeEntryModal();
      await window.renderBankView(currentTable);
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
  const entry = bankAllEntries.find(e => String(e.unique_id || e.uniqueId) === String(uid));
  if (!entry) return;

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.remove('hidden');

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန်";

  const entryTitle = entry.title || (entry.income > 0 ? 'ဝင်ငွေ' : 'ထွက်ငွေ');
  const cleanType = normalizeEntryType(entryTitle);

  document.getElementById("entry-id").value = entry.unique_id || entry.uniqueId || "";
  document.getElementById("entry-date").value = entry.date || "";
  
  const recSelect = document.getElementById("entry-receiver");
  if (recSelect) {
    if (isBankTable) {
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
  if (catSelect && entry.title) {
    catSelect.value = entry.title;
    window.onEntryCategoryChange(entry.title);
  }

  const subcatSelect = document.getElementById("entry-subcategory");
  if (subcatSelect && entry.sub_title) {
    subcatSelect.value = entry.sub_title;
  }

  document.getElementById("entry-voucher").value = window.toEnglishDigits(entry.voucher_no || "");
  document.getElementById("entry-amount").value = (entry.income || entry.expense || 0);
  document.getElementById("entry-description").value = entry.description || "";
};

window.deleteEntry = async function(uid) {
  const entry = bankAllEntries.find(e => String(e.unique_id || e.uniqueId) === String(uid));
  const isTransfer = entry?.title === "စာရင်းပြောင်း" || entry?.sub_title?.includes("လွှဲပြောင်း") || String(uid).includes('TRF_');

  const confirmMsg = isTransfer 
    ? "ဤစာရင်းသည် စာရင်းပြောင်း (Transfer) စာရင်းဖြစ်သဖြင့် ချိတ်ဆက်ထားသော ဒုတိယစာကြောင်းပါ တစ်ပါတည်း ပျက်သွားပါမည်။ ဖျက်ရန် သေချာပါသလား?"
    : "ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?";

  if (!confirm(confirmMsg)) return;

  window.showLoading(true);
  try {
    if (isTransfer) {
      const groupId = String(uid).replace(/_(OUT|IN)$/, '');
      await window.deleteCashbookEntryAPI(`${groupId}_OUT`).catch(() => {});
      await window.deleteCashbookEntryAPI(`${groupId}_IN`).catch(() => {});
      await window.deleteCashbookEntryAPI(uid).catch(() => {});
    } else {
      await window.deleteCashbookEntryAPI(uid);
    }

    await window.renderBankView(window.currentTable || window.currentSheet);
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

  const currentTable = resolveD1Table(window.currentTable || window.currentSheet);
  const isBankTable = currentTable.includes('Bank');

  let csv = "\uFEFF";
  csv += "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,အကြောင်းအရာ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,လက်ခံသူ,လနှစ်,စာအုပ်အမည်\n";

  bankFilteredEntries.forEach((e, idx) => {
    const esc = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const my = e.month_year || formatMonthYear(e.date);
    const receiverText = isBankTable ? "Bank" : (e.receiver || "");

    csv += [
      e.no || (idx + 1), esc(e.date), esc(e.title),
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
