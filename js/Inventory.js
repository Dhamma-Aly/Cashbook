// js/Inventory.js - Inventory (11Inv) Logic 
let currentInvPage = 1; // 📌 Pagination အတွက် Page ကို မှတ်ရန်

window.renderInventoryView = async function() {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Inventory.html");
  container.innerHTML = await res.text();

  window.currentSheetKey = "11Inv";

  const renderData = (rows) => {
    // Header ၅ ကြောင်းကို ဖြတ်ထုတ်မည်
    let dataRows = rows && rows.length > 5 ? rows.slice(5) : [];
    
    // အလွတ် (Empty rows) များကို ဖယ်ရှားမည်
    dataRows = dataRows.filter(r => r[0] || r[1]);

    // ၁။ 🌟 KPI (စုစုပေါင်း) များကို Data အားလုံးပေါ်မူတည်၍ အရင်တွက်ပါမည် 🌟
    let kitCount = 0, hallCount = 0, simCount = 0, storeCount = 0;
    dataRows.forEach(r => {
      const loc = r[2] || "-";
      const qty = parseInt(r[6]) || 0;
      if (loc.includes("မီးဖို")) kitCount += qty;
      else if (loc.includes("ဓမ္မာရုံ")) hallCount += qty;
      else if (loc.includes("သိမ်")) simCount += qty;
      else storeCount += qty;
    });

    // ၂။ 🌟 နောက်ဆုံးစာကြောင်း (အသစ်ဆုံး) ကို အပေါ်ဆုံးပို့ရန် Reverse လုပ်ပါမည် 🌟
    dataRows.reverse();
    
    // Reverse လုပ်ပြီးသား Data ကို Search နှင့် Export အတွက် သိမ်းပါမည်
    window.currentSheetData = dataRows;

    // ၃။ Pagination ဖြတ်ခြင်း
    const ROWS_PER_PAGE = 30;
    const maxPage = Math.ceil(dataRows.length / ROWS_PER_PAGE) || 1;
    
    // Page နံပါတ် အလွန်အမင်း မသွားစေရန် ထိန်းချုပ်ခြင်း
    if (currentInvPage > maxPage) currentInvPage = maxPage;
    if (currentInvPage < 1) currentInvPage = 1;

    const start = (currentInvPage - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    
    // Page အတွက် အကြောင်း ၃၀ ကို ဖြတ်ယူမည်
    const pageRows = dataRows.slice(start, end);

    const tbody = document.getElementById("inv-table-body");
    tbody.innerHTML = "";

    if (dataRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-amber-500/50">ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
    } else {
      // ၄။ Table ဆွဲခြင်း
      pageRows.forEach((r, idx) => {
        const uid = r[10] || ""; // Column K: real Unique-ID
        // မူလစဉ်နံပါတ် ရှိလျှင်ပြမည်။ မရှိလျှင် လက်ရှိစာမျက်နှာအလိုက် တွက်ချက်ပြမည်။
        const srNo = r[0] || (start + idx + 1); 
        const date = r[1] || "-";
        const loc = r[2] || "-";
        const cat = r[3] || "-";
        const item = r[4] || "-";
        const unit = r[5] || "-";
        const qty = parseInt(r[6]) || 0;
        const note = r[7] || "-";
        const monthYear = r[8] || "-";
        const bookName = r[9] || "11Inv - ပစ္စည်းစာရင်း";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="text-center font-bold text-amber-500/70">${srNo}</td>
          <td class="font-mono text-xs">${date}</td>
          <td class="font-bold text-amber-300">${loc}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">${cat}</span></td>
          <td class="font-semibold text-amber-100">${item}</td>
          <td>${unit}</td>
          <td class="text-right font-mono font-bold text-emerald-400">${qty.toLocaleString()}</td>
          <td class="text-xs text-amber-200/70">${note}</td>
          <td class="font-mono text-xs">${monthYear}</td>
          <td class="text-xs text-amber-500/70">${bookName}</td>
          <td class="text-center right-0 sticky px-3">
            <div class="flex items-center justify-center gap-2.5">
              <button onclick="editInvEntry('${uid}')" class="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-sm" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button onclick="deleteInvEntry('${uid}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    // ၅။ အပေါ်ဆုံးတွင်တွက်ထားသော စုစုပေါင်း KPI များကို ထည့်သွင်းခြင်း
    const kitEl = document.getElementById("kpi-inv-kitchen");
    if(kitEl) kitEl.textContent = kitCount.toLocaleString();
    
    const hallEl = document.getElementById("kpi-inv-dhammahall");
    if(hallEl) hallEl.textContent = hallCount.toLocaleString();
    
    const simEl = document.getElementById("kpi-inv-sim");
    if(simEl) simEl.textContent = simCount.toLocaleString();
    
    const storeEl = document.getElementById("kpi-inv-store");
    if(storeEl) storeEl.textContent = storeCount.toLocaleString();

    // Inventory Pagination numbers update & Button States
    const totalInv = dataRows.length;
    const invStartEl = document.getElementById("inv-page-start");
    const invEndEl = document.getElementById("inv-page-end");
    const invTotalEl = document.getElementById("inv-total-entries");

    if (invStartEl) invStartEl.textContent = totalInv ? start + 1 : 0;
    if (invEndEl) invEndEl.textContent = Math.min(end, totalInv);
    if (invTotalEl) invTotalEl.textContent = totalInv;

    // Previous / Next Button များကို Enable/Disable လုပ်ပေးခြင်း
    const btnPrev = document.getElementById("btn-inv-prev-page");
    const btnNext = document.getElementById("btn-inv-next-page");
    if (btnPrev) btnPrev.disabled = currentInvPage <= 1;
    if (btnNext) btnNext.disabled = currentInvPage >= maxPage;
  };

  const data = await window.fetchSheetData("11Inv");
  if(data) renderData(data);
};

// ⏭️ Next Page Function
window.nextInvPage = function() {
  const ROWS_PER_PAGE = 30;
  const totalRows = window.currentSheetData ? window.currentSheetData.length : 0;
  const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
  if (currentInvPage < maxPage) {
    currentInvPage++;
    window.renderInventoryView();
  }
};

// ◀️ Previous Page Function
window.prevInvPage = function() {
  if (currentInvPage > 1) {
    currentInvPage--;
    window.renderInventoryView();
  }
};

window.openAddInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  document.getElementById("inv-entry-form").reset();
  document.getElementById("inv-uniqueId").value = "";
  document.getElementById("inv-date").valueAsDate = new Date();
  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း အသစ် ထည့်သွင်းရန်";

  const locSelect = document.getElementById("inv-location");
  if (locSelect && window.APP_CONFIG && window.APP_CONFIG.INVENTORY_LOCATIONS) {
    locSelect.innerHTML = "";
    window.APP_CONFIG.INVENTORY_LOCATIONS.forEach(l => locSelect.add(new Option(l, l)));
  }

  const catSelect = document.getElementById("inv-category");
  if (catSelect && window.APP_CONFIG && window.APP_CONFIG.INVENTORY_CATEGORIES) {
    catSelect.innerHTML = "";
    window.APP_CONFIG.INVENTORY_CATEGORIES.forEach(c => catSelect.add(new Option(c, c)));
  }

  const unitSelect = document.getElementById("inv-unit");
  if (unitSelect && window.APP_CONFIG && window.APP_CONFIG.INVENTORY_UNITS) {
    unitSelect.innerHTML = "";
    window.APP_CONFIG.INVENTORY_UNITS.forEach(u => unitSelect.add(new Option(u, u)));
  }

  modal.classList.remove("hidden");
};

window.closeInvModal = function() {
  document.getElementById("inv-entry-modal").classList.add("hidden");
};

window.saveInvEntryForm = async function(event) {
  event.preventDefault();
  const uniqueId = document.getElementById("inv-uniqueId").value;
  const date = document.getElementById("inv-date").value;
  const loc = document.getElementById("inv-location").value;
  const cat = document.getElementById("inv-category").value;
  const unit = document.getElementById("inv-unit").value;
  const qty = parseInt(document.getElementById("inv-qty").value) || 0;
  const desc = document.getElementById("inv-desc").value;
  const note = document.getElementById("inv-note").value;

  const monthYear = date ? date.substring(0, 7) : "";
  const finalUniqueId = uniqueId || `INV-${Date.now()}`;
  const rowData = ["", date, loc, cat, desc, unit, qty, note, monthYear, "11Inv - ပစ္စည်းစာရင်း", finalUniqueId];

  window.closeInvModal();
  document.getElementById("loading-overlay").classList.remove("hidden");

  try {
    await window.saveSheetEntry("11Inv", rowData, uniqueId || null);
    await window.renderInventoryView();
  } catch (err) {
    alert("ပစ္စည်းစာရင်း သိမ်းဆည်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    document.getElementById("loading-overlay").classList.add("hidden");
  }
};

window.editInvEntry = function(uid) {
  const r = (window.currentSheetData || []).find(row => String(row[10]) === String(uid));
  if (!r) return;

  window.openAddInvModal();
  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း ပြင်ဆင်ရန်";
  document.getElementById("inv-uniqueId").value = uid;
  document.getElementById("inv-date").value = r[1] || "";
  
  const locSelect = document.getElementById("inv-location");
  if (locSelect) locSelect.value = r[2] || "";
  
  const catSelect = document.getElementById("inv-category");
  if (catSelect) catSelect.value = r[3] || "";
  
  document.getElementById("inv-desc").value = r[4] || "";
  
  const unitSelect = document.getElementById("inv-unit");
  if (unitSelect) unitSelect.value = r[5] || "";
  
  document.getElementById("inv-qty").value = parseInt(r[6]) || 0;
  document.getElementById("inv-note").value = r[7] || "";
};

window.deleteInvEntry = async function(uid) {
  if (!confirm("ဤပစ္စည်းစာရင်းကို ဖျက်ရန် သေချာပါသလား?")) return;
  document.getElementById("loading-overlay").classList.remove("hidden");
  try {
    await window.deleteSheetEntry("11Inv", uid);
    await window.renderInventoryView();
  } catch (err) {
    alert("ဖျက်သိမ်းခြင်း မအောင်မြင်ပါ: " + err.message);
  } finally {
    document.getElementById("loading-overlay").classList.add("hidden");
  }
};

window.exportInventoryCSV = function() {
  const rows = window.currentSheetData;
  if (!rows || rows.length === 0) return alert("Export လုပ်ရန် ဒေတာ မရှိပါ။");

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  rows.forEach(r => {
    csvContent += r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `11Inv_Export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.onInvSearchInput = function() {
  const query = document.getElementById("inv-search-input").value.toLowerCase();
  const tbody = document.getElementById("inv-table-body");
  if (!tbody) return;

  const trs = tbody.getElementsByTagName("tr");
  Array.from(trs).forEach(tr => {
    // သတိပြုရန် - လက်ရှိ Page (အကြောင်း ၃၀) အတွင်း၌သာ ရှာပေးပါမည်။
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(query) ? "" : "none";
  });
};
