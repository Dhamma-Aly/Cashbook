// ===================================================================
// js/yogi.js - Frontend Logic for Yogi Management (12Yogi & 13Yogi)
// Features Flicker-Free Silent Background Sync, DoB Auto-Age,
// Name Prefix Auto-Gender, and Post/Checkout (Active -> Inactive)
// ===================================================================

let currentYogiSheet = '12Yogi';
let currentYogiStatus = 'Active';
let allYogiEntries = [];
let filteredYogiEntries = [];
let yogiCurrentPage = 1;
const yogiRowsPerPage = 15;

// 1. Core View Renderer (Supports Silent Background Refresh to Prevent Flickering)
async function renderYogiView(isSilent = false) {
  if (!isSilent && typeof showLoading === 'function') {
    showLoading(true);
  }

  try {
    const response = await fetchYogiDataAPI(currentYogiSheet);
    if (response && response.success) {
      allYogiEntries = response.data || [];
      updateYogiKPIs(response.kpis);
    } else {
      allYogiEntries = [];
    }
  } catch (err) {
    console.error('Yogi Fetch Error:', err);
    allYogiEntries = [];
  } finally {
    if (!isSilent && typeof showLoading === 'function') {
      showLoading(false);
    }
  }

  applyYogiFilters();
}

// 2. Update Active KPI Cards (Only active count displayed)
function updateYogiKPIs(kpis) {
  if (!kpis) return;
  const setElem = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val || 0).toLocaleString();
  };

  setElem('kpi-yogi-monks', kpis.totalMonks);
  setElem('kpi-yogi-nuns', kpis.totalNuns);
  setElem('kpi-yogi-males', kpis.totalMales);
  setElem('kpi-yogi-females', kpis.totalFemales);
  setElem('kpi-yogi-total', kpis.totalActiveYogis);
}

