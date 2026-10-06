// ===================================================================
// js/app.js - Enterprise Main Application Controller & View Router
// 100% Config-Driven: Directly uses window.CONFIG & D1 Table Names
// Zero Redundant Dictionaries - Instant 0-Second Template Caching
// ===================================================================

// Global State Assignments (Directly uses D1 Table Names)
window.currentTable = window.currentTable || 'Home';
window.currentSheet = window.currentTable; // Backward Compatibility Alias
window.currentYogiTable = window.currentYogiTable || 'Permanent Yogi';
window.autoRefreshTimer = window.autoRefreshTimer || null;

const LIVE_SYNC_INTERVAL = 15000; // 15-second Real-time Background Sync
const templateCache = {};         // 0-Second Template Cache Engine

// -------------------------------------------------------------------
// 🚀 APP INITIALIZATION
// -------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initApp === 'function') {
    window.initApp();
  }

  // Mobile Menu & Overlay Listeners
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

// 🌟 Sync Event Listener (Sync Failed ဖြစ်ပါက Error Badge ကို UI တွင်ပြသရန်)
window.addEventListener('sasana-sync-complete', (e) => {
  const { synced, failed } = e.detail || { synced: 0, failed: 0 };
  const errBadge = document.getElementById('sync-error-badge');
  if (errBadge) {
    if (failed > 0) {
      errBadge.classList.remove('hidden');
      errBadge.classList.add('flex');
      const countEl = document.getElementById('sync-failed-count');
      if (countEl) countEl.textContent = failed;
    } else {
      errBadge.classList.add('hidden');
      errBadge.classList.remove('flex');
    }
  }
});

window.initApp = function() {
  const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
  if (user) {
    if (typeof window.showWorkspace === 'function') window.showWorkspace();

    // 🚀 Bootstrap Preload
    if (typeof window.bootstrapAppData === 'function') {
      window.bootstrapAppData();
    }

    // မူလ စာမျက်နှာသို့ သွားခြင်း
    window.switchTab(window.currentTable || 'Home');

    // နောက်ကွယ်မှ Auto-Sync နှင့် Background Refresh စတင်ခြင်း
    window.startLiveSync();
  } else {
    if (typeof window.showLoginOverlay === 'function') window.showLoginOverlay();
  }
};

