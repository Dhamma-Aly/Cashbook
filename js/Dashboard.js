// js/Dashboard.js - Home Dashboard View Renderer
window.renderDashboardView = async function() {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Dashboard.html");
  container.innerHTML = await res.text();

  const renderHomeData = (rows) => {
    let totalFund = 0, totalBank = 0, totalCash = 0, totalCount = 0;
    
    let tableHtml = `<table class="table-lg w-full text-left border-collapse">
      <thead>
        <tr>
          <th>စဉ်</th>
          <th>ရန်ပုံငွေအမည်</th>
          <th class="text-right">ဘဏ်ရှိငွေ</th>
          <th class="text-right">လက်ရှိငွေ</th>
          <th class="text-right">စုစုပေါင်း</th>
        </tr>
      </thead>
      <tbody>`;

    // Headers are in rows 0..4, data rows start at index 5 or 2 depending on layout
    const dataRows = rows && rows.length > 2 ? rows.slice(2) : [];

    if (dataRows.length > 0) {
      dataRows.forEach((r, idx) => {
        if (!r[0] && !r[1]) return;
        const name = r[1] || r[0] || "-";
        const bank = parseFloat((r[2] || "0").toString().replace(/,/g, "")) || 0;
        const cash = parseFloat((r[3] || "0").toString().replace(/,/g, "")) || 0;
        const sum = bank + cash;

        totalBank += bank;
        totalCash += cash;
        totalFund += sum;
        totalCount++;

        tableHtml += `<tr>
          <td class="text-center font-bold">${idx + 1}</td>
          <td class="font-bold text-amber-200">${name}</td>
          <td class="text-right font-mono text-sky-300">${bank.toLocaleString()}</td>
          <td class="text-right font-mono text-emerald-300">${cash.toLocaleString()}</td>
          <td class="text-right font-mono font-bold text-amber-400">${sum.toLocaleString()} MMK</td>
        </tr>`;
      });
    } else {
      tableHtml += `<tr><td colspan="5" class="text-center py-6 text-amber-500/60">ဒေတာ မရှိသေးပါ။</td></tr>`;
    }

    tableHtml += `</tbody></table>`;
    document.getElementById("home-bank-table").innerHTML = tableHtml;

    document.getElementById("kpi-home-fund").textContent = `${totalFund.toLocaleString()} MMK`;
    document.getElementById("kpi-home-bank").textContent = `${totalBank.toLocaleString()} MMK`;
    document.getElementById("kpi-home-cash").textContent = `${totalCash.toLocaleString()} MMK`;
    document.getElementById("kpi-home-count").textContent = totalCount;
  };

  await window.fetchSheetData("Home", renderHomeData).then(data => renderHomeData(data));
};