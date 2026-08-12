// ===================================================================
// js/report-system.js - Report & Mindfulness System Handler
// ===================================================================

window.renderReportView = async function(activeTab = "Report") {
  let reportSec = document.getElementById("report-section");
  let systemSec = document.getElementById("system-section");

  // Inject template if not already present in DOM (Fallback for direct calls)
  if (!reportSec || !systemSec) {
    const container = document.getElementById("view-container");
    if (container) {
      const fetchFn = window.fetchTemplate || (async (p) => { const r = await fetch(p); return await r.text(); });
      container.innerHTML = await fetchFn("view/report-system.html");
      reportSec = document.getElementById("report-section");
      systemSec = document.getElementById("system-section");
    }
  }

  if (!reportSec || !systemSec) return;

  if (activeTab === "Report") {
    reportSec.classList.remove("hidden");
    systemSec.classList.add("hidden");

    const renderRep = (rows) => {
      const tbody = document.getElementById("report-table-body");
      if (!tbody) return;

      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td class="text-center py-8 text-amber-500 font-bold"><i class="fa-solid fa-chart-pie mr-2"></i> အစီရင်ခံစာ ဒေတာ မရှိသေးပါ။</td></tr>`;
        return;
      }

      let htmlString = "";

      rows.forEach((r, idx) => {
        if (!Array.isArray(r)) return;

        // ဒုတိယ Column (သို့မဟုတ် ပထမ Column) တွင် စုစုပေါင်း စာသားများ ပါမပါ စစ်ဆေးခြင်း
        const categoryText = String(r[1] || r[0] || "");
        const isTotalRow = categoryText.includes("ဝင်ငွေပေါင်း") || 
                           categoryText.includes("ထွက်ငွေပေါင်း") || 
                           categoryText.includes("လက်ကျန်ငွေ") ||
                           categoryText.includes("စုစုပေါင်း");

        let trClass = "";
        
        if (idx === 0) {
          // ခေါင်းစဉ် (Header) Row
          trClass = "bg-[#1a1410] font-black text-amber-300 uppercase tracking-wider border-b border-amber-900/40";
        } else if (isTotalRow) {
          // စုစုပေါင်း Row များအတွက် အပေါ်/အောက် မျဉ်းသားခြင်း နှင့် အရောင်တင်ခြင်း
          trClass = "border-t border-b border-amber-500/50 bg-[#1a1410]/80 font-black text-amber-200 shadow-sm";
        } else {
          // ရိုးရိုး Row များအတွက်
          trClass = "hover:bg-amber-500/10 transition-colors border-b border-amber-900/20";
        }

        let rowHtml = "";
        r.forEach((cell, cIdx) => {
          const isNumberColumn = cIdx > 1;
          const textAlignment = isNumberColumn ? 'text-right font-mono' : 'text-left';
          const highlightText = (isTotalRow && isNumberColumn) ? 'text-amber-300 font-bold' : '';

          // ဂဏန်းများ ဖြစ်ပါက Comma ဖြင့် လှပစွာ ပြသခြင်း
          let displayVal = cell || '';
          if (isNumberColumn && displayVal !== '' && !isNaN(Number(displayVal))) {
            displayVal = Number(displayVal).toLocaleString();
          }

          rowHtml += `<td class="py-3 px-4 ${textAlignment} ${highlightText}">${displayVal}</td>`;
        });
        
        htmlString += `<tr class="${trClass}">${rowHtml}</tr>`;
      });

      tbody.innerHTML = htmlString;
    };

    try {
      // API Helper သုံး၍ ဒေတာ ခေါ်ယူခြင်း
      let res = typeof window.fetchReportDataAPI === 'function' 
        ? await window.fetchReportDataAPI() 
        : await window.fetchSheetData("12Rep");

      const rows = res && res.data ? res.data : (Array.isArray(res) ? res : []);
      renderRep(rows);
    } catch (error) {
      console.error("Error fetching report data:", error);
      renderRep([]);
    }
    
  } else {
    reportSec.classList.add("hidden");
    systemSec.classList.remove("hidden");
  }
};

// Safety Alias
window.loadReportView = window.renderReportView;
