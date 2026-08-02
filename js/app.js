// js/app.js - Main Application Orchestrator
document.addEventListener("DOMContentLoaded", async () => {
  await window.cacheEngine.init();
  if (window.initAuth()) {
    window.switchTab("Home");
  }
});

window.switchTab = async function (tabKey) {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`btn-${tabKey}`);
  if (activeBtn) activeBtn.classList.add("active");

  const pageTitle = document.getElementById("page-title");
  if (pageTitle) {
    pageTitle.textContent = window.APP_CONFIG.BOOKS[tabKey] || tabKey;
  }

  if (tabKey === "Home") {
    await window.renderDashboardView();
  } else if (["1CB", "2CB", "3CB"].includes(tabKey)) {
    await window.renderBankView(tabKey);
  } else if (["4GB", "5FB", "6HB", "7PB", "8EB", "9MB", "10GB"].includes(tabKey)) {
    await window.renderBookView(tabKey);
  } else if (tabKey === "11Inv") {
    await window.renderInventoryView();
  } else if (tabKey === "Report") {
    await window.renderReportView("Report");
  } else if (tabKey === "System") {
    await window.renderReportView("System");
  }
};

window.loadSheetView = async function () {
  if (window.currentSheetKey) {
    await window.switchTab(window.currentSheetKey);
  }
};

window.openAddModal = function () {
  const modal = document.getElementById("entry-modal");
  document.getElementById("entry-form").reset();
  document.getElementById("entry-uniqueId").value = "";
  document.getElementById("entry-date").valueAsDate = new Date();
  window.onTypeChange();
  modal.classList.remove("hidden");
};

window.closeEntryModal = function () {
  document.getElementById("entry-modal").classList.add("hidden");
};

window.onTypeChange = function () {
  const type = document.getElementById("entry-type").value;
  const subSelect = document.getElementById("entry-subcategory");
  subSelect.innerHTML = "";

  const list = window.APP_CONFIG.SUBCATEGORIES[type] || [];
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
  const uniqueId = document.getElementById("entry-uniqueId").value; // "" = new entry, else editing this row
  const date = document.getElementById("entry-date").value;
  const type = document.getElementById("entry-type").value;
  const subcat = document.getElementById("entry-subcategory").value;
  const voucher = document.getElementById("entry-voucher").value;
  const amount = parseFloat(document.getElementById("entry-amount").value) || 0;
  const receiver = document.getElementById("entry-receiver").value;
  const desc = document.getElementById("entry-description").value;

  const monthYear = date ? date.substring(0, 7) : "";
  const bookName = window.APP_CONFIG.BOOKS[sheet] || sheet;

  const income = type === "ဝင်ငွေ" ? amount : 0;
  const expense = type === "ထွက်ငွေ" ? amount : 0;

  // Column A (စဉ်) is left blank here on purpose: the server auto-assigns
  // it on create, and preserves the existing value on update regardless
  // of what's sent. Column M keeps the row's real Unique-ID: the existing
  // one when editing, or a freshly generated one for a brand new row.
  const finalUniqueId = uniqueId || `ID-${Date.now()}`;
  const rowData = [
    "", date, type, subcat, voucher, desc, receiver,
    income, expense, "", monthYear, bookName, finalUniqueId
  ];

  window.closeEntryModal();
  document.getElementById("loading-overlay").classList.remove("hidden");

  try {
    await window.saveSheetEntry(sheet, rowData, uniqueId || null);
    await window.switchTab(sheet);
  } catch (err) {
    alert("အချက်အလက် သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    document.getElementById("loading-overlay").classList.add("hidden");
  }
};

// 💡 Looks up a currently-rendered row by its real Unique-ID (last column)
// instead of a physical sheet row number, which used to drift out of sync
// the moment any row above it was added or removed.
function findRowByUid(uid) {
  const uidCol = window.currentSheetKey === "11Inv" ? 10 : 12;
  return (window.currentSheetData || []).find(r => String(r[uidCol]) === String(uid));
}

window.editEntry = function (uid) {
  const r = findRowByUid(uid);
  if (!r) return;

  window.openAddModal();
  document.getElementById("modal-form-title").textContent = "စာရင်း ပြင်ဆင်ရန်";
  document.getElementById("entry-uniqueId").value = uid;
  document.getElementById("entry-date").value = r[1] || "";
  document.getElementById("entry-type").value = r[2] || "ဝင်ငွေ";
  window.onTypeChange();
  document.getElementById("entry-subcategory").value = r[3] || "";
  document.getElementById("entry-voucher").value = r[4] || "";
  document.getElementById("entry-description").value = r[5] || "";
  document.getElementById("entry-receiver").value = r[6] || "None";

  const inc = parseFloat(r[7]) || 0;
  const exp = parseFloat(r[8]) || 0;
  document.getElementById("entry-amount").value = inc || exp || 0;
};

window.deleteEntry = async function (uid) {
  if (!confirm("ဤစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;
  document.getElementById("loading-overlay").classList.remove("hidden");
  try {
    await window.deleteSheetEntry(window.currentSheetKey, uid);
    await window.switchTab(window.currentSheetKey);
  } catch (err) {
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    document.getElementById("loading-overlay").classList.add("hidden");
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
