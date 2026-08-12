// ===================================================================
// js/Books.js - Book Ledger Group Bridge Module (4GB ~ 10GB)
// ===================================================================
// Note: Books (4GB to 10GB) and Banks (1CB to 3CB) share the exact
// same data model, table structure, and API backend.
// All core logic (rendering, editing, saving, deleting, CSV export)
// is unified inside js/Banks.js to avoid code duplication (DRY).
// This file acts as a safe bridge & alias router.
// ===================================================================

window.renderBookView = async function(sheetKey) {
  const targetSheet = sheetKey || window.currentSheet || '4GB';
  if (typeof window.renderBankView === 'function') {
    await window.renderBankView(targetSheet);
  } else {
    console.warn("renderBankView function is not available in js/Banks.js");
  }
};

// Safety Aliases for legacy calls
window.loadBookView = window.renderBookView;
window.renderBookSheet = window.renderBookView;
