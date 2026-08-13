// ===================================================================
// js/app.js - Main Application Controller & View Router 
// Safely handles global declarations to avoid duplicate identifier errors 
// ===================================================================

// Safe Global Variable Assignments (Avoids SyntaxError)
window.currentSheet = window.currentSheet || 'Home';
window.currentYogiSheet = window.currentYogiSheet || '12Yogi';
window.autoRefreshTimer = window.autoRefreshTimer || null;

const LIVE_SYNC_INTERVAL = 10000; // 10-second Real-time Background Sync

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initApp === 'function') window.initApp();
});

window.initApp = function() {
  const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
  if (user) {
    if (typeof window.showWorkspace === 'function') window.showWorkspace();
    window.switchTab(window.currentSheet || 'Home');
    window.startLiveSync(); // Start background real-time sync
  } else {
    if (typeof window.showLoginOverlay === 'function') window.showLoginOverlay();
  }
};

// ===================================================================
// 1. Mobile Sidebar Responsive Controls
// ===================================================================
window.toggleMobileSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isHidden = sidebar.classList.contains('-translate-x-full');
  if (isHidden) {
    sidebar.classList.remove('-translate-x-full');
    if (overlay) overlay.classList.remove('hidden');
  } else {
    window.closeMobileSidebar();
  }
};

window.closeMobileSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (overlay) overlay.classList.add('hidden');
};

// ===================================================================
// 2. Real-Time Live Sync Engine
// ===================================================================
window.startLiveSync = function() {
  if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
  window.autoRefreshTimer = setInterval(() => {
    // Modal တစ်ခုခု ပွင့်နေပါက (သို့) Page Hidden ဖြစ်နေပါက Silent Refresh မလုပ်ပါ
    const openModal = document.querySelector('.modal-overlay-bg:not(.hidden), #yogi-entry-modal:not(.hidden), #entry-modal:not(.hidden), #book-entry-modal:not(.hidden), #inv-entry-modal:not(.hidden)');
    if (document.hidden || openModal) return;

    window.refreshCurrentTabSilent();
  }, LIVE_SYNC_INTERVAL);
};

window.refreshCurrentTabSilent = function() {
  try {
    const sheet = window.currentSheet;
    if (['12Yogi', '13Yogi'].includes(sheet)) {
      if (typeof window.renderYogiView === 'function') window.renderYogiView(true);
    } else if (['1CB', '2CB', '3CB'].includes(sheet)) {
      if (typeof window.loadSheetView === 'function') window.loadSheetView(true);
    } else if (['4GB','5FB','6HB','7PB','8EB','9MB','10GB'].includes(sheet)) {
      if (typeof window.loadSheetView === 'function') window.loadSheetView(true);
    } else if (sheet === '11Inv') {
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView(true);
    } else if (sheet === 'Home') {
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView(true);
    } else if (['14Rep', 'Report'].includes(sheet)) {
      if (typeof window.renderReportView === 'function') window.renderReportView(true);
    }
  } catch (err) {
    console.warn("Silent Sync Error:", err);
  }
};

