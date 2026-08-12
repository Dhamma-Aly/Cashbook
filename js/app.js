// ===================================================================
// js/app.js - Main Application Controller & View Router 
// Drives Navigation, Tab Switching, Real-Time Live Sync (Auto-polling 10s),
// Mobile Sidebar Controls, and Modals for Cashbooks, Inventory & Yogis 
// ===================================================================

let currentSheet = 'Home';
let currentYogiSheet = '12Yogi';
let autoRefreshTimer = null;
const LIVE_SYNC_INTERVAL = 10000; // 10-second Real-time Background Sync

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user) {
    if (typeof showWorkspace === 'function') showWorkspace();
    switchTab('Home');
    startLiveSync(); // Start background real-time sync
  } else {
    if (typeof showLoginOverlay === 'function') showLoginOverlay();
  }
}

// ===================================================================
// 1. Mobile Sidebar Responsive Controls (Phones & Tablets)
// ===================================================================
function toggleMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isHidden = sidebar.classList.contains('-translate-x-full');
  if (isHidden) {
    sidebar.classList.remove('-translate-x-full');
    if (overlay) overlay.classList.remove('hidden');
  } else {
    closeMobileSidebar();
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (overlay) overlay.classList.add('hidden');
}

// ===================================================================
// 2. Real-Time Live Sync Engine (Silent Background Refetching)
// ===================================================================
function startLiveSync() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    // Modal ပွင့်နေချိန် သို့မဟုတ် Screen ပိတ်ထားချိန်တွင် Auto Sync ခဏ ရပ်မည်
    const openModal = document.querySelector('.modal-overlay-bg:not(.hidden), #yogi-entry-modal:not(.hidden)');
    if (document.hidden || openModal) return;

    refreshCurrentTabSilent();
  }, LIVE_SYNC_INTERVAL);
}

function refreshCurrentTabSilent() {
  // Silent auto refresh without triggering full-screen loading spinner
  try {
    if (['12Yogi', '13Yogi'].includes(currentSheet)) {
      if (typeof renderYogiView === 'function') renderYogiView(true);
    } else if (['1CB', '2CB', '3CB'].includes(currentSheet)) {
      if (typeof loadSheetView === 'function') loadSheetView(true);
    } else if (['4GB','5FB','6HB','7PB','8EB','9MB','10GB'].includes(currentSheet)) {
      if (typeof loadSheetView === 'function') loadSheetView(true);
    } else if (currentSheet === '11Inv') {
      if (typeof renderInventoryView === 'function') renderInventoryView(true);
    } else if (currentSheet === 'Home') {
      if (typeof renderDashboardView === 'function') renderDashboardView(true);
    } else if (['14Rep', 'Report'].includes(currentSheet)) {
      if (typeof renderReportView === 'function') renderReportView(true);
    }
  } catch (err) {
    console.warn("Silent Sync Error:", err);
  }
}

// ===================================================================
// 3. View Router & Navigation
// ===================================================================
async function switchTab(sheetName) {
  currentSheet = sheetName;

  // Auto close mobile sidebar when a menu item is tapped on mobile
  closeMobileSidebar();

  // Update Page Title in Header
  const titleEl = document.getElementById('page-title');
  if (titleEl && window.CONFIG && window.CONFIG.SHEET_TITLES) {
    titleEl.textContent = window.CONFIG.SHEET_TITLES[sheetName] || sheetName;
  }

  // Update Sidebar Nav Button Active Styling
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${sheetName}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Load View Template Fragment into #view-container
  const container = document.getElementById('view-container');
  if (!container) return;

  try {
    if (sheetName === 'Home') {
      container.innerHTML = await fetchTemplate('view/Dashboard.html');
      if (typeof renderDashboardView === 'function') renderDashboardView();
    } else if (['1CB', '2CB', '3CB'].includes(sheetName)) {
      container.innerHTML = await fetchTemplate('view/Banks.html');
      if (typeof loadSheetView === 'function') loadSheetView();
    } else if (['4GB','5FB','6HB','7PB','8EB','9MB','10GB'].includes(sheetName)) {
      container.innerHTML = await fetchTemplate('view/Books.html');
      if (typeof loadSheetView === 'function') loadSheetView();
    } else if (sheetName === '11Inv') {
      container.innerHTML = await fetchTemplate('view/Inventory.html');
      if (typeof renderInventoryView === 'function') renderInventoryView();
    } else if (['12Yogi', '13Yogi'].includes(sheetName)) {
      currentYogiSheet = sheetName;
      container.innerHTML = await fetchTemplate('view/yogi.html');
      if (typeof renderYogiView === 'function') renderYogiView();
    } else if (['14Rep', 'Report'].includes(sheetName)) {
      container.innerHTML = await fetchTemplate('view/report-system.html');
      if (typeof renderReportView === 'function') renderReportView();
    }
  } catch (err) {
    console.error("Tab Switch Render Error:", err);
  }
}

async function fetchTemplate(path) {
  try {
    let res = await fetch(path);
    
    // If 'view/' fails, try fallback to 'views/' folder
    if (!res.ok && path.startsWith('view/')) {
      const fallbackPath = path.replace('view/', 'views/');
      res = await fetch(fallbackPath);
    }

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error('Template Fetch Error:', err);
    return `<div class="text-rose-400 p-4 font-bold text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl">Template မတွေ့ပါ: ${path} (Folder နာမည် view သို့မဟုတ် views စစ်ဆေးပါ)</div>`;
  }
}

