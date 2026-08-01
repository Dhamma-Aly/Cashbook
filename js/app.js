// js/app.js - FIXES NULL innerHTML BUG & DEFAULTS TO HOME DASHBOARD

let currentSheet = "Home"; // 💡 Default to Home Dashboard on App Start
let rawData = [];

function initApp() {
  const auth = getAuthUser();
  if (!auth) {
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("erp-workspace").classList.add("hidden");
    return;
  }

  document.getElementById("login-overlay").classList.add("hidden");
  document.getElementById("erp-workspace").classList.remove("hidden");
  document.getElementById("current-user-display").innerText = `${auth.user} (${auth.role})`;

  // 💡 Open Home Dashboard by Default
  switchTab("Home");
}

function switchTab(sheetName) {
  currentSheet = sheetName;
  
  // Sidebar Nav Active Highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + sheetName);
  if (activeBtn) activeBtn.classList.add("active");

  const titleText = CONFIG.SHEETS[sheetName] ? `${sheetName} - ${CONFIG.SHEETS[sheetName]}` : sheetName;
  document.getElementById("page-title").innerText = titleText;

  loadSheetView();
}

async function loadSheetView() {
  const container = document.getElementById("view-container");
  if (!container) return;
  
  // 💡 1. HANDLE NON-TABLE VIEWS (Home, Report, System) - Early Return to prevent null crashes
  if (currentSheet === "Home" || currentSheet === "Report" || currentSheet === "System") {
    let title = "Home Dashboard";
    let subtitle = "ဓမ္မအလင်းရောင် တောရရိပ်သာ ငွေစာရင်း စီမံခန့်ခွဲမှုစနစ် မှ ကြိုဆိုပါသည်";
    let icon = "fa-gauge-high";

    if (currentSheet === "Report") {
      title = "Reporting Center";
      subtitle = "ဘဏ္ဍာရေး အစီရင်ခံစာများ စင်တာ";
      icon = "fa-chart-pie";
    } else if (currentSheet === "System") {
      title = "System Settings";
      subtitle = "စနစ်ထိန်းချုပ်မှု ပြင်ဆင်ချက်များ";
      icon = "fa-gears";
    }

    container.innerHTML = `
      <div class="p-10 text-center border border-amber-900/30 bg-[#14110d] rounded-2xl shadow-2xl my-6 max-w-2xl mx-auto space-y-4">
        <div class="inline-flex items-center justify-center p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <i class="fa-solid ${icon} text-4xl"></i>
        </div>
        <h2 class="text-xl font-black text-gold-gradient">${title}</h2>
        <p class="text-xs text-amber-200/70">${subtitle}</p>
        <p class="text-[11px] text-amber-500/50 italic pt-3 border-t border-amber-900/20">
          (ဤအပိုင်းအတွက် သီးသန့် အချက်အလက်များကို အနီးကပ် ထပ်မံဖြည့်သွင်းပေးပါမည်)
        </p>
      </div>
    `;
    return; // ★ CRITICAL RETURN: Stops code execution from trying to update non-existent table elements!
  }

  // 💡 2. HANDLE TABLE SHEETS (1CB to 10GB)
  // Immediate UI Skeleton Render
  container.innerHTML = `
    <div class="space-y-5">
      <!-- Top 4 KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i class="fa-solid fa-arrow-trend-up text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စုစုပေါင်းဝင်ငွေ</p><h3 id="kpi-income" class="text-base font-extrabold text-emerald-400 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-rose-500/10 text-rose-400"><i class="fa-solid fa-arrow-trend-down text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စုစုပေါင်းထွက်ငွေ</p><h3 id="kpi-expense" class="text-base font-extrabold text-rose-400 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-amber-500/10 text-amber-400"><i class="fa-solid fa-scale-balanced text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">လက်ကျန်ငွေ</p><h3 id="kpi-balance" class="text-base font-extrabold text-amber-300 mt-1">0 MMK</h3></div>
        </div>
        <div class="stats-card">
          <div class="p-3.5 rounded-lg bg-sky-500/10 text-sky-400"><i class="fa-solid fa-list-check text-xl"></i></div>
          <div><p class="text-[10px] uppercase font-bold text-amber-500/70">စာကြောင်းရေ</p><h3 id="kpi-count" class="text-base font-extrabold text-amber-100 mt-1">0</h3></div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row justify-between items-center bg-[#14110d] border border-amber-900/30 p-4 rounded-xl gap-4">
        <div class="relative w-full sm:w-64">
          <input type="text" id="search-input" oninput="renderTable()" placeholder="ရှာဖွေရန်..." class="w-full pl-3 pr-4 py-2 text-xs rounded-lg bg-[#0a0806] border border-amber-900/40 text-amber-100 outline-none focus:border-amber-400">
        </div>
        <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button onclick="loadSheetView()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-rotate text-xs"></i> Refresh</button>
          <button onclick="exportCSV()" class="p-2 bg-[#1f1913] hover:bg-[#2a2118] border border-amber-900/30 text-amber-200 rounded-lg text-xs font-bold transition-all"><i class="fa-solid fa-file-export text-xs"></i> Export</button>
          <button id="btn-add-entry" onclick="openAddModal()" class="p-2 bg-amber-600 hover:bg-amber-500 text-amber-950 rounded-lg text-xs font-black transition-all"><i class="fa-solid fa-plus text-xs"></i> + စာရင်းအသစ်ထည့်ရန်</button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="bg-[#14110d] border border-amber-900/30 rounded-xl overflow-x-auto shadow-2xl">
        <table class="w-full text-left border-collapse min-w-[1400px]">
          <thead>
            <tr>
              <th class="w-12 text-center">စဉ်</th>
              <th class="w-28">ရက်စွဲ</th>
              <th class="w-24">ခေါင်းစဉ်</th>
              <th class="w-36">ခေါင်းစဉ်ခွဲ</th>
              <th class="w-28">ဘောင်ချာ</th>
              <th class="min-w-[200px]">အကြောင်းအရာ</th>
              <th class="w-28">လက်ခံသူ</th>
              <th class="w-32 text-right">ဝင်ငွေ</th>
              <th class="w-32 text-right">ထွက်ငွေ</th>
              <th class="w-32 text-right">လက်ကျန်</th>
              <th class="w-24">လနှစ်</th>
              <th class="w-36">စာအုပ်အမည်</th>
              <th class="w-24 text-center right-0 sticky">လုပ်ဆောင်ချက်</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="13" class="text-center py-8 text-amber-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> ဒေတာများ ဆွဲယူနေပါသည်...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Hide Add button for Viewer
  const auth = getAuthUser();
  if (auth && auth.role === "Viewer") {
    const addBtn = document.getElementById("btn-add-entry");
    if (addBtn) addBtn.style.display = "none";
  }

  // Fetch Data Safely
  try {
    rawData = await fetchSheetData(currentSheet);
    renderTable();
  } catch (err) {
    console.error("Sheet load error:", err);
    const tbody = document.getElementById("table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-6 text-rose-400 font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။ မကြာမီ ပြန်လည် ကြိုးစားပါ။</td></tr>`;
    }
  }
}

