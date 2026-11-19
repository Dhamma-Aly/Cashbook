// ===================================================================
// js/app.js - Enterprise Main Application Controller & View Router (v4.0)
// Features: Deep-Link ?tab= Routing, Anti-Flicker Silent Sync,
// Role UI Guard, Race-Condition Protection & Pro Toast Utility
// ===================================================================

window.currentTable = window.currentTable || 'Home';
window.currentSheet = window.currentTable;
window.currentYogiTable = window.currentYogiTable || 'Permanent Yogi';
window.autoRefreshTimer = window.autoRefreshTimer || null;

// 🌟 ၆၀ စက္ကန့်တစ်ကြိမ် Version-Check ဖြင့် ငြိမ်သက်စွာ Background Sync ပြုလုပ်ခြင်း
const LIVE_SYNC_INTERVAL = 60000;
const templateCache = {};
let activeTabSwitchToken = 0;

function getTodayLocalISO() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveTabShortCode(tabIdentifier) {
  const raw = String(tabIdentifier || 'Home').trim();
  if (raw === 'Home' || raw === '14Rep' || raw === 'Report') return raw === 'Report' ? '14Rep' : raw;

  const map = window.CONFIG?.TABLE_MAP || {};
  if (map[raw]) return raw; // already a short code like 4GB, 1CB, 11Inv, 12Yogi

  const reverseHit = Object.entries(map).find(([, tbl]) => tbl === raw);
  return reverseHit ? reverseHit[0] : raw;
}

// -------------------------------------------------------------------
// 🌟 PRO TOAST NOTIFICATION UTILITY
// -------------------------------------------------------------------
window.showToast = function (message, type = 'info', duration = 3200) {
  if (!message) return;
  let container = document.getElementById('sasana-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sasana-toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:250000;display:flex;flex-direction:column;gap:8px;max-width:340px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const colors = {
    success: 'background:#064e3b;border:1px solid #10b981;color:#d1fae5;',
    error: 'background:#4c0519;border:1px solid #f43f5e;color:#ffe4e6;',
    warning: 'background:#451a03;border:1px solid #f59e0b;color:#fef3c7;',
    info: 'background:#0f172a;border:1px solid rgba(245,158,11,0.45);color:#fef08a;',
  };
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
  };

  const toast = document.createElement('div');
  toast.style.cssText = `${colors[type] || colors.info}padding:10px 14px;border-radius:12px;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:8px;box-shadow:0 12px 30px rgba(0,0,0,0.65);pointer-events:auto;transition:opacity 0.25s ease;`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span></span>`;
  toast.querySelector('span').textContent = String(message);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 260);
  }, duration);
};

// -------------------------------------------------------------------
// 🚀 APP INITIALIZATION
// -------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initApp === 'function') {
    window.initApp();
  }

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

// 🌟 Sync Event Listener (Desktop & Mobile Error Badges ၂ ခုလုံး Update လုပ်ရန်)
window.addEventListener('sasana-sync-complete', (e) => {
  const { failed } = e.detail || { synced: 0, failed: 0 };
  const errBadge = document.getElementById('sync-error-badge');
  if (!errBadge) return;

  if (failed > 0) {
    errBadge.classList.remove('hidden');
    errBadge.classList.add('flex');
    const countEl = document.getElementById('sync-failed-count');
    const mobileCountEl = document.getElementById('sync-failed-count-mobile');
    if (countEl) countEl.textContent = failed;
    if (mobileCountEl) mobileCountEl.textContent = failed;
  } else {
    errBadge.classList.add('hidden');
    errBadge.classList.remove('flex');
  }
});

window.initApp = function () {
  const user = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
  if (user) {
    if (typeof window.showWorkspace === 'function') window.showWorkspace();

    if (typeof window.bootstrapAppData === 'function') {
      window.bootstrapAppData();
    }

    // URL Parameter (?tab=...) ပါလာပါက ဦးစားပေး ဖွင့်လှစ်ခြင်း
    let initialTab = window.currentTable || 'Home';
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab) initialTab = urlTab;
    } catch (_) {}

    window.switchTab(initialTab);
    window.startLiveSync();
  } else {
    if (typeof window.showLoginOverlay === 'function') window.showLoginOverlay();
  }
};

// ===================================================================
// 1. 📱 Mobile Sidebar Responsive Controls
// ===================================================================
window.toggleMobileSidebar = function () {
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

window.closeMobileSidebar = function () {
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
window.startLiveSync = function () {
  if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
  window.autoRefreshTimer = setInterval(() => {
    const openModal = document.querySelector(
      '.modal-overlay-bg:not(.hidden), #yogi-entry-modal:not(.hidden), #entry-modal:not(.hidden), #book-entry-modal:not(.hidden), #inv-entry-modal:not(.hidden), #reauth-modal:not(.hidden)'
    );
    if (document.hidden || openModal) return;

    if (typeof window.triggerBackgroundSync === 'function') {
      window.triggerBackgroundSync();
    }
    window.refreshCurrentTabSilent();
  }, LIVE_SYNC_INTERVAL);
};

window.refreshCurrentTabSilent = function () {
  try {
    const table = window.currentTable || 'Home';

    if (table.includes('Yogi')) {
      if (typeof window.renderYogiView === 'function') window.renderYogiView(true);
    } else if (table === 'Inventory' || table === '11Inv') {
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView(true);
    } else if (table === 'Home') {
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView(true);
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
// 3. 🚀 View Router & Navigation (0-Second Template Cached + Role Guard)
// ===================================================================
function applyRolePermissionsToView() {
  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;
  ['btn-add-entry', 'btn-add-inv', 'btn-add-yogi'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (!canEdit) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
    }
  });
}

window.switchTab = async function (tabIdentifier) {
  const switchToken = ++activeTabSwitchToken;
  const targetKey = String(tabIdentifier || 'Home').trim();
  const shortCode = resolveTabShortCode(targetKey);
  const d1Table = (window.CONFIG?.TABLE_MAP && window.CONFIG.TABLE_MAP[shortCode]) || targetKey;

  window.currentTable = d1Table;
  window.currentSheet = d1Table;

  if (window.innerWidth < 768) {
    window.closeMobileSidebar();
  }

  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    const title = window.CONFIG?.TABLE_TITLES?.[d1Table] ||
                  window.CONFIG?.TABLE_TITLES?.[shortCode] ||
                  window.CONFIG?.TABLE_TITLES?.[targetKey] ||
                  d1Table;
    titleEl.textContent = title;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'nav-btn-active', 'bg-amber-500/20', 'text-amber-300');
  });

  const activeBtn =
    document.getElementById(`btn-${shortCode}`) ||
    document.getElementById(`btn-${targetKey}`) ||
    document.getElementById(`btn-${d1Table}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'nav-btn-active', 'bg-amber-500/20', 'text-amber-300');
  }

  const container = document.getElementById('view-container');
  if (!container) return;

  try {
    let html = '';
    if (d1Table === 'Home') {
      html = await window.fetchTemplate('view/Dashboard.html');
    } else if (d1Table === 'Inventory' || shortCode === '11Inv') {
      html = await window.fetchTemplate('view/Inventory.html');
    } else if (d1Table.includes('Yogi') || shortCode.includes('Yogi')) {
      html = await window.fetchTemplate('view/yogi.html');
    } else if (d1Table.includes('Report') || shortCode === '14Rep') {
      html = await window.fetchTemplate('view/report-system.html');
    } else {
      html = await window.fetchTemplate('view/Banks.html');
    }

    if (switchToken !== activeTabSwitchToken) return;
    container.innerHTML = html;
    applyRolePermissionsToView();

    if (d1Table === 'Home') {
      if (typeof window.renderDashboardView === 'function') window.renderDashboardView(false);
    } else if (d1Table === 'Inventory' || shortCode === '11Inv') {
      if (typeof window.renderInventoryView === 'function') window.renderInventoryView(false);
    } else if (d1Table.includes('Yogi') || shortCode.includes('Yogi')) {
      window.currentYogiTable = d1Table;
      if (typeof window.renderYogiView === 'function') window.renderYogiView(false);
    } else if (d1Table.includes('Report') || shortCode === '14Rep') {
      if (typeof window.renderReportView === 'function') window.renderReportView(false);
    } else {
      if (typeof window.renderBankView === 'function') {
        window.renderBankView(d1Table, false);
      } else if (typeof window.loadSheetView === 'function') {
        window.loadSheetView(false);
      }
    }
  } catch (err) {
    console.error("Tab Switch Render Error:", err);
  }
};

