// js/report-system.js - Report & Mindfulness System Handler
window.renderReportView = async function(activeTab = "Report") {
  const container = document.getElementById("view-container");
  const res = await fetch("view/report-system.html");
  container.innerHTML = await res.text();

  const reportSec = document.getElementById("report-section");
  const systemSec = document.getElementById("system-section");

  if (activeTab === "Report") {
    reportSec.classList.remove("hidden");
    systemSec.classList.add("hidden");

    const renderRep = (rows) => {
      const tbody = document.getElementById("report-table-body");
      tbody.innerHTML = "";
      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td class="text-center py-6 text-amber-500">အစီရင်ခံစာ ဒေတာ မရှိသေးပါ။</td></tr>`;
        return;
      }
      rows.forEach((r, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.className = "bg-[#1a1410] font-black text-amber-300";
        let rowHtml = "";
        r.forEach((cell, cIdx) => {
          rowHtml += `<td class="${cIdx > 1 ? 'text-right font-mono' : ''}">${cell || ''}</td>`;
        });
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
      });
    };

    await window.fetchSheetData("12Rep", renderRep).then(data => renderRep(data));
  } else {
    reportSec.classList.add("hidden");
    systemSec.classList.remove("hidden");
  }
};