// ===================================================================
// js/Dashboard.js - Home Dashboard & System Control Center (v4.5)
// Features: 8-Row Fund Matrix with Direct User 1/2/3 Deep-Filter Jump,
// System Tab (D1 Live Quota %, FY Excel, Daily Mail, SQL ZIP Backup,
// GitHub File Downloader, Smart Refresh & One-Click Force Hard Refresh)
// ===================================================================

const DASH_CACHE_KEY = 'sasana_dashboard_cache';
const GITHUB_REPO = 'Dhamma-Aly/Cashbook';
const GITHUB_BRANCH = 'main';

let lastRenderedDashboardHash = '';
let activeDashTab = 'fund';
let activeDashFetchToken = 0;
let lastSystemMetricsLoadedAt = 0;
let sheetJsPromise = null;

function escapeDashHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notifyDash(msg, type = 'info', duration = 3200) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type, duration);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
}

window.openLedgerWithUserFilter = function (tabKey, userFilter = null) {
  window.pendingLedgerUserFilter = userFilter || null;
  if (typeof window.switchTab === 'function') {
    window.switchTab(tabKey);
  }
};

function showSystemStatus(html, tone = 'info') {
  const box = document.getElementById('sys-automation-status');
  if (!box) return;
  const tones = {
    success: 'border-color:rgba(16,185,129,0.4); color:#d1fae5; background:rgba(6,78,59,0.35);',
    error: 'border-color:rgba(244,63,94,0.4); color:#ffe4e6; background:rgba(76,5,25,0.38);',
    warning: 'border-color:rgba(245,158,11,0.4); color:#fef3c7; background:rgba(69,26,3,0.35);',
    info: 'border-color:rgba(56,189,248,0.35); color:#e0f2fe; background:rgba(12,74,110,0.28);',
  };
  box.style.cssText = tones[tone] || tones.info;
  box.innerHTML = html;
  box.classList.remove('hidden');
}

function applySystemTabPermissions() {
  const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;

  const mailBtn = document.getElementById('btn-sys-mail');
  const driveBtn = document.getElementById('btn-sys-drive-backup');
  const sqlLocalBtn = document.getElementById('btn-sys-sql-local');
  const rebuildBtn = document.getElementById('btn-sys-rebuild');

  if (mailBtn) {
    mailBtn.disabled = !canEdit;
    if (!canEdit) mailBtn.title = 'Viewer အဆင့်ဖြစ်၍ Mail ပို့ခွင့် မရှိပါ';
  }
  if (driveBtn) {
    driveBtn.disabled = !canEdit;
    if (!canEdit) driveBtn.title = 'Viewer အဆင့်ဖြစ်၍ Backup သိမ်းခွင့် မရှိပါ';
  }
  if (sqlLocalBtn) sqlLocalBtn.classList.toggle('hidden', !isAdmin);
  if (rebuildBtn) rebuildBtn.classList.toggle('hidden', !isAdmin);
}

