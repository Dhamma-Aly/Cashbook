// ===================================================================
// js/yogi.js - Frontend Logic for Yogi Management (12Yogi & 13Yogi)
// Features Flicker-Free Background Sync, 2-Way Active <-> Inactive Toggle,
// Dynamic Sequential Indexing (1, 2, 3...), Auto-Age, and Auto-Gender
// ===================================================================

let currentYogiSheet = '12Yogi';
let currentYogiStatus = 'Active';
let allYogiEntries = [];
let filteredYogiEntries = [];
let yogiCurrentPage = 1;
const yogiRowsPerPage = 15;

// -------------------------------------------------------------------
// 1. Core View Renderer
// -------------------------------------------------------------------
window.renderYogiView = async function(isSilent = false) {
  currentYogiSheet = window.currentYogiSheet || window.currentSheet || '12Yogi';

  if (!isSilent && typeof window.showLoading === 'function') {
    window.showLoading(true);
  }

  try {
    const response = await window.fetchYogiDataAPI(currentYogiSheet);
    if (response && response.success) {
      allYogiEntries = response.data || [];
      updateYogiKPIs(response.kpis);
    } else {
      allYogiEntries = [];
      updateYogiKPIs(null);
    }
  } catch (err) {
    console.error('Yogi Fetch Error:', err);
    allYogiEntries = [];
  } finally {
    if (!isSilent && typeof window.showLoading === 'function') {
      window.showLoading(false);
    }
  }

  applyYogiFilters();
};

// -------------------------------------------------------------------
// 2. Update Active KPI Cards
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
    if (activeBtn) activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-300 bg-[#1e293b] border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    if (inactiveBtn) inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  } else {
    if (inactiveBtn) inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-rose-300 bg-[#1e293b] border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    if (activeBtn) activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-400/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
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
    // Status Filter (Active / Inactive)
    const matchesStatus = (entry.status || 'Active') === currentYogiStatus;

    // Search Term Filter
    const matchesSearch = !searchTerm ||
      (entry.name || '').toLowerCase().includes(searchTerm) ||
      (entry.father_name || '').toLowerCase().includes(searchTerm) ||
      (entry.nrc || entry.full_nrc || '').toLowerCase().includes(searchTerm) ||
      (entry.phone || entry.yogi_phone || '').toLowerCase().includes(searchTerm) ||
      (entry.address || '').toLowerCase().includes(searchTerm) ||
      (entry.category || '').toLowerCase().includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  renderYogiTable();
}

// -------------------------------------------------------------------
// 5. Render 14-Column Table Data with Dynamic Sequential Indexing (1, 2, 3...)
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
          ${currentYogiStatus === 'Active' ? 'Active ယောဂီစာရင်း မရှိပါ' : 'Inactive ယောဂီစာရင်း မရှိပါ'}
        </td>
      </tr>
    `;
    updateYogiPaginationInfo(0, 0, 0);
    return;
  }

  const startIndex = (yogiCurrentPage - 1) * yogiRowsPerPage;
  const endIndex = Math.min(startIndex + yogiRowsPerPage, totalEntries);
  const pageEntries = filteredYogiEntries.slice(startIndex, endIndex);

  let html = '';
  pageEntries.forEach((entry, idx) => {
    const srNo = startIndex + idx + 1; // Dynamic Sequential Indexing (1, 2, 3...)
    const uid = entry.uniqueId || entry.id || '';
    const isCheckout = (entry.status === 'Inactive');
    const nrcVal = entry.full_nrc || entry.nrc || '-';
    const phoneVal = entry.phone || entry.yogi_phone || '-';

    html += `
      <tr class="hover:bg-amber-500/5 transition border-b border-amber-500/20 text-xs">
        <td class="text-center font-bold text-amber-400/80 py-3">${srNo}</td>
        <td class="font-mono text-slate-300">${entry.start_date || '-'}</td>
        <td class="font-mono ${entry.end_date ? 'text-rose-400 font-bold' : 'text-slate-500'}">${entry.end_date || '-'}</td>
        <td class="font-bold text-amber-300">${entry.category || '-'}</td>
        <td class="font-extrabold text-amber-100">${entry.name || '-'}</td>
        <td class="text-slate-300">${entry.father_name || '-'}</td>
        <td class="font-mono text-amber-200">${nrcVal}</td>
        <td class="font-mono text-slate-300">${entry.dob || '-'}</td>
        <td class="text-center font-bold text-amber-300">${entry.age || '-'}</td>
        <td class="text-center font-bold ${entry.gender === 'ကျား' ? 'text-sky-400' : 'text-rose-400'}">${entry.gender || '-'}</td>
        <td class="font-mono text-amber-200">${phoneVal}</td>
        <td class="font-mono text-slate-300">${entry.home_phone || '-'}</td>
        <td class="truncate max-w-[220px] text-slate-300" title="${entry.address || ''}">${entry.address || '-'}</td>
        <td class="text-center right-0 sticky bg-[#080d1a] z-10 px-2 py-1.5 border-l border-amber-500/20">
          <div class="flex items-center justify-center gap-1.5">
            <!-- Edit Button -->
            <button onclick="openEditYogiModal('${uid}')" class="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded transition cursor-pointer" title="ပြင်ဆင်မည်">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <!-- 🔄 2-Way Togglable Action Button (Active -> Checkout | Inactive -> Reactivate) -->
            ${!isCheckout ? `
              <button onclick="checkoutYogiPrompt('${uid}', '${entry.name}')" class="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition font-bold cursor-pointer" title="စခန်းထွက်ပေးမည် (Inactive သို့ ပို့မည်)">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
              </button>
            ` : `
              <button onclick="reactivateYogiPrompt('${uid}', '${entry.name}')" class="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded transition font-bold cursor-pointer" title="စခန်းတွင်း ပြန်လည်ဝင်မည် (Active သို့ ပြန်ပို့မည်)">
                <i class="fa-solid fa-arrow-right-to-bracket"></i>
              </button>
            `}

            <!-- Delete Button -->
            <button onclick="deleteYogiPrompt('${uid}')" class="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition cursor-pointer" title="ဖျက်မည်">
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
  const maxPage = Math.ceil(filteredYogiEntries.length / yogiRowsPerPage);
  if (yogiCurrentPage < maxPage) {
    yogiCurrentPage++;
    renderYogiTable();
  }
};

