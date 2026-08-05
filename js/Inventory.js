// js/Inventory.js - Inventory (11Inv) Logic
window.renderInventoryView = async function() {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Inventory.html");
  container.innerHTML = await res.text();

  window.currentSheetKey = "11Inv";

  const renderData = (rows) => {
    const dataRows = rows && rows.length > 5 ? rows.slice(5) : [];
    window.currentSheetData = dataRows;

    let kitCount = 0, hallCount = 0, simCount = 0, storeCount = 0;
    const tbody = document.getElementById("inv-table-body");
    tbody.innerHTML = "";

    if (dataRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-amber-500/50">ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
    } else {
      dataRows.forEach((r, idx) => {
        if (!r[0] && !r[1]) return;
        const uid = r[10] || ""; // Column K: real Unique-ID, used to identify this row for edit/delete
        const srNo = r[0] || (idx + 1);
        const date = r[1] || "-";
        const loc = r[2] || "-";
        const cat = r[3] || "-";
        const item = r[4] || "-";
        const unit = r[5] || "-";
        const qty = parseInt(r[6]) || 0;
        const note = r[7] || "-";
        const monthYear = r[8] || "-";
        const bookName = r[9] || "11Inv - ပစ္စည်းစာရင်း";

        if (loc.includes("မီးဖို")) kitCount += qty;
        else if (loc.includes("ဓမ္မာရုံ")) hallCount += qty;
        else if (loc.includes("သိမ်")) simCount += qty;
        else storeCount += qty;

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
    <button onclick="editEntry('${uid}')" class="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-all text-sm" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
    <button onclick="deleteEntry('${uid}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-all text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
  </div>
</td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById("kpi-inv-kitchen").textContent = kitCount;
    document.getElementById("kpi-inv-dhammahall").textContent = hallCount;
    document.getElementById("kpi-inv-sim").textContent = simCount;
    document.getElementById("kpi-inv-store").textContent = storeCount;

    // Inventory Pagination numbers update
    const totalInv = dataRows.length;
    const invStartEl = document.getElementById("inv-page-start");
    const invEndEl = document.getElementById("inv-page-end");
    const invTotalEl = document.getElementById("inv-total-entries");
    if (invStartEl) invStartEl.textContent = totalInv > 0 ? 1 : 0;
    if (invEndEl) invEndEl.textContent = totalInv;
    if (invTotalEl) invTotalEl.textContent = totalInv;
  };

  await window.fetchSheetData("11Inv", renderData).then(data => renderData(data));
};

window.openAddInvModal = function() {
  const modal = document.getElementById("inv-entry-modal");
  document.getElementById("inv-entry-form").reset();
  document.getElementById("inv-uniqueId").value = "";
  document.getElementById("inv-date").valueAsDate = new Date();
  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း အသစ် ထည့်သွင်းရန်";

  // Populate Select Options
  const locSelect = document.getElementById("inv-location");
  locSelect.innerHTML = "";
  window.APP_CONFIG.INVENTORY_LOCATIONS.forEach(l => locSelect.add(new Option(l, l)));

  const catSelect = document.getElementById("inv-category");
  catSelect.innerHTML = "";
  window.APP_CONFIG.INVENTORY_CATEGORIES.forEach(c => catSelect.add(new Option(c, c)));

  const unitSelect = document.getElementById("inv-unit");
  unitSelect.innerHTML = "";
  window.APP_CONFIG.INVENTORY_UNITS.forEach(u => unitSelect.add(new Option(u, u)));

  modal.classList.remove("hidden");
};

window.closeInvModal = function() {
  document.getElementById("inv-entry-modal").classList.add("hidden");
};

window.saveInvEntryForm = async function(event) {
  event.preventDefault();
  const uniqueId = document.getElementById("inv-uniqueId").value; // "" = new item, else editing this row
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

// 💡 These two were referenced by the table's action buttons but were
// never actually defined anywhere - inventory edit/delete has never
// worked. Added here, mirroring how app.js does it for ledger entries.
window.editInvEntry = function(uid) {
  const r = (window.currentSheetData || []).find(row => String(row[10]) === String(uid));
  if (!r) return;

  window.openAddInvModal();
  const titleEl = document.getElementById("inv-modal-title");
  if (titleEl) titleEl.textContent = "ပစ္စည်း ပြင်ဆင်ရန်";
  document.getElementById("inv-uniqueId").value = uid;
  document.getElementById("inv-date").value = r[1] || "";
  document.getElementById("inv-location").value = r[2] || "";
  document.getElementById("inv-category").value = r[3] || "";
  document.getElementById("inv-desc").value = r[4] || "";
  document.getElementById("inv-unit").value = r[5] || "";
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

// 💡 Referenced by view/Inventory.html's Export button ("exportInventoryCSV()")
// but was never actually defined anywhere - clicking Export on the
// Inventory tab threw "exportInventoryCSV is not defined" and did
// nothing. Mirrors window.exportCSV in app.js (same CSV-building logic),
// just scoped to the currently loaded Inventory rows/filename.
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
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(query) ? "" : "none";
  });
};
