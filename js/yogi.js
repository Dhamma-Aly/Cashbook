// ===================================================================
// js/yogi.js - Frontend Logic for Yogi Management (12Yogi & 13Yogi)
// Handles Rendering, Filtering, Pagination, Auto DoB/Gender Logics,
// and Post/Checkout (Status Active -> Inactive transition)
// ===================================================================

let currentYogiSheet = '12Yogi';
let currentYogiStatus = 'Active';
let allYogiEntries = [];
let filteredYogiEntries = [];
let yogiCurrentPage = 1;
const yogiRowsPerPage = 15;

// 1. Core View Renderer
async function renderYogiView() {
  showLoading(true);
  try {
    const response = await fetchYogiDataAPI(currentYogiSheet);
    if (response.success) {
      allYogiEntries = response.data || [];
      updateYogiKPIs(response.kpis);
    } else {
      allYogiEntries = [];
      alert('ဒေတာဆွဲယူရာတွင် အမှားအယွင်းရှိပါသည်: ' + (response.error || ''));
    }
  } catch (err) {
    console.error('Yogi Fetch Error:', err);
    allYogiEntries = [];
  } finally {
    showLoading(false);
  }

  applyYogiFilters();
}

// 2. Update KPI Cards (Active counts returned from API)
function updateYogiKPIs(kpis) {
  if (!kpis) return;
  document.getElementById('kpi-yogi-monks').textContent = (kpis.totalMonks || 0).toLocaleString();
  document.getElementById('kpi-yogi-nuns').textContent = (kpis.totalNuns || 0).toLocaleString();
  document.getElementById('kpi-yogi-males').textContent = (kpis.totalMales || 0).toLocaleString();
  document.getElementById('kpi-yogi-females').textContent = (kpis.totalFemales || 0).toLocaleString();
  document.getElementById('kpi-yogi-total').textContent = (kpis.totalActiveYogis || 0).toLocaleString();
}

// 3. Status Tab Switcher (Active vs Inactive)
function switchYogiStatusTab(status) {
  currentYogiStatus = status;
  yogiCurrentPage = 1;

  const activeBtn = document.getElementById('tab-yogi-active');
  const inactiveBtn = document.getElementById('tab-yogi-inactive');

  if (status === 'Active') {
    activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-300 bg-[#211912] border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-500/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  } else {
    inactiveBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-rose-300 bg-[#211912] border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer';
    activeBtn.className = 'px-3.5 py-1.5 rounded-lg font-bold text-amber-500/60 hover:text-amber-200 transition-all flex items-center gap-1.5 cursor-pointer';
  }

  applyYogiFilters();
}

// 4. Live Search Filter
function onYogiSearchInput() {
  yogiCurrentPage = 1;
  applyYogiFilters();
}

function applyYogiFilters() {
  const searchTerm = (document.getElementById('yogi-search-input')?.value || '').toLowerCase().trim();

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

// 5. Render Table Data with Dynamic Sr Re-indexing (1, 2, 3...)
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
    const srNo = startIndex + idx + 1; // Dynamic Sequential Index
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

            <!-- Post/Checkout Button (Only for Active) -->
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

// 6. Pagination Functions
function updateYogiPaginationInfo(start, end, total) {
  document.getElementById('yogi-page-start').textContent = start;
  document.getElementById('yogi-page-end').textContent = end;
  document.getElementById('yogi-total-entries').textContent = total;

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

  showLoading(true);
  try {
    const response = await checkoutYogiAPI({ uniqueId, end_date: todayStr });
    if (response.success) {
      alert('စခန်းထွက်စာရင်း အောင်မြင်စွာ ပြုလုပ်ပြီးပါပြီ။');
      renderYogiView(); // Reloads data, updates KPIs and re-indexes Sr numbers
    } else {
      alert('စခန်းထွက်ရာတွင် အမှားရှိပါသည်: ' + response.error);
    }
  } catch (err) {
    console.error('Checkout Error:', err);
    alert('စခန်းထွက်ရာတွင် အမှားရှိပါသည်');
  } finally {
    showLoading(false);
  }
}

// 8. Delete Action Workflow
async function deleteYogiPrompt(uniqueId) {
  if (!confirm('ဤယောဂီစာရင်းကို ပယ်ဖျက်ရန် သေချာပါသလား။')) return;

  showLoading(true);
  try {
    const response = await deleteYogiAPI(uniqueId);
    if (response.success) {
      renderYogiView();
    } else {
      alert('ဖျက်ရာတွင် အမှားရှိပါသည်: ' + response.error);
    }
  } catch (err) {
    console.error('Delete Yogi Error:', err);
  } finally {
    showLoading(false);
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

  return 'ကျား'; // Default fallback
}

// 11. Expo
