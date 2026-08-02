// js/app.js - Core Router + Shared State + Shared Utilities
//
// 💡 MODULE MAP (all loaded before this file — see index.html):
//   js/config.js         -> CONFIG constants (sheet names, sub-categories,
//                            NAV_ORDER, BANK_GROUP / LEDGER_GROUP)
//   js/api.js             -> backend fetch/create/update/delete helpers
//   js/auth.js             -> login/session/permission helpers
//   js/dashboard.js        -> Home Dashboard          (view/dashboard.html)
//   js/banks.js            -> Bank Group (1CB..3CB)    (view/bank.html)
//   js/books.js            -> Ledger Group (4GB..10GB) (view/books.html)
//                              + the SHARED ledger table/modal engine that
//                              js/banks.js also calls into
//   js/inventory.js        -> Inventory (11Inv)        (view/inventory.html)
//   js/report-system.js    -> Report + System Settings (view/report-system.html)
//
// This file only holds: shared app state, the tab router (switchTab /
// loadSheetView), and small utilities used by more than one module
// (setText, formatNum, the header badge, the Previous/Next bar, and the
// view/*.html partial loader).

let currentSheet = "Home"; // 💡 Default to Home Dashboard on App Start
let rawData = [];

// 💡 IN-MEMORY CACHE: keyed by sheet name. When the user re-opens a tab
// they already visited, we render the cached rows immediately (no
// spinner, no wait) and silently refetch in the background to keep the
// numbers fresh. This is what makes "switch away and come back" feel
// instant, on top of the server-side CacheService layer in worker.js.
let sheetCache = {};   // { sheetName: { data, ts } }
let homeCache = null;  // { cards, table, ts }

// 💡 view/*.html partials are plain static fragments (no dynamic data in
// them), so once fetched they're cached forever for the session.
let viewHtmlCache = {}; // { viewName: htmlString }

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
function formatNum(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString();
}

// 💡 Fetches (and caches) a view/*.html partial and injects it into
// #view-container. Every render*View() function in the per-tab modules
// calls this first, before touching any element inside the view.
async function loadView(name) {
  const container = document.getElementById("view-container");
  if (!container) return;
  if (!viewHtmlCache[name]) {
    const res = await fetch(`view/${name}.html`);
    viewHtmlCache[name] = await res.text();
  }
  container.innerHTML = viewHtmlCache[name];
}

// 💡 Top-right badge: "Date: Sat 1 Aug 26 | Admin" — date always today,
// role reflects whoever is actually logged in (Admin / Account / Viewer).
function updateHeaderBadge() {
  const auth = getAuthUser();
  const el = document.getElementById("current-user-display");
  if (!el) return;

  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const dateStr = `${weekday} ${d.getDate()} ${month} ${String(d.getFullYear()).slice(-2)}`;

  el.innerText = `Date: ${dateStr} | ${auth ? auth.role : ""}`;
}

// 💡 PREVIOUS / NEXT page navigation (every ledger + inventory page,
// i.e. everything except Home / Report / System). Each of those view
// templates has an empty <div id="prev-next-bar"></div> that the calling
// module fills with this after loadView().
function renderPrevNextBar() {
  const order = CONFIG.NAV_ORDER;
  const idx = order.indexOf(currentSheet);
  if (idx === -1) return "";

  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx < order.length - 1 ? order[idx + 1] : null;

  const prevLabel = prev ? (CONFIG.SHEETS[prev] || prev) : "";
  const nextLabel = next ? (CONFIG.SHEETS[next] || next) : "";

  return `
    <div class="flex justify-between items-center gap-3 pt-1">
      <button ${prev ? `onclick="switchTab('${prev}')"` : 'disabled'}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border border-amber-900/30 transition-all ${prev ? 'bg-[#1f1913] hover:bg-[#2a2118] text-amber-200 cursor-pointer' : 'bg-[#14110d] text-amber-800/40 cursor-not-allowed'}">
        <i class="fa-solid fa-chevron-left text-[10px]"></i>
        <span class="truncate max-w-[220px]">${prev ? `${prev} - ${prevLabel}` : 'Previous'}</span>
      </button>
      <button ${next ? `onclick="switchTab('${next}')"` : 'disabled'}
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border border-amber-900/30 transition-all ${next ? 'bg-[#1f1913] hover:bg-[#2a2118] text-amber-200 cursor-pointer' : 'bg-[#14110d] text-amber-800/40 cursor-not-allowed'}">
        <span class="truncate max-w-[220px]">${next ? `${next} - ${nextLabel}` : 'Next'}</span>
        <i class="fa-solid fa-chevron-right text-[10px]"></i>
      </button>
    </div>
  `;
}

function initApp() {
  const auth = getAuthUser();
  if (!auth) {
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("erp-workspace").classList.add("hidden");
    return;
  }

  document.getElementById("login-overlay").classList.add("hidden");
  document.getElementById("erp-workspace").classList.remove("hidden");
  updateHeaderBadge();

  // 💡 Open Home Dashboard by Default
  switchTab("Home");
}

function switchTab(sheetName) {
  currentSheet = sheetName;

  // Sidebar Nav Active Highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + sheetName);
  if (activeBtn) activeBtn.classList.add("active");

  const titleText = CONFIG.SHEETS[sheetName] ? `${sheetName} - ${CONFIG.SHEETS[sheetName]}` : sheetName;
  const specialTitles = { Home: "Home Dashboard", Report: "Reporting Center", System: "System Settings" };
  document.getElementById("page-title").innerText = specialTitles[sheetName] || titleText;

  updateHeaderBadge();
  loadSheetView();
}

// 💡 Central router: decides which module's render*View() handles the
// current tab. Each module fetches its own view/*.html partial via
// loadView() internally, so this just needs to pick the right function.
async function loadSheetView() {
  const container = document.getElementById("view-container");
  if (!container) return;

  if (currentSheet === "Home") { await renderHomeDashboard(); return; }
  if (currentSheet === "Report" || currentSheet === "System") { await renderReportSystemView(); return; }
  if (currentSheet === "11Inv") { await renderInventoryView(); return; }
  if (CONFIG.BANK_GROUP.includes(currentSheet)) { await renderBankView(); return; }
  await renderBooksView();
}

window.onload = initApp;
