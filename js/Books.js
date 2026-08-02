// js/Books.js - Ledger Group (4GB..10GB)
window.renderBookView = async function(sheetKey) {
  // Reuses Bank view renderer logic because schemas are identical
  await window.renderBankView(sheetKey);
};