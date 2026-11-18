// ===================================================================
// js/yogi.js - Yogi Management Controller (Permanent & Camp Yogi) (v4.1)
// Features: Calm Eye-Comfort Palette, Preserves end_date on Edit,
// Anti-Jitter, Race-Condition Guard, Myanmar Digits, Role Guards & XSS Safe
// ===================================================================

const YOGI_CACHE_PREFIX = 'sasana_yogi_cache_';
const yogiRowsPerPage = 15;

let currentYogiTable = 'Permanent Yogi';
let currentYogiStatus = 'Active';
let allYogiEntries = [];
let filteredYogiEntries = [];
let yogiCurrentPage = 1;
let isYogiSubmitting = false;
let lastRenderedYogiHTML = '';
let activeYogiFetchToken = 0;

function escapeYogiHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toEngDigitsYogi(str) {
  if (typeof window.toEnglishDigits === 'function') return window.toEnglishDigits(str);
  if (str === null || str === undefined) return '';
  const mm = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
  return String(str).replace(/[၀-၉]/g, ch => mm.indexOf(ch));
}

function notifyYogi(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
}

function setYogiSelectSafe(selectEl, val) {
  if (!selectEl) return;
  const v = String(val ?? '').trim();
  if (!v) return;
  if (!Array.from(selectEl.options).some(o => o.value === v)) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  selectEl.value = v;
}

function getTodayYogiISO() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveYogiTable(nameOrKey) {
  const k = String(nameOrKey || '').trim();
  if (k === '13Yogi' || k === 'Camp Yogi' || k.includes('စခန်းဝင်')) return 'Camp Yogi';
  return 'Permanent Yogi';
}

function getYogiCategoryDotColor(category) {
  const c = String(category || '');
  if (c.includes('ရဟန်း') || c.includes('ကိုရင်')) return '#fbbf24';
  if (c.includes('သီလရှင်')) return '#a78bfa';
  if (c.includes('ဝေယျာဝိစ္စ')) return '#34d399';
  return '#38bdf8';
}

function parseNrcString(nrcStr) {
  const result = { state: '12', township: '', type: '(နိုင်)', number: '' };
  if (!nrcStr) return result;

  const match = String(nrcStr).match(/^(\d{1,2})\/([^\(\d]+)(\([^\)]+\))?(\d+)/);
  if (match) {
    result.state = match[1] || '12';
    result.township = match[2] || '';
    result.type = match[3] || '(နိုင်)';
    result.number = match[4] || '';
  } else {
    result.number = nrcStr;
  }
  return result;
}

function isYogiActive(entry) {
  if (entry.status) return entry.status === 'Active';
  return !entry.end_date || entry.end_date.trim() === '' || entry.end_date.trim() === '-';
}

window.renderYogiView = async function (isSilent = false) {
  const targetTable = resolveYogiTable(window.currentYogiTable || window.currentSheet || 'Permanent Yogi');
  const isTableChanged = (currentYogiTable !== targetTable) || !isSilent;
  const fetchToken = ++activeYogiFetchToken;

  if (currentYogiTable !== targetTable) {
    allYogiEntries = [];
    filteredYogiEntries = [];
    yogiCurrentPage = 1;
    lastRenderedYogiHTML = '';
  } else if (!isSilent) {
    yogiCurrentPage = 1;
    lastRenderedYogiHTML = '';
  }

  currentYogiTable = targetTable;
  window.currentYogiTable = currentYogiTable;
  window.currentTable = currentYogiTable;

  const cacheKey = `${YOGI_CACHE_PREFIX}${currentYogiTable}`;

  if (!isSilent && allYogiEntries.length === 0) {
    try {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && cached.data) {
          allYogiEntries = cached.data || [];
          updateYogiKPIs(cached.kpis);
          applyYogiFilters();
        }
      }
    } catch (_) {}
  }

  const shouldShowOverlay = !isSilent && allYogiEntries.length === 0;
  if (shouldShowOverlay && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const sheetParam = (currentYogiTable === 'Camp Yogi') ? '13Yogi' : '12Yogi';
    const response = await window.fetchYogiDataAPI(sheetParam);
    if (fetchToken !== activeYogiFetchToken) return;

    if (response && response.success) {
      allYogiEntries = response.data || [];
      try { localStorage.setItem(cacheKey, JSON.stringify(response)); } catch (_) {}
      updateYogiKPIs(response.kpis);
      applyYogiFilters();
    }
  } catch (err) {
    if (fetchToken !== activeYogiFetchToken) return;
    console.error('Yogi Fetch Error from D1:', err);
  } finally {
    if (shouldShowOverlay && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }

  if (isTableChanged && !isSilent) {
    window.switchYogiStatusTab(currentYogiStatus);
  }
};