// -------------------------------------------------------------------
// 7. Modal Form Opener, Edits, and Event Listeners
// -------------------------------------------------------------------
window.openAddYogiModal = function() {
  const modal = document.getElementById('yogi-entry-modal');
  const form = document.getElementById('yogi-entry-form');
  if (form) form.reset();

  const uidInput = document.getElementById('yogi-uniqueId');
  if (uidInput) uidInput.value = '';

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အသစ် သွင်းယူရန်';

  // Set default start date to Today
  const startDateInput = document.getElementById('yogi-start-date');
  if (startDateInput) startDateInput.value = new Date().toISOString().split('T')[0];

  if (modal) modal.classList.remove('hidden');
};

window.openEditYogiModal = function(uid) {
  const entry = allYogiEntries.find(e => String(e.uniqueId || e.id) === String(uid));
  if (!entry) return;

  const modal = document.getElementById('yogi-entry-modal');
  if (!modal) return;

  const titleEl = document.getElementById('yogi-modal-title');
  if (titleEl) titleEl.textContent = 'ယောဂီ အချက်အလက် ပြင်ဆင်ရန်';

  document.getElementById('yogi-uniqueId').value = uid;
  document.getElementById('yogi-category').value = entry.category || 'လူပုဂ္ဂိုလ်';
  document.getElementById('yogi-start-date').value = entry.start_date || '';
  document.getElementById('yogi-name').value = entry.name || '';
  document.getElementById('yogi-father-name').value = entry.father_name || '';

  // Set 4-Part NRC
  document.getElementById('yogi-nrc-state').value = entry.nrc_state || '12';
  document.getElementById('yogi-nrc-township').value = entry.nrc_township || '';
  document.getElementById('yogi-nrc-type').value = entry.nrc_type || '(နိုင်)';
  document.getElementById('yogi-nrc-number').value = entry.nrc_number || '';

  document.getElementById('yogi-dob').value = entry.dob || '';
  document.getElementById('yogi-age').value = entry.age || '';
  document.getElementById('yogi-gender').value = entry.gender || 'ကျား';
  document.getElementById('yogi-phone').value = entry.phone || entry.yogi_phone || '';
  document.getElementById('yogi-home-phone').value = entry.home_phone || '';
  document.getElementById('yogi-address').value = entry.address || '';

  modal.classList.remove('hidden');
};

// Auto Age Calculation on DoB Change
window.onYogiDoBChange = function(dobString) {
  const age = calcAgeFromDoB(dobString);
  const ageInput = document.getElementById('yogi-age');
  if (ageInput) ageInput.value = age > 0 ? age : '';
};

// Auto Gender Selection on Name Input
window.onYogiNameChange = function(nameString) {
  const gender = detectGenderFromName(nameString);
  const genderSelect = document.getElementById('yogi-gender');
  if (genderSelect) genderSelect.value = gender;
};

