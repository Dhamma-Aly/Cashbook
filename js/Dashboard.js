// ===================================================================
// js/Dashboard.js - Home Dashboard View Renderer & Tab Controller
// Executive Slate-Navy & Amber Gold Highlight Theme
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
    if (fundSection) fundSection.classList.remove("hidden");
    if (yogiSection) yogiSection.classList.add("hidden");

    if (fundTabBtn) {
      fundTabBtn.classList.add(...activeClasses);
      fundTabBtn.classList.remove(...inactiveClasses);
    }
    if (yogiTabBtn) {
      yogiTabBtn.classList.remove(...activeClasses);
      yogiTabBtn.classList.add(...inactiveClasses);
    }

    if (tabBadge) tabBadge.textContent = "(ပမာဏ - MMK)";

  } else if (tabName === 'yogi') {
    if (fundSection) fundSection.classList.add("hidden");
    if (yogiSection) yogiSection.classList.remove("hidden");

    if (yogiTabBtn) {
      yogiTabBtn.classList.add(...activeClasses);
      yogiTabBtn.classList.remove(...inactiveClasses);
    }
    if (fundTabBtn) {
      fundTabBtn.classList.remove(...activeClasses);
      fundTabBtn.classList.add(...inactiveClasses);
    }

    if (tabBadge) tabBadge.textContent = "စခန်းတွင်း Active ယောဂီများ";
  }
};

/**
 * 📊 Main Dashboard View Render Function
 */