function updateYogiKPIs(kpis) {
  if (!kpis) return;
  const setElem = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val || 0).toLocaleString();
  };

  setElem('kpi-yogi-monks', kpis.totalMonks || kpis.monks);
  setElem('kpi-yogi-nuns', kpis.totalNuns || kpis.nuns);
  setElem('kpi-yogi-males', kpis.totalMales || kpis.males);
  setElem('kpi-yogi-females', kpis.totalFemales || kpis.females);
  setElem('kpi-yogi-total', kpis.totalActiveYogis || kpis.total);
}

window.switchYogiStatusTab = function (status) {
  currentYogiStatus = status;
  yogiCurrentPage = 1;
  lastRenderedYogiHTML = '';

  const activeBtn = document.getElementById('tab-yogi-active');
  const inactiveBtn = document.getElementById('tab-yogi-inactive');

  if (status === 'Active') {
    if (activeBtn) activeBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-amber-300 bg-[#1e293b] border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm';
    if (inactiveBtn) inactiveBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer';
  } else {
    if (inactiveBtn) inactiveBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-rose-300 bg-[#1e293b] border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm';
    if (activeBtn) activeBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer';
  }

  applyYogiFilters();
};

window.onYogiSearchInput = function () {
  yogiCurrentPage = 1;
  lastRenderedYogiHTML = '';
  applyYogiFilters();
};

function applyYogiFilters() {
  const searchInput = document.getElementById('yogi-search-input');
  const rawTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const engTerm = toEngDigitsYogi(rawTerm);

  filteredYogiEntries = allYogiEntries.filter(entry => {
    const active = isYogiActive(entry);
    const matchesStatus = (currentYogiStatus === 'Active') ? active : !active;
    if (!matchesStatus) return false;
    if (!rawTerm) return true;

    const nrcText = entry.nrc || entry.full_nrc || '';
    const phoneText = entry.yogi_phone || entry.phone || '';
    const homePhone = entry.home_phone || '';
    const catText = entry.yogi_type || entry.category || '';

    return [entry.name, entry.father_name, nrcText, phoneText, homePhone, entry.address, catText]
      .some(v => {
        const s = (v || '').toString().toLowerCase();
        return s.includes(rawTerm) || s.includes(engTerm);
      });
  });

  renderYogiTable();
}

function renderYogiTable() {
  const tbody = document.getElementById('yogi-table-body');
  if (!tbody) return;

  const totalEntries = filteredYogiEntries.length;
  const maxPage = Math.max(1, Math.ceil(totalEntries / yogiRowsPerPage));
  if (yogiCurrentPage > maxPage) yogiCurrentPage = maxPage;
  if (yogiCurrentPage < 1) yogiCurrentPage = 1;

  const startIndex = (yogiCurrentPage - 1) * yogiRowsPerPage;
  const endIndex = Math.min(startIndex + yogiRowsPerPage, totalEntries);
  const pageEntries = filteredYogiEntries.slice(startIndex, endIndex);

  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : canEdit;

  let html = '';
  if (totalEntries === 0) {
    html = `
      <tr>
        <td colspan="14" class="text-center py-8 font-semibold" style="color:#64748b;">
          <i class="fa-solid fa-users-slash mr-2"></i>
          ${currentYogiStatus === 'Active' ? 'Active ယောဂီစာရင်း မရှိပါ' : 'Inactive (စခန်းထွက်ပြီး) ယောဂီစာရင်း မရှိပါ'}
        </td>
      </tr>
    `;
  } else {
    pageEntries.forEach((entry, idx) => {
      const srNo = (startIndex + idx + 1);
      const uid = String(entry.unique_id || entry.uniqueId || entry.id || '');
      const safeUidAttr = escapeYogiHtml(uid);
      const active = isYogiActive(entry);
      const nrcVal = entry.nrc || entry.full_nrc || '-';
      const phoneVal = entry.yogi_phone || entry.phone || '-';
      const categoryVal = entry.yogi_type || entry.category || '-';
      const catDot = getYogiCategoryDotColor(categoryVal);

      const categoryHtml = `
        <span class="inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap" style="color:#e2e8f0;">
          <span style="width:7px;height:7px;border-radius:9999px;background-color:${catDot};flex-shrink:0;display:inline-block;"></span>
          <span>${escapeYogiHtml(categoryVal)}</span>
        </span>
      `;

      const pendingBadge = entry.pending
        ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold" style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.28);">Pending</span>`
        : '';

      const rawAddr = entry.address || '';
      const escapedAddr = escapeYogiHtml(rawAddr);
      const addrHtml = rawAddr
        ? `<div class="min-w-[180px] max-w-[320px] text-xs leading-relaxed whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" style="color:#94a3b8;" title="${escapedAddr}">${escapedAddr}</div>`
        : '<span class="font-mono" style="color:#475569;">-</span>';

      html += `
        <tr class="transition text-xs">
          <td class="text-center py-3 font-mono text-xs" style="color:#64748b;">${srNo}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:#94a3b8;">${escapeYogiHtml(entry.start_date || '-')}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:${entry.end_date ? '#fda4af' : '#475569'};font-weight:${entry.end_date ? '600' : '400'};">${escapeYogiHtml(entry.end_date || '-')}</td>
          <td class="whitespace-nowrap px-3">${categoryHtml}</td>
          <td class="font-semibold whitespace-nowrap px-2" style="color:#f8fafc;">${escapeYogiHtml(entry.name || '-')}${pendingBadge}</td>
          <td class="whitespace-nowrap px-2" style="color:#94a3b8;">${escapeYogiHtml(entry.father_name || '-')}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:#cbd5e1;">${escapeYogiHtml(nrcVal)}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:#94a3b8;">${escapeYogiHtml(entry.dob || '-')}</td>
          <td class="text-center font-mono whitespace-nowrap px-2" style="color:#cbd5e1;">${escapeYogiHtml(entry.age || '-')}</td>
          <td class="text-center font-medium whitespace-nowrap px-2" style="color:${entry.gender === 'ကျား' ? '#7dd3fc' : '#fda4af'};">${escapeYogiHtml(entry.gender || '-')}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:#cbd5e1;">${escapeYogiHtml(phoneVal)}</td>
          <td class="font-mono whitespace-nowrap px-2" style="color:#94a3b8;">${escapeYogiHtml(entry.home_phone || '-')}</td>
          <td class="py-2.5 px-3 align-middle text-left">${addrHtml}</td>
          <td class="text-center right-0 sticky z-10 px-3 py-2">
            <div class="flex items-center justify-center gap-1.5">
              <button type="button" onclick="openEditYogiModal('${safeUidAttr}')" ${!canEdit ? 'disabled class="p-1.5 opacity-30 cursor-not-allowed rounded" style="color:#64748b;"' : 'class="p-1.5 hover:bg-slate-800 rounded transition cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#fbbf24\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="ပြင်ဆင်မည်">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              ${active ? `
                <button type="button" onclick="checkoutYogiPrompt('${safeUidAttr}')" ${!canEdit ? 'disabled class="p-1.5 opacity-30 cursor-not-allowed rounded" style="color:#64748b;"' : 'class="p-1.5 hover:bg-slate-800 rounded transition cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#fda4af\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="စခန်းထွက်ပေးမည်">
                  <i class="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
              ` : `
                <button type="button" onclick="reactivateYogiPrompt('${safeUidAttr}')" ${!canEdit ? 'disabled class="p-1.5 opacity-30 cursor-not-allowed rounded" style="color:#64748b;"' : 'class="p-1.5 hover:bg-slate-800 rounded transition cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#6ee7b7\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="စခန်းတွင်း ပြန်လည်ဝင်မည်">
                  <i class="fa-solid fa-arrow-right-to-bracket"></i>
                </button>
              `}
              <button type="button" onclick="deleteYogiPrompt('${safeUidAttr}')" ${!canDelete ? 'disabled class="p-1.5 opacity-30 cursor-not-allowed rounded" style="color:#64748b;"' : 'class="p-1.5 hover:bg-slate-800 rounded transition cursor-pointer" style="color:#94a3b8;" onmouseenter="this.style.color=\'#fda4af\'" onmouseleave="this.style.color=\'#94a3b8\'"'} title="ဖျက်မည်">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  if (lastRenderedYogiHTML !== html) {
    lastRenderedYogiHTML = html;
    tbody.innerHTML = html;
  }

  updateYogiPaginationInfo(totalEntries ? startIndex + 1 : 0, endIndex, totalEntries);
}

function updateYogiPaginationInfo(start, end, total) {
  const startEl = document.getElementById('yogi-page-start');
  const endEl = document.getElementById('yogi-page-end');
  const totalEl = document.getElementById('yogi-total-entries');

  if (startEl) startEl.textContent = start;
  if (endEl) endEl.textContent = end;
  if (totalEl) totalEl.textContent = total;

  const prevBtn = document.getElementById('btn-yogi-prev-page');
  const nextBtn = document.getElementById('btn-yogi-next-page') || document.getElementById('btn-next-page');

  if (prevBtn) prevBtn.disabled = (yogiCurrentPage <= 1);
  if (nextBtn) nextBtn.disabled = (end >= total);
}

window.prevYogiPage = function () {
  if (yogiCurrentPage > 1) {
    yogiCurrentPage--;
    lastRenderedYogiHTML = '';
    renderYogiTable();
  }
};

window.nextYogiPage = function () {
  const maxPage = Math.max(1, Math.ceil(filteredYogiEntries.length / yogiRowsPerPage));
  if (yogiCurrentPage < maxPage) {
    yogiCurrentPage++;
    lastRenderedYogiHTML = '';
    renderYogiTable();
  }
};

window.openAddYogiModal = function () {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyYogi('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ ယောဂီအသစ်ထည့်ခွင့် မရှိပါ။', 'warning');
    return;
  }

  const modal = document.getElementById('yogi-entry-modal');
  const form = document.getElementById('yogi-entry-form');
  if (form) form.reset();

  const uidInput = document.getElementById('yogi-uniqueId');
  if (uidInput) uidInput.value = '';

  const sheetInput = document.getElementById('yogi-sheet-type');
  if (sheetInput) sheetInput.value = resolveYogiTable(window.currentYogiTable || window.currentSheet);

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အသစ် သွင်းယူရန်';

  const startDateInput = document.getElementById('yogi-start-date');
  if (startDateInput) startDateInput.value = getTodayYogiISO();

  const catSelect = document.getElementById('yogi-category');
  if (catSelect) {
    catSelect.value = 'လူပုဂ္ဂိုလ်';
    window.onYogiCategoryChange('လူပုဂ္ဂိုလ်');
  }

  if (modal) modal.classList.remove('hidden');
};

window.openEditYogiModal = function (uid) {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyYogi('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ ပြင်ဆင်ခွင့် မရှိပါ။', 'warning');
    return;
  }

  const entry = allYogiEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById('yogi-entry-modal');
  if (!modal) return;

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အချက်အလက် ပြင်ဆင်ရန်';

  document.getElementById('yogi-uniqueId').value = entry.unique_id || entry.uniqueId || uid;
  const sheetInput = document.getElementById('yogi-sheet-type');
  if (sheetInput) sheetInput.value = resolveYogiTable(window.currentYogiTable || window.currentSheet);

  setYogiSelectSafe(document.getElementById('yogi-category'), entry.yogi_type || entry.category || 'လူပုဂ္ဂိုလ်');
  document.getElementById('yogi-start-date').value = entry.start_date || '';
  document.getElementById('yogi-name').value = entry.name || '';
  document.getElementById('yogi-father-name').value = entry.father_name || '';

  const parsedNrc = parseNrcString(entry.nrc || entry.full_nrc || '');
  setYogiSelectSafe(document.getElementById('yogi-nrc-state'), parsedNrc.state || '12');
  if (document.getElementById('yogi-nrc-township')) document.getElementById('yogi-nrc-township').value = parsedNrc.township || '';
  setYogiSelectSafe(document.getElementById('yogi-nrc-type'), parsedNrc.type || '(နိုင်)');
  if (document.getElementById('yogi-nrc-number')) document.getElementById('yogi-nrc-number').value = parsedNrc.number || '';

  document.getElementById('yogi-dob').value = entry.dob || '';
  document.getElementById('yogi-age').value = entry.age || '';
  setYogiSelectSafe(document.getElementById('yogi-gender'), entry.gender || 'ကျား');
  document.getElementById('yogi-phone').value = entry.yogi_phone || entry.phone || '';
  document.getElementById('yogi-home-phone').value = entry.home_phone || '';
  document.getElementById('yogi-address').value = entry.address || '';

  modal.classList.remove('hidden');
};

window.onYogiCategoryChange = function (category) {
  const genderSelect = document.getElementById('yogi-gender');
  if (!genderSelect) return;

  if (category === 'ရဟန်း' || category === 'ကိုရင်') {
    genderSelect.value = 'ကျား';
  } else if (category === 'သီလရှင်') {
    genderSelect.value = 'မ';
  } else {
    const nameVal = document.getElementById('yogi-name') ? document.getElementById('yogi-name').value : '';
    genderSelect.value = detectGenderFromName(nameVal);
  }
};

window.onYogiDoBChange = function (dobString) {
  const age = calcAgeFromDoB(dobString);
  const ageInput = document.getElementById('yogi-age');
  if (ageInput) ageInput.value = age > 0 ? age : '';
};

window.onYogiNameChange = function (nameString) {
  const catVal = document.getElementById('yogi-category') ? document.getElementById('yogi-category').value : '';
  const genderSelect = document.getElementById('yogi-gender');
  if (!genderSelect) return;

  if (catVal === 'ရဟန်း' || catVal === 'ကိုရင်') {
    genderSelect.value = 'ကျား';
    return;
  }
  if (catVal === 'သီလရှင်') {
    genderSelect.value = 'မ';
    return;
  }

  genderSelect.value = detectGenderFromName(nameString);
};

window.saveYogiEntryForm = async function (event) {
  if (event && event.preventDefault) event.preventDefault();
  if (isYogiSubmitting) return;

  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyYogi('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ သိမ်းဆည်းခွင့် မရှိပါ။', 'warning');
    return;
  }

  const startDateEl = document.getElementById('yogi-start-date');
  const start_date = startDateEl ? startDateEl.value.trim() : '';
  if (!start_date) {
    alert('စတင်ရက်စွဲ (Start Date) အား ရွေးချယ်ပေးပါခင်ဗျာ။');
    if (startDateEl) startDateEl.focus();
    return;
  }

  const nameEl = document.getElementById('yogi-name');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    alert('ယောဂီအမည် (Name) အား ထည့်သွင်းပေးပါခင်ဗျာ။');
    if (nameEl) nameEl.focus();
    return;
  }

  const unique_id = (document.getElementById('yogi-uniqueId')?.value || '').trim();
  const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
  const isEdit = !!unique_id;

  const existingEntry = isEdit
    ? allYogiEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(unique_id))
    : null;
  const preservedEndDate = isEdit ? (existingEntry?.end_date || '') : '';

  const category = document.getElementById('yogi-category')?.value || 'လူပုဂ္ဂိုလ်';
  const father_name = (document.getElementById('yogi-father-name')?.value || '').trim();

  const nrc_state = document.getElementById('yogi-nrc-state')?.value || '12';
  const nrc_township = (document.getElementById('yogi-nrc-township')?.value || '').trim();
  const nrc_type = document.getElementById('yogi-nrc-type')?.value || '(နိုင်)';
  const nrc_number = toEngDigitsYogi((document.getElementById('yogi-nrc-number')?.value || '').trim());

  let full_nrc = '';
  if (nrc_township && nrc_number) {
    full_nrc = `${nrc_state}/${nrc_township}${nrc_type}${nrc_number}`;
  } else if (!nrc_township && nrc_number) {
    full_nrc = nrc_number;
  }

  const dob = document.getElementById('yogi-dob')?.value || '';
  const rawAge = toEngDigitsYogi(document.getElementById('yogi-age')?.value || '');
  const age = parseInt(rawAge, 10) || calcAgeFromDoB(dob);
  const gender = document.getElementById('yogi-gender')?.value || 'ကျား';
  const phone = toEngDigitsYogi((document.getElementById('yogi-phone')?.value || '').trim());
  const home_phone = toEngDigitsYogi((document.getElementById('yogi-home-phone')?.value || '').trim());
  const address = (document.getElementById('yogi-address')?.value || '').trim();

  const finalUid = unique_id || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? `YOGI-${crypto.randomUUID()}`
    : `YOGI_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  const payload = {
    unique_id: finalUid,
    sheet_type: currentTable,
    book_name: currentTable,
    yogi_type: category,
    start_date,
    end_date: preservedEndDate,
    name,
    father_name,
    nrc: full_nrc,
    dob,
    age,
    gender,
    yogi_phone: phone,
    home_phone,
    address,
    uniqueId: finalUid,
    category,
    phone,
    full_nrc
  };

  const form = document.getElementById('yogi-entry-form');
  const submitBtn = form ? form.querySelector("button[type='submit']") : null;
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Save';

  isYogiSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
  }
  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const response = await window.saveYogiAPI(payload, isEdit);
    if (response && response.success) {
      try { localStorage.removeItem(`${YOGI_CACHE_PREFIX}${currentTable}`); } catch (_) {}
      lastRenderedYogiHTML = '';
      if (typeof window.closeYogiModal === 'function') window.closeYogiModal();
      notifyYogi(response.message || (isEdit ? 'ယောဂီစာရင်း ပြင်ဆင်ပြီးပါပြီ' : 'ယောဂီစာရင်း သိမ်းဆည်းပြီးပါပြီ'), response.offline ? 'warning' : 'success');
      await window.renderYogiView(false);
    } else if (!response || response.status !== 401) {
      notifyYogi('ယောဂီစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: ' + (response?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Save Yogi Error:', err);
    notifyYogi('ယောဂီစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။', 'error');
  } finally {
    isYogiSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.checkoutYogiPrompt = async function (uniqueId) {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyYogi('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ လုပ်ဆောင်ခွင့် မရှိပါ။', 'warning');
    return;
  }

  const entry = allYogiEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uniqueId));
  const name = entry ? entry.name : '';
  const todayStr = getTodayYogiISO();
  const confirmCheckout = confirm(`ယောဂီ "${name}" အား ယနေ့ (${todayStr}) ရက်စွဲဖြင့် စခန်းထွက် (Inactive) စာရင်းသို့ ပြောင်းလဲပါမည်လော။`);

  if (!confirmCheckout) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.checkoutYogiAPI({
      unique_id: uniqueId, uniqueId: uniqueId, end_date: todayStr, sheet_type: currentTable
    });

    if (response && response.success) {
      try { localStorage.removeItem(`${YOGI_CACHE_PREFIX}${currentTable}`); } catch (_) {}
      lastRenderedYogiHTML = '';
      notifyYogi('စခန်းထွက်စာရင်းသို့ ပြောင်းလဲပြီးပါပြီ', 'success');
      await window.renderYogiView(false);
    } else if (!response || response.status !== 401) {
      notifyYogi('စခန်းထွက် ပြုလုပ်ရာတွင် အမှားရှိပါသည်: ' + (response?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Checkout Error:', err);
    notifyYogi('စခန်းထွက် ပြုလုပ်ရာတွင် အမှားရှိပါသည်', 'error');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.reactivateYogiPrompt = async function (uniqueId) {
  if (typeof window.canUserEdit === 'function' && !window.canUserEdit()) {
    notifyYogi('ကြည့်ရှုသူ (Viewer) အဆင့်ဖြစ်၍ လုပ်ဆောင်ခွင့် မရှိပါ။', 'warning');
    return;
  }

  const entry = allYogiEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uniqueId));
  const name = entry ? entry.name : '';
  const confirmReactivate = confirm(`ယောဂီ "${name}" အား စခန်းတွင်း Active စာရင်းသို့ ပြန်လည်ပြောင်းလဲပါမည်လော။`);

  if (!confirmReactivate) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.reactivateYogiAPI({
      unique_id: uniqueId, uniqueId: uniqueId, sheet_type: currentTable
    });

    if (response && response.success) {
      try { localStorage.removeItem(`${YOGI_CACHE_PREFIX}${currentTable}`); } catch (_) {}
      lastRenderedYogiHTML = '';
      notifyYogi('Active စာရင်းသို့ ပြန်လည်ပြောင်းလဲပြီးပါပြီ', 'success');
      await window.renderYogiView(false);
    } else if (!response || response.status !== 401) {
      notifyYogi('Active စာရင်းသို့ ပြန်ပြောင်းရာတွင် အမှားရှိပါသည်: ' + (response?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Reactivate Error:', err);
    notifyYogi('Active စာရင်းသို့ ပြန်ပြောင်းရာတွင် အမှားရှိပါသည်', 'error');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.deleteYogiPrompt = async function (uniqueId) {
  const canDelete = typeof window.canUserDelete === 'function' ? window.canUserDelete() : true;
  if (!canDelete) {
    notifyYogi('သင့်ရာထူးအဆင့်တွင် ယောဂီစာရင်း ဖျက်သိမ်းခွင့် မရှိပါ။', 'warning');
    return;
  }

  if (!confirm('ဤယောဂီစာရင်းကို ပယ်ဖျက်ရန် သေချာပါသလား။')) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.deleteYogiAPI(uniqueId, currentTable);
    if (response && response.success) {
      try { localStorage.removeItem(`${YOGI_CACHE_PREFIX}${currentTable}`); } catch (_) {}
      lastRenderedYogiHTML = '';
      notifyYogi(response.message || 'ယောဂီစာရင်း ဖျက်သိမ်းပြီးပါပြီ', response.offline ? 'warning' : 'success');
      await window.renderYogiView(false);
    } else if (!response || response.status !== 401) {
      notifyYogi('ဖျက်ရာတွင် အမှားရှိပါသည်: ' + (response?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Delete Yogi Error:', err);
    notifyYogi('ဖျက်ရာတွင် အမှားရှိပါသည်', 'error');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

function calcAgeFromDoB(dobString) {
  if (!dobString) return 0;
  const dobDate = new Date(dobString);
  if (isNaN(dobDate.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const monthDiff = today.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
    age--;
  }
  return age > 0 ? age : 0;
}

function detectGenderFromName(name) {
  if (!name) return 'ကျား';
  const trimmed = name.trim();

  if (
    trimmed.startsWith('ဦး') ||
    trimmed.startsWith('ကို') ||
    trimmed.startsWith('မောင်') ||
    trimmed.startsWith('ရှင်') ||
    trimmed.startsWith('ဆရာတော်')
  ) {
    return 'ကျား';
  }

  if (
    trimmed.startsWith('ဒေါ်') ||
    trimmed.startsWith('မ') ||
    trimmed.startsWith('ဆရာလေး')
  ) {
    return 'မ';
  }

  return 'ကျား';
}

window.exportYogiCSV = function () {
  if (!filteredYogiEntries || filteredYogiEntries.length === 0) {
    notifyYogi('ထုတ်ယူရန် ဒေတာ မရှိပါ', 'warning');
    return;
  }

  let csv = '\uFEFF';
  csv += 'စဉ်,စတင်ရက်စွဲ,စခန်းထွက်ရက်စွဲ,အမျိုးအစား,အမည်,အဘအမည်,မှတ်ပုံတင်,မွေးသက္ကရာဇ်,အသက်,ကျား/မ,ယောဂီဖုန်း,အိမ်ဖုန်း,နေရပ်လိပ်စာ,အခြေအနေ\n';

  const esc = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;

  filteredYogiEntries.forEach((row, idx) => {
    const nrcVal = row.nrc || row.full_nrc || '';
    const phoneVal = row.yogi_phone || row.phone || '';
    const catVal = row.yogi_type || row.category || '';
    const statusVal = isYogiActive(row) ? 'Active' : 'Inactive';

    csv += [
      (idx + 1),
      esc(row.start_date),
      esc(row.end_date),
      esc(catVal),
      esc(row.name),
      esc(row.father_name),
      esc(nrcVal),
      esc(row.dob),
      row.age || 0,
      esc(row.gender),
      esc(phoneVal),
      esc(row.home_phone),
      esc(row.address),
      esc(statusVal)
    ].join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${currentYogiTable}_List_${currentYogiStatus}_${getTodayYogiISO()}.csv`;
  link.click();
};
// === END OF yogi.js ===
