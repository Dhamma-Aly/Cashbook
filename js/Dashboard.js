// ===================================================================
// js/Dashboard.js - Home Dashboard View Renderer & Tab Controller
// Renders Fund Summary Breakdown & Yogi Summary Matrix
// ===================================================================

/**
 * 💡 Sub-Tab Switch Controller (ရန်ပုံငွေ အကျဉ်းချုပ် <-> ယောဂီ ပေါင်းချုပ်)
 */
window.switchDashboardTab = function(tabName) {
  const fundSection = document.getElementById("dash-fund-section");
  const yogiSection = document.getElementById("dash-yogi-section");
  const fundTabBtn = document.getElementById("tab-dash-fund");
  const yogiTabBtn = document.getElementById("tab-dash-yogi");
  const tabBadge = document.getElementById("dash-tab-badge");

  const activeClasses = ["text-amber-300", "bg-[#1e293b]", "border-amber-500/30", "font-black", "shadow-sm"];
  const inactiveClasses = ["text-amber-400/60", "font-bold", "hover:text-amber-200"];

  if (tabName === 'fund') {
    // Show Fund Section
    if (fundSection) fundSection.classList.remove("hidden");
    if (yogiSection) yogiSection.classList.add("hidden");

    // Update Tab Buttons UI
    if (fundTabBtn) {
      fundTabBtn.classList.add(...activeClasses);
      fundTabBtn.classList.remove(...inactiveClasses);
    }
    if (yogiTabBtn) {
      yogiTabBtn.classList.remove(...activeClasses);
      yogiTabBtn.classList.add(...inactiveClasses);
    }

    // Update Badge
    if (tabBadge) tabBadge.textContent = "(ပမာဏ - MMK)";

  } else if (tabName === 'yogi') {
    // Show Yogi Section
    if (fundSection) fundSection.classList.add("hidden");
    if (yogiSection) yogiSection.classList.remove("hidden");

    // Update Tab Buttons UI
    if (yogiTabBtn) {
      yogiTabBtn.classList.add(...activeClasses);
      yogiTabBtn.classList.remove(...inactiveClasses);
    }
    if (fundTabBtn) {
      fundTabBtn.classList.remove(...activeClasses);
      fundTabBtn.classList.add(...inactiveClasses);
    }

    // Update Badge
    if (tabBadge) tabBadge.textContent = "စခန်းတွင်း Active ယောဂီများ";
  }
};

/**
 * 📊 Main Dashboard View Render Function
 */
