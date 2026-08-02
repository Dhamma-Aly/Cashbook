// js/report-system.js - Report ("ရိပ်သာ အထွေထွေရန်ပုံငွေစာရင်း အကျဉ်းချုပ်",
// 12Rep!A1:P15) + System Settings. Both live in one module since they're
// grouped under "System Controls" in the sidebar; view/report-system.html
// has both sections and this file just shows/hides the right one.

async function renderReportSystemView() {
  const requestedSheet = currentSheet;

  await loadView("report-system");

  const reportSection = document.getElementById("report-section");
  const systemSection = document.getElementById("system-section");

  if (currentSheet === "System") {
    if (reportSection) reportSection.classList.add("hidden");
    if (systemSection) systemSection.classList.remove("hidden");
    return;
  }

  // currentSheet === "Report"
  if (systemSection) systemSection.classList.add("hidden");
  if (reportSection) reportSection.classList.remove("hidden");

  try {
    const rows = await fetchReportData();
    if (currentSheet === requestedSheet) renderReportTable(rows);
  } catch (err) {
    console.error("Report load error:", err);
    const tbody = document.getElementById("report-table-body");
    if (tbody) tbody.innerHTML = `<tr><td class="text-center py-6 text-rose-400 font-bold">ဒေတာ ချိတ်ဆက်မှု မအောင်မြင်ပါ။</td></tr>`;
  }
}

function renderReportTable(rows) {
  const tbody = document.getElementById("report-table-body");
  if (!tbody) return;
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td class="text-center py-6 text-amber-500/50">ဒေတာ မရှိသေးပါ။</td></tr>`;
    return;
  }

  // Row indices (0-based) with special meaning per spreadsheet layout:
  //   row 0        -> header
  //   row 4 (R5)   -> ဝင်ငွေ စုစုပေါင်း (income total)
  //   row 11 (R12) -> ထွက်ငွေ စုစုပေါင်း (expense total)
  //   row 12 (R13) -> လက်ကျန်ငွေ စုစုပေါင်း (balance total)
  const INCOME_TOTAL = 4, EXPENSE_TOTAL = 11, BALANCE_TOTAL = 12;

  let html = "";
  rows.forEach((row, ri) => {
    let rowClass, cellClass, borderClass = "border-b border-amber-900/10";

    if (ri === 0) {
      rowClass = "bg-[#1a1410] sticky top-0";
      cellClass = "px-4 py-3 font-black text-amber-400 uppercase text-xs tracking-wide";
    } else if (ri === INCOME_TOTAL) {
      rowClass = "bg-emerald-500/10 font-black text-emerald-300";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-emerald-600/50 border-b border-amber-900/10";
    } else if (ri === EXPENSE_TOTAL) {
      rowClass = "bg-rose-500/10 font-black text-rose-300";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-rose-600/50 border-b border-amber-900/10";
    } else if (ri === BALANCE_TOTAL) {
      rowClass = "bg-amber-500/10 font-black text-amber-300 text-base";
      cellClass = "px-4 py-3 font-mono";
      borderClass = "border-t-2 border-amber-600/60 border-b-2 border-amber-600/60";
    } else if (ri < INCOME_TOTAL) {
      rowClass = "bg-emerald-500/[0.03] text-emerald-100/90 hover:bg-emerald-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    } else if (ri < EXPENSE_TOTAL) {
      rowClass = "bg-rose-500/[0.03] text-rose-100/90 hover:bg-rose-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    } else {
      rowClass = "text-amber-100/90 hover:bg-amber-500/5";
      cellClass = "px-4 py-2.5 font-mono";
    }

    html += `<tr class="${rowClass} ${borderClass}">`;
    row.forEach((cell) => {
      const display = cell !== "" && cell !== null && !isNaN(cell) && cell !== "" ? (typeof cell === "number" ? cell.toLocaleString() : cell) : (cell || "");
      html += `<td class="${cellClass}">${display}</td>`;
    });
    html += `</tr>`;
  });

  tbody.innerHTML = html;
}