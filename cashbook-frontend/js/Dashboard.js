// ===================================================================
// js/Dashboard.js - Home Dashboard View Renderer & Tab Controller
// Instant 0-Second Load with 4 Sub-Tabs (Fund, Padetha, Yogi, Contact)
// Features: 100% Anti-Flicker, Silent Delta-Sync & Layout Stabilization
// ===================================================================

const DASH_CACHE_KEY = 'sasana_dashboard_cache';
let lastRenderedDashboardHash = ''; // 🌟 မလိုအပ်ဘဲ ဇယား အသစ်ပြန်မဆွဲစေရန် ဒေတာတူ/မတူ စစ်ဆေးသည့် Variable

/**
 * 💡 Sub-Tab Switch Controller (ရန်ပုံငွေ <-> စာအုပ်စာရင်း <-> ယောဂီ <-> ဆက်သွယ်ရန်)
 */
window.switchDashboardTab = function(tabName) {
  const fundSection = document.getElementById("dash-fund-section");
  const padethaSection = document.getElementById("dash-padetha-section");
  const yogiSection = document.getElementById("dash-yogi-section");
  const contactSection = document.getElementById("dash-contact-section");

  const fundTabBtn = document.getElementById("tab-dash-fund");
  const padethaTabBtn = document.getElementById("tab-dash-padetha");
  const yogiTabBtn = document.getElementById("tab-dash-yogi");
  const contactTabBtn = document.getElementById("tab-dash-contact");
  const tabBadge = document.getElementById("dash-tab-badge");

  const activeClasses = ["text-amber-300", "bg-[#1e293b]", "border-amber-500/30", "font-black", "shadow-sm"];
  const inactiveClasses = ["text-amber-400/60", "font-bold", "hover:text-amber-200"];

  // ၁။ Section အားလုံးကို အရင် ဝှက်ထားမည်
  if (fundSection) fundSection.classList.add("hidden");
  if (padethaSection) padethaSection.classList.add("hidden");
  if (yogiSection) yogiSection.classList.add("hidden");
  if (contactSection) contactSection.classList.add("hidden");

  // ၂။ Tab ခလုတ် ၄ ခုလုံးကို Inactive ပုံစံ ပြောင်းမည်
  [fundTabBtn, padethaTabBtn, yogiTabBtn, contactTabBtn].forEach(btn => {
    if (btn) {
      btn.classList.remove(...activeClasses);
      btn.classList.add(...inactiveClasses);
    }
  });

  // ၃။ ရွေးချယ်လိုက်သော Tab အလိုက် ဖွင့်လှစ်ပြသခြင်း
  if (tabName === 'fund') {
    if (fundSection) fundSection.classList.remove("hidden");
    if (fundTabBtn) {
      fundTabBtn.classList.add(...activeClasses);
      fundTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "(ပမာဏ - MMK)";

  } else if (tabName === 'padetha') {
    if (padethaSection) padethaSection.classList.remove("hidden");
    if (padethaTabBtn) {
      padethaTabBtn.classList.add(...activeClasses);
      padethaTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "(ပဒေသာပင် ၄ အုပ်)";

  } else if (tabName === 'yogi') {
    if (yogiSection) yogiSection.classList.remove("hidden");
    if (yogiTabBtn) {
      yogiTabBtn.classList.add(...activeClasses);
      yogiTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "စခန်းတွင်း Active ယောဂီများ";

  } else if (tabName === 'contact') {
    if (contactSection) contactSection.classList.remove("hidden");
    if (contactTabBtn) {
      contactTabBtn.classList.add(...activeClasses);
      contactTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "ပြင်ဦးလွင်မြို့";
  }
};

/**
 * 📊 Main Dashboard View Render Function (100% Anti-Flicker & Stable Engine)
 */
window.renderDashboardView = async function(isSilent = false) {
  const container = document.getElementById("view-container");

  // ၁။ Template မရှိသေးမှသာ အသစ်ဆွဲယူခြင်း
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

  const D1_TABLE_SPECS = [
    { key: '1CB', tableName: '1CB Bank (General)', defaultTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    { key: '2CB', tableName: '2CB Bank (Meal)', defaultTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    { key: '3CB', tableName: '3CB Bank (UZ)', defaultTitle: 'တစ်ဦးတည်းစာရင်း (Bank)' },
    { key: '4GB', tableName: '1General Book', defaultTitle: 'ကျောင်းရန်ပုံငွေ စာအုပ်' },
    { key: '5FB', tableName: '2Meal Book', defaultTitle: 'ဆွမ်းပဒေသာပင် စာအုပ်' },
    { key: '6HB', tableName: '3Hall Book', defaultTitle: 'ဓမ္မာရုံငွေစာရင်း စာအုပ်' },
    { key: '7PB', tableName: '4Pagoda Book', defaultTitle: 'စေတီငွေစာရင်း စာအုပ်' },
    { key: '8EB', tableName: '5Electronic Book', defaultTitle: 'လျှပ်စစ်ပဒေသာပင် စာအုပ်' },
    { key: '9MB', tableName: '6Medical Book', defaultTitle: 'ဆေးပဒေသာပင် စာအုပ်' },
    { key: '10GB', tableName: '7Other Book', defaultTitle: 'အထွေထွေရန်ပုံငွေစာအုပ်' }
  ];

  const PADETHA_SPECS = [
    { tableName: '2Meal Book', title: 'ဆွမ်းပဒေသာပင် စာအုပ်' },
    { tableName: '5Electronic Book', title: 'လျှပ်စစ်ပဒေသာပင် စာအုပ်' },
    { tableName: '6Medical Book', title: 'ဆေးပဒေသာပင် စာအုပ်' },
    { tableName: '7Other Book', title: 'အထွေထွေရန်ပုံငွေစာအုပ်' }
  ];

  const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

  const formatMoney = (val, defaultColor = "text-slate-200") => {
    const num = Number(val || 0);
    if (num === 0) return `<span class="text-slate-600 font-mono font-medium">-</span>`;
    if (num < 0) return `<span class="text-rose-400 font-mono font-black">${num.toLocaleString()}</span>`;
    return `<span class="${defaultColor} font-mono font-bold">${num.toLocaleString()}</span>`;
  };

  const renderHomeData = (raw) => {
    const bankTableElem = document.getElementById("home-bank-table");
    const padethaTableElem = document.getElementById("home-padetha-table");
    const yogiTableElem = document.getElementById("home-yogi-table");

    const data = (raw && raw.data) ? raw.data : (raw || {});
    const kpis = data.kpis || { totalFund: 0, totalBank: 0, totalCash: 0, totalCount: 0 };
    const fundSummary = data.fundSummary || {};
    const padethaSummary = data.padethaSummary || [];
    const yogiSummary = data.yogiSummary || {};

    // 1. TOP KPIS
    const setKpi = (id, val, isCash = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      const num = Number(val || 0);
      el.textContent = `${num.toLocaleString()} MMK`;
      if (isCash && num < 0) el.className = "text-base font-extrabold text-rose-400 mt-1";
    };
    setKpi("kpi-home-fund", kpis.totalFund);
    setKpi("kpi-home-bank", kpis.totalBank);
    setKpi("kpi-home-cash", kpis.totalCash, true);
    
    const countEl = document.getElementById("kpi-home-count");
    if (countEl) countEl.textContent = Number(kpis.totalCount || 0).toLocaleString();

    // 2. FUND SUMMARY TABLE (စာအုပ် ၁၀ အုပ်)
    if (bankTableElem) {
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

      D1_TABLE_SPECS.forEach((spec, idx) => {
        const item = fundSummary[spec.tableName] || fundSummary[spec.key] || { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
        const name = window.CONFIG?.TABLE_TITLES?.[spec.tableName] || window.CONFIG?.TABLE_TITLES?.[spec.key] || spec.defaultTitle;

        const bb = Number(item.bankBalance || 0);
        const u1 = Number(item.user1Balance || 0);
        const u2 = Number(item.user2Balance || 0);
        const u3 = Number(item.user3Balance || 0);
        const tot = Number(item.totalBalance || (bb + u1 + u2 + u3));

        sumBank += bb; sumU1 += u1; sumU2 += u2; sumU3 += u3; sumTotal += tot;

        let totalCellHtml = tot < 0 ? `<span class="font-mono font-black text-rose-400">${tot.toLocaleString()}</span>` : (tot === 0 ? `<span class="font-mono font-medium text-slate-600">-</span>` : `<span class="font-mono font-black text-amber-300">${tot.toLocaleString()}</span>`);

        fundHtml += `
        <tr class="hover:bg-[#1e293b]/40 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-3 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-100 py-3 px-4">${name}</td>
          <td class="text-right py-3 px-4">${formatMoney(bb, "text-sky-300 font-bold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u1, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u2, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u3, "text-slate-200 font-semibold")}</td>
          <td class="text-right py-3 px-4 bg-amber-500/5 border-l border-amber-500/15">${totalCellHtml}</td>
        </tr>`;
      });

      let grandTotalBadge = sumTotal < 0 ? `<span class="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono font-black text-sm shadow-sm">${sumTotal.toLocaleString()}</span>` : `<span class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 to-amber-600/35 border border-amber-400/50 text-amber-200 font-mono font-black text-sm shadow-md shadow-amber-500/15">${sumTotal.toLocaleString()}</span>`;

      fundHtml += `
        <tr class="bg-gradient-to-r from-[#091122] via-[#0f1d3a] to-[#091122] border-t-2 border-amber-400/70 shadow-2xl">
          <td class="text-center py-4 px-3 font-mono text-amber-500/60 font-bold">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
              <i class="fa-solid fa-calculator text-amber-400"></i> စုစုပေါင်း
            </span>
          </td>
          <td class="text-right py-4 px-4"><span class="font-mono text-sky-300 font-black text-xs">${sumBank.toLocaleString()}</span></td>
          <td class="text-right py-4 px-3">${formatMoney(sumU1, "text-emerald-300 font-black")}</td>
          <td class="text-right py-4 px-3">${formatMoney(sumU2, "text-emerald-300 font-black")}</td>
          <td class="text-right py-4 px-3">${formatMoney(sumU3, "text-emerald-300 font-black")}</td>
          <td class="text-right py-4 px-4 bg-amber-500/15 border-l border-amber-500/30">${grandTotalBadge}</td>
        </tr>
      </tbody></table></div>`;

      bankTableElem.innerHTML = fundHtml;
    }

    // 3. BOOK SUMMARY TABLE (ပဒေသာပင် ၄ အုပ်)
    if (padethaTableElem) {
      let padethaHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[700px] text-xs">
          <thead>
            <tr class="bg-[#080d1a] border-b border-amber-500/30 text-amber-300 font-extrabold uppercase tracking-wider">
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[220px] py-3.5 px-4 text-amber-200">စာအုပ်အမည်</th>
              <th class="text-right w-40 py-3.5 px-4 text-emerald-400">ဝင်ငွေ</th>
              <th class="text-right w-40 py-3.5 px-4 text-rose-400">ဘဏ်အပ်နှံ (ထွက်ငွေ)</th>
              <th class="text-right w-44 py-3.5 px-4 text-amber-300 bg-amber-500/10 font-black border-l border-amber-500/20">
                ✨ လက်ကျန်ငွေ
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amber-500/10">`;

      let totalPadethaIncome = 0;
      let totalPadethaExpense = 0;
      let totalPadethaBalance = 0;

      PADETHA_SPECS.forEach((spec, idx) => {
        const row = padethaSummary.find(p => p.table_name === spec.tableName) || {
          income: 0,
          expense: 0,
          balance: 0
        };

        const inc = Number(row.income || 0);
        const exp = Number(row.expense || 0);
        const bal = Number(row.balance || (inc - exp));

        totalPadethaIncome += inc;
        totalPadethaExpense += exp;
        totalPadethaBalance += bal;

        padethaHtml += `
        <tr class="hover:bg-[#1e293b]/40 transition-colors">
          <td class="text-center font-bold text-amber-500/70 py-3 px-3 font-mono">${idx + 1}</td>
          <td class="font-bold text-amber-100 py-3 px-4 text-sm">${spec.title}</td>
          <td class="text-right py-3 px-4 font-mono text-emerald-400 font-bold text-sm">${inc ? inc.toLocaleString() : '-'}</td>
          <td class="text-right py-3 px-4 font-mono text-rose-400 font-bold text-sm">${exp ? exp.toLocaleString() : '-'}</td>
          <td class="text-right py-3 px-4 font-mono text-amber-300 font-black text-sm bg-amber-500/5 border-l border-amber-500/15">${bal.toLocaleString()}</td>
        </tr>`;
      });

      padethaHtml += `
        <tr class="bg-gradient-to-r from-[#091122] via-[#0f1d3a] to-[#091122] border-t-2 border-amber-400/70 shadow-2xl">
          <td class="text-center py-4 px-3 font-mono text-amber-500/60 font-bold">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
              <i class="fa-solid fa-calculator text-amber-400"></i> စုစုပေါင်း
            </span>
          </td>
          <td class="text-right py-4 px-4 font-mono text-emerald-300 font-black text-sm">${totalPadethaIncome.toLocaleString()}</td>
          <td class="text-right py-4 px-4 font-mono text-rose-300 font-black text-sm">${totalPadethaExpense.toLocaleString()}</td>
          <td class="text-right py-4 px-4 font-mono text-amber-200 font-black text-sm bg-amber-500/20 border-l border-amber-500/30 shadow-inner">${totalPadethaBalance.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      padethaTableElem.innerHTML = padethaHtml;
    }

    // 4. YOGI SUMMARY MATRIX TABLE
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
        resMale += m; resFemale += f; resTotal += t;
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

      yogiHtml += `
        <tr class="bg-[#0b1329] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono text-amber-500/60">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (အမြဲနေ)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${resMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${resFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15 border-l border-amber-500/20">${resTotal.toLocaleString()}</td>
        </tr>`;

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
        retMale += m; retFemale += f; retTotal += t;
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

      yogiHtml += `
        <tr class="bg-[#0b1329] font-extrabold text-amber-300 border-t border-amber-500/30">
          <td class="text-center py-3 px-3 font-mono text-amber-500/60">-</td>
          <td class="py-3 px-4 text-amber-300 font-black">ပေါင်း (စခန်းဝင်)</td>
          <td class="text-center font-mono text-sky-300 font-black py-3 px-4">${retMale.toLocaleString()}</td>
          <td class="text-center font-mono text-rose-300 font-black py-3 px-4">${retFemale.toLocaleString()}</td>
          <td class="text-center font-mono text-amber-300 font-black py-3 px-4 bg-amber-500/15 border-l border-amber-500/20">${retTotal.toLocaleString()}</td>
        </tr>`;

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

  // 🌟 (၂) မျက်နှာပြင်ပေါ်တွင် ဇယားများ ရှိနေပြီးသား ဟုတ်/မဟုတ် စစ်ဆေးခြင်း
  const hasContentOnScreen = Boolean(
    document.getElementById("home-bank-table")?.querySelector('table')
  );

  // 🌟 (၃) မျက်နှာပြင်ပေါ်တွင် ဒေတာ မရှိသေးမှသာ (ပထမဆုံးအကြိမ်) Cache မှ ထုတ်ပြမည်
  if (!hasContentOnScreen) {
    try {
      const cachedStr = localStorage.getItem(DASH_CACHE_KEY);
      if (cachedStr) {
        const cachedData = JSON.parse(cachedStr);
        lastRenderedDashboardHash = JSON.stringify(cachedData.data || cachedData);
        renderHomeData(cachedData);
      }
    } catch (_) {}
  }

  // 🌟 (၄) အရေးကြီးဆုံးအချက်:
  // ဒေတာ ရှိနေပြီးသား ဖြစ်ပါက (သို့မဟုတ် Silent ဖြစ်ပါက) အနက်ရောင် Loading အလွှာကို လုံးဝ မပြတော့ပါ!
  // ပထမဆုံးအကြိမ် မျက်နှာပြင် ဗလာဖြစ်နေချိန်မှသာ Loading အလွှာ ပေါ်ပါမည်။
  const shouldShowOverlay = !isSilent && !hasContentOnScreen;
  if (typeof window.showLoading === 'function' && shouldShowOverlay) {
    window.showLoading(true);
  }
  
  try {
    const fetchFunc = window.fetchHomeSummary || window.fetchHomeSummaryAPI;
    if (typeof fetchFunc === 'function') {
      const freshData = await fetchFunc();
      if (freshData && freshData.success) {
        const freshHash = JSON.stringify(freshData.data || freshData);
        localStorage.setItem(DASH_CACHE_KEY, JSON.stringify(freshData));

        // 🌟 (၅) Anti-Flicker: ဒေတာ အပြောင်းအလဲ အမှန်တကယ် ရှိမှသာ (သို့မဟုတ် ဇယား မရှိသေးမှသာ) DOM ကို ရေးဆွဲမည်။
        // ဒေတာ တူနေပါက DOM ကို လုံးဝ မထိတော့သည့်အတွက် မျက်နှာပြင် လှုပ်ခါခြင်း ၁၀၀% ကင်းဝေးသွားပါမည်။
        if (freshHash !== lastRenderedDashboardHash || !document.getElementById("home-bank-table")?.querySelector('table')) {
          lastRenderedDashboardHash = freshHash;
          renderHomeData(freshData);
        }
      }
    }
  } catch (error) {
    console.warn("Silent background dashboard sync warning:", error);
  } finally {
    if (typeof window.showLoading === 'function' && shouldShowOverlay) {
      window.showLoading(false);
    }
  }
};

window.loadDashboardView = window.renderDashboardView;
window.renderHomeView = window.renderDashboardView;
