// ===================================================================
// js/app.js - Main Application Controller & View Router
// Drives Navigation, Tab Switching, Real-Time Live Sync (Auto-polling 10s),
// and Modal Controls for Cashbooks, Inventory, and Yogi Management
// ===================================================================

let currentSheet = 'Home';
let autoRefreshTimer = null;
const LIVE_SYNC_INTERVAL = 10000; // 10-second Real-time Background Sync

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const user = getCurrentUser();
  if (user) {
    showWorkspace();
    switchTab('Home');
    startLiveSync(); // Start background real-time sync
  } else {
    showLoginOverlay();
  }
}

// ===================================================================
// 1. Real-Time Live Sync Engine (Silent Background Refetching)
// ===================================================================
function startLiveSync() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    refreshCurrentTabSilent();
  }, LIVE_SYNC_INTERVAL);
}

function refreshCurrentTabSilent() {
  // Silent auto refresh without triggering full-screen loading spinner
  if (['12Yogi', '13Yogi'].includes(currentSheet)) {
    if (typeof renderYogiView === 'function') renderYogiView();
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
}

// ===================================================================
// 2. View Router & Navigation
// ===================================================================
async function switchTab(sheetName) {
  currentSheet = sheetName;

  // Update Page Title in Header
  const title = CONFIG.SHEET_TITLES[sheetName] || sheetName;
  document.getElementById('page-title').textContent = title;

  // Update Sidebar Nav Button Active Styling
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${sheetName}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Load View Template Fragment into #view-container
  const container = document.getElementById('view-container');

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
}

async function fetchTemplate(path) {
  try {
    const res = await fetch(path);
    return await res.text();
  } catch (err) {
    console.error('Template Fetch Error:', err);
    return `<div class="text-rose-400 p-4">Template မတွေ့ပါ: ${path}</div>`;
  }
}

// ===================================================================
// 3. Yogi Modal Dialog Controllers
// ===================================================================
function openAddYogiModal() {
  const form = document.getElementById('yogi-entry-form');
  if (!form) return;

  form.reset();
  document.getElementById('yogi-modal-title').textContent = `${CONFIG.SHEET_TITLES[currentYogiSheet] || 'ယောဂီ'} - အသစ်ထည့်ရန်`;
  document.getElementById('yogi-uniqueId').value = '';
  document.getElementById('yogi-sheet-type').value = currentYogiSheet;
  document.getElementById('yogi-start-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('yogi-nrc-type').value = '(နိုင်)';

  document.getElementById('yogi-entry-modal').classList.remove('hidden');
}

function openEditYogiModal(uniqueId) {
  const entry = allYogiEntries.find(item => item.uniqueId === uniqueId);
  if (!entry) return;

  document.getElementById('yogi-modal-title').textContent = 'ယောဂီ အချက်အလက် ပြင်ဆင်ရန်';
  document.getElementById('yogi-uniqueId').value = entry.uniqueId;
  document.getElementById('yogi-sheet-type').value = entry.sheet_type || currentYogiSheet;
  document.getElementById('yogi-start-date').value = entry.start_date || '';
  document.getElementById('yogi-category').value = entry.category || 'လူပုဂ္ဂိုလ်';
  document.getElementById('yogi-name').value = entry.name || '';
  document.getElementById('yogi-father-name').value = entry.father_name || '';
  document.getElementById('yogi-dob').value = entry.dob || '';
  document.getElementById('yogi-age').value = entry.age || '';
  document.getElementById('yogi-gender').value = entry.gender || 'ကျား';
  document.getElementById('yogi-phone').value = entry.yogi_phone || '';
  document.getElementById('yogi-home-phone').value = entry.home_phone || '';
  document.getElementById('yogi-address').value = entry.address || '';

  // Parse NRC string (e.g. "12/ရကန(နိုင်)123456")
  if (entry.nrc) {
    const match = entry.nrc.match(/^(\d{1,2})\/([^\(]+)\(([^)]+)\)(\d+)$/);
    if (match) {
      document.getElementById('yogi-nrc-state').value = match[1] || '12';
      document.getElementById('yogi-nrc-township').value = match[2] || '';
      document.getElementById('yogi-nrc-type').value = `(${match[3]})` || '(နိုင်)';
      document.getElementById('yogi-nrc-number').value = match[4] || '';
    } else {
      document.getElementById('yogi-nrc-township').value = entry.nrc;
    }
  }

  document.getElementById('yogi-entry-modal').classList.remove('hidden');
}

function closeYogiModal() {
  const modal = document.getElementById('yogi-entry-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveYogiEntryForm(e) {
  e.preventDefault();

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
    const res = await saveYogiAPI(payload, isEdit);
    if (res.success) {
      closeYogiModal();
      renderYogiView(); // Immediately refresh and update
    } else {
      alert('သိမ်းဆည်းရာတွင် အမှားရှိပါသည်: ' + (res.error || ''));
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
