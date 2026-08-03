// js/Dashboard.js - Home Dashboard View Renderer (Enhanced Aesthetic Styling)
window.renderDashboardView = async function() {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Dashboard.html");
  container.innerHTML = await res.text();

  const renderHomeData = (rows) => {
    if (!rows || rows.length < 3) {
      document.getElementById("home-bank-table").innerHTML = 
        `<div class="p-8 text-center text-amber-500/50 text-sm">ဒေတာ မရှိသေးပါ။</div>`;
      return;
    }

    const headerRow = rows[2] || [];
    const dataRows = rows.slice(3);

    let totalBank = 0;
    let totalCash = 0;
    let totalFund = 0;
    let totalCount = 0;

    // Header Column Titles from Sheet Row 3
    const colSr = headerRow[0] || "စဉ်";
    const colName = headerRow[1] || "ဘဏ်စာရင်း";
    const colBank = headerRow[2] || "ဘဏ်ရှိငွေပေါင်း";
    const colU1 = headerRow[3] || "USER 1";
    const colU2 = headerRow[4] || "USER 2";
    const colU3 = headerRow[5] || "USER 3";
    const colUTotal = headerRow[6] || "USER TOTAL";
    const colAccNo = headerRow[7] || "ဘဏ်စာရင်းအမှတ်";

    let tableHtml = `
    <div class="overflow-x-auto rounded-xl border border-amber-900/30 shadow-2xl">
      <table class="table-lg w-full text-left border-collapse min-w-[1100px]">
        <thead>
          <tr class="bg-[#1a1410] border-b border-amber-500/40 text-amber-300 text-xs uppercase font-extrabold tracking-wider">
            <th class="w-14 text-center py-4 px-3 text-amber-400">${colSr}</th>
            <th class="min-w-[190px] py-4 px-4 text-amber-200">${colName}</th>
            <!-- 💡 ဘဏ်ရှိငွေပေါင်း Column Accent (Sky Blue) -->
            <th class="text-right min-w-[140px] py-4 px-4 text-sky-300 bg-sky-950/40 border-x border-sky-500/20">${colBank}</th>
            <th class="text-right min-w-[105px] py-4 px-4 text-emerald-300/70">${colU1}</th>
            <th class="text-right min-w-[105px] py-4 px-4 text-emerald-300/70">${colU2}</th>
            <th class="text-right min-w-[105px] py-4 px-4 text-emerald-300/70">${colU3}</th>
            <!-- 💡 USER TOTAL Column Accent (Emerald Green) -->
            <th class="text-right min-w-[140px] py-4 px-4 text-emerald-400 bg-emerald-950/40 border-x border-emerald-500/20 font-black">${colUTotal}</th>
            <th class="text-center min-w-[180px] py-4 px-4 text-amber-400/80">${colAccNo}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-amber-900/20 text-xs">`;

    if (dataRows.length > 0) {
      dataRows.forEach((r, idx) => {
        if (!r[0] && !r[1] && !r[2] && !r[3] && !r[6]) return;

        const srNo = r[0] || (idx + 1);
        const name = r[1] || "-";
        const bankVal = parseFloat((r[2] || "0").toString().replace(/,/g, "")) || 0;
        const u1Val = parseFloat((r[3] || "0").toString().replace(/,/g, "")) || 0;
        const u2Val = parseFloat((r[4] || "0").toString().replace(/,/g, "")) || 0;
        const u3Val = parseFloat((r[5] || "0").toString().replace(/,/g, "")) || 0;
        
        const userTotalVal = r[6] !== undefined && r[6] !== "" 
          ? (parseFloat((r[6] || "0").toString().replace(/,/g, "")) || 0)
          : (u1Val + u2Val + u3Val);

        const rawAccNo = r[7] || "";
        const accNoBadge = (rawAccNo && rawAccNo !== "-") 
          ? `<span class="inline-block px-2.5 py-1 bg-[#0d0a08] border border-amber-700/40 text-amber-300/90 font-mono text-[11px] rounded-lg tracking-widest shadow-inner">${rawAccNo}</span>`
          : `<span class="text-amber-500/30 font-bold">-</span>`;

        const rowSum = bankVal + userTotalVal;
        const isTotalRow = String(name).includes("စုစုပေါင်း") || String(srNo).includes("စုစုပေါင်း");

        if (isTotalRow) {
          // 💡 စုစုပေါင်း Summary Row Accent
          tableHtml += `
          <tr class="bg-gradient-to-r from-amber-950/90 via-[#211810] to-amber-950/90 border-t-2 border-b-2 border-amber-500/60 font-black text-amber-200 text-sm shadow-xl">
            <td class="text-center py-4 px-3 font-mono text-amber-400 font-bold">${srNo}</td>
            <td class="py-4 px-4 font-black text-gold-gradient text-base filter drop-shadow">${name}</td>
            <!-- ဘဏ်ရှိငွေပေါင်း Total (Sky) -->
            <td class="text-right font-mono text-sky-300 font-bold py-4 px-4 bg-sky-950/50 border-x border-sky-500/30 text-base">${bankVal ? bankVal.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-4 px-4">${u1Val ? u1Val.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-4 px-4">${u2Val ? u2Val.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-4 px-4">${u3Val ? u3Val.toLocaleString() : "0"}</td>
            <!-- USER TOTAL Total (Emerald) -->
            <td class="text-right font-mono text-emerald-400 font-black py-4 px-4 bg-emerald-950/50 border-x border-emerald-500/30 text-base">${userTotalVal ? userTotalVal.toLocaleString() : "0"}</td>
            <td class="text-center py-4 px-4">${accNoBadge}</td>
          </tr>`;
        } else {
          totalBank += bankVal;
          totalCash += userTotalVal;
          totalFund += rowSum;
          totalCount++;

          tableHtml += `
          <tr class="hover:bg-amber-500/10 transition-all duration-200 group">
            <td class="text-center font-bold text-amber-500/70 py-3.5 px-3 font-mono">${srNo}</td>
            <td class="font-bold text-amber-200 group-hover:text-amber-100 py-3.5 px-4">${name}</td>
            <!-- 💡 ဘဏ်ရှိငွေပေါင်း Cell Accent (Sky Blue) -->
            <td class="text-right font-mono text-sky-300 font-bold py-3.5 px-4 bg-sky-950/20 border-x border-sky-500/10 group-hover:bg-sky-950/30">${bankVal ? bankVal.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3.5 px-4">${u1Val ? u1Val.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3.5 px-4">${u2Val ? u2Val.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3.5 px-4">${u3Val ? u3Val.toLocaleString() : "-"}</td>
            <!-- 💡 USER TOTAL Cell Accent (Emerald Green) -->
            <td class="text-right font-mono text-emerald-400 font-bold py-3.5 px-4 bg-emerald-950/20 border-x border-emerald-500/10 group-hover:bg-emerald-950/30">${userTotalVal ? userTotalVal.toLocaleString() : "-"}</td>
            <td class="text-center py-3.5 px-4">${accNoBadge}</td>
          </tr>`;
        }
      });
    } else {
      tableHtml += `<tr><td colspan="8" class="text-center py-8 text-amber-500/60">ဒေတာ မရှိသေးပါ။</td></tr>`;
    }

    tableHtml += `</tbody></table></div>`;
    document.getElementById("home-bank-table").innerHTML = tableHtml;

    // Top KPI Cards Calculation
    const kpiRow = rows[1] || [];
    const kpiFund = parseFloat((kpiRow[1] || totalFund).toString().replace(/,/g, "")) || totalFund;
    const kpiBank = parseFloat((kpiRow[2] || totalBank).toString().replace(/,/g, "")) || totalBank;
    const kpiCash = parseFloat((kpiRow[3] || totalCash).toString().replace(/,/g, "")) || totalCash;
    const kpiCount = parseInt(kpiRow[4]) || totalCount;

    document.getElementById("kpi-home-fund").textContent = `${kpiFund.toLocaleString()} MMK`;
    document.getElementById("kpi-home-bank").textContent = `${kpiBank.toLocaleString()} MMK`;
    document.getElementById("kpi-home-cash").textContent = `${kpiCash.toLocaleString()} MMK`;
    document.getElementById("kpi-home-count").textContent = kpiCount;
  };

  await window.fetchSheetData("Home", renderHomeData).then(data => renderHomeData(data));
};