// -------------------------------------------------------------------
// 8. Save Yogi Form Submission
// -------------------------------------------------------------------
window.saveYogiEntryForm = async function(event) {
  if (event && event.preventDefault) event.preventDefault();

  const uniqueId = document.getElementById('yogi-uniqueId').value;
  const sheet_type = window.currentYogiSheet || window.currentSheet || '12Yogi';

  const category = document.getElementById('yogi-category').value;
  const start_date = document.getElementById('yogi-start-date').value;
  const name = document.getElementById('yogi-name').value.trim();
  const father_name = document.getElementById('yogi-father-name').value.trim();

  // 4-Part NRC Assembly
  const nrc_state = document.getElementById('yogi-nrc-state').value;
  const nrc_township = document.getElementById('yogi-nrc-township').value.trim();
  const nrc_type = document.getElementById('yogi-nrc-type').value;
  const nrc_number = document.getElementById('yogi-nrc-number').value.trim();
  
  let full_nrc = '';
  if (nrc_township && nrc_number) {
    full_nrc = `${nrc_state}/${nrc_township}${nrc_type}${nrc_number}`;
  }

  const dob = document.getElementById('yogi-dob').value;
  const age = parseInt(document.getElementById('yogi-age').value) || calcAgeFromDoB(dob);
  const gender = document.getElementById('yogi-gender').value;
  const phone = document.getElementById('yogi-phone').value.trim();
  const home_phone = document.getElementById('yogi-home-phone').value.trim();
  const address = document.getElementById('yogi-address').value.trim();

  const isEdit = !!uniqueId;

  const payload = {
    uniqueId: uniqueId || `YOGI-${Date.now()}`,
    sheet_type,
    category,
    start_date,
    name,
    father_name,
    nrc_state,
    nrc_township,
    nrc_type,
    nrc_number,
    full_nrc,
    nrc: full_nrc,
    dob,
    age,
    gender,
    phone,
    yogi_phone: phone,
    home_phone,
    address,
    status: 'Active'
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
// 9. 🔄 2-Way Active <-> Inactive Action Workflows
// -------------------------------------------------------------------

// A. Checkout Yogi (Active -> Inactive)
window.checkoutYogiPrompt = async function(uniqueId, name) {
  const todayStr = new Date().toISOString().split('T')[0];
  const confirmCheckout = confirm(`ယောဂီ "${name}" အား ယနေ့ (${todayStr}) ရက်စွဲဖြင့် Inactive စာရင်း သို့ ပြောင်းလဲပါမည်လော။`);

  if (!confirmCheckout) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const response = await window.checkoutYogiAPI({ uniqueId, end_date: todayStr });
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

// B. Reactivate Yogi (Inactive -> Active)
window.reactivateYogiPrompt = async function(uniqueId, name) {
  const confirmReactivate = confirm(`ယောဂီ "${name}" အား Active (စခန်းတွင်း/အမြဲနေဆဲ) စာရင်းသို့ ပြန်လည်ပြောင်းလဲပါမည်လော။`);

  if (!confirmReactivate) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const response = await window.reactivateYogiAPI({ uniqueId });
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

// C. Delete Yogi
window.deleteYogiPrompt = async function(uniqueId) {
  if (!confirm('ဤယောဂီစာရင်းကို ပယ်ဖျက်ရန် သေချာပါသလား။')) return;

  if (typeof window.showLoading === 'function') window.showLoading(true);
  try {
    const response = await window.deleteYogiAPI(uniqueId);
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
// 10. Smart Helpers: Age Calculation & Auto-Gender Detection
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
// 11. Export Yogi Data to CSV
// -------------------------------------------------------------------
window.exportYogiCSV = function() {
  if (!filteredYogiEntries || filteredYogiEntries.length === 0) {
    alert('ထုတ်ယူရန် ဒေတာ မရှိပါ');
    return;
  }

  let csv = '\uFEFF'; // UTF-8 BOM
  csv += 'စဉ်,စတင်ရက်စွဲ,စခန်းထွက်ရက်စွဲ,အမျိုးအစား,အမည်,အဘအမည်,မှတ်ပုံတင်,မွေးသက္ကရာဇ်,အသက်,ကျား/မ,ယောဂီဖုန်း,အိမ်ဖုန်း,နေရပ်လိပ်စာ,အခြေအနေ\n';

  filteredYogiEntries.forEach((row, idx) => {
    const nrcVal = row.full_nrc || row.nrc || '';
    const phoneVal = row.phone || row.yogi_phone || '';
    const addrEsc = (row.address || '').replace(/"/g, '""');

    csv += `"${idx + 1}","${row.start_date || ''}","${row.end_date || ''}","${row.category || ''}","${row.name || ''}","${row.father_name || ''}","${nrcVal}","${row.dob || ''}","${row.age || ''}","${row.gender || ''}","${phoneVal}","${row.home_phone || ''}","${addrEsc}","${row.status || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${currentYogiSheet}_Yogi_List_${currentYogiStatus}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
