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
      
      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td class="text-center py-6 text-amber-500">အစီရင်ခံစာ ဒေတာ မရှိသေးပါ။</td></tr>`;
        return;
      }

      let htmlString = "";

      rows.forEach((r, idx) => {
        // ဒုတိယ Column (Category) တွင် စုစုပေါင်းစာသားများ ပါမပါ စစ်ဆေးခြင်း
        const categoryText = String(r[1] || "");
        const isTotalRow = categoryText.includes("ဝင်ငွေပေါင်း") || 
                           categoryText.includes("ထွက်ငွေပေါင်း") || 
                           categoryText.includes("လက်ကျန်ငွေ");

        let trClass = "";
        
        if (idx === 0) {
          // ခေါင်းစဉ် (Header) Row
          trClass = "bg-[#1a1410] font-black text-amber-300 uppercase tracking-wider";
        } else if (isTotalRow) {
          // 💡 စုစုပေါင်း Row များအတွက် အပေါ်/အောက် မျဉ်းသားခြင်း နှင့် အရောင်တင်ခြင်း
          trClass = "border-t border-b border-amber-500/50 bg-[#1a1410]/60 font-black text-amber-200 shadow-sm";
        } else {
          // ရိုးရိုး Row များအတွက်
          trClass = "hover:bg-amber-500/10 transition-colors";
        }

        let rowHtml = "";
        r.forEach((cell, cIdx) => {
          // စုစုပေါင်း Row ရဲ့ ဂဏန်းတွေဆိုရင် ပိုသိသာအောင် font-bold လုပ်ပေးထားပါတယ်
          const isNumberColumn = cIdx > 1;
          const textAlignment = isNumberColumn ? 'text-right font-mono' : 'text-left';
          const highlightText = (isTotalRow && isNumberColumn) ? 'text-amber-300 font-bold' : '';
          
          rowHtml += `<td class="py-3 px-4 ${textAlignment} ${highlightText}">${cell || ''}</td>`;
        });
        
        htmlString += `<tr class="${trClass}">${rowHtml}</tr>`;
      });

      // Loop ပတ်ပြီးမှ တစ်ခါတည်း DOM ထဲထည့်ခြင်း
      tbody.innerHTML = htmlString;
    };

    // Double-call ဖြစ်နေသော Bug ကို ပြင်ဆင်ထားသော အပိုင်း
    try {
      const data = await window.fetchSheetData("12Rep");
      renderRep(data);
    } catch (error) {
      console.error("Error fetching report data:", error);
      renderRep([]);
    }
    
  } else {
    reportSec.classList.add("hidden");
    systemSec.classList.remove("hidden");
  }
};