// ===================================================================
// 3. View Router & Navigation
// ===================================================================
window.switchTab = async function(sheetName) {
  window.currentSheet = sheetName;
  window.closeMobileSidebar();

  const titleEl = document.getElementById('page-title');
  if (titleEl && window.CONFIG && window.CONFIG.SHEET_TITLES) {
    titleEl.textContent = window.CONFIG.SHEET_TITLES[sheetName] || sheetName;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${sheetName}`);
  if (activeBtn) activeBtn.classList.add('active');

  const container = document.getElementById('view-container');
  if (!container) return;

  try {
    if (sheetName === 'Home') {
      container.innerHTML = await window.fetchTemplate('view/Dashboard.html');
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView();
    } else if (['1CB', '2CB', '3CB'].includes(sheetName)) {
      container.innerHTML = await window.fetchTemplate('view/Banks.html');
      if (typeof window.loadSheetView === 'function') window.loadSheetView();
    } else if (['4GB','5FB','6HB','7PB','8EB','9MB','10GB'].includes(sheetName)) {
      container.innerHTML = await window.fetchTemplate('view/Books.html');
      if (typeof window.loadSheetView === 'function') window.loadSheetView();
    } else if (sheetName === '11Inv') {
      container.innerHTML = await window.fetchTemplate('view/Inventory.html');
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView();
    } else if (['12Yogi', '13Yogi'].includes(sheetName)) {
      window.currentYogiSheet = sheetName;
      container.innerHTML = await window.fetchTemplate('view/yogi.html');
      if (typeof window.renderYogiView === 'function') window.renderYogiView();
    } else if (['14Rep', 'Report'].includes(sheetName)) {
      container.innerHTML = await window.fetchTemplate('view/report-system.html');
      if (typeof window.renderReportView === 'function') window.renderReportView();
    }
  } catch (err) {
    console.error("Tab Switch Render Error:", err);
  }
};

window.fetchTemplate = async function(path) {
  try {
    let res = await fetch(path);
    if (!res.ok && path.startsWith('view/')) {
      const fallbackPath = path.replace('view/', 'views/');
      res = await fetch(fallbackPath);
    }
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error('Template Fetch Error:', err);
    return `<div class="text-rose-400 p-4 font-bold text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl">Template မတွေ့ပါ: ${path}</div>`;
  }
};

// ===================================================================
// 4. Modal Dialog Controllers
// ===================================================================
window.openAddModal = function() {
  const sheet = window.currentSheet || '';
  if (['12Yogi', '13Yogi'].includes(sheet) || sheet.includes('Yogi')) {
    if (typeof window.openAddYogiModal === 'function') window.openAddYogiModal();
  } else if (sheet === '11Inv') {
    if (typeof window.openAddInvModal === 'function') window.openAddInvModal();
  } else {
    window.openAddEntryModal();
  }
};

window.openAddEntryModal = function() {
  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (!modal) return;

  const form = document.getElementById('entry-form');
  if (form) form.reset();

  const idInput = document.getElementById("entry-id");
  if (idInput) idInput.value = "";

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်းအသစ် သွင်းယူရန်";

  // 📅 ယနေ့ရက်စွဲ (Today's Date YYYY-MM-DD) Auto ဖြည့်ပေးခြင်း
  const dateInput = document.getElementById("entry-date");
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const currentSheet = String(window.currentSheetKey || window.currentSheet || '1CB').trim();
  const isBank = ['1CB', '2CB', '3CB'].includes(currentSheet);

  if (isBank) {
    const catSelect = document.getElementById("entry-category");
    if (catSelect) catSelect.value = "စာရင်းဖွင့်";
    if (typeof window.onBankCategoryChange === 'function') window.onBankCategoryChange("စာရင်းဖွင့်");
  } else {
    const typeSelect = document.getElementById("entry-type");
    if (typeSelect) typeSelect.value = "ဝင်ငွေ";
    if (typeof window.onBookTypeChange === 'function') window.onBookTypeChange("ဝင်ငွေ");
  }

  modal.classList.remove('hidden');
};
window.openBookEntryModal = window.openAddEntryModal;

window.closeEntryModal = function() {
  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.add('hidden');
};
window.closeAddModal = window.closeEntryModal;
window.closeBookEntryModal = window.closeEntryModal;

window.openAddYogiModal = function() {
  const form = document.getElementById('yogi-entry-form');
  if (form) form.reset();
  
  const idInput = document.getElementById('yogi-uniqueId');
  if (idInput) idInput.value = '';

  // 📅 ယနေ့ရက်စွဲ Auto ဖြည့်ပေးခြင်း
  const dateInput = document.getElementById('yogi-start-date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeYogiModal = function() {
  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.add('hidden');
};

// Global Loading Spinner
window.showLoading = function(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
};