// 3. Status Tab Switcher (Active vs Inactive)
function switchYogiStatusTab(status) {
  currentYogiStatus = status;
  yogiCurrentPage = 1;

  const activeBtn = document.getElementById('tab-yogi-active');
  const inactiveBtn = document.getElementById('tab-yogi-inactive');

  if (status === 'Active') {
    if (activeBtn) activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-300 bg-[#211912] border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    if (inactiveBtn) inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-500/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  } else {
    if (inactiveBtn) inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-rose-300 bg-[#211912] border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    if (activeBtn) activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-500/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  }

  applyYogiFilters();
}

// 4. Live Search Filter
function onYogiSearchInput() {
  yogiCurrentPage = 1;
  applyYogiFilters();
}

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
      (entry.nrc || '').toLowerCase().includes(searchTerm) ||
      (entry.yogi_phone || '').toLowerCase().includes(searchTerm) ||
      (entry.address || '').toLowerCase().includes(searchTerm) ||
      (entry.category || '').toLowerCase().includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  renderYogiTable();
}

// 5. Render 14-Column Table Data with Dynamic Sr Re-indexing
function renderYogiTable() {
  const tbody = document.getElementById('yogi-table-body');
  if (!tbody) return;

  const totalEntries = filteredYogiEntries.length;
  if (totalEntries === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-8 text-amber-500/60 font-semibold">
          ${currentYogiStatus === 'Active' ? 'စခန်းတွင်း ယောဂီစာရင်း မရှိပါ' : 'စခန်းထွက်ပြီးသူ ယောဂီစာရင်း မရှိပါ'}
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
    const srNo = startIndex + idx + 1; // Dynamic Sequential Indexing
    const isCheckout = (entry.status === 'Inactive');

    html += `
      <tr class="hover:bg-amber-500/5 transition border-b border-amber-900/20 text-xs">
        <td class="text-center font-bold text-amber-400/80">${srNo}</td>
        <td class="font-mono text-amber-200">${entry.start_date || '-'}</td>
        <td class="font-mono ${entry.end_date ? 'text-rose-400 font-bold' : 'text-amber-500/40'}">${entry.end_date || '-'}</td>
        <td class="font-bold text-amber-300">${entry.category || '-'}</td>
        <td class="font-extrabold text-amber-100">${entry.name || '-'}</td>
        <td class="text-amber-200/80">${entry.father_name || '-'}</td>
        <td class="font-mono text-amber-200">${entry.nrc || '-'}</td>
        <td class="font-mono text-amber-200/80">${entry.dob || '-'}</td>
        <td class="text-center font-bold text-amber-300">${entry.age || '-'}</td>
        <td class="text-center font-bold ${entry.gender === 'ကျား' ? 'text-sky-400' : 'text-rose-400'}">${entry.gender || '-'}</td>
        <td class="font-mono text-amber-200">${entry.yogi_phone || '-'}</td>
        <td class="font-mono text-amber-200/80">${entry.home_phone || '-'}</td>
        <td class="truncate max-w-[220px] text-amber-200/80" title="${entry.address || ''}">${entry.address || '-'}</td>
        <td class="text-center right-0 sticky bg-[#14100c] z-10 px-2 py-1.5 border-l border-amber-900/30">
          <div class="flex items-center justify-center gap-1.5">
            <!-- Edit Button -->
            <button onclick="openEditYogiModal('${entry.uniqueId}')" class="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded transition cursor-pointer" title="ပြင်ဆင်မည်">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <!-- Post/Checkout Button -->
            ${!isCheckout ? `
              <button onclick="checkoutYogiPrompt('${entry.uniqueId}', '${entry.name}')" class="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded transition font-bold cursor-pointer" title="စခန်းထွက်ပေးမည် (Post/Checkout)">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
              </button>
            ` : `
              <span class="px-1.5 py-0.5 text-[10px] bg-rose-950/40 border border-rose-500/30 text-rose-400 rounded font-bold">ထွက်ပြီး</span>
            `}

            <!-- Delete Button -->
            <button onclick="deleteYogiPrompt('${entry.uniqueId}')" class="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition cursor-pointer" title="ဖျက်မည်">
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

// 6. Pagination Controllers
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

function prevYogiPage() {
  if (yogiCurrentPage > 1) {
    yogiCurrentPage--;
    renderYogiTable();
  }
}

function nextYogiPage() {
  const maxPage = Math.ceil(filteredYogiEntries.length / yogiRowsPerPage);
  if (yogiCurrentPage < maxPage) {
    yogiCurrentPage++;
    renderYogiTable();
  }
}

// 7. Post (Checkout) Action Workflow
async function checkoutYogiPrompt(uniqueId, name) {
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const confirmCheckout = confirm(`ယောဂီ "${name}" အား ယနေ့ (${todayStr}) ရက်စွဲဖြင့် စခန်းထွက်စာရင်း (Inactive) သို့ ပြောင်းလဲပါမည်လော။`);

  if (!confirmCheckout) return;

  if (typeof showLoading === 'function') showLoading(true);
  try {
    const response = await checkoutYogiAPI({ uniqueId, end_date: todayStr });
    if (response && response.success) {
      alert('စခန်းထွက်စာရင်း အောင်မြင်စွာ ပြုလုပ်ပြီးပါပြီ။');
      renderYogiView(false); // Reload and refresh active KPIs
    } else {
      alert('စခန်းထွက်ရာတွင် အမှားရှိပါသည်: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Checkout Error:', err);
    alert('စခန်းထွက်ရာတွင် အမှားရှိပါသည်');
  } finally {
    if (typeof showLoading === 'function') showLoading(false);
  }
}

// 8. Delete Action Workflow
async function deleteYogiPrompt(uniqueId) {
  if (!confirm('ဤယောဂီစာရင်းကို ပယ်ဖျက်ရန် သေချာပါသလား။')) return;

  if (typeof showLoading === 'function') showLoading(true);
  try {
    const response = await deleteYogiAPI(uniqueId);
    if (response && response.success) {
      renderYogiView(false);
    } else {
      alert('ဖျက်ရာတွင် အမှားရှိပါသည်: ' + (response ? response.error : ''));
    }
  } catch (err) {
    console.error('Delete Yogi Error:', err);
  } finally {
    if (typeof showLoading === 'function') showLoading(false);
  }
}

// 9. Smart Helpers: DoB -> Age Calculation
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

// 10. Smart Helpers: Name Prefix -> Auto Gender Detection
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

// 11. Export Yogi Data to CSV
function exportYogiCSV() {
  if (!filteredYogiEntries || filteredYogiEntries.length === 0) {
    alert('ထုတ်ယူရန် ဒေတာ မရှိပါ');
    return;
  }

  let csv = '\uFEFF'; // UTF-8 BOM
  csv += 'စဉ်,စတင်ရက်စွဲ,စခန်းထွက်ရက်စွဲ,အမျိုးအစား,အမည်,အဘအမည်,မှတ်ပုံတင်,မွေးသက္ကရာဇ်,အသက်,ကျား/မ,ယောဂီဖုန်း,အိမ်ဖုန်း,နေရပ်လိပ်စာ,အခြေအနေ\n';

  filteredYogiEntries.forEach((row, idx) => {
    csv += `"${idx + 1}","${row.start_date || ''}","${row.end_date || ''}","${row.category || ''}","${row.name || ''}","${row.father_name || ''}","${row.nrc || ''}","${row.dob || ''}","${row.age || ''}","${row.gender || ''}","${row.yogi_phone || ''}","${row.home_phone || ''}","${(row.address || '').replace(/"/g, '""')}","${row.status || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${currentYogiSheet}_Yogi_List_${currentYogiStatus}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}