window.renderDashboardView = async function() {
  const container = document.getElementById("view-container");

  // Template Fetch & Inject
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

  // Smart Money Formatter (အနှုတ်ပြကိန်းများကို Rose Red ဖြင့် အလိုအလျောက် သီးသန့်ပြသခြင်း)
  const formatMoney = (val, defaultColor = "text-slate-200") => {
    const num = Number(val || 0);
    if (num === 0) return `<span class="text-slate-600 font-mono font-medium">-</span>`;
    if (num < 0) return `<span class="text-rose-400 font-mono font-black">${num.toLocaleString()}</span>`;
    return `<span class="${defaultColor} font-mono font-bold">${num.toLocaleString()}</span>`;
  };

  const renderHomeData = (raw) => {
    const bankTableElem = document.getElementById("home-bank-table");
    const yogiTableElem = document.getElementById("home-yogi-table");

    const data = (raw && raw.data) ? raw.data : (raw || {});
    const kpis = data.kpis || { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 };
    const fundSummary = data.fundSummary || {};
    const yogiSummary = data.yogiSummary || {};

    // ---------------------------------------------------------------
    // 1. TOP KPIS
    // ---------------------------------------------------------------
    const setKpi = (id, val, isCash = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      const num = Number(val || 0);
      el.textContent = `${num.toLocaleString()} MMK`;
      if (isCash && num < 0) {
        el.className = "text-base font-extrabold text-rose-400 mt-1";
      }
    };
    setKpi("kpi-home-fund", kpis.totalFund);
    setKpi("kpi-home-bank", kpis.totalBank);
    setKpi("kpi-home-cash", kpis.totalCash, true);
    
    const countEl = document.getElementById("kpi-home-count");
    if (countEl) countEl.textContent = Number(kpis.totalCount || 0).toLocaleString();

    // ---------------------------------------------------------------
    // 2. FUND SUMMARY TABLE (ရိပ်သာ ရန်ပုံငွေစာရင်း အကျဉ်းချုပ်)
    // ---------------------------------------------------------------
    if (bankTableElem) {
      const titles = (window.CONFIG && window.CONFIG.SHEET_TITLES) || {
        '1CB': 'အထွေထွေ ရန်ပုံငွေ (Bank)',
        '2CB': 'ဆွမ်းပဒေသာပင် (Bank)',
        '3CB': 'တစ်ဦးတည်းစာရင်း (Bank)',
        '4GB': 'ကျောင်းရန်ပုံငွေ စာအုပ်',
        '5FB': 'ဆွမ်းပဒေသာပင် စာအုပ်',
        '6HB': 'ဓမ္မာရုံငွေစာရင်း စာအုပ်',
        '7PB': 'စေတီငွေစာရင်း စာအုပ်',
        '8EB': 'လျှပ်စစ်ပဒေသာပင် စာအုပ်',
        '9MB': 'ဆေးပဒေသာပင် စာအုပ်',
        '10GB': 'အထွေထွေရန်ပုံငွေစာအုပ်'
      };

      let fundHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[780px] text-xs">
          <thead>
            <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4">စာအုပ်အမည်</th>
              <th class="text-right w-36 py-3.5 px-4 text-sky-400">ဘဏ်လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3 text-emerald-400">USER 1 လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3 text-emerald-400">USER 2 လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3 text-emerald-400">USER 3 လက်ကျန်</th>
              <th class="text-right w-44 py-3.5 px-4 text-amber-300 font-black bg-gradient-to-b from-amber-500/10 to-amber-500/20 border-l border-amber-500/30 shadow-inner">
                ✨ လက်ကျန် ပေါင်း
              </th>
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

        // လက်ကျန်ပေါင်း ကော်လံအတွက် Highlight Style
        let totalCellHtml = '';
        if (tot < 0) {
          totalCellHtml = `<span class="font-mono font-black text-rose-400">${tot.toLocaleString()}</span>`;
        } else if (tot === 0) {
          totalCellHtml = `<span class="font-mono font-medium text-slate-600">-</span>`;
        } else {
          totalCellHtml = `<span class="font-mono font-black text-amber-300">${tot.toLocaleString()}</span>`;
        }

        fundHtml += `
        <tr class="hover:bg-[#1e293b]/40 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-3 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-100 py-3 px-4">${name}</td>
          <td class="text-right py-3 px-4">${formatMoney(bb, "text-sky-300 font-bold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u1, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u2, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u3, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-4 bg-amber-500/5 border-l border-amber-500/15">
            ${totalCellHtml}
          </td>
        </tr>`;
      });

      // 🌟 GRAND TOTAL ROW (ပေါ်လွင်တောက်ပသော စုစုပေါင်း စာကြောင်း)
      let grandTotalBadge = '';
      if (sumTotal < 0) {
        grandTotalBadge = `<span class="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono font-black text-sm shadow-sm">${sumTotal.toLocaleString()}</span>`;
      } else {
        grandTotalBadge = `<span class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 to-amber-600/35 border border-amber-400/50 text-amber-200 font-mono font-black text-sm shadow-md shadow-amber-500/15">${sumTotal.toLocaleString()}</span>`;
      }

      fundHtml += `
        <tr class="bg-gradient-to-r from-[#091122] via-[#0f1d3a] to-[#091122] border-t-2 border-amber-400/70 shadow-2xl">
          <td class="text-center py-4 px-3 font-mono text-amber-500/60 font-bold">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
              <i class="fa-solid fa-calculator text-amber-400"></i> စုစုပေါင်း
            </span>
          </td>
          <td class="text-right py-4 px-4">
            <span class="font-mono text-sky-300 font-black text-xs">${sumBank.toLocaleString()}</span>
          </td>
          <td class="text-right py-4 px-3">
            ${formatMoney(sumU1, "text-emerald-300 font-black")}
          </td>
          <td class="text-right py-4 px-3">
            ${formatMoney(sumU2, "text-emerald-300 font-black")}
          </td>
          <td class="text-right py-4 px-3">
            ${formatMoney(sumU3, "text-emerald-300 font-black")}
          </td>
          <td class="text-right py-4 px-4 bg-amber-500/15 border-l border-amber-500/30">
            ${grandTotalBadge}
          </td>
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
          <thead>
            <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4 text-amber-200">အမြဲနေယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4 text-sky-400">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4 text-rose-400">မ</th>
              <th class="text-center w-36 py-3.5 px-4 text-amber-300 bg-amber-500/10 font-black border-l border-amber-500/20">ပေါင်း</th>
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
        <tr class="hover:bg-[#1e293b]/40 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-2.5 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-100 py-2.5 px-4">${cat}</td>
          <td class="text-center font-mono text-sky-300 font-bold py-2.5 px-4">${fmt(m)}</td>
          <td class="text-center font-mono text-rose-300 font-bold py-2.5 px-4">${fmt(f)}</td>
          <td class="text-center font-mono font-black text-amber-300 py-2.5 px-4 bg-amber-500/5 border-l border-amber-500/15">${fmt(t)}</td>
        </tr>`;
      });

      // Resident Subtotal
      yogiHtml += `
        <tr class="bg-[#0b1329] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono text-amber-500/60">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (အမြဲနေ)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${resMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${resFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15 border-l border-amber-500/20">${resTotal.toLocaleString()}</td>
        </tr>`;

      // Retreat Section
      yogiHtml += `
          <thead>
            <tr class="bg-[#080d1a] border-t-2 border-b border-amber-500/40 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4 text-amber-200">စခန်းဝင်ယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4 text-sky-400">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4 text-rose-400">မ</th>
              <th class="text-center w-36 py-3.5 px-4 text-amber-300 bg-amber-500/10 font-black border-l border-amber-500/20">ပေါင်း</th>
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
        <tr class="hover:bg-[#1e293b]/40 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-2.5 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-100 py-2.5 px-4">${cat}</td>
          <td class="text-center font-mono text-sky-300 font-bold py-2.5 px-4">${fmt(m)}</td>
          <td class="text-center font-mono text-rose-300 font-bold py-2.5 px-4">${fmt(f)}</td>
          <td class="text-center font-mono font-black text-amber-300 py-2.5 px-4 bg-amber-500/5 border-l border-amber-500/15">${fmt(t)}</td>
        </tr>`;
      });

      // Retreat Subtotal
      yogiHtml += `
        <tr class="bg-[#0b1329] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono text-amber-500/60">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (စခန်းဝင်)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${retMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${retFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15 border-l border-amber-500/20">${retTotal.toLocaleString()}</td>
        </tr>`;

      // 🌟 Grand Total Yogi Row
      const grandMale = resMale + retMale;
      const grandFemale = resFemale + retFemale;
      const grandTotal = resTotal + retTotal;

      yogiHtml += `
        <tr class="bg-gradient-to-r from-[#091122] via-[#0f1d3a] to-[#091122] border-t-2 border-amber-400/70 font-black text-amber-300 shadow-2xl">
          <td class="text-center py-4 px-3 font-mono text-amber-500/60">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
              <i class="fa-solid fa-users text-amber-400"></i> စုစုပေါင်း ယောဂီ
            </span>
          </td>
          <td class="text-center font-mono text-sky-400 font-black py-4 px-4 text-xs">${grandMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-400 font-black py-4 px-4 text-xs">${grandFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-200 font-black py-4 px-4 bg-amber-500/20 border-l border-amber-500/30 text-sm shadow-inner">${grandTotal.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      yogiTableElem.innerHTML = yogiHtml;
    }
  };

  // Safe Data Fetching
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