// ===================================================================
// 1. 📱 Mobile Sidebar Responsive Controls
// ===================================================================
window.toggleMobileSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isClosed = sidebar.classList.contains('-translate-x-full');

  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0', 'mobile-open');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('block');
    }
  } else {
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
// 2. 🔄 Background Live Sync Engine
// ===================================================================
window.startLiveSync = function() {
  if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
  window.autoRefreshTimer = setInterval(() => {
    const openModal = document.querySelector('.modal-overlay-bg:not(.hidden), #yogi-entry-modal:not(.hidden), #entry-modal:not(.hidden), #book-entry-modal:not(.hidden), #inv-entry-modal:not(.hidden)');
    if (document.hidden || openModal) return;

    if (typeof window.triggerBackgroundSync === 'function') {
      window.triggerBackgroundSync();
    }

    window.refreshCurrentTabSilent();
  }, LIVE_SYNC_INTERVAL);
};

window.refreshCurrentTabSilent = function() {
  try {
    const table = window.currentTable;

    if (table.includes('Yogi')) {
      if (typeof window.renderYogiView === 'function') window.renderYogiView(true);
    } else if (table === 'Inventory' || table === '11Inv') {
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView(true);
    } else if (table === 'Home') {
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView();
    } else if (table.includes('Report') || table === '14Rep') {
      if (typeof window.renderReportView === 'function') window.renderReportView(true);
    } else {
      if (typeof window.renderBankView === 'function') window.renderBankView(table, true);
      else if (typeof window.loadSheetView === 'function') window.loadSheetView(true);
    }
  } catch (err) {
    console.warn("Silent Sync Warning:", err);
  }
};

// ===================================================================
// 3. 🚀 View Router & Navigation (0-Second Template Cached)
// ===================================================================
window.switchTab = async function(tabIdentifier) {
  const targetKey = String(tabIdentifier || 'Home').trim();
  const d1Table = (window.CONFIG?.TABLE_MAP && window.CONFIG.TABLE_MAP[targetKey]) || targetKey;

  window.currentTable = d1Table;
  window.currentSheet = d1Table;
  
  if (window.innerWidth < 768) {
    window.closeMobileSidebar();
  }

  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    const title = window.CONFIG?.TABLE_TITLES?.[d1Table] || 
                  window.CONFIG?.TABLE_TITLES?.[targetKey] || 
                  d1Table;
    titleEl.textContent = title;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'nav-btn-active', 'bg-amber-500/20', 'text-amber-300');
  });
  
  const activeBtn = document.getElementById(`btn-${targetKey}`) || document.getElementById(`btn-${d1Table}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'nav-btn-active', 'bg-amber-500/20', 'text-amber-300');
  }

  const container = document.getElementById('view-container');
  if (!container) return;

  try {
    if (d1Table === 'Home') {
      container.innerHTML = await window.fetchTemplate('view/Dashboard.html');
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView();
    } else if (d1Table === 'Inventory' || targetKey === '11Inv') {
      container.innerHTML = await window.fetchTemplate('view/Inventory.html');
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView();
    } else if (d1Table.includes('Yogi') || targetKey.includes('Yogi')) {
      window.currentYogiTable = d1Table;
      container.innerHTML = await window.fetchTemplate('view/yogi.html');
      if (typeof window.renderYogiView === 'function') window.renderYogiView(d1Table);
    } else if (d1Table.includes('Report') || targetKey.includes('Rep')) {
      container.innerHTML = await window.fetchTemplate('view/report-system.html');
      if (typeof window.renderReportView === 'function') window.renderReportView();
    } else {
      container.innerHTML = await window.fetchTemplate('view/Banks.html');
      if (typeof window.renderBankView === 'function') {
        window.renderBankView(d1Table);
      } else if (typeof window.loadSheetView === 'function') {
        window.loadSheetView();
      }
    }
  } catch (err) {
    console.error("Tab Switch Render Error:", err);
  }
};

window.fetchTemplate = async function(path) {
  if (templateCache[path]) {
    return templateCache[path]; 
  }

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
    const html = await res.text();
    templateCache[path] = html; 
    return html;
  } catch (err) {
    console.error('Template Fetch Error:', err);
    return `<div class="text-rose-400 p-4 font-bold text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl">Template မတွေ့ပါ: ${path}</div>`;
  }
};

// ===================================================================
// 4. Modal Dialog Controllers
// ===================================================================
window.openAddModal = function() {
  const table = window.currentTable || '';

  if (table.includes('Yogi')) {
    if (typeof window.openAddYogiModal === 'function') window.openAddYogiModal();
  } else if (table === 'Inventory' || table === '11Inv') {
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

  const typeSelect = document.getElementById("entry-type");
  if (typeSelect) {
    typeSelect.value = "ဝင်ငွေ";
    if (typeof window.onEntryTypeChange === 'function') window.onEntryTypeChange("ဝင်ငွေ");
  }

  const currentTable = window.currentTable || '';
  const isBankTable = currentTable.includes('Bank');
  const receiverInput = document.getElementById("entry-receiver");

  if (receiverInput) {
    if (isBankTable) {
      if (receiverInput.tagName === 'SELECT') {
        const hasBankOpt = Array.from(receiverInput.options).some(opt => opt.value === 'Bank');
        if (!hasBankOpt) {
          const bankOpt = document.createElement('option');
          bankOpt.value = 'Bank';
          bankOpt.textContent = 'Bank';
          receiverInput.prepend(bankOpt);
        }
      }
      receiverInput.value = 'Bank';
      receiverInput.style.pointerEvents = 'none';
      receiverInput.style.opacity = '0.85';
    } else {
      receiverInput.style.pointerEvents = 'auto';
      receiverInput.style.opacity = '1';
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

window.showLoading = function(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
};
