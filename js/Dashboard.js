// js/Dashboard.js - Home Dashboard View Renderer (A3:H12 Exact Layout)
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

    // Row 3 (index 2 in 0-based array) is Header (A3:H3)
    // Rows 4..12 (index 3..11) are Data Rows (A4:H12)
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
    const colU1 = headerRow[3] || "User 1";
    const colU2 = headerRow[4] || "User 2";
    const colU3 = headerRow[5] || "User 3";
    const colUTotal = headerRow[6] || "User Total";
    const colAccNo = headerRow[7] || "ဘဏ်စာရင်းအမှတ်";

    let tableHtml = `
    <div class="overflow-x-auto">
      <table class="table-lg w-full text-left border-collapse min-w-[1050px]">
        <thead>
          <tr class="bg-[#1a1410] border-b border-amber-500/40 text-amber-300 text-xs uppercase font-extrabold">
            <th class="w-12 text-center py-3.5 px-3">${colSr}</th>
            <th class="min-w-[180px] py-3.5 px-4">${colName}</th>
            <th class="text-right min-w-[130px] py-3.5 px-4 text-sky-300">${colBank}</th>
            <th class="text-right min-w-[100px] py-3.5 px-4 text-emerald-300/80">${colU1}</th>
            <th class="text-right min-w-[100px] py-3.5 px-4 text-emerald-300/80">${colU2}</th>
            <th class="text-right min-w-[100px] py-3.5 px-4 text-emerald-300/80">${colU3}</th>
            <th class="text-right min-w-[130px] py-3.5 px-4 text-emerald-400 font-bold">${colUTotal}</th>
            <th class="text-center min-w-[150px] py-3.5 px-4 text-amber-400/80">${colAccNo}</th>
          </tr>
        </thead>
        <tbody>`;

    if (dataRows.length > 0) {
      dataRows.forEach((r, idx) => {
        // Ignore empty rows
        if (!r[0] && !r[1] && !r[2] && !r[3] && !r[6]) return;

        const srNo = r[0] || (idx + 1);
        const name = r[1] || "-";
        const bankVal = parseFloat((r[2] || "0").toString().replace(/,/g, "")) || 0;
        const u1Val = parseFloat((r[3] || "0").toString().replace(/,/g, "")) || 0;
        const u2Val = parseFloat((r[4] || "0").toString().replace(/,/g, "")) || 0;
        const u3Val = parseFloat((r[5] || "0").toString().replace(/,/g, "")) || 0;
        
        // User Total from Col G or calculated sum
        const userTotalVal = r[6] !== undefined && r[6] !== "" 
          ? (parseFloat((r[6] || "0").toString().replace(/,/g, "")) || 0)
          : (u1Val + u2Val + u3Val);

        const accNo = r[7] || "-";
        const rowSum = bankVal + userTotalVal;

        const isTotalRow = String(name).includes("စုစုပေါင်း") || String(srNo).includes("စုစုပေါင်း");

        if (isTotalRow) {
          // Bottom Summary Row (Highlight)
          tableHtml += `
          <tr class="bg-amber-950/60 border-t-2 border-b-2 border-amber-500/50 font-black text-amber-300 text-sm">
            <td class="text-center py-3.5 px-3">${srNo}</td>
            <td class="py-3.5 px-4 font-black text-gold-gradient">${name}</td>
            <td class="text-right font-mono text-sky-300 py-3.5 px-4">${bankVal ? bankVal.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-3.5 px-4">${u1Val ? u1Val.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-3.5 px-4">${u2Val ? u2Val.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-300/80 py-3.5 px-4">${u3Val ? u3Val.toLocaleString() : "0"}</td>
            <td class="text-right font-mono text-emerald-400 py-3.5 px-4">${userTotalVal ? userTotalVal.toLocaleString() : "0"}</td>
            <td class="text-center font-mono text-xs text-amber-400/80 py-3.5 px-4">${accNo}</td>
          </tr>`;
        } else {
          totalBank += bankVal;
          totalCash += userTotalVal;
          totalFund += rowSum;
          totalCount++;

          tableHtml += `
          <tr class="hover:bg-amber-500/10 transition-colors border-b border-amber-900/20">
            <td class="text-center font-bold text-amber-500/70 py-3 px-3">${srNo}</td>
            <td class="font-bold text-amber-200 py-3 px-4">${name}</td>
            <td class="text-right font-mono text-sky-300 font-semibold py-3 px-4">${bankVal ? bankVal.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3 px-4">${u1Val ? u1Val.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3 px-4">${u2Val ? u2Val.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-200/70 py-3 px-4">${u3Val ? u3Val.toLocaleString() : "-"}</td>
            <td class="text-right font-mono text-emerald-400 font-bold py-3 px-4">${userTotalVal ? userTotalVal.toLocaleString() : "-"}</td>
            <td class="text-center font-mono text-xs text-amber-400/70 py-3 px-4">${accNo}</td>
          </tr>`;
        }
      });
    } else {
      tableHtml += `<tr><td colspan="8" class="text-center py-6 text-amber-500/60">ဒေတာ မရှိသေးပါ။</td></tr>`;
    }

    tableHtml += `</tbody></table></div>`;
    document.getElementById("home-bank-table").innerHTML = tableHtml;

    // Top KPI Cards Calculation (Read from Row 2 or compute)
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
