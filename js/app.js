// js/app.js - Main Application Orchestrator
document.addEventListener("DOMContentLoaded", async () => {
  // Cache Engine အလုပ်မလုပ်ရင်တောင် Script မရပ်သွားစေရန်
  try {
    if (window.cacheEngine && window.cacheEngine.init) {
      await window.cacheEngine.init();
    }
  } catch (cacheErr) {
    console.warn("Cache engine initialization failed, proceeding without cache:", cacheErr);
  }

  // Auth စစ်ဆေးခြင်း
  try {
    const isAuthenticated = window.initAuth ? window.initAuth() : true;
    if (isAuthenticated) {
      await window.switchTab("Home");
    } else {
      console.warn("User is not authenticated.");
      // မှတ်ချက် - တကယ်လို့ Login မဝင်ထားရင် Login Page ကို Redirect လုပ်ချင်ရင် 
      // window.location.href = "login.html"; လို့ ပြောင်းသုံးနိုင်ပါတယ်။ 
      // အခုကတော့ Public Dashboard အနေနဲ့ ပွင့်နေပါမယ်။
      await window.switchTab("Home"); 
    }
  } catch (authErr) {
    console.error("Tab Initialization Error:", authErr);
    if (window.renderDashboardView) {
      await window.renderDashboardView();
    }
  }
});

window.switchTab = async function (tabKey) {
  window.currentSheetKey = tabKey; 

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`btn-${tabKey}`);
  if (activeBtn) activeBtn.classList.add("active");

  const pageTitle = document.getElementById("page-title");
  if (pageTitle) {
    pageTitle.textContent = (window.APP_CONFIG && window.APP_CONFIG.BOOKS && window.APP_CONFIG.BOOKS[tabKey]) || tabKey;
  }

  try {
    if (tabKey === "Home") {
      if (window.renderDashboardView) await window.renderDashboardView();
    } else if (["1CB", "2CB", "3CB"].includes(tabKey)) {
      if (window.renderBankView) await window.renderBankView(tabKey);
    } else if (["4GB", "5FB", "6HB", "7PB", "8EB", "9MB", "10GB"].includes(tabKey)) {
      if (window.renderBookView) await window.renderBookView(tabKey);
    } else if (tabKey === "11Inv") {
      if (window.renderInventoryView) await window.renderInventoryView();
    } else if (tabKey === "Report") {
      if (window.renderReportView) await window.renderReportView("Report");
    } else if (tabKey === "System") {
      if (window.renderReportView) await window.renderReportView("System");
    }
  } catch (err) {
    console.error(`Error rendering tab ${tabKey}:`, err);
  }
};

window.loadSheetView = async function () {
  if (window.currentSheetKey) {
    await window.switchTab(window.currentSheetKey);
  }
};

window.openAddModal = function () {
  const modal = document.getElementById("entry-modal");
  if (!modal) return;
  
  const form = document.getElementById("entry-form");
  if (form) form.reset();
  
  const uidInput = document.getElementById("entry-uniqueId");
  if (uidInput) uidInput.value = "";
  
  const dateInput = document.getElementById("entry-date");
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
  
  if (window.onTypeChange) window.onTypeChange();
  modal.classList.remove("hidden");
};

window.closeEntryModal = function () {
  const modal = document.getElementById("entry-modal");
  if (modal) modal.classList.add("hidden");
};

window.onTypeChange = function () {
  const typeEl = document.getElementById("entry-type");
  const subSelect = document.getElementById("entry-subcategory");
  if (!typeEl || !subSelect) return;

  const type = typeEl.value;
  subSelect.innerHTML = "";

  const list = (window.APP_CONFIG && window.APP_CONFIG.SUBCATEGORIES && window.APP_CONFIG.SUBCATEGORIES[type]) || [];
  list.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    subSelect.appendChild(opt);
  });
};

window.saveEntryForm = async function (event) {
  event.preventDefault();
  const sheet = window.currentSheetKey;
  const uniqueId = document.getElementById("entry-uniqueId").value;
  const date = document.getElementById("entry-date").value;
  const type = document.getElementById("entry-type").value;
  const subcat = document.getElementById("entry-subcategory").value;
  const voucher = document.getElementById("entry-voucher").value;
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  const desc = document.getElementById("entry-description").value;

  const monthYear = date ? date.substring(0, 7) : "";
  const bookName = (window.APP_CONFIG && window.APP_CONFIG.BOOKS && window.APP_CONFIG.BOOKS[sheet]) || sheet;

  const income = type === "ဝင်ငွေ" ? amount : 0;
  const expense = type === "ထွက်ငွေ" ? amount : 0;

  const finalUniqueId = uniqueId || `ID-${Date.now()}`;
  const rowData = [
    "", date, type, subcat, voucher, desc, receiver,
    income, expense, "", monthYear, bookName, finalUniqueId
  ];

  window.closeEntryModal();
  const loader = document.getElementById("loading-overlay");
  if (loader) loader.classList.remove("hidden");

  try {
    if (window.saveSheetEntry) {
      await window.saveSheetEntry(sheet, rowData, uniqueId || null);
    }
    await window.switchTab(sheet);
  } catch (err) {
    alert("အချက်အလက် သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    if (loader) loader.classList.add("hidden");
  }
};

// 🔴 Inventory (11Inv) ပါ ရှုပ်မနေစေရန် ပြင်ဆင်ထားသည်
function findRowByUid(uid) {
  return (window.currentSheetData || []).find(r => String(r[12]) === String(uid));
}

window.editEntry = function (uid) {
  const r = findRowByUid(uid);
  if (!r) return;

  window.openAddModal();
  const titleEl = document.getElementById("modal-form-title");
  if (titleEl) titleEl.textContent = "စာရင်း ပြင်ဆင်ရန်";
  
  document.getElementById("entry-uniqueId").value = uid;
  document.getElementById("entry-date").value = r[1] || "";
  document.getElementById("entry-type").value = r[2] || "ဝင်ငွေ";
  if (window.onTypeChange) window.onTypeChange();
  document.getElementById("entry-subcategory").value = r[3] || "";
  document.getElementById("entry-voucher").value = r[4] || "";
  document.getElementById("entry-description").value = r[5] || "";
  document.getElementById("entry-receiver").value = r[6] || "None";

  // 🔴 Comma ပါလာလျှင် အရင်ဖယ်ရှားပြီးမှ Float သို့ ပြောင်းရန် ပြင်ဆင်ထားသည်
  const incStr = (r[7] || "0").toString().replace(/,/g, "");
  const expStr = (r[8] || "0").toString().replace(/,/g, "");
  const inc = parseFloat(incStr) || 0;
  const exp = parseFloat(expStr) || 0;
  
  document.getElementById("entry-amount").value = inc || exp || 0;
};

window.deleteEntry = async function (uid) {
  if (!confirm("ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;
  const loader = document.getElementById("loading-overlay");
  if (loader) loader.classList.remove("hidden");
  try {
    if (window.deleteSheetEntry) {
      await window.deleteSheetEntry(window.currentSheetKey, uid);
    }
    await window.switchTab(window.currentSheetKey);
  } catch (err) {
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    if (loader) loader.classList.add("hidden");
  }
};

window.exportCSV = function () {
  const rows = window.currentSheetData;
  if (!rows || rows.length === 0) return alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  rows.forEach(r => {
    csvContent += r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${window.currentSheetKey}_Export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