window.renderDashboardView = async function() {
  const container = document.getElementById("view-container");

  // 1. Template Inject ပြုလုပ်ခြင်း
  if (container && !document.getElementById("home-bank-table")) {
    try {
      const fetchFn = window.fetchTemplate || (async (p) => { 
        const r = await fetch(p); 
        return await r.text(); 
      });
      container.innerHTML = await fetchFn("view/Dashboard.html");
    } catch (e) {
      console.warn("Could not fetch view/Dashboard.html:", e);
    }
  }

  const ALL_KNOWN_SHEETS = ['1CB', '2CB', '3CB', '4GB', '5FB', '6HB', '7PB', '8EB', '9MB', '10GB'];
  const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

  // Table & KPI Renderer
  const renderHomeData = (raw) => {
    const bankTableElem = document.getElementById("home-bank-table");
    const yogiTableElem = document.getElementById("home-yogi-table");

    // Format safe data
    const data = (raw && raw.data) ? raw.data : (raw || {});
    const kpis = data.kpis || { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 };
    const fundSummary = data.fundSummary || {};
    const yogiSummary = data.yogiSummary || {};

    // ---------------------------------------------------------------
    // 1. TOP KPIS
    // ---------------------------------------------------------------
    const setKpi = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${Number(val || 0).toLocaleString()} MMK`;
    };
    setKpi("kpi-home-fund", kpis.totalFund);
    setKpi("kpi-home-bank", kpis.totalBank);
    setKpi("kpi-home-cash", kpis.totalCash);
    
    const countEl = document.getElementById("kpi-home-count");
    if (countEl) countEl.textContent = Number(kpis.totalCount || 0).toLocaleString();

    // ---------------------------------------------------------------
    // 2. FUND SUMMARY TABLE (ရိပ်သာ ရန်ပုံငွေစာရင်း အကျဉ်းချုပ်)
    // ---------------------------------------------------------------
    if (bankTableElem) {
      const titles = (window.CONFIG && window.CONFIG.SHEET_TITLES) || {
        '1CB': 'ပင်မ ရန်ပုံငွေစာအုပ် (1CB)',
        '2CB': 'အထွေထွေ အလှူငွေစာအုပ် (2CB)',
        '3CB': 'အဆောက်အဦ ရန်ပုံငွေစာအုပ် (3CB)',
        '4GB': 'ဆွမ်း ရန်ပုံငွေစာအုပ် (4GB)',
        '5FB': 'ဆေး ရန်ပုံငွေစာအုပ် (5FB)',
        '6HB': 'ပညာဒါန ရန်ပုံငွေ (6HB)',
        '7PB': 'သာသနာပြု ရန်ပုံငွေ (7PB)',
        '8EB': 'မီး ရန်ပုံငွေစာအုပ် (8EB)',
        '9MB': 'ရေ ရန်ပုံငွေစာအုပ် (9MB)',
        '10GB': 'အခြား ရန်ပုံငွေ (10GB)'
      };

      let fundHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[750px] text-xs">
          <thead>
            <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4">စာအုပ်အမည်</th>
              <th class="text-right w-36 py-3.5 px-4 text-sky-400">ဘဏ်လက်ကျန်</th>
              <th class="text-right w-36 py-3.5 px-4 text-emerald-400">User 1 လက်ကျန်</th>
              <th class="text-right w-36 py-3.5 px-4 text-emerald-400">User 2 လက်ကျန်</th>
              <th class="text-right w-36 py-3.5 px-4 text-emerald-400">User 3 လက်ကျန်</th>
              <th class="text-right w-40 py-3.5 px-4 text-amber-300 font-black bg-amber-500/10">လက်ကျန် ပေါင်း</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amber-500/10">`;

      let sumBank = 0, sumU1 = 0, sumU2 = 0, sumU3 = 0, sumTotal = 0;

      ALL_KNOWN_SHEETS.forEach((sheet, idx) => {
        const item = fundSummary[sheet] || { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
        const name = titles[sheet] || sheet;

        const bb = Number(item.bankBalance || 0);
        const u1 = Number(item.user1Balance || 0);
        const u2 = Number(item.user2Balance || 0);
        const u3 = Number(item.user3Balance || 0);
        const tot = Number(item.totalBalance || (bb + u1 + u2 + u3));

        sumBank += bb;
        sumU1 += u1;
        sumU2 += u2;
        sumU3 += u3;
        sumTotal += tot;

        const fmt = (v) => v !== 0 ? v.toLocaleString() : '-';

        fundHtml += `
        <tr class="hover:bg-amber-500/5 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-3 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-200 py-3 px-4">${name}</td>
          <td class="text-right font-mono text-sky-400 font-bold py-3 px-4">${fmt(bb)}</td>
          <td class="text-right font-mono text-slate-300 py-3 px-4">${fmt(u1)}</td>
          <td class="text-right font-mono text-slate-300 py-3 px-4">${fmt(u2)}</td>
          <td class="text-right font-mono text-slate-300 py-3 px-4">${fmt(u3)}</td>
          <td class="text-right font-mono font-black text-amber-300 py-3 px-4 bg-amber-500/5">${tot.toLocaleString()}</td>
        </tr>`;
      });

      // Total Row
      fundHtml += `
        <tr class="bg-[#080d1a] border-t-2 border-amber-500/40 font-extrabold text-amber-300">
          <td class="text-center py-3.5 px-3 font-mono">-</td>
          <td class="py-3.5 px-4 text-amber-300 font-black">စုစုပေါင်း</td>
          <td class="text-right font-mono text-sky-300 font-black py-3.5 px-4">${sumBank.toLocaleString()}</td>
          <td class="text-right font-mono text-emerald-300 font-black py-3.5 px-4">${sumU1.toLocaleString()}</td>
          <td class="text-right font-mono text-emerald-300 font-black py-3.5 px-4">${sumU2.toLocaleString()}</td>
          <td class="text-right font-mono text-emerald-300 font-black py-3.5 px-4">${sumU3.toLocaleString()}</td>
          <td class="text-right font-mono text-amber-300 font-black py-3.5 px-4 bg-amber-500/15">${sumTotal.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      bankTableElem.innerHTML = fundHtml;
    }

    // ---------------------------------------------------------------
    // 3. YOGI SUMMARY MATRIX TABLE (ယောဂီပေါင်းချုပ်စာရင်း)
    // ---------------------------------------------------------------
    if (yogiTableElem) {
      const residentData = yogiSummary.resident || {};
      const retreatData = yogiSummary.retreat || {};

      let yogiHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[650px] text-xs">
          <!-- Resident Yogi Section -->
          <thead>
            <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4 text-amber-200">အမြဲနေယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4 text-sky-400">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4 text-rose-400">မ</th>
              <th class="text-center w-32 py-3.5 px-4 text-amber-300 bg-amber-500/10 font-black">ပေါင်း</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amber-500/10">`;

      let resMale = 0, resFemale = 0, resTotal = 0;

      YOGI_CATS.forEach((cat, idx) => {
        const item = residentData[cat] || { male: 0, female: 0, total: 0 };
        const m = Number(item.male || 0);
        const f = Number(item.female || 0);
        const t = Number(item.total || (m + f));

        resMale += m;
        resFemale += f;
        resTotal += t;

        const fmt = (v) => v !== 0 ? v.toLocaleString() : '-';

        yogiHtml += `
        <tr class="hover:bg-amber-500/5 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-2.5 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-200 py-2.5 px-4">${cat}</td>
          <td class="text-center font-mono text-sky-300 font-bold py-2.5 px-4">${fmt(m)}</td>
          <td class="text-center font-mono text-rose-300 font-bold py-2.5 px-4">${fmt(f)}</td>
          <td class="text-center font-mono font-extrabold text-amber-300 py-2.5 px-4 bg-amber-500/5">${fmt(t)}</td>
        </tr>`;
      });

      // Resident Subtotal Row
      yogiHtml += `
        <tr class="bg-[#080d1a] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (အမြဲနေ)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${resMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${resFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15">${resTotal.toLocaleString()}</td>
        </tr>`;

      // Retreat Yogi Section
      yogiHtml += `
          <thead>
            <tr class="bg-[#080d1a] border-t-2 border-b border-amber-500/40 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4 text-amber-200">စခန်းဝင်ယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4 text-sky-400">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4 text-rose-400">မ</th>
              <th class="text-center w-32 py-3.5 px-4 text-amber-300 bg-amber-500/10 font-black">ပေါင်း</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amber-500/10">`;

      let retMale = 0, retFemale = 0, retTotal = 0;

      YOGI_CATS.forEach((cat, idx) => {
        const item = retreatData[cat] || { male: 0, female: 0, total: 0 };
        const m = Number(item.male || 0);
        const f = Number(item.female || 0);
        const t = Number(item.total || (m + f));

        retMale += m;
        retFemale += f;
        retTotal += t;

        const fmt = (v) => v !== 0 ? v.toLocaleString() : '-';

        yogiHtml += `
        <tr class="hover:bg-amber-500/5 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-2.5 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-200 py-2.5 px-4">${cat}</td>
          <td class="text-center font-mono text-sky-300 font-bold py-2.5 px-4">${fmt(m)}</td>
          <td class="text-center font-mono text-rose-300 font-bold py-2.5 px-4">${fmt(f)}</td>
          <td class="text-center font-mono font-extrabold text-amber-300 py-2.5 px-4 bg-amber-500/5">${fmt(t)}</td>
        </tr>`;
      });

      // Retreat Subtotal Row
      yogiHtml += `
        <tr class="bg-[#080d1a] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (စခန်းဝင်)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${retMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${retFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15">${retTotal.toLocaleString()}</td>
        </tr>`;

      // Grand Total Row
      const grandMale = resMale + retMale;
      const grandFemale = resFemale + retFemale;
      const grandTotal = resTotal + retTotal;

      yogiHtml += `
        <tr class="bg-[#020617] border-t-2 border-amber-500/50 font-black text-amber-300 text-sm">
          <td class="text-center py-4 px-3 font-mono">-</td>
          <td class="py-4 px-4 text-amber-300 font-black">စုစုပေါင်း ယောဂီ</td>
          <td class="text-center font-mono text-sky-400 font-black py-4 px-4">${grandMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-400 font-black py-4 px-4">${grandFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-4 px-4 bg-amber-500/25">${grandTotal.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      yogiTableElem.innerHTML = yogiHtml;
    }
  };

  // ---------------------------------------------------------------
  // Safe Data Fetching & Execution
  // ---------------------------------------------------------------
  try {
    const fetchFunc = window.fetchHomeSummary || window.fetchHomeSummaryAPI;
    if (typeof fetchFunc === 'function') {
      const data = await fetchFunc();
      renderHomeData(data);
    } else {
      renderHomeData(null);
    }
  } catch (error) {
    console.error("Error fetching home dashboard data:", error);
    renderHomeData(null);
  }
};

// Global Aliases
window.loadDashboardView = window.renderDashboardView;
window.renderHomeView = window.renderDashboardView;
