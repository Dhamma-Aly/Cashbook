// js/banks.js - Bank Group (1CB, 2CB, 3CB)
//
// 💡 Bank Group sheets use the exact same 13-column row schema, table
// layout, and Add/Edit modal as the Ledger Group, so the actual table +
// modal engine lives once in js/books.js (renderLedgerEngine, renderTable,
// openAddModal, etc.) instead of being duplicated here. This file just
// points that shared engine at view/bank.html for CONFIG.BANK_GROUP
// sheets, so the Bank Group still has its own module/view to edit
// independently (e.g. give it a different look later) without touching
// the Ledger Group's.

async function renderBankView() {
  await renderLedgerEngine("bank");
}