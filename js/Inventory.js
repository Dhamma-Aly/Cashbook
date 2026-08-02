// js/Inventory.js - Inventory (11Inv) Logic
window.renderInventoryView = async function() {
  const container = document.getElementById("view-container");
  const res = await fetch("view/Inventory.html");
  container.innerHTML = await res.text();

  const renderData = (rows) => {
    let kitCount = 0, hallCount = 0, simCount = 0, storeCount = 0;
    const tbody = document.getElementById("inv-table-body");
    tbody.innerHTML = "";

    const dataRows = rows && rows.length > 1 ? rows.slice(1) : [];

    if (dataRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-amber-500/50">ပစ္စည်းစာရင်း မရှိသေးပါ။</td></tr>`;
    } else {
      dataRows.forEach((r, idx) => {
        if (!r[0] && !r[1]) return;
        const rowIndex = idx + 2;
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
          <td class="text-center font-bold text-amber-500/70">${idx + 1}</td>
          <td class="font-mono text-xs">${date}</td>
          <td class="font-bold text-amber-300">${loc}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">${cat}</span></td>
          <td class="font-semibold text-amber-100">${item}</td>
          <td>${unit}</td>
          <td class="text-right font-mono font-bold text-emerald-400">${qty.toLocaleString()}</td>
          <td class="text-xs text-amber-200/70">${note}</td>
          <td class="font-mono text-xs">${monthYear}</td>
          <td class="text-xs text-amber-500/70">${bookName}</td>
          <td class="text-center right-0 sticky">
            <button onclick="editInvEntry(${rowIndex})" class="p-1 text-amber-400 hover:text-amber-200 mr-1"><i class="fa-solid fa-pen-to-square"></i></button>
            <button onclick="deleteInvEntry(${rowIndex})" class="p-1 text-rose-400 hover:text-rose-200"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById("kpi-inv-kitchen").textContent = kitCount;
    document.getElementById("kpi-inv-dhammahall").textContent = hallCount;
    document.getElementById("kpi-inv-sim").textContent = simCount;
    document.getElementById("kpi-inv-store").textContent = storeCount;
  };

  await window.fetchSheetData("11Inv", renderData).then(data => renderData(data));
};