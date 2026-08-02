// js/dashboard.js - Home Dashboard ("Be Mindful" + fund summary table)
// Loads view/dashboard.html into #view-container, then fills it with
// data from the "home" backend action (see js/api.js: fetchHomeDashboard).

async function renderHomeDashboard() {
  const requestedSheet = currentSheet;

  await loadView("Dashboard");

  const applyData = (data) => {
    renderHomeCards(data.cards || []);
    renderHomeBankTable(data.table || []);
  };

  if (homeCache) applyData(homeCache);

  try {
    const fresh = await fetchHomeDashboard();
    homeCache = fresh;
    if (currentSheet === requestedSheet) applyData(fresh);
  } catch (err) {
    console.error("Home dashboard load error:", err);
    if (!homeCache) {
      const box = document.getElementById("home-bank-table");
      if (box) box.innerHTML = `<div class="p-8 text-center text-rose-400 text-xs font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</div>`;
    }
  }
}

// 💡 Top 4 KPI cards, sourced from Home!B2:E2 (order: fund total, bank
// total, cash-on-hand total, line count).
function renderHomeCards(cards) {
  const fund = cards[0];
  const bank = cards[1];
  const cash = cards[2];
  const count = cards[3];

  const fmt = (v) => (v !== undefined && v !== null && v !== "" && !isNaN(v)) ? Number(v).toLocaleString() : (v || "0");

  setText("kpi-home-fund", fmt(fund) + " MMK");
  setText("kpi-home-bank", fmt(bank) + " MMK");
  setText("kpi-home-cash", fmt(cash) + " MMK");
  setText("kpi-home-count", fmt(count));
}

function renderHomeBankTable(rows) {
  const box = document.getElementById("home-bank-table");
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = `<div class="p-8 text-center text-amber-500/50 text-xs">စာရင်း မရှိသေးပါ။</div>`;
    return;
  }
  const header = rows[0];
  const body = rows.slice(1);

  // 💡 Give the "ဘဏ်ရှိငွေပေါင်း" (bank-balance total) column its own
  // accent color so it stands out from the rest of the numeric columns.
  const bankColIdx = header.findIndex((h) => String(h || "").includes("ဘဏ်ရှိငွေ"));

  let html = `<table class="table-lg w-full text-left border-collapse text-sm"><thead><tr>`;
  header.forEach((h, i) => {
    const isBankCol = i === bankColIdx;
    html += `<th class="px-4 py-3.5 sticky top-0 bg-[#1a1410] font-bold uppercase text-xs tracking-wide ${i >= 2 ? 'text-right' : ''} ${isBankCol ? 'text-sky-400' : 'text-amber-400/90'}">${h}</th>`;
  });
  html += `</tr></thead><tbody>`;

  body.forEach((row, ri) => {
    const isTotal = ri === body.length - 1;
    html += `<tr class="${isTotal ? 'font-black text-amber-300 bg-amber-500/5 border-t-2 border-amber-600/40 text-base' : 'border-b border-amber-900/10 hover:bg-amber-500/5'}">`;
    row.forEach((cell, ci) => {
      const isNumeric = ci >= 2;
      const isBankCol = ci === bankColIdx;
      const display = isNumeric && cell !== "" && !isNaN(cell) ? Number(cell).toLocaleString() : cell;
      const colorClass = isBankCol ? (isTotal ? 'text-sky-300' : 'text-sky-400 font-bold') : '';
      html += `<td class="px-4 py-3 font-mono ${isNumeric ? 'text-right' : ''} ${!isNumeric ? 'font-sans' : ''} ${colorClass}">${display}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  box.innerHTML = html;
}