// ===================================================================
// js/auth.js - Authentication & User Session Manager (Cloudflare D1 Server Sync)
// Supports D1 Server Login, Role Management, and Live Clock Display
// ===================================================================

window.currentUser = null;
let clockInterval = null;

// 1. Get Current User Helper (Fixes ReferenceError in app.js)
window.getCurrentUser = function() {
  if (window.currentUser) return window.currentUser;
  const saved = localStorage.getItem("cashbook_user");
  if (saved) {
    try {
      window.currentUser = JSON.parse(saved);
      return window.currentUser;
    } catch(e) {
      localStorage.removeItem("cashbook_user");
    }
  }
  return null;
};

// 2. Initialize Auth State
window.initAuth = function() {
  const user = window.getCurrentUser();
  const loginOverlay = document.getElementById("login-overlay");
  const workspace = document.getElementById("erp-workspace");

  if (user) {
    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");
    updateUserBadge();
    startLiveClock();
    return true;
  }

  if (loginOverlay) loginOverlay.classList.remove("hidden");
  if (workspace) workspace.classList.add("hidden");
  return false;
};

// 3. UI Visibility Controls
window.showLoginOverlay = function() {
  const loginOverlay = document.getElementById("login-overlay");
  const workspace = document.getElementById("erp-workspace");
  if (loginOverlay) loginOverlay.classList.remove("hidden");
  if (workspace) workspace.classList.add("hidden");
};

window.showWorkspace = function() {
  const loginOverlay = document.getElementById("login-overlay");
  const workspace = document.getElementById("erp-workspace");
  if (loginOverlay) loginOverlay.classList.add("hidden");
  if (workspace) workspace.classList.remove("hidden");
  updateUserBadge();
  startLiveClock();
};

// 4. Cloudflare Worker /api/login မှတစ်ဆင့် D1 Database တွင် လျှို့ဝှက် စစ်ဆေးခြင်း
window.handleLoginSubmit = async function(event) {
  event.preventDefault();

  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const errDiv = document.getElementById("login-error");
  const submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;

  const username = usernameInput ? usernameInput.value.trim() : "";
  const pass = passwordInput ? passwordInput.value.trim() : "";

  if (!username || !pass) {
    if (errDiv) {
      errDiv.textContent = "အသုံးပြုသူအမည် နှင့် လျှို့ဝှက်နံပါတ် ဖြည့်ပါခင်ဗျာ။";
      errDiv.classList.remove("hidden");
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  try {
    // Detect API Base URL (Checks APP_CONFIG, CONFIG or Fallback)
    const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) ||
                    (window.CONFIG && window.CONFIG.API_BASE_URL) ||
                    "https://cashbook.dhammaaly.workers.dev";
    
    // Server (D1 Database) ဆီသို့ လျှို့ဝှက် စစ်ဆေးခိုင်းခြင်း
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pass })
    });

    const json = await res.json();

    if (res.ok && json.success && json.user) {
      window.currentUser = {
        username: json.user.username,
        role: json.user.role || json.user.username,
        loginTime: new Date().toISOString()
      };
      localStorage.setItem("cashbook_user", JSON.stringify(window.currentUser));
      
      if (errDiv) errDiv.classList.add("hidden");
      window.showWorkspace();

      if (window.switchTab) {
        window.switchTab("Home");
      }
    } else {
      if (errDiv) {
        errDiv.textContent = json.error || json.message || "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
        errDiv.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Login Fetch Error:", err);
    if (errDiv) {
      errDiv.textContent = "ချိတ်ဆက်မှု မအောင်မြင်ပါ: " + (err.message || "Server Error");
      errDiv.classList.remove("hidden");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// 5. Logout Handler
window.handleLogout = function() {
  if (confirm("စနစ်မှ ထွက်ရန် သေချာပါသလား။")) {
    if (clockInterval) clearInterval(clockInterval);
    localStorage.removeItem("cashbook_user");
    window.currentUser = null;
    location.reload();
  }
};

// 6. Custom Date Formatter: Mon 12 Aug 26 | 12:57 PM
function formatCustomDate() {
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dayName = days[now.getDay()];
  const dayNum = now.getDate();
  const monthName = months[now.getMonth()];
  const yearTwoDigits = String(now.getFullYear()).slice(-2);

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  // Pipe symbol '|' with subtle amber color styling
  return `${dayName} ${dayNum} ${monthName} ${yearTwoDigits} <span class="text-amber-500/40 font-normal px-1">|</span> ${hours}:${minutes} ${ampm}`;
}

// 7. Update User Badge Header
function updateUserBadge() {
  const user = window.getCurrentUser();
  if (!user) return;
  const badgeStr = formatCustomDate();
  const badge = document.getElementById("current-user-display");
  if (badge) {
    // Result: DATE: Mon 12 Aug 26 | 12:57 PM | Admin
    badge.innerHTML = `DATE: ${badgeStr} <span class="text-amber-500/40 font-normal px-1">|</span> ${user.username}`;
  }
}

// 8. Start Live Clock Interval
function startLiveClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(updateUserBadge, 10000); // 10 စက္ကန့်တစ်ခါ အချိန်စစ်ပေးမည်
}