window.fetchTemplate = async function (path) {
  if (templateCache[path]) {
    return templateCache[path];
  }

  try {
    const targetPath = path.startsWith('./') ? path : `./${path}`;
    let res = await fetch(targetPath);

    if (!res.ok) {
      res = await fetch(targetPath.toLowerCase());
    }
    if (!res.ok && targetPath.includes('view/')) {
      res = await fetch(targetPath.replace('view/', 'views/'));
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
window.openAddModal = function () {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    window.showToast('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ စာရင်းအသစ်ထည့်ခွင့် မရှိပါ။', 'warning');
    return;
  }
  const table = window.currentTable || '';

  if (table.includes('Yogi')) {
    if (typeof window.openAddYogiModal === 'function') window.openAddYogiModal();
  } else if (table === 'Inventory' || table === '11Inv') {
    if (typeof window.openAddInvModal === 'function') window.openAddInvModal();
  } else {
    window.openAddEntryModal();
  }
};

window.openAddEntryModal = function () {
  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (!modal) return;

  const form = document.getElementById('entry-form');
  if (form) form.reset();

  const idInput = document.getElementById("entry-id");
  if (idInput) idInput.value = "";

  const saveBtn = document.getElementById("btn-entry-save");
  const saveBtnText = document.getElementById("btn-entry-save-text");
  if (saveBtn) saveBtn.disabled = false;
  if (saveBtnText) saveBtnText.textContent = "Save";

  const titleEl = document.getElementById("entry-modal-title");
  if (titleEl) titleEl.textContent = "စာရင်းအသစ် သွင်းယူရန်";

  const dateInput = document.getElementById("entry-date");
  if (dateInput) dateInput.value = getTodayLocalISO();

  const typeSelect = document.getElementById("entry-type");
  if (typeSelect) {
    typeSelect.value = "ဝင်ငွေ";
    if (typeof window.onEntryTypeChange === 'function') window.onEntryTypeChange("ဝင်ငွေ");
  }

  modal.classList.remove('hidden');
};
window.openBookEntryModal = window.openAddEntryModal;

window.closeEntryModal = function () {
  const modal = document.getElementById('entry-modal') || document.getElementById('book-entry-modal');
  if (modal) modal.classList.add('hidden');
};
window.closeAddModal = window.closeEntryModal;
window.closeBookEntryModal = window.closeEntryModal;

// NOTE: openAddYogiModal → js/yogi.js ၊ openAddInvModal / closeInvModal → js/Inventory.js တွင် သတ်မှတ်ထားပြီး
//       (app.js သည် နောက်ဆုံး load ဖြစ်၍ ဤနေရာတွင် ထပ်သတ်မှတ်ပါက module ဗားရှင်းကို override လုပ်မိသည်)
window.closeYogiModal = function () {
  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.add('hidden');
};

window.showLoading = function (show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
};