function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return; // Safely exit if table-body doesn't exist

  const searchInput = document.getElementById("search-input");
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const auth = getAuthUser();

  let totIncome = 0;
  let totExpense = 0;
  let runningBalance = 0;
  let html = "";
  let count = 0;

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

    count++;
    totIncome += income;
    totExpense += expense;
    runningBalance += (income - expense);

    const editable = canEditRecord(date);

    html += `
      <tr>
        <td class="text-center font-mono">${count}</td>
        <td class="font-mono">${date}</td>
        <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${category === 'ဝင်ငွေ' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950 text-rose-400 border border-rose-800/40'}">${category}</span></td>
        <td>${subCat}</td>
        <td class="font-mono text-amber-300">${voucher}</td>
        <td>${desc}</td>
        <td>${receiver}</td>
        <td class="text-right font-mono text-emerald-400 font-bold">${income ? income.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-rose-400 font-bold">${expense ? expense.toLocaleString() : '-'}</td>
        <td class="text-right font-mono text-amber-300 font-bold">${runningBalance.toLocaleString()}</td>
        <td class="font-mono text-amber-500/80">${monthYear}</td>
        <td class="text-amber-200/80">${bookName}</td>
        <td class="text-center right-0 sticky">
          ${auth && auth.role !== "Viewer" && editable ? `
            <button onclick="openEditModal('${uniqueId}')" class="text-amber-400 hover:text-amber-200 mr-2" title="ပြင်ဆင်မည်"><i class="fa-solid fa-pen-to-square"></i></button>
            ${auth.role === "Admin" ? `<button onclick="handleDelete('${uniqueId}')" class="text-rose-400 hover:text-rose-200" title="ဖျက်မည်"><i class="fa-solid fa-trash"></i></button>` : ''}
          ` : `<span class="text-amber-700/50 text-[10px] italic">Locked</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html || `<tr><td colspan="13" class="text-center py-6 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;

  // Safely update KPI Cards
  const kInc = document.getElementById("kpi-income");
  const kExp = document.getElementById("kpi-expense");
  const kBal = document.getElementById("kpi-balance");
  const kCnt = document.getElementById("kpi-count");

  if (kInc) kInc.innerText = totIncome.toLocaleString() + " MMK";
  if (kExp) kExp.innerText = totExpense.toLocaleString() + " MMK";
  if (kBal) kBal.innerText = runningBalance.toLocaleString() + " MMK";
  if (kCnt) kCnt.innerText = count;
}

function openAddModal() {
  document.getElementById("modal-form-title").innerText = "စာရင်းအသစ် ထည့်သွင်းရန်";
  document.getElementById("entry-uniqueId").value = "";
  document.getElementById("entry-date").value = new Date().toISOString().split('T')[0];
  document.getElementById("entry-type").value = "ဝင်ငွေ";
  document.getElementById("entry-amount").value = "";
  document.getElementById("entry-voucher").value = "";
  document.getElementById("entry-description").value = "";

  const auth = getAuthUser();
  document.getElementById("entry-receiver").value = auth ? auth.user : "User";

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

  let subMap = CONFIG.SUB_CATEGORIES[currentSheet] || CONFIG.SUB_CATEGORIES["DefaultLedger"];
  if (["1CB", "2CB", "3CB"].includes(currentSheet)) {
    subMap = CONFIG.SUB_CATEGORIES["BankGroup"];
  }

  const options = subMap[type] || [];
  subSelect.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join("");
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

  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

async function handleDelete(uniqueId) {
  if (!confirm("ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;

  document.getElementById("loading-overlay").classList.remove("hidden");
  await deleteSheetEntry(currentSheet, uniqueId);
  await loadSheetView();
  document.getElementById("loading-overlay").classList.add("hidden");
}

function exportCSV() {
  let csv = "စဉ်,ရက်စွဲ,ခေါင်းစဉ်,ခေါင်းစဉ်ခွဲ,ဘောင်ချာ,အကြောင်းအရာ,လက်ခံသူ,ဝင်ငွေ,ထွက်ငွေ,လက်ကျန်,လနှစ်,စာအုပ်အမည်\n";
  rawData.forEach((r, i) => {
    csv += `"${i+1}","${r[1]}","${r[2]}","${r[3]}","${r[4]}","${r[5]}","${r[6]}","${r[7]}","${r[8]}","${r[9]}","${r[10]}","${r[11]}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentSheet}_Export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

window.onload = initApp;
