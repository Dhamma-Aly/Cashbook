// js/Banks.js - Bank Group Table Renderer
window.renderBankView = async function(sheetKey) {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Banks.html");
  container.innerHTML = await res.text();

  window.currentSheetKey = sheetKey;
  window.currentSheetData = [];

  const renderData = (rows) => {
    // Header rows 1..5. Actual transactions start at index 5
    const dataRows = rows && rows.length > 5 ? rows.slice(5) : [];
    window.currentSheetData = dataRows; // Search/Export လုပ်ဖို့ သိမ်းထားပေးမယ်

    let totalInc = 0, totalExp = 0, totalBal = 0;
    let processedData = [];

    // ၁။ စုစုပေါင်းပေါင်းခြင်းနှင့် Running Balance အရင်တွက်ပါမည် (Data အားလုံးအတွက်)
    dataRows.forEach((r, idx) => {
      if (!r[0] && !r[1]) return; // အလွတ်ဖြစ်နေလျှင် ကျော်မည်

      const incomeVal = parseFloat((r[7] || "0").toString().replace(/,/g, "")) || 0;
      const expenseVal = parseFloat((r[8] || "0").toString().replace(/,/g, "")) || 0;
      
      totalInc += incomeVal;
      totalExp += expenseVal;
      totalBal += (incomeVal - expenseVal);

      // တွက်ပြီးသား အချက်အလက်တွေကို Object အနေနဲ့ ပြန်စုထားမယ်
      processedData.push({
        rawRow: r,
        index: idx,
        incomeVal: incomeVal,
        expenseVal: expenseVal,
        runningBalance: totalBal
      });
    });

    // 🌟 ဤနေရာတွင် REVERSE လုပ်ပါမည် 🌟
    // နောက်ဆုံး Transaction ကို အပေါ်ဆုံး (ပထမဆုံး) သို့ ပို့ရန်
    processedData.reverse();
    // 🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟

    // ၂။ Pagination ဖြတ်ပါမည်
    const ROWS_PER_PAGE = 30;
    const currentPage = 1; // နောက်မှ Next/Prev ထည့်ရင် ပြောင်းမည်
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    
    // တွက်ပြီးသား processedData ကိုမှ ၃၀ စာ ဖြတ်ထုတ်ပါမည်
    const pageRows = processedData.slice(start, end);

    const tbody = document.getElementById("table-body");
    let tableHTML = ""; 

    if (processedData.length === 0) {
      tableHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;
    } else {
      // ၃။ Table ဆွဲပါမည်
      pageRows.forEach((item) => {
        const r = item.rawRow;
        
        const uid = r[12] || ""; // Column M
        const srNo = r[0] || (item.index + 1);
        const date = r[1] || "-";
        const type = r[2] || "-";
        const subcat = r[3] || "-";
        const voucher = r[4] || "-";
        const desc = r[5] || "-";
        const receiver = r[6] || "-";
        
        const monthYear = r[10] || "-";
        const bookName = r[11] || (window.APP_CONFIG?.BOOKS?.[sheetKey]) || sheetKey;

        tableHTML += `
          <tr>
            <td class="text-center font-bold text-amber-500/70">${srNo}</td>
            <td class="font-mono text-xs">${date}</td>
            <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${type === 'ဝင်ငွေ' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">${type}</span></td>
            <td class="font-semibold text-amber-200">${subcat}</td>
            <td class="font-mono text-xs">${voucher}</td>
            <td class="whitespace-normal max-w-xs">${desc}</td>
            <td>${receiver}</td>
            <td class="text-right font-mono text-emerald-400 font-semibold">${item.incomeVal ? item.incomeVal.toLocaleString() : '-'}</td>
            <td class="text-right font-mono text-rose-400 font-semibold">${item.expenseVal ? item.expenseVal.toLocaleString() : '-'}</td>
            <td class="text-right font-mono font-bold text-amber-300">${item.runningBalance.toLocaleString()}</td>
            <td class="font-mono text-xs">${monthYear}</td>
            <td class="text-xs text-amber-500/70">${bookName}</td>
            <td class="text-center right-0 sticky px-3">
              <div class="flex items-center justify-center gap-2.5">
                <button onclick="editEntry('${uid}')" class="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-sm" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteEntry('${uid}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      });
    }

    tbody.innerHTML = tableHTML;

    // ၄။ KPI အချက်အလက်များ Update လုပ်ခြင်း (Data အားလုံး၏ စုစုပေါင်းများကို ပြပါမည်)
    document.getElementById("kpi-income").textContent = `${totalInc.toLocaleString()} MMK`;
    document.getElementById("kpi-expense").textContent = `${totalExp.toLocaleString()} MMK`;
    document.getElementById("kpi-balance").textContent = `${totalBal.toLocaleString()} MMK`;
    document.getElementById("kpi-count").textContent = processedData.length;

    // Pagination numbers update
    const pageStartEl = document.getElementById("page-start");
    const pageEndEl = document.getElementById("page-end");
    const totalEntriesEl = document.getElementById("total-entries");
    
    if (pageStartEl) pageStartEl.textContent = processedData.length ? start + 1 : 0;
    if (pageEndEl) pageEndEl.textContent = Math.min(end, processedData.length);
    if (totalEntriesEl) totalEntriesEl.textContent = processedData.length;
  };

  try {
    const data = await window.fetchSheetData(sheetKey);
    renderData(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    renderData([]); 
  }
};

window.onLedgerSearchInput = function() {
  const query = document.getElementById("search-input").value.toLowerCase();
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const trs = tbody.getElementsByTagName("tr");
  Array.from(trs).forEach(tr => {
    // သတိပြုရန် - ဤနည်းလမ်းသည် လက်ရှိ Page ပေါ်ရှိ ၃၀ ကြောင်းကိုသာ ရှာပေးမည်ဖြစ်သည်။
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(query) ? "" : "none";
  });
};
