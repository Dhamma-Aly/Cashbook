// ===================================================================
// js/yogi.js - Yogi Management Controller (Permanent Yogi & Camp Yogi) 
// 100% Aligned with D1 Schema: end_date Status Tracking, Smart NRC & 0s Cache
// Features: Natural Typography, Clamped Tooltips & Polished Sticky Actions
// ===================================================================

const YOGI_CACHE_PREFIX = 'sasana_yogi_cache_';
const yogiRowsPerPage = 15;

let currentYogiTable = 'Permanent Yogi'; // D1 Standard: 'Permanent Yogi' or 'Camp Yogi'
let currentYogiStatus = 'Active';        // 'Active' or 'Inactive'
let allYogiEntries = [];
let filteredYogiEntries = [];
let yogiCurrentPage = 1;

function resolveYogiTable(nameOrKey) {
  const k = String(nameOrKey || '').trim();
  if (k === '13Yogi' || k === 'Camp Yogi' || k.includes('စခန်းဝင်')) return 'Camp Yogi';
  return 'Permanent Yogi';
}

// Helper: Smart NRC Splitter
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

// 💡 D1 Schema Helper: end_date မရှိပါက Active ဖြစ်သည်
function isYogiActive(entry) {
  if (entry.status) return entry.status === 'Active';
  return !entry.end_date || entry.end_date.trim() === '' || entry.end_date.trim() === '-';
}