// ===================================================================
// 4. Yogi Modal Dialog Controllers
// ===================================================================
function openAddYogiModal() {
  const form = document.getElementById('yogi-entry-form');
  if (!form) return;

  form.reset();
  const title = (window.CONFIG && window.CONFIG.SHEET_TITLES && window.CONFIG.SHEET_TITLES[currentYogiSheet]) || 'ယောဂီ';
  const modalTitle = document.getElementById('yogi-modal-title');
  if (modalTitle) modalTitle.textContent = `${title} - အသစ်ထည့်ရန်`;

  const uniqueIdEl = document.getElementById('yogi-uniqueId');
  if (uniqueIdEl) uniqueIdEl.value = '';

  const sheetTypeEl = document.getElementById('yogi-sheet-type');
  if (sheetTypeEl) sheetTypeEl.value = currentYogiSheet;

  const startDateEl = document.getElementById('yogi-start-date');
  if (startDateEl) startDateEl.value = new Date().toISOString().split('T')[0];

  const nrcTypeEl = document.getElementById('yogi-nrc-type');
  if (nrcTypeEl) nrcTypeEl.value = '(နိုင်)';

  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.remove('hidden');
}

function openEditYogiModal(uniqueId) {
  if (typeof allYogiEntries === 'undefined') return;
  const entry = allYogiEntries.find(item => item.uniqueId === uniqueId);
  if (!entry) return;

  const modalTitle = document.getElementById('yogi-modal-title');
  if (modalTitle) modalTitle.textContent = 'ယောဂီ အချက်အလက် ပြင်ဆင်ရန်';

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('yogi-uniqueId', entry.uniqueId);
  setVal('yogi-sheet-type', entry.sheet_type || currentYogiSheet);
  setVal('yogi-start-date', entry.start_date);
  setVal('yogi-category', entry.category || 'လူပုဂ္ဂိုလ်');
  setVal('yogi-name', entry.name);
  setVal('yogi-father-name', entry.father_name);
  setVal('yogi-dob', entry.dob);
  setVal('yogi-age', entry.age);
  setVal('yogi-gender', entry.gender || 'ကျား');
  setVal('yogi-phone', entry.yogi_phone);
  setVal('yogi-home-phone', entry.home_phone);
  setVal('yogi-address', entry.address);

  // Parse NRC string (e.g. "12/ရကန(နိုင်)123456")
  if (entry.nrc) {
    const match = entry.nrc.match(/^(\d{1,2})\/([^\(]+)\(([^)]+)\)(\d+)$/);
    if (match) {
      setVal('yogi-nrc-state', match[1] || '12');
      setVal('yogi-nrc-township', match[2]);
      setVal('yogi-nrc-type', `(${match[3]})` || '(နိုင်)');
      setVal('yogi-nrc-number', match[4]);
    } else {
      setVal('yogi-nrc-township', entry.nrc);
    }
  }

  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeYogiModal() {
  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveYogiEntryForm(e) {
  if (e && e.preventDefault) e.preventDefault();

  const uniqueId = document.getElementById('yogi-uniqueId').value.trim() || 'YG_' + Date.now();
  const sheet_type = document.getElementById('yogi-sheet-type').value || currentYogiSheet;
  const start_date = document.getElementById('yogi-start-date').value;
  const category = document.getElementById('yogi-category').value;
  const name = document.getElementById('yogi-name').value.trim();
  const father_name = document.getElementById('yogi-father-name').value.trim();

  // Structured NRC Formatting
  const nrcState = document.getElementById('yogi-nrc-state').value;
  const nrcTownship = document.getElementById('yogi-nrc-township').value.trim();
  const nrcType = document.getElementById('yogi-nrc-type').value;
  const nrcNumber = document.getElementById('yogi-nrc-number').value.trim();
  const nrc = nrcTownship && nrcNumber ? `${nrcState}/${nrcTownship}${nrcType}${nrcNumber}` : '';

  const dob = document.getElementById('yogi-dob').value;
  const age = parseInt(document.getElementById('yogi-age').value) || (typeof calcAgeFromDoB === 'function' ? calcAgeFromDoB(dob) : 0);
  const gender = document.getElementById('yogi-gender').value;
  const yogi_phone = document.getElementById('yogi-phone').value.trim();
  const home_phone = document.getElementById('yogi-home-phone').value.trim();
  const address = document.getElementById('yogi-address').value.trim();

  const isEdit = !!document.getElementById('yogi-uniqueId').value.trim();

  const payload = {
    uniqueId,
    sheet_type,
    start_date,
    category,
    name,
    father_name,
    nrc,
    dob,
    age,
    gender,
    yogi_phone,
    home_phone,
    address,
    status: 'Active'
  };

  showLoading(true);
  try {
    if (typeof saveYogiAPI === 'function') {
      const res = await saveYogiAPI(payload, isEdit);
      if (res.success) {
        closeYogiModal();
        if (typeof renderYogiView === 'function') renderYogiView();
      } else {
        alert('သိမ်းဆည်းရာတွင် အမှားရှိပါသည်: ' + (res.error || res.message || ''));
      }
    }
  } catch (err) {
    console.error('Save Yogi Error:', err);
    alert('သိမ်းဆည်းရာတွင် အမှားရှိပါသည်');
  } finally {
    showLoading(false);
  }
}

// Input Auto Helper Listeners
function onYogiNameChange(val) {
  if (!val) return;
  const genderSelect = document.getElementById('yogi-gender');
  if (genderSelect && typeof detectGenderFromName === 'function') {
    genderSelect.value = detectGenderFromName(val);
  }
}

function onYogiDoBChange(val) {
  if (!val) return;
  const ageInput = document.getElementById('yogi-age');
  if (ageInput && typeof calcAgeFromDoB === 'function') {
    ageInput.value = calcAgeFromDoB(val);
  }
}

// Global Loading Spinner
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}
