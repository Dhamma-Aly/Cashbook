// js/Banks.js - Bank Group Table Renderer
window.renderBankView = async function(sheetKey) {
  const container = document.getElementById("view-container");
  const res = await fetch("view/banks.html");
  container.innerHTML = await res.text();

  window.currentSheetKey = sheetKey;
  window.currentSheetData = [];

  const renderData = (rows) => {
    // Header rows in Google Sheet are rows 1..5. Actual transactions start at index 5 (Row 6)
    const dataRows = rows && rows.length > 5 ? rows.slice(5) : [];
    window.currentSheetData = dataRows;

    let inc = 0, exp = 0, bal = 0, count = 0;
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    if (dataRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-amber-500/50">စာရင်း မရှိသေးပါ။</td></tr>`;
    } else {
      dataRows.forEach((r, idx) => {
        if (!r[0] && !r[1]) return;
        const uid = r[12] || ""; // Column M: real Unique-ID, used to identify this row for edit/delete
        const srNo = r[0] || (idx + 1);
        const date = r[1] || "-";
        const type = r[2] || "-";
        const subcat = r[3] || "-";
        const voucher = r[4] || "-";
        const desc = r[5] || "-";
        const receiver = r[6] || "-";
        const incomeVal = parseFloat((r[7] || "0").toString().replace(/,/g, "")) || 0;
        const expenseVal = parseFloat((r[8] || "0").toString().replace(/,/g, "")) || 0;
        const balanceVal = parseFloat((r[9] || "0").toString().replace(/,/g, "")) || 0;
        const monthYear = r[10] || "-";
        const bookName = r[11] || window.APP_CONFIG.BOOKS[sheetKey] || sheetKey;

        inc += incomeVal;
        exp += expenseVal;
        bal = balanceVal || (inc - exp);
        count++;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="text-center font-bold text-amber-500/70">${srNo}</td>
          <td class="font-mono text-xs">${date}</td>
          <td><span class="px-2 py-0.5 rounded text-[10px] font-bold ${type === 'ဝင်ငွေ' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">${type}</span></td>
          <td class="font-semibold text-amber-200">${subcat}</td>
          <td class="font-mono text-xs">${voucher}</td>
          <td class="whitespace-normal max-w-xs">${desc}</td>
          <td>${receiver}</td>
          <td class="text-right font-mono text-emerald-400 font-semibold">${incomeVal ? incomeVal.toLocaleString() : '-'}</td>
          <td class="text-right font-mono text-rose-400 font-semibold">${expenseVal ? expenseVal.toLocaleString() : '-'}</td>
          <td class="text-right font-mono font-bold text-amber-300">${balanceVal ? balanceVal.toLocaleString() : '-'}</td>
          <td class="font-mono text-xs">${monthYear}</td>
          <td class="text-xs text-amber-500/70">${bookName}</td>
          <td class="text-center right-0 sticky">
            <button onclick="editEntry('${uid}')" class="p-1 text-amber-400 hover:text-amber-200 mr-1" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button onclick="deleteEntry('${uid}')" class="p-1 text-rose-400 hover:text-rose-200" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById("kpi-income").textContent = `${inc.toLocaleString()} MMK`;
    document.getElementById("kpi-expense").textContent = `${exp.toLocaleString()} MMK`;
    document.getElementById("kpi-balance").textContent = `${bal.toLocaleString()} MMK`;
    document.getElementById("kpi-count").textContent = count;
  };

  await window.fetchSheetData(sheetKey, renderData).then(data => renderData(data));
};

window.onLedgerSearchInput = function() {
  const query = document.getElementById("search-input").value.toLowerCase();
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const trs = tbody.getElementsByTagName("tr");
  Array.from(trs).forEach(tr => {
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(query) ? "" : "none";
  });
};