// -------------------------------------------------------------------
// 1. Core View Renderer (Instant Cache-First Engine)
// -------------------------------------------------------------------
window.renderYogiView = async function(isSilent = false) {
  currentYogiTable = resolveYogiTable(window.currentYogiTable || window.currentSheet || 'Permanent Yogi');
  window.currentYogiTable = currentYogiTable;
  window.currentTable = currentYogiTable;

  const cacheKey = `${YOGI_CACHE_PREFIX}${currentYogiTable}`;

  // ၁။ Cache ရှိပါက ဝ စက္ကန့်ဖြင့် ချက်ချင်း အရင်ထုတ်ပြမည် (Loading မစောင့်ရပါ)
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

  // ၂။ ကက်ရှ်မရှိသေးလျှင် Loading ပြမည်
  if (!isSilent && allYogiEntries.length === 0 && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  // ၃။ နောက်ကွယ်မှ D1 Database အချက်အလက်အသစ်ကို အသံတိတ် ဆွဲယူပြီး Update လုပ်ခြင်း
  try {
    const sheetParam = (currentYogiTable === 'Camp Yogi') ? '13Yogi' : '12Yogi';
    const response = await window.fetchYogiDataAPI(sheetParam);

    if (response && response.success) {
      allYogiEntries = response.data || [];
      localStorage.setItem(cacheKey, JSON.stringify(response));
      updateYogiKPIs(response.kpis);
      applyYogiFilters();
    }
  } catch (err) {
    console.error('Yogi Fetch Error from D1:', err);
  } finally {
    if (!isSilent && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }
};

// -------------------------------------------------------------------
// 2. Update Active KPI Cards (4-Box Single Row Compatible)
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// 3. Status Tab Switcher (Active vs Inactive)
// -------------------------------------------------------------------
window.switchYogiStatusTab = function(status) {
  currentYogiStatus = status;
  yogiCurrentPage = 1;

  const activeBtn = document.getElementById('tab-yogi-active');
  const inactiveBtn = document.getElementById('tab-yogi-inactive');

  if (status === 'Active') {
    if (activeBtn) activeBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-amber-300 bg-[#1e293b] border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm';
    if (inactiveBtn) inactiveBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  } else {
    if (inactiveBtn) inactiveBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-rose-300 bg-[#1e293b] border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm';
    if (activeBtn) activeBtn.className = 'px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  }

  applyYogiFilters();
};

// -------------------------------------------------------------------
// 4. Live Search Filter
// -------------------------------------------------------------------
window.onYogiSearchInput = function() {
  yogiCurrentPage = 1;
  applyYogiFilters();
};

function applyYogiFilters() {
  const searchInput = document.getElementById('yogi-search-input');
  const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();

  filteredYogiEntries = allYogiEntries.filter(entry => {
    const active = isYogiActive(entry);
    const matchesStatus = (currentYogiStatus === 'Active') ? active : !active;

    const nrcText = entry.nrc || entry.full_nrc || '';
    const phoneText = entry.yogi_phone || entry.phone || '';
    const catText = entry.yogi_type || entry.category || '';

    const matchesSearch = !searchTerm ||
      (entry.name || '').toLowerCase().includes(searchTerm) ||
      (entry.father_name || '').toLowerCase().includes(searchTerm) ||
      nrcText.toLowerCase().includes(searchTerm) ||
      phoneText.toLowerCase().includes(searchTerm) ||
      (entry.address || '').toLowerCase().includes(searchTerm) ||
      catText.toLowerCase().includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  renderYogiTable();
}

// -------------------------------------------------------------------
// 5. Render 14-Column Table Data (D1 Schema Aligned)
// -------------------------------------------------------------------
function renderYogiTable() {
  const tbody = document.getElementById('yogi-table-body');
  if (!tbody) return;

  const totalEntries = filteredYogiEntries.length;
  if (totalEntries === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-8 text-amber-400/60 font-semibold">
          <i class="fa-solid fa-users-slash mr-2"></i>
          ${currentYogiStatus === 'Active' ? 'Active ယောဂီစာရင်း မရှိပါ' : 'Inactive (စခန်းထွက်ပြီး) ယောဂီစာရင်း မရှိပါ'}
        </td>
      </tr>
    `;
    updateYogiPaginationInfo(0, 0, 0);
    return;
  }

  const startIndex = (yogiCurrentPage - 1) * yogiRowsPerPage;
  const endIndex = Math.min(startIndex + yogiRowsPerPage, totalEntries);
  const pageEntries = filteredYogiEntries.slice(startIndex, endIndex);
  const canEdit = typeof window.canUserEdit === 'function' ? window.canUserEdit() : true;

  let html = '';
  pageEntries.forEach((entry, idx) => {
    const srNo = entry.no || (startIndex + idx + 1);
    const uid = entry.unique_id || entry.uniqueId || entry.id || '';
    const active = isYogiActive(entry);
    const nrcVal = entry.nrc || entry.full_nrc || '-';
    const phoneVal = entry.yogi_phone || entry.phone || '-';
    const categoryVal = entry.yogi_type || entry.category || '-';

    // 🌟 နေရပ်လိပ်စာအား နိုင်ငံတကာ စံနှုန်းအတိုင်း သဘာဝကျကျ ညှိနှိုင်းခြင်း
    const rawAddr = entry.address || '';
    const escapedAddr = rawAddr.replace(/"/g, '&quot;');
    const addrHtml = rawAddr
      ? `<div class="min-w-[180px] max-w-[320px] text-slate-300 text-xs leading-relaxed whitespace-normal line-clamp-2 hover:line-clamp-none transition-all cursor-default" title="${escapedAddr}">${rawAddr}</div>`
      : '<span class="text-slate-600 font-mono">-</span>';

    html += `
      <tr class="hover:bg-amber-500/5 transition border-b border-amber-500/20 text-xs">
        <td class="text-center font-bold text-amber-400/80 py-3 font-mono">${srNo}</td>
        <td class="font-mono text-slate-300 whitespace-nowrap px-2">${entry.start_date || '-'}</td>
        <td class="font-mono whitespace-nowrap px-2 ${entry.end_date ? 'text-rose-400 font-bold' : 'text-slate-500'}">${entry.end_date || '-'}</td>
        <td class="font-bold text-amber-300 whitespace-nowrap px-2">${categoryVal}</td>
        <td class="font-extrabold text-amber-100 whitespace-nowrap px-2">${entry.name || '-'}</td>
        <td class="text-slate-300 whitespace-nowrap px-2">${entry.father_name || '-'}</td>
        <td class="font-mono text-amber-200 whitespace-nowrap px-2">${nrcVal}</td>
        <td class="font-mono text-slate-300 whitespace-nowrap px-2">${entry.dob || '-'}</td>
        <td class="text-center font-bold text-amber-300 whitespace-nowrap px-2">${entry.age || '-'}</td>
        <td class="text-center font-bold whitespace-nowrap px-2 ${entry.gender === 'ကျား' ? 'text-sky-400' : 'text-rose-400'}">${entry.gender || '-'}</td>
        <td class="font-mono text-amber-200 whitespace-nowrap px-2">${phoneVal}</td>
        <td class="font-mono text-slate-300 whitespace-nowrap px-2">${entry.home_phone || '-'}</td>
        <td class="py-2.5 px-3 align-middle text-left">${addrHtml}</td>
        <td class="text-center right-0 sticky bg-[#080d1a] z-10 px-3 py-2 border-l border-amber-500/20 shadow-[-8px_0_12px_rgba(0,0,0,0.5)]">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditYogiModal('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded transition cursor-pointer"'} title="ပြင်ဆင်မည်">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            ${active ? `
              <button onclick="checkoutYogiPrompt('${uid}', '${entry.name}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition font-bold cursor-pointer"'} title="စခန်းထွက်ပေးမည်">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
              </button>
            ` : `
              <button onclick="reactivateYogiPrompt('${uid}', '${entry.name}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded transition font-bold cursor-pointer"'} title="စခန်းတွင်း ပြန်လည်ဝင်မည်">
                <i class="fa-solid fa-arrow-right-to-bracket"></i>
              </button>
            `}
            <button onclick="deleteYogiPrompt('${uid}')" ${!canEdit ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition cursor-pointer"'} title="ဖျက်မည်">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateYogiPaginationInfo(startIndex + 1, endIndex, totalEntries);
}

// -------------------------------------------------------------------
// 6. Pagination Controls
// -------------------------------------------------------------------
function updateYogiPaginationInfo(start, end, total) {
  const startEl = document.getElementById('yogi-page-start');
  const endEl = document.getElementById('yogi-page-end');
  const totalEl = document.getElementById('yogi-total-entries');

  if (startEl) startEl.textContent = start;
  if (endEl) endEl.textContent = end;
  if (totalEl) totalEl.textContent = total;

  const prevBtn = document.getElementById('btn-yogi-prev-page');
  const nextBtn = document.getElementById('btn-yogi-next-page');

  if (prevBtn) prevBtn.disabled = (yogiCurrentPage === 1);
  if (nextBtn) nextBtn.disabled = (end >= total);
}

window.prevYogiPage = function() {
  if (yogiCurrentPage > 1) {
    yogiCurrentPage--;
    renderYogiTable();
  }
};

window.nextYogiPage = function() {
  const maxPage = Math.max(1, Math.ceil(filteredYogiEntries.length / yogiRowsPerPage));
  if (yogiCurrentPage < maxPage) {
    yogiCurrentPage++;
    renderYogiTable();
  }
};

// -------------------------------------------------------------------
// 7. Modal Form Opener & Edit Handlers
// -------------------------------------------------------------------
window.openAddYogiModal = function() {
  const modal = document.getElementById('yogi-entry-modal');
  const form = document.getElementById('yogi-entry-form');
  if (form) form.reset();

  const uidInput = document.getElementById('yogi-uniqueId');
  if (uidInput) uidInput.value = '';

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အသစ် သွင်းယူရန်';

  const startDateInput = document.getElementById('yogi-start-date');
  if (startDateInput) startDateInput.value = new Date().toISOString().split('T')[0];

  const catSelect = document.getElementById('yogi-category');
  if (catSelect) {
    catSelect.value = 'လူပုဂ္ဂိုလ်';
    window.onYogiCategoryChange('လူပုဂ္ဂိုလ်');
  }

  if (modal) modal.classList.remove('hidden');
};

window.openEditYogiModal = function(uid) {
  const entry = allYogiEntries.find(e => String(e.unique_id || e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById('yogi-entry-modal');
  if (!modal) return;

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အချက်အလက် ပြင်ဆင်ရန်';

  document.getElementById('yogi-uniqueId').value = uid;
  document.getElementById('yogi-category').value = entry.yogi_type || entry.category || 'လူပုဂ္ဂိုလ်';
  document.getElementById('yogi-start-date').value = entry.start_date || '';
  document.getElementById('yogi-name').value = entry.name || '';
  document.getElementById('yogi-father-name').value = entry.father_name || '';

  // Smart NRC Splitter
  const parsedNrc = parseNrcString(entry.nrc || entry.full_nrc || '');
  if (document.getElementById('yogi-nrc-state')) document.getElementById('yogi-nrc-state').value = parsedNrc.state || '12';
  if (document.getElementById('yogi-nrc-township')) document.getElementById('yogi-nrc-township').value = parsedNrc.township || '';
  if (document.getElementById('yogi-nrc-type')) document.getElementById('yogi-nrc-type').value = parsedNrc.type || '(နိုင်)';
  if (document.getElementById('yogi-nrc-number')) document.getElementById('yogi-nrc-number').value = parsedNrc.number || '';

  document.getElementById('yogi-dob').value = entry.dob || '';
  document.getElementById('yogi-age').value = entry.age || '';
  document.getElementById('yogi-gender').value = entry.gender || 'ကျား';
  document.getElementById('yogi-phone').value = entry.yogi_phone || entry.phone || '';
  document.getElementById('yogi-home-phone').value = entry.home_phone || '';
  document.getElementById('yogi-address').value = entry.address || '';

  modal.classList.remove('hidden');
};

// Category / Gender Smart Detection
window.onYogiCategoryChange = function(category) {
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

window.onYogiDoBChange = function(dobString) {
  const age = calcAgeFromDoB(dobString);
  const ageInput = document.getElementById('yogi-age');
  if (ageInput) ageInput.value = age > 0 ? age : '';
};

window.onYogiNameChange = function(nameString) {
  const catVal = document.getElementById('yogi-category') ? document.getElementById('yogi-category').value : '';
  
  if (catVal === 'ရဟန်း' || catVal === 'ကိုရင်') {
    document.getElementById('yogi-gender').value = 'ကျား';
    return;
  }
  if (catVal === 'သီလရှင်') {
    document.getElementById('yogi-gender').value = 'မ';
    return;
  }

  const gender = detectGenderFromName(nameString);
  const genderSelect = document.getElementById('yogi-gender');
  if (genderSelect) genderSelect.value = gender;
};

// -------------------------------------------------------------------
// 8. Save Yogi Form Submission (D1 Schema Aligned)
// -------------------------------------------------------------------
window.saveYogiEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const unique_id = document.getElementById('yogi-uniqueId').value;
  const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);

  const category = document.getElementById('yogi-category').value;
  const start_date = document.getElementById('yogi-start-date').value;
  const name = document.getElementById('yogi-name').value.trim();
  const father_name = document.getElementById('yogi-father-name').value.trim();

  // NRC Assembly
  const nrc_state = document.getElementById('yogi-nrc-state')?.value || '12';
  const nrc_township = (document.getElementById('yogi-nrc-township')?.value || '').trim();
  const nrc_type = document.getElementById('yogi-nrc-type')?.value || '(နိုင်)';
  const nrc_number = (document.getElementById('yogi-nrc-number')?.value || '').trim();
  
  let full_nrc = '';
  if (nrc_township && nrc_number) {
    full_nrc = `${nrc_state}/${nrc_township}${nrc_type}${nrc_number}`;
  }

  const dob = document.getElementById('yogi-dob').value;
  const age = parseInt(document.getElementById('yogi-age').value) || calcAgeFromDoB(dob);
  const gender = document.getElementById('yogi-gender').value;
  const phone = document.getElementById('yogi-phone').value.trim();
  const home_phone = (document.getElementById('yogi-home-phone')?.value || '').trim();
  const address = (document.getElementById('yogi-address')?.value || '').trim();

  const isEdit = !!unique_id;

  // 🌟 D1 Schema စံနှုန်းအတိုင်း ပေးပို့ခြင်း
  const payload = {
    unique_id: unique_id || `YOGI-${crypto.randomUUID()}`,
    sheet_type: currentTable,
    book_name: currentTable,
    yogi_type: category,
    start_date,
    end_date: '',
    name,
    father_name,
    nrc: full_nrc,
    dob,
    age,
    gender,
    yogi_phone: phone,
    home_phone,
    address,
    uniqueId: unique_id,
    category,
    phone,
    full_nrc
  };

  if (typeof window.showLoading === 'function') window.showLoading(true);

  try {
    const response = await window.saveYogiAPI(payload, isEdit);
    if (response && response.success) {
      if (typeof window.closeYogiModal === 'function') window.closeYogiModal();
      await window.renderYogiView(false);
    } else {
      alert('ယောဂီစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Save Yogi Error:', err);
    alert('ယောဂီစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

// -------------------------------------------------------------------
// 9. Workflows (Checkout, Reactivate, Delete)
// -------------------------------------------------------------------
window.checkoutYogiPrompt = async function(uniqueId, name) {
  const todayStr = new Date().toISOString().split('T')[0];
  const confirmCheckout = confirm(`ယောဂီ "${name}" အား ယနေ့ (${todayStr}) ရက်စွဲဖြင့် စခန်းထွက် (Inactive) စာရင်းသို့ ပြောင်းလဲပါမည်လော။`);

  if (!confirmCheckout) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.checkoutYogiAPI({ 
      unique_id: uniqueId, 
      uniqueId: uniqueId, 
      end_date: todayStr,
      sheet_type: currentTable 
    });

    if (response && response.success) {
      await window.renderYogiView(false);
    } else {
      alert('စခန်းထွက် ပြုလုပ်ရာတွင် အမှားရှိပါသည်: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Checkout Error:', err);
    alert('စခန်းထွက် ပြုလုပ်ရာတွင် အမှားရှိပါသည်');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.reactivateYogiPrompt = async function(uniqueId, name) {
  const confirmReactivate = confirm(`ယောဂီ "${name}" အား စခန်းတွင်း Active စာရင်းသို့ ပြန်လည်ပြောင်းလဲပါမည်လော။`);

  if (!confirmReactivate) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.reactivateYogiAPI({ 
      unique_id: uniqueId, 
      uniqueId: uniqueId, 
      sheet_type: currentTable 
    });

    if (response && response.success) {
      await window.renderYogiView(false);
    } else {
      alert('Active စာရင်းသို့ ပြန်ပြောင်းရာတွင် အမှားရှိပါသည်: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Reactivate Error:', err);
    alert('Active စာရင်းသို့ ပြန်ပြောင်းရာတွင် အမှားရှိပါသည်');
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

window.deleteYogiPrompt = async function(uniqueId) {
  if (!confirm('ဤယောဂီစာရင်းကို ပယ်ဖျက်ရန် သေချာပါသလား။')) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const currentTable = resolveYogiTable(window.currentYogiTable || window.currentSheet);
    const response = await window.deleteYogiAPI(uniqueId, currentTable);
    if (response && response.success) {
      await window.renderYogiView(false);
    } else {
      alert('ဖျက်ရာတွင် အမှားရှိပါသည်: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Delete Yogi Error:', err);
  } finally {
    if (typeof window.showLoading === 'function') window.showLoading(false);
  }
};

// -------------------------------------------------------------------
// 10. Smart Helpers: Age & Gender
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// 11. Export Yogi Data to CSV (D1 Schema Aligned)
// -------------------------------------------------------------------
window.exportYogiCSV = function() {
  if (!filteredYogiEntries || filteredYogiEntries.length === 0) {
    alert('ထုတ်ယူရန် ဒေတာ မရှိပါ');
    return;
  }

  let csv = '\uFEFF';
  csv += 'စဉ်,စတင်ရက်စွဲ,စခန်းထွက်ရက်စွဲ,အမျိုးအစား,အမည်,အဘအမည်,မှတ်ပုံတင်,မွေးသက္ကရာဇ်,အသက်,ကျား/မ,ယောဂီဖုန်း,အိမ်ဖုန်း,နေရပ်လိပ်စာ,အခြေအနေ\n';

  filteredYogiEntries.forEach((row, idx) => {
    const nrcVal = row.nrc || row.full_nrc || '';
    const phoneVal = row.yogi_phone || row.phone || '';
    const catVal = row.yogi_type || row.category || '';
    const addrEsc = (row.address || '').replace(/"/g, '""');
    const statusVal = isYogiActive(row) ? 'Active' : 'Inactive';

    csv += `"${row.no || (idx + 1)}","${row.start_date || ''}","${row.end_date || ''}","${catVal}","${row.name || ''}","${row.father_name || ''}","${nrcVal}","${row.dob || ''}","${row.age || ''}","${row.gender || ''}","${phoneVal}","${row.home_phone || ''}","${addrEsc}","${statusVal}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentYogiTable}_List_${currentYogiStatus}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
