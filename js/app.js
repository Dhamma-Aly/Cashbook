// ===================================================================
// js/app.js - Main Application Controller & View Router 
// Handles global routing, mobile sidebar, live sync, and modal delegations
// ===================================================================

// Safe Global Variable Assignments
window.currentSheet = window.currentSheet || 'Home';
window.currentYogiSheet = window.currentYogiSheet || '12Yogi';
window.autoRefreshTimer = window.autoRefreshTimer || null;

const LIVE_SYNC_INTERVAL = 10000; // 10-second Real-time Background Sync

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initApp === 'function') {
    window.initApp();
  }

  // 📱 Mobile Menu Button & Overlay များအား Event Listener တိုက်ရိုက် ချိတ်ဆက်ပေးခြင်း (Android/iOS Touch ပိုမိုမြန်ဆန်စေရန်)
  const mobileBtn = document.getElementById('mobile-menu-btn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleMobileSidebar();
    });
  }

  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      window.closeMobileSidebar();
    });
  }
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
// 1. 📱 Mobile Sidebar Responsive Controls (FIXED FOR ANDROID & iOS)
// ===================================================================
window.toggleMobileSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  // Sidebar ပိတ်ထားသလား စစ်ဆေးခြင်း (Tailwind -translate-x-full ဖြင့်)
  const isClosed = sidebar.classList.contains('-translate-x-full');

  if (isClosed) {
    // ဖွင့်မည်
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0', 'mobile-open');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('block');
    }
  } else {
    // ပိတ်မည်
    window.closeMobileSidebar();
  }
};

window.closeMobileSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (sidebar) {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0', 'mobile-open');
  }
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('block');
  }
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
    } else if (['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'].includes(sheet)) {
      if (typeof window.loadSheetView === 'function') window.loadSheetView(true);
      else if (typeof window.renderBankView === 'function') window.renderBankView(sheet, true);
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
// 3. View Router & Navigation (Target Sheet Explicit Router)
// ===================================================================
window.switchTab = async function(sheetName) {
  window.currentSheet = sheetName;
  
  // ဖုန်း screen (Screen width < 768px) ဖြစ်ပါက Menu ရွေးပြီးလျှင် Sidebar ကို အလိုအလျောက် ပိတ်မည်
  if (window.innerWidth < 768) {
    window.closeMobileSidebar();
  }

  const titleEl = document.getElementById('page-title');
  if (titleEl && window.CONFIG && window.CONFIG.SHEET_TITLES) {
    titleEl.textContent = window.CONFIG.SHEET_TITLES[sheetName] || sheetName;
  }

  // Active Navigation Styling
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'nav-btn-active', 'bg-amber-500/20', 'text-amber-300');
  });
  
  const activeBtn = document.getElementById(`btn-${sheetName}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'nav-btn-active');
  }

  const container = document.getElementById('view-container');
  if (!container) return;

  try {
    if (sheetName === 'Home') {
      container.innerHTML = await window.fetchTemplate('view/Dashboard.html');
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView();
    } else if (['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'].includes(sheetName)) {
      container.innerHTML = await window.fetchTemplate('view/Banks.html');
      if (typeof window.renderBankView === 'function') {
        window.renderBankView(sheetName);
      } else if (typeof window.loadSheetView === 'function') {
        window.loadSheetView(sheetName);
      }
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
    let targetPath = path.startsWith('./') ? path : `./${path}`;
    let res = await fetch(targetPath);

    if (!res.ok) {
      const lowerPath = targetPath.toLowerCase();
      res = await fetch(lowerPath);
    }
    
    if (!res.ok && targetPath.includes('view/')) {
      const fallbackPath = targetPath.replace('view/', 'views/');
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

  const dateInput = document.getElementById("entry-date");
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // 💡 3-Tier Cascading Dropdown ကို Default အနေဖြင့် "ဝင်ငွေ" ဖြင့် စတင် Trigger ပြုလုပ်ခြင်း
  const typeSelect = document.getElementById("entry-type");
  if (typeSelect) {
    typeSelect.value = "ဝင်ငွေ";
    if (typeof window.onEntryTypeChange === 'function') {
      window.onEntryTypeChange("ဝင်ငွေ");
    }
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

// Yogi Modal Controls
window.openAddYogiModal = function() {
  const form = document.getElementById('yogi-entry-form');
  if (form) form.reset();
  
  const idInput = document.getElementById('yogi-uniqueId');
  if (idInput) idInput.value = '';

  const modalTitle = document.getElementById('yogi-modal-title');
  if (modalTitle) modalTitle.textContent = "ယောဂီ အသစ် သွင်းယူရန်";

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

// Inventory Modal Controls
window.openAddInvModal = function() {
  const form = document.getElementById('inv-entry-form');
  if (form) form.reset();

  const idInput = document.getElementById('inv-id');
  if (idInput) idInput.value = '';

  const modalTitle = document.getElementById('inv-modal-title');
  if (modalTitle) modalTitle.textContent = "ပစ္စည်းအသစ် သွင်းယူရန်";

  const dateInput = document.getElementById('inv-date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const modal = document.getElementById('inv-entry-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeInvModal = function() {
  const modal = document.getElementById('inv-entry-modal');
  if (modal) modal.classList.add('hidden');
};

// Global Loading Spinner
window.showLoading = function(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
};
