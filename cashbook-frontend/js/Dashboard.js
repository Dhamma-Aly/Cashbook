// ===================================================================
// js/Dashboard.js - Home Dashboard View Renderer & Tab Controller (v4.1)
// Features: Calm Eye-Comfort Palette, Summary-Powered 0-Second Load,
// 4 Sub-Tabs, Click-to-Open Book, Admin JSON Backup & Anti-Flicker Sync
// ===================================================================

const DASH_CACHE_KEY = 'sasana_dashboard_cache';
let lastRenderedDashboardHash = '';
let activeDashTab = 'fund';
let activeDashFetchToken = 0;

function escapeDashHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notifyDash(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else if (type === 'error' || type === 'warning') {
    alert(msg);
  }
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

window.switchDashboardTab = function (tabName) {
  activeDashTab = tabName || 'fund';

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

  [fundSection, padethaSection, yogiSection, contactSection].forEach(sec => {
    if (sec) sec.classList.add("hidden");
  });

  [fundTabBtn, padethaTabBtn, yogiTabBtn, contactTabBtn].forEach(btn => {
    if (btn) {
      btn.classList.remove(...activeClasses);
      btn.classList.add(...inactiveClasses);
    }
  });

  if (activeDashTab === 'fund') {
    if (fundSection) fundSection.classList.remove("hidden");
    if (fundTabBtn) {
      fundTabBtn.classList.add(...activeClasses);
      fundTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "(ပမာဏ - MMK)";
  } else if (activeDashTab === 'padetha') {
    if (padethaSection) padethaSection.classList.remove("hidden");
    if (padethaTabBtn) {
      padethaTabBtn.classList.add(...activeClasses);
      padethaTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "(ပဒေသာပင် ၄ အုပ်)";
  } else if (activeDashTab === 'yogi') {
    if (yogiSection) yogiSection.classList.remove("hidden");
    if (yogiTabBtn) {
      yogiTabBtn.classList.add(...activeClasses);
      yogiTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "စခန်းတွင်း Active ယောဂီများ";
  } else if (activeDashTab === 'contact') {
    if (contactSection) contactSection.classList.remove("hidden");
    if (contactTabBtn) {
      contactTabBtn.classList.add(...activeClasses);
      contactTabBtn.classList.remove(...inactiveClasses);
    }
    if (tabBadge) tabBadge.textContent = "ပြင်ဦးလွင်မြို့";
  }
};

window.renderDashboardView = async function (isSilent = false) {
  const fetchToken = ++activeDashFetchToken;
  const container = document.getElementById("view-container");

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

  injectAdminBackupButton();
  window.switchDashboardTab(activeDashTab);

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
    { key: '5FB', tableName: '2Meal Book', title: 'ဆွမ်းပဒေသာပင် စာအုပ်' },
    { key: '8EB', tableName: '5Electronic Book', title: 'လျှပ်စစ်ပဒေသာပင် စာအုပ်' },
    { key: '9MB', tableName: '6Medical Book', title: 'ဆေးပဒေသာပင် စာအုပ်' },
    { key: '10GB', tableName: '7Other Book', title: 'အထွေထွေရန်ပုံငွေစာအုပ်' }
  ];

  const YOGI_CATS = ['ရဟန်း', 'ကိုရင်', 'သီလရှင်', 'လူပုဂ္ဂိုလ်', 'ဝေယျာဝိစ္စ'];

  const formatMoney = (val, colorHex = "#cbd5e1", weight = "font-medium") => {
    const num = Number(val || 0);
    if (num === 0) return `<span class="font-mono" style="color:#475569;">-</span>`;
    if (num < 0) return `<span class="font-mono font-bold" style="color:#fda4af;">${num.toLocaleString()}</span>`;
    return `<span class="font-mono ${weight}" style="color:${colorHex};">${num.toLocaleString()}</span>`;
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

    const setKpi = (id, val, colorHex) => {
      const el = document.getElementById(id);
      if (!el) return;
      const num = Number(val || 0);
      el.textContent = `${num.toLocaleString()} MMK`;
      el.className = "text-base font-extrabold mt-1 truncate font-mono";
      el.style.color = num < 0 ? '#fda4af' : colorHex;
    };
    setKpi("kpi-home-fund", kpis.totalFund, "#fbbf24");
    setKpi("kpi-home-bank", kpis.totalBank, "#7dd3fc");
    setKpi("kpi-home-cash", kpis.totalCash, "#6ee7b7");

    const countEl = document.getElementById("kpi-home-count");
    if (countEl) {
      countEl.textContent = Number(kpis.totalCount || 0).toLocaleString();
      countEl.style.color = "#e2e8f0";
    }

    // 1. FUND SUMMARY TABLE
    if (bankTableElem) {
      let fundHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[780px] text-xs">
          <thead>
            <tr>
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4">စာအုပ်အမည်</th>
              <th class="text-right w-36 py-3.5 px-4">ဘဏ်လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3">USER 1 လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3">USER 2 လက်ကျန်</th>
              <th class="text-right w-32 py-3.5 px-3">USER 3 လက်ကျန်</th>
              <th class="text-right w-44 py-3.5 px-4" style="color:#cbd5e1;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.04);">
                လက်ကျန် ပေါင်း
              </th>
            </tr>
          </thead>
          <tbody>`;

      let sumBank = 0, sumU1 = 0, sumU2 = 0, sumU3 = 0, sumTotal = 0;

      D1_TABLE_SPECS.forEach((spec, idx) => {
        const item = fundSummary[spec.tableName] || fundSummary[spec.key] || { bankBalance: 0, user1Balance: 0, user2Balance: 0, user3Balance: 0, totalBalance: 0 };
        const name = window.CONFIG?.TABLE_TITLES?.[spec.tableName] || window.CONFIG?.TABLE_TITLES?.[spec.key] || spec.defaultTitle;

        const bb = Number(item.bankBalance || 0);
        const u1 = Number(item.user1Balance || 0);
        const u2 = Number(item.user2Balance || 0);
        const u3 = Number(item.user3Balance || 0);
        const tot = Number(item.totalBalance !== undefined ? item.totalBalance : (bb + u1 + u2 + u3));

        sumBank += bb; sumU1 += u1; sumU2 += u2; sumU3 += u3; sumTotal += tot;

        const totalCellHtml = tot < 0
          ? `<span class="font-mono font-bold" style="color:#fda4af;">${tot.toLocaleString()}</span>`
          : (tot === 0
            ? `<span class="font-mono" style="color:#475569;">-</span>`
            : `<span class="font-mono font-bold" style="color:#f8fafc;">${tot.toLocaleString()}</span>`);

        fundHtml += `
        <tr onclick="if(typeof window.switchTab==='function') window.switchTab('${escapeDashHtml(spec.key)}')" class="transition-colors cursor-pointer">
          <td class="text-center py-3 px-3 font-mono text-xs" style="color:#64748b;">${idx + 1}</td>
          <td class="font-medium py-3 px-4" style="color:#e2e8f0;">${escapeDashHtml(name)}</td>
          <td class="text-right py-3 px-4">${formatMoney(bb, "#7dd3fc", "font-semibold")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u1, "#cbd5e1", "font-medium")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u2, "#cbd5e1", "font-medium")}</td>
          <td class="text-right py-3 px-3">${formatMoney(u3, "#cbd5e1", "font-medium")}</td>
          <td class="text-right py-3 px-4" style="border-left:1px solid rgba(148,163,184,0.12);background:rgba(148,163,184,0.03);">${totalCellHtml}</td>
        </tr>`;
      });

      const grandTotalBadge = sumTotal < 0
        ? `<span class="px-3 py-1 rounded-lg font-mono font-extrabold text-sm" style="background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.3);color:#fda4af;">${sumTotal.toLocaleString()}</span>`
        : `<span class="px-3 py-1 rounded-lg font-mono font-extrabold text-sm" style="background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.35);color:#fde68a;">${sumTotal.toLocaleString()}</span>`;

      fundHtml += `
        <tr style="background:#161e2c;border-top:1px solid rgba(148,163,184,0.22);">
          <td class="text-center py-4 px-3 font-mono font-bold" style="color:#64748b;">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style="color:#f8fafc;">
              <i class="fa-solid fa-calculator" style="color:#fbbf24;"></i> စုစုပေါင်း
            </span>
          </td>
          <td class="text-right py-4 px-4">${formatMoney(sumBank, "#7dd3fc", "font-bold")}</td>
          <td class="text-right py-4 px-3">${formatMoney(sumU1, "#6ee7b7", "font-bold")}</td>
          <td class="text-right py-4 px-3">${formatMoney(sumU2, "#6ee7b7", "font-bold")}</td>
          <td class="text-right py-4 px-3">${formatMoney(sumU3, "#6ee7b7", "font-bold")}</td>
          <td class="text-right py-4 px-4" style="border-left:1px solid rgba(148,163,184,0.18);background:rgba(245,158,11,0.05);">${grandTotalBadge}</td>
        </tr>
      </tbody></table></div>`;

      bankTableElem.innerHTML = fundHtml;
    }

    // 2. BOOK SUMMARY TABLE (ပဒေသာပင် ၄ အုပ်)
    if (padethaTableElem) {
      let padethaHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[700px] text-xs">
          <thead>
            <tr>
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[220px] py-3.5 px-4">စာအုပ်အမည်</th>
              <th class="text-right w-40 py-3.5 px-4">ဝင်ငွေ</th>
              <th class="text-right w-40 py-3.5 px-4">ဘဏ်အပ်နှံ (ထွက်ငွေ)</th>
              <th class="text-right w-44 py-3.5 px-4" style="color:#cbd5e1;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.04);">
                လက်ကျန်ငွေ
              </th>
            </tr>
          </thead>
          <tbody>`;

      let totalPadethaIncome = 0, totalPadethaExpense = 0, totalPadethaBalance = 0;

      PADETHA_SPECS.forEach((spec, idx) => {
        const row = padethaSummary.find(p => p.table_name === spec.tableName) || { income: 0, expense: 0, balance: 0 };
        const inc = Number(row.income || 0);
        const exp = Number(row.expense || 0);
        const bal = Number(row.balance !== undefined ? row.balance : (inc - exp));

        totalPadethaIncome += inc;
        totalPadethaExpense += exp;
        totalPadethaBalance += bal;

        padethaHtml += `
        <tr onclick="if(typeof window.switchTab==='function') window.switchTab('${escapeDashHtml(spec.key)}')" class="transition-colors cursor-pointer">
          <td class="text-center py-3 px-3 font-mono text-xs" style="color:#64748b;">${idx + 1}</td>
          <td class="font-medium py-3 px-4" style="color:#e2e8f0;">${escapeDashHtml(spec.title)}</td>
          <td class="text-right py-3 px-4">${formatMoney(inc, "#6ee7b7", "font-semibold")}</td>
          <td class="text-right py-3 px-4">${formatMoney(exp, "#fda4af", "font-semibold")}</td>
          <td class="text-right py-3 px-4 font-mono font-bold" style="color:${bal < 0 ? '#fda4af' : '#f8fafc'};border-left:1px solid rgba(148,163,184,0.12);background:rgba(148,163,184,0.03);">${bal.toLocaleString()}</td>
        </tr>`;
      });

      padethaHtml += `
        <tr style="background:#161e2c;border-top:1px solid rgba(148,163,184,0.22);">
          <td class="text-center py-4 px-3 font-mono font-bold" style="color:#64748b;">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style="color:#f8fafc;">
              <i class="fa-solid fa-calculator" style="color:#fbbf24;"></i> စုစုပေါင်း
            </span>
          </td>
          <td class="text-right py-4 px-4 font-mono font-bold" style="color:#6ee7b7;">${totalPadethaIncome.toLocaleString()}</td>
          <td class="text-right py-4 px-4 font-mono font-bold" style="color:#fda4af;">${totalPadethaExpense.toLocaleString()}</td>
          <td class="text-right py-4 px-4 font-mono font-extrabold text-sm" style="color:${totalPadethaBalance < 0 ? '#fda4af' : '#fde68a'};border-left:1px solid rgba(148,163,184,0.18);background:rgba(245,158,11,0.05);">${totalPadethaBalance.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      padethaTableElem.innerHTML = padethaHtml;
    }

    // 3. YOGI SUMMARY MATRIX TABLE
    if (yogiTableElem) {
      const residentData = yogiSummary.resident || {};
      const retreatData = yogiSummary.retreat || {};
      const fmt = (v) => v !== 0 ? v.toLocaleString() : '-';

      let yogiHtml = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[650px] text-xs">
          <thead>
            <tr>
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4">အမြဲနေယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4">မ</th>
              <th class="text-center w-36 py-3.5 px-4" style="color:#cbd5e1;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.04);">ပေါင်း</th>
            </tr>
          </thead>
          <tbody>`;

      let resMale = 0, resFemale = 0, resTotal = 0;

      YOGI_CATS.forEach((cat, idx) => {
        const item = residentData[cat] || { male: 0, female: 0, total: 0 };
        const m = Number(item.male || 0);
        const f = Number(item.female || 0);
        const t = Number(item.total !== undefined ? item.total : (m + f));
        resMale += m; resFemale += f; resTotal += t;

        yogiHtml += `
        <tr onclick="if(typeof window.switchTab==='function') window.switchTab('12Yogi')" class="transition-colors cursor-pointer">
          <td class="text-center py-2.5 px-3 font-mono text-xs" style="color:#64748b;">${idx + 1}</td>
          <td class="font-medium py-2.5 px-4" style="color:#e2e8f0;">${escapeDashHtml(cat)}</td>
          <td class="text-center font-mono font-semibold py-2.5 px-4" style="color:${m ? '#7dd3fc' : '#475569'};">${fmt(m)}</td>
          <td class="text-center font-mono font-semibold py-2.5 px-4" style="color:${f ? '#fda4af' : '#475569'};">${fmt(f)}</td>
          <td class="text-center font-mono font-bold py-2.5 px-4" style="color:${t ? '#f8fafc' : '#475569'};border-left:1px solid rgba(148,163,184,0.12);background:rgba(148,163,184,0.03);">${fmt(t)}</td>
        </tr>`;
      });

      yogiHtml += `
        <tr style="background:#141c28;border-top:1px solid rgba(148,163,184,0.18);">
          <td class="text-center py-3 px-3 font-mono" style="color:#64748b;">-</td>
          <td class="py-3 px-4 font-bold" style="color:#cbd5e1;">ပေါင်း (အမြဲနေ)</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#7dd3fc;">${resMale.toLocaleString()}</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#fda4af;">${resFemale.toLocaleString()}</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#f8fafc;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.05);">${resTotal.toLocaleString()}</td>
        </tr>
          </tbody>
          <thead>
            <tr>
              <th class="w-12 text-center py-3.5 px-3">စဉ်</th>
              <th class="min-w-[200px] py-3.5 px-4">စခန်းဝင်ယောဂီစာရင်း</th>
              <th class="text-center w-28 py-3.5 px-4">ကျား</th>
              <th class="text-center w-28 py-3.5 px-4">မ</th>
              <th class="text-center w-36 py-3.5 px-4" style="color:#cbd5e1;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.04);">ပေါင်း</th>
            </tr>
          </thead>
          <tbody>`;

      let retMale = 0, retFemale = 0, retTotal = 0;

      YOGI_CATS.forEach((cat, idx) => {
        const item = retreatData[cat] || { male: 0, female: 0, total: 0 };
        const m = Number(item.male || 0);
        const f = Number(item.female || 0);
        const t = Number(item.total !== undefined ? item.total : (m + f));
        retMale += m; retFemale += f; retTotal += t;

        yogiHtml += `
        <tr onclick="if(typeof window.switchTab==='function') window.switchTab('13Yogi')" class="transition-colors cursor-pointer">
          <td class="text-center py-2.5 px-3 font-mono text-xs" style="color:#64748b;">${idx + 1}</td>
          <td class="font-medium py-2.5 px-4" style="color:#e2e8f0;">${escapeDashHtml(cat)}</td>
          <td class="text-center font-mono font-semibold py-2.5 px-4" style="color:${m ? '#7dd3fc' : '#475569'};">${fmt(m)}</td>
          <td class="text-center font-mono font-semibold py-2.5 px-4" style="color:${f ? '#fda4af' : '#475569'};">${fmt(f)}</td>
          <td class="text-center font-mono font-bold py-2.5 px-4" style="color:${t ? '#f8fafc' : '#475569'};border-left:1px solid rgba(148,163,184,0.12);background:rgba(148,163,184,0.03);">${fmt(t)}</td>
        </tr>`;
      });

      yogiHtml += `
        <tr style="background:#141c28;border-top:1px solid rgba(148,163,184,0.18);">
          <td class="text-center py-3 px-3 font-mono" style="color:#64748b;">-</td>
          <td class="py-3 px-4 font-bold" style="color:#cbd5e1;">ပေါင်း (စခန်းဝင်)</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#7dd3fc;">${retMale.toLocaleString()}</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#fda4af;">${retFemale.toLocaleString()}</td>
          <td class="text-center font-mono font-bold py-3 px-4" style="color:#f8fafc;border-left:1px solid rgba(148,163,184,0.14);background:rgba(148,163,184,0.05);">${retTotal.toLocaleString()}</td>
        </tr>`;

      const grandMale = resMale + retMale;
      const grandFemale = resFemale + retFemale;
      const grandTotal = resTotal + retTotal;

      yogiHtml += `
        <tr style="background:#161e2c;border-top:1px solid rgba(148,163,184,0.25);">
          <td class="text-center py-4 px-3 font-mono font-bold" style="color:#64748b;">-</td>
          <td class="py-4 px-4">
            <span class="inline-flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style="color:#f8fafc;">
              <i class="fa-solid fa-users" style="color:#fbbf24;"></i> စုစုပေါင်း ယောဂီ
            </span>
          </td>
          <td class="text-center font-mono font-bold py-4 px-4 text-xs" style="color:#7dd3fc;">${grandMale.toLocaleString()}</td>
          <td class="text-center font-mono font-bold py-4 px-4 text-xs" style="color:#fda4af;">${grandFemale.toLocaleString()}</td>
          <td class="text-center font-mono font-extrabold py-4 px-4 text-sm" style="color:#fde68a;border-left:1px solid rgba(148,163,184,0.18);background:rgba(245,158,11,0.06);">${grandTotal.toLocaleString()}</td>
        </tr>
      </tbody></table></div>`;

      yogiTableElem.innerHTML = yogiHtml;
    }
  };

  const hasContentOnScreen = Boolean(
    document.getElementById("home-bank-table")?.querySelector('table')
  );

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

  const shouldShowOverlay = !isSilent && !hasContentOnScreen && !localStorage.getItem(DASH_CACHE_KEY);
  if (typeof window.showLoading === 'function' && shouldShowOverlay) {
    window.showLoading(true);
  }

  try {
    const fetchFunc = window.fetchHomeSummary || window.fetchHomeSummaryAPI;
    if (typeof fetchFunc === 'function') {
      const freshData = await fetchFunc();
      if (fetchToken !== activeDashFetchToken) return;

      if (freshData && freshData.success) {
        const freshHash = JSON.stringify(freshData.data || freshData);
        try { localStorage.setItem(DASH_CACHE_KEY, JSON.stringify(freshData)); } catch (_) {}

        if (freshHash !== lastRenderedDashboardHash || !document.getElementById("home-bank-table")?.querySelector('table')) {
          lastRenderedDashboardHash = freshHash;
          renderHomeData(freshData);
        }
      }
    }
  } catch (error) {
    if (fetchToken !== activeDashFetchToken) return;
    console.warn("Silent background dashboard sync warning:", error);
  } finally {
    if (typeof window.showLoading === 'function' && shouldShowOverlay) {
      window.showLoading(false);
    }
  }
};

window.loadDashboardView = window.renderDashboardView;
window.renderHomeView = window.renderDashboardView;
// === END OF Dashboard.js ===