function injectAdminBackupButton() {
  const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
  if (!isAdmin) return;

  const badge = document.getElementById('dash-tab-badge');
  const parent = badge ? badge.parentElement : null;
  if (!parent || document.getElementById('btn-dash-backup')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-dash-backup';
  btn.type = 'button';
  btn.onclick = window.downloadFullSystemBackup;
  btn.title = 'D1 Database တစ်ခုလုံး JSON Backup သိမ်းဆည်းရန် (Admin)';
  btn.className = 'px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer';
  btn.innerHTML = '<i class="fa-solid fa-download text-xs"></i><span class="hidden sm:inline">Backup</span>';
  parent.insertBefore(btn, badge);
}

window.downloadFullSystemBackup = async function () {
  if (typeof window.isAdminUser === 'function' && !window.isAdminUser()) {
    notifyDash('Admin တစ်ဦးတည်းသာ Full Backup ထုတ်ယူခွင့် ရှိပါသည်။', 'warning');
    return;
  }
  if (!navigator.onLine) {
    notifyDash('Full Backup ထုတ်ယူရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }
  if (typeof window.fetchAdminBackupAPI !== 'function') {
    notifyDash('Backup API မတွေ့ပါ။', 'error');
    return;
  }

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.fetchAdminBackupAPI();
    if (res && res.success && res.tables) {
      const jsonStr = JSON.stringify(res, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Sasana_ERP_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      notifyDash('Database Full Backup ဖိုင် ထုတ်ယူပြီးပါပြီ', 'success');
    } else if (!res || res.status !== 401) {
      notifyDash('Backup ထုတ်ယူခြင်း မအောင်မြင်ပါ: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Backup error:', err);
    notifyDash('Backup ထုတ်ယူခြင်း မအောင်မြင်ပါ။', 'error');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

// ===================================================================
// 1. TAB CONTROLLER (5 Sub-Tabs: Fund, Padetha, Yogi, Contact, System)
// ===================================================================
window.switchDashboardTab = function (tabName) {
  activeDashTab = tabName || 'fund';

  const sections = {
    fund: document.getElementById('dash-fund-section'),
    padetha: document.getElementById('dash-padetha-section'),
    yogi: document.getElementById('dash-yogi-section'),
    contact: document.getElementById('dash-contact-section'),
    system: document.getElementById('dash-system-section'),
  };

  const buttons = {
    fund: document.getElementById('tab-dash-fund'),
    padetha: document.getElementById('tab-dash-padetha'),
    yogi: document.getElementById('tab-dash-yogi'),
    contact: document.getElementById('tab-dash-contact'),
    system: document.getElementById('tab-dash-system'),
  };

  const tabBadge = document.getElementById('dash-tab-badge');
  const activeClasses = ['text-amber-300', 'bg-[#1e293b]', 'border-amber-500/30', 'font-black', 'shadow-sm'];
  const inactiveClasses = ['text-amber-400/60', 'font-bold', 'hover:text-amber-200'];

  Object.values(sections).forEach(sec => { if (sec) sec.classList.add('hidden'); });
  Object.values(buttons).forEach(btn => {
    if (btn) {
      btn.classList.remove(...activeClasses);
      btn.classList.add(...inactiveClasses);
    }
  });

  const targetSec = sections[activeDashTab] || sections.fund;
  const targetBtn = buttons[activeDashTab] || buttons.fund;
  if (targetSec) targetSec.classList.remove('hidden');
  if (targetBtn) {
    targetBtn.classList.add(...activeClasses);
    targetBtn.classList.remove(...inactiveClasses);
  }

  const badgeTextMap = {
    fund: '(ပမာဏ - MMK)',
    padetha: '(ပဒေသာပင် ၄ အုပ်)',
    yogi: 'စခန်းတွင်း Active ယောဂီများ',
    contact: 'ပြင်ဦးလွင်မြို့',
    system: 'System Control Center',
  };
  if (tabBadge) tabBadge.textContent = badgeTextMap[activeDashTab] || '(ပမာဏ - MMK)';

  if (activeDashTab === 'system') {
    applySystemTabPermissions();
    const isStale = (Date.now() - lastSystemMetricsLoadedAt) > 60000;
    if (isStale) window.loadSystemMetrics(false);
  }
};

// ===================================================================
// 2. SMART REFRESH & ONE-CLICK FORCE HARD REFRESH (No Ctrl+Shift+R Needed)
// ===================================================================
window.smartRefreshApp = async function () {
  const icon = document.getElementById('dash-refresh-icon');
  if (icon) icon.classList.add('fa-spin');

  try {
    if ('serviceWorker' in navigator && navigator.onLine) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          const newWorker = reg.waiting || reg.installing;
          if (newWorker) {
            notifyDash('ကုတ်ဗားရှင်းအသစ် တွေ့ရှိသဖြင့် အလိုအလျောက် ပြန်တင်နေပါသည်...', 'info', 2500);
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => window.location.reload(), 700);
            return;
          }
        }
      } catch (e) {
        console.warn('SW update check skipped:', e);
      }
    }

    await window.renderDashboardView(false);
    if (activeDashTab === 'system') {
      await window.loadSystemMetrics(true);
    }
    notifyDash('အချက်အလက်များ အသစ်ပြန်လည် ရယူပြီးပါပြီ', 'success', 2000);
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
};

window.forceHardRefreshApp = async function () {
  if (!navigator.onLine) {
    notifyDash('Cache ရှင်းပြီး ဗားရှင်းအသစ်တင်ရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }

  notifyDash('Cache အဟောင်းများ ရှင်းလင်းပြီး ကုတ်အသစ် ပြန်တင်နေပါသည်...', 'info', 3000);
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    try {
      localStorage.removeItem('sasana_dashboard_cache');
    } catch (_) {}
  } catch (err) {
    console.warn('Force Hard Refresh warning:', err);
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  window.location.replace(url.toString());
};

// ===================================================================
// 3. CLOUDFLARE D1 METRICS & QUOTA CARDS
// ===================================================================
function setBarStyle(barEl, usedPct, defaultClass = '') {
  if (!barEl) return;
  const clamped = Math.max(0, Math.min(100, Number(usedPct || 0)));
  barEl.style.width = `${clamped > 0 && clamped < 1 ? 1 : clamped}%`;
  barEl.classList.remove('is-sky', 'is-warn', 'is-danger');
  if (clamped >= 90) barEl.classList.add('is-danger');
  else if (clamped >= 70) barEl.classList.add('is-warn');
  else if (defaultClass) barEl.classList.add(defaultClass);
}

window.loadSystemMetrics = async function (showToastOnDone = false) {
  if (typeof window.fetchD1MetricsAPI !== 'function') return;
  const noticeEl = document.getElementById('sys-d1-notice');

  try {
    const res = await window.fetchD1MetricsAPI();
    if (!res || !res.success) {
      if (noticeEl) {
        noticeEl.textContent = `D1 Metrics ဆွဲယူ၍ မရပါ: ${res?.error || 'Network error'}`;
        noticeEl.classList.remove('hidden');
      }
      return;
    }

    lastSystemMetricsLoadedAt = Date.now();
    const t = res.today || {};
    const tot = res.total30d || {};
    const st = res.storage || {};

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('sys-d1-read-val', Number(t.rowsRead || 0).toLocaleString());
    setText('sys-d1-read-used-pct', `${Number(t.rowsReadPct || 0).toFixed(2)}%`);
    setText('sys-d1-read-rem-pct', `${Number(t.rowsReadRemainingPct ?? 100).toFixed(2)}%`);
    setText('sys-d1-read-queries', `Queries: ${Number(t.readQueries || 0).toLocaleString()}`);
    setBarStyle(document.getElementById('sys-d1-read-bar'), t.rowsReadPct, 'is-sky');

    setText('sys-d1-write-val', Number(t.rowsWritten || 0).toLocaleString());
    setText('sys-d1-write-used-pct', `${Number(t.rowsWrittenPct || 0).toFixed(2)}%`);
    setText('sys-d1-write-rem-pct', `${Number(t.rowsWrittenRemainingPct ?? 100).toFixed(2)}%`);
    setText('sys-d1-write-queries', `Queries: ${Number(t.writeQueries || 0).toLocaleString()}`);
    setBarStyle(document.getElementById('sys-d1-write-bar'), t.rowsWrittenPct, '');

    setText('sys-d1-total-read', Number(tot.rowsRead || 0).toLocaleString());
    setText('sys-d1-total-write', Number(tot.rowsWritten || 0).toLocaleString());
    setText('sys-d1-tracked-rows', Number(res.totalTrackedRows || 0).toLocaleString());
    setText('sys-d1-window-label', `ကာလ: ${res.windowStartUtc || ''} ~ ${res.todayUtc || ''} (UTC)`);

    setText('sys-d1-storage-val', `${Number(st.usedMB || 0).toFixed(2)} MB`);
    setText('sys-d1-storage-used-pct', `${Number(st.usedPct || 0).toFixed(2)}%`);
    setText('sys-d1-storage-rem-pct', `${Number(st.remainingPct ?? 100).toFixed(2)}%`);
    setText('sys-d1-last-update', `Last Data: ${(res.lastDataUpdate || '-').slice(0, 16)}`);
    setBarStyle(document.getElementById('sys-d1-storage-bar'), st.usedPct, 'is-sky');

    if (noticeEl) {
      if (!res.analyticsConfigured) {
        noticeEl.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> D1 Storage နှင့် Row Count များကို တိုက်ရိုက်ပြသထားပါသည်။ တစ်နေ့တာ Read/Write % အတိအကျ ပြရန် Cloudflare Worker Secrets တွင် <code>CF_API_TOKEN</code> (Account Analytics: Read) ထည့်သွင်းပေးပါ။`;
        noticeEl.classList.remove('hidden');
      } else if (res.analyticsError) {
        noticeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Cloudflare Analytics Warning: ${escapeDashHtml(res.analyticsError)}`;
        noticeEl.classList.remove('hidden');
      } else {
        noticeEl.classList.add('hidden');
      }
    }

    if (showToastOnDone) notifyDash('D1 Metrics အသစ်ရယူပြီးပါပြီ', 'success', 2000);
  } catch (err) {
    console.warn('D1 Metrics error:', err);
  }
};

// ===================================================================
// 4. MULTI-SHEET FY EXCEL (.xlsx) GENERATOR (Lazy-Loads SheetJS CDN)
// ===================================================================
function loadSheetJsLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;

  const cdns = [
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  ];

  sheetJsPromise = new Promise((resolve, reject) => {
    const tryLoad = (idx) => {
      if (idx >= cdns.length) {
        sheetJsPromise = null;
        reject(new Error('Excel Library (SheetJS) ဆွဲယူ၍ မရပါ'));
        return;
      }
      const s = document.createElement('script');
      s.src = cdns[idx];
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : tryLoad(idx + 1));
      s.onerror = () => tryLoad(idx + 1);
      document.head.appendChild(s);
    };
    tryLoad(0);
  });
  return sheetJsPromise;
}

function safeExcelSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function populateFyDropdown(years) {
  const sel = document.getElementById('sys-fy-select');
  if (!sel || !Array.isArray(years) || !years.length) return;
  const currentVal = sel.value || years[0];
  sel.innerHTML =
    years.map(y => `<option value="${escapeDashHtml(y)}">${escapeDashHtml(y)} (Jan – Dec)</option>`).join('') +
    `<option value="ALL">All (နှစ်အားလုံး)</option>`;
  if ([...sel.options].some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
}

window.downloadMultiSheetExcel = async function () {
  if (!navigator.onLine) {
    notifyDash('Excel ထုတ်ယူရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }
  const fySel = document.getElementById('sys-fy-select');
  const fy = fySel ? fySel.value : 'ALL';
  const btn = document.getElementById('btn-sys-excel');
  if (btn) btn.disabled = true;
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const [XLSX, res] = await Promise.all([
      loadSheetJsLibrary(),
      window.fetchSystemExportExcelAPI(fy),
    ]);

    if (!res || !res.success || !res.sheets) {
      throw new Error(res?.error || 'Export data ဆွဲယူခြင်း မအောင်မြင်ပါ');
    }

    if (res.availableYears) populateFyDropdown(res.availableYears);

    const wb = XLSX.utils.book_new();

    const summaryRows = (res.summary || []).map((s, idx) => ({
      'စဉ်': idx + 1,
      'စာအုပ်အမည် (Book)': s.book_name,
      'စာရင်းဖွင့်လက်ကျန် (Opening)': s.opening_balance,
      'စုစုပေါင်းဝင်ငွေ (Income)': s.total_income,
      'စုစုပေါင်းထွက်ငွေ (Expense)': s.total_expense,
      'လက်ကျန်ငွေ (Closing)': s.closing_balance,
      'စာကြောင်းရေ': s.row_count,
    }));
    const totOpen = (res.summary || []).reduce((a, b) => a + Number(b.opening_balance || 0), 0);
    const totInc = (res.summary || []).reduce((a, b) => a + Number(b.total_income || 0), 0);
    const totExp = (res.summary || []).reduce((a, b) => a + Number(b.total_expense || 0), 0);
    const totClose = (res.summary || []).reduce((a, b) => a + Number(b.closing_balance || 0), 0);
    const totRows = (res.summary || []).reduce((a, b) => a + Number(b.row_count || 0), 0);
    summaryRows.push({
      'စဉ်': '',
      'စာအုပ်အမည် (Book)': `စုစုပေါင်း (FY: ${res.fy})`,
      'စာရင်းဖွင့်လက်ကျန် (Opening)': totOpen,
      'စုစုပေါင်းဝင်ငွေ (Income)': totInc,
      'စုစုပေါင်းထွက်ငွေ (Expense)': totExp,
      'လက်ကျန်ငွေ (Closing)': totClose,
      'စာကြောင်းရေ': totRows,
    });
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const ledgerCols = [{ wch: 6 }, { wch: 12 }, { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
    const invCols = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 10 }];
    const yogiCols = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 7 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 32 }, { wch: 10 }];

    Object.entries(res.sheets).forEach(([sheetName, rows]) => {
      let mapped = [];
      let cols = ledgerCols;

      if (sheetName === 'Inventory') {
        cols = invCols;
        mapped = rows.map(r => ({
          'စဉ်': r.no, 'ရက်စွဲ': r.date, 'တည်နေရာ': r.location, 'အမျိုးအစား': r.category,
          'အကြောင်းအရာ': r.description, 'ရေတွက်ပုံ': r.unit, 'အရေအတွက်': r.qty,
          'မှတ်ချက်': r.remark, 'လနှစ်': r.month_year,
        }));
      } else if (sheetName === 'Permanent Yogi' || sheetName === 'Camp Yogi') {
        cols = yogiCols;
        mapped = rows.map(r => ({
          'စဉ်': r.no, 'စတင်ရက်': r.start_date, 'ထွက်ရက်': r.end_date, 'အမျိုးအစား': r.yogi_type,
          'ယောဂီအမည်': r.name, 'အဘအမည်': r.father_name, 'မှတ်ပုံတင်': r.nrc,
          'မွေးသက္ကရာဇ်': r.dob, 'အသက်': r.age, 'ကျား/မ': r.gender,
          'ယောဂီဖုန်း': r.yogi_phone, 'အိမ်ဖုန်း': r.home_phone, 'နေရပ်လိပ်စာ': r.address, 'အခြေအနေ': r.status,
        }));
      } else {
        mapped = rows.map(r => ({
          'စဉ်': r.no, 'ရက်စွဲ': r.date, 'ခေါင်းစဉ်': r.title, 'အကြောင်းအရာ': r.description,
          'ဝင်ငွေ': r.income, 'ထွက်ငွေ': r.expense, 'လက်ကျန်': r.balance,
          'ခေါင်းစဉ်ခွဲ': r.sub_title, 'ဘောင်ချာ': r.voucher_no, 'လက်ခံသူ': r.receiver,
          'လနှစ်': r.month_year, 'စာအုပ်အမည်': r.book_name,
        }));
      }

      const ws = mapped.length
        ? XLSX.utils.json_to_sheet(mapped)
        : XLSX.utils.aoa_to_sheet([['ဒေတာ မရှိသေးပါ']]);
      ws['!cols'] = cols;
      XLSX.utils.book_append_sheet(wb, ws, safeExcelSheetName(sheetName));
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `Sasana_ERP_FY_${res.fy}_${todayStr}.xlsx`;
    XLSX.writeFile(wb, fileName);

    notifyDash(`Excel (${fileName}) ဒေါင်းလုပ်ဆွဲပြီးပါပြီ`, 'success');
    showSystemStatus(
      `<i class="fa-solid fa-circle-check mr-1"></i> <b>${escapeDashHtml(fileName)}</b> (Sheet ၁၄ ခု အပြည့်အစုံ) ထုတ်ယူပြီးပါပြီ။`,
      'success'
    );
  } catch (err) {
    console.error('Excel export error:', err);
    notifyDash('Excel ထုတ်ယူခြင်း မအောင်မြင်ပါ: ' + err.message, 'error');
    showSystemStatus(`<i class="fa-solid fa-circle-exclamation mr-1"></i> ${escapeDashHtml(err.message)}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

// ===================================================================
// 5. DAILY MAIL, SQL ZIP BACKUP & ADMIN TOOLS
// ===================================================================
window.triggerManualDailyMail = async function () {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyDash('Viewer အဆင့်ဖြစ်၍ Mail ပို့ခွင့် မရှိပါ။', 'warning');
    return;
  }
  if (!navigator.onLine) {
    notifyDash('Mail ပို့ရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }

  const fySel = document.getElementById('sys-fy-select');
  const fy = fySel ? fySel.value : String(new Date().getFullYear());
  const btn = document.getElementById('btn-sys-mail');
  if (btn) btn.disabled = true;
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const res = await window.triggerDailyMailAPI({ fy, force: true });
    if (res && res.success) {
      const msg = res.message || `dhammaaly@gmail.com သို့ Daily Mail (FY: ${fy}) ပေးပို့ပြီးပါပြီ`;
      notifyDash(msg, 'success');
      showSystemStatus(`<i class="fa-solid fa-envelope-circle-check mr-1"></i> ${escapeDashHtml(msg)}`, 'success');
    } else if (!res || res.status !== 401) {
      const errMsg = res?.error || 'Mail ပို့ခြင်း မအောင်မြင်ပါ';
      notifyDash(errMsg, 'error');
      showSystemStatus(`<i class="fa-solid fa-circle-exclamation mr-1"></i> ${escapeDashHtml(errMsg)}`, 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.triggerManualDriveBackup = async function () {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyDash('Viewer အဆင့်ဖြစ်၍ Backup သိမ်းခွင့် မရှိပါ။', 'warning');
    return;
  }
  if (!navigator.onLine) {
    notifyDash('SQL Backup သိမ်းရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }

  const btn = document.getElementById('btn-sys-drive-backup');
  if (btn) btn.disabled = true;
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const res = await window.triggerDriveBackupAPI({ force: false });
    if (res && res.success) {
      if (res.skipped) {
        const msg = res.message || 'နောက်ဆုံး Backup သိမ်းထားချိန်မှစ၍ ဒေတာအသစ် မရှိသေးပါသဖြင့် Backup အပို မသိမ်းပါ။';
        notifyDash(msg, 'info', 4000);
        showSystemStatus(`<i class="fa-solid fa-circle-info mr-1"></i> ${escapeDashHtml(msg)}`, 'info');
      } else {
        const fileLink = res.fileUrl
          ? ` — <a href="${escapeDashHtml(res.fileUrl)}" target="_blank" rel="noopener noreferrer" style="color:#fde68a;text-decoration:underline;font-weight:800;">Google Drive တွင်ဖွင့်ကြည့်ရန်</a>`
          : '';
        const msg = res.message || `${res.fileName || 'SQL Backup (.zip)'} ပေးပို့သိမ်းဆည်းပြီးပါပြီ`;
        notifyDash(msg, 'success');
        showSystemStatus(`<i class="fa-solid fa-cloud-arrow-up mr-1"></i> ${escapeDashHtml(msg)}${fileLink}`, 'success');
      }
    } else if (!res || res.status !== 401) {
      const errMsg = res?.error || 'SQL Backup မအောင်မြင်ပါ';
      notifyDash(errMsg, 'error');
      showSystemStatus(`<i class="fa-solid fa-circle-exclamation mr-1"></i> ${escapeDashHtml(errMsg)}`, 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.downloadLocalSqlDump = async function () {
  if (typeof window.isAdminUser === 'function' && !window.isAdminUser()) {
    notifyDash('Admin တစ်ဦးတည်းသာ SQL Dump ထုတ်ယူခွင့် ရှိပါသည်။', 'warning');
    return;
  }
  if (!navigator.onLine) {
    notifyDash('SQL Dump ထုတ်ယူရန် အင်တာနက် လိုအပ်ပါသည်။', 'warning');
    return;
  }

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.fetchSqlDumpAPI();
    if (res && res.success && res.sql) {
      const blob = new Blob([res.sql], { type: 'application/sql;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.filename || `Sasana_ERP_D1_Backup_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      notifyDash(`SQL Backup (${res.totalRows || 0} rows) ဒေါင်းလုပ်ဆွဲပြီးပါပြီ`, 'success');
    } else if (!res || res.status !== 401) {
      notifyDash('SQL Dump မအောင်မြင်ပါ: ' + (res?.error || ''), 'error');
    }
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.rebuildSystemSummaries = async function () {
  if (typeof window.isAdminUser === 'function' && !window.isAdminUser()) {
    notifyDash('Admin တစ်ဦးတည်းသာ လုပ်ဆောင်ခွင့် ရှိပါသည်။', 'warning');
    return;
  }
  if (!confirm('Summary Cache နှင့် Version များအားလုံးကို Database မှ ပြန်လည်တွက်ချက်မည်လား?')) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const res = await window.rebuildSummariesAPI();
    if (res && res.success) {
      notifyDash('Summary Cache အားလုံး ပြန်လည်တွက်ချက်ပြီးပါပြီ', 'success');
      await window.renderDashboardView(false);
    } else if (!res || res.status !== 401) {
      notifyDash('မအောင်မြင်ပါ: ' + (res?.error || ''), 'error');
    }
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

// ===================================================================
// 6. GITHUB INDIVIDUAL FILE EXPLORER & DIRECT DOWNLOADER
// ===================================================================
window.openGitHubFilesModal = async function () {
  const modal = document.getElementById('sys-github-files-modal');
  const listEl = document.getElementById('sys-github-files-list');
  if (!modal || !listEl) return;

  modal.classList.remove('hidden');
  listEl.innerHTML = `<div style="text-align:center; padding:24px; color:#fbbf24;"><i class="fa-solid fa-spinner fa-spin mr-2"></i> GitHub ဖိုင်စာရင်း ဆွဲယူနေပါသည်...</div>`;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`);
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const data = await res.json();
    const files = (data.tree || []).filter(item => item.type === 'blob');

    if (!files.length) {
      listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">ဖိုင်မတွေ့ပါ</div>`;
      return;
    }

    listEl.innerHTML = files.map(f => {
      const kb = f.size ? `${(f.size / 1024).toFixed(1)} KB` : '';
      const safePath = escapeDashHtml(f.path);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 12px; background:#0a0f17; border:1px solid rgba(148,163,184,0.14); border-radius:10px;">
          <div style="min-width:0; flex:1;">
            <div class="font-mono truncate" style="color:#e2e8f0; font-size:12px;" title="${safePath}">${safePath}</div>
            <div style="color:#64748b; font-size:10.5px;">${escapeDashHtml(kb)}</div>
          </div>
          <button type="button" onclick="downloadSingleGitHubFile('${safePath}')" class="sys-action-btn sys-btn-emerald" style="padding:5px 10px; font-size:11px; flex-shrink:0;">
            <i class="fa-solid fa-download"></i> <span>Download</span>
          </button>
        </div>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#fda4af;">GitHub ဖိုင်စာရင်း ဆွဲယူ၍ မရပါ: ${escapeDashHtml(err.message)}</div>`;
  }
};

window.closeGitHubFilesModal = function () {
  const modal = document.getElementById('sys-github-files-modal');
  if (modal) modal.classList.add('hidden');
};

window.downloadSingleGitHubFile = async function (filePath) {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filePath.split('/').pop() || 'file';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    notifyDash(`${filePath.split('/').pop()} ဒေါင်းလုပ်ဆွဲပြီးပါပြီ`, 'success', 2000);
  } catch (err) {
    notifyDash('ဖိုင်ဒေါင်းလုပ် မအောင်မြင်ပါ: ' + err.message, 'error');
  }
};

// ===================================================================
// 7. MAIN DASHBOARD RENDERER (Fund 8-Row Matrix, Padetha & Yogi)
// ===================================================================
window.renderDashboardView = async function (isSilent = false) {
  const fetchToken = ++activeDashFetchToken;
  const container = document.getElementById('view-container');

  if (container && !document.getElementById('home-bank-table')) {
    try {
      const fetchFn = window.fetchTemplate || (async (p) => {
        const r = await fetch(p);
        return await r.text();
      });
      container.innerHTML = await fetchFn('view/Dashboard.html');
    } catch (e) {
      console.warn('Could not fetch view/Dashboard.html:', e);
    }
  }

  injectAdminBackupButton();
  applySystemTabPermissions();
  window.switchDashboardTab(activeDashTab);

  const FUND_GROUP_SPECS = [
    {
      title: 'အထွေထွေ ရန်ပုံငွေ',
      bankKey: '1CB',
      cashKey: '4GB',
      bankLabel: 'အထွေထွေ ရန်ပုံငွေ (Bank) ဖွင့်ရန်',
      cashLabel: 'ကျောင်းရန်ပုံငွေ စာအုပ် (Cash) ဖွင့်ရန်',
      sources: [
        { key: '1CB', tableName: '1CB Bank (General)' },
        { key: '4GB', tableName: '1General Book' }
      ]
    },
    {
      title: 'ဆွမ်းပဒေသာပင်',
      bankKey: '2CB',
      cashKey: '5FB',
      bankLabel: 'ဆွမ်းပဒေသာပင် (Bank) ဖွင့်ရန်',
      cashLabel: 'ဆွမ်းပဒေသာပင် စာအုပ် (Cash) ဖွင့်ရန်',
      sources: [
        { key: '2CB', tableName: '2CB Bank (Meal)' },
        { key: '5FB', tableName: '2Meal Book' }
      ]
    },
    {
      title: 'တစ်ဦးတည်းစာရင်း',
      bankKey: '3CB',
      cashKey: null,
      bankLabel: 'တစ်ဦးတည်းစာရင်း (Bank) ဖွင့်ရန်',
      cashLabel: '',
      sources: [{ key: '3CB', tableName: '3CB Bank (UZ)' }]
    },
    {
      title: 'ဓမ္မာရုံငွေစာရင်း',
      bankKey: null,
      cashKey: '6HB',
      bankLabel: '',
      cashLabel: 'ဓမ္မာရုံငွေစာရင်း စာအုပ် ဖွင့်ရန်',
      sources: [{ key: '6HB', tableName: '3Hall Book' }]
    },
    {
      title: 'စေတီငွေစာရင်း',
      bankKey: null,
      cashKey: '7PB',
      bankLabel: '',
      cashLabel: 'စေတီငွေစာရင်း စာအုပ် ဖွင့်ရန်',
      sources: [{ key: '7PB', tableName: '4Pagoda Book' }]
    },
    {
      title: 'လျှပ်စစ်ပဒေသာပင်',
      bankKey: null,
      cashKey: '8EB',
      bankLabel: '',
      cashLabel: 'လျှပ်စစ်ပဒေသာပင် စာအုပ် ဖွင့်ရန်',
      sources: [{ key: '8EB', tableName: '5Electronic Book' }]
    },
    {
      title: 'ဆေးပဒေသာပင်',
      bankKey: null,
      cashKey: '9MB',
      bankLabel: '',
      cashLabel: 'ဆေးပဒေသာပင် စာအုပ် ဖွင့်ရန်',
      sources: [{ key: '9MB', tableName: '6Medical Book' }]
    },
    {
      title: 'အထွေထွေရန်ပုံငွေ',
      bankKey: null,
      cashKey: '10GB',
      bankLabel: '',
      cashLabel: 'အထွေထွေရန်ပုံငွေစာအုပ် ဖွင့်ရန်',
      sources: [{ key: '10GB', tableName: '7Other Book' }]
    }
  ];

  const PADETHA_SPECS = [
    { key: '5FB', tableName: '2Meal Book', title: 'ဆွမ်းပဒေသာပင် စာအုပ်' },
    { key: '8EB', tableName: '5Electronic Book', title: 'လျှပ်စစ်ပဒေသာပင် စာအုပ်' },
    { key: '9MB', tableName: '6Medical Book', title: 'ဆေးပဒေသာပင် စာအုပ်' },
    { key: '10GB', tableName: '7Other Book', title: 'အထွေထွေရန်ပုံငွေစာအုပ်' }
  ];

  const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

  const formatMoney = (val, colorHex = '#cbd5e1', weight = 'font-medium') => {
    const num = Number(val || 0);
    if (num === 0) return `<span class="font-mono" style="color:#475569;">-</span>`;
    if (num < 0) return `<span class="font-mono font-bold" style="color:#fda4af;">${num.toLocaleString()}</span>`;
    return `<span class="font-mono ${weight}" style="color:${colorHex};">${num.toLocaleString()}</span>`;
  };

  const renderHomeData = (raw) => {
    const bankTableElem = document.getElementById('home-bank-table');
    const padethaTableElem = document.getElementById('home-padetha-table');
    const yogiTableElem = document.getElementById('home-yogi-table');

    const data = (raw && raw.data) ? raw.data : (raw || {});
    const kpis = data.kpis || { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 };
    const fundSummary = data.fundSummary || {};
    const padethaSummary = data.padethaSummary || [];
    const yogiSummary = data.yogiSummary || {};

    const setKpi = (id, val, colorHex) => {
      const el = document.getElementById(id);
      if (!el) return;
      const num = Number(val || 0);
      el.textContent = `${num.toLocaleString()} MMK`;
      el.className = 'text-base font-extrabold mt-1 truncate font-mono';
      el.style.color = num < 0 ? '#fda4af' : colorHex;
    };
    setKpi('kpi-home-fund', kpis.totalFund, '#fbbf24');
    setKpi('kpi-home-bank', kpis.totalBank, '#7dd3fc');
    setKpi('kpi-home-cash', kpis.totalCash, '#6ee7b7');

    const countEl = document.getElementById('kpi-home-count');
    if (countEl) {
      countEl.textContent = Number(kpis.totalCount || 0).toLocaleString();
      countEl.style.color = '#e2e8f0';
    }

    if (bankTableElem) {
      let fundHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse" style="min-width: 820px;">
          <thead>
            <tr>
              <th class="w-14 text-center px-3">စဉ်</th>
              <th class="px-4" style="min-width: 240px;">စာအုပ်အမည်</th>
              <th class="text-right w-40 px-4">ဘဏ်လက်ကျန
