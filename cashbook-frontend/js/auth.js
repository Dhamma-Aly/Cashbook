// ===================================================================
// js/auth.js - Sāsana ERP Pure D1 Auth Controller
// Features: Auto-Bootstrap on Login, Version Sync & Burmese Role Display
// ===================================================================

(function () {
  "use strict";

  // 🇲🇲 မြန်မာလို ရာထူးအမည်များ အလိုအလျောက် ချိတ်ဆက်ပေးသော စံနှုန်း
  const ROLE_BURMESE_MAP = {
    'Admin': 'စီမံအုပ်ချုပ်သူ',
    'Finance': 'ဘဏ္ဍာရေး',
    'Account': 'ငွေစာရင်းကိုင်',
    'Staff': 'ရုံးအကူ',
    'Viewer': 'ကြည့်ရှုသူ'
  };

  // 🚨 1. Version Sync with config.js (Unifies App Version)
  const getAppVersion = () => {
    return window.CONFIG?.APP_VERSION || window.APP_CONFIG?.APP_VERSION || "v3.0_D1_ENTERPRISE";
  };

  const storedVersion = localStorage.getItem("sasana_app_version");
  const targetVersion = getAppVersion();
  if (storedVersion && storedVersion !== targetVersion) {
    localStorage.removeItem("sasana_auth_token");
    localStorage.removeItem("yogi_auth_token");
    localStorage.setItem("sasana_app_version", targetVersion);
  } else if (!storedVersion) {
    localStorage.setItem("sasana_app_version", targetVersion);
  }

  // -----------------------------------------------------------------
  // 👤 2. User Info Helpers
  // -----------------------------------------------------------------
  window.getCurrentUser = function () {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    if (!token) return null;
    return localStorage.getItem("sasana_user_name") || localStorage.getItem("yogi_user_name") || null;
  };

  window.getCurrentUserRole = function () {
    return localStorage.getItem("sasana_user_role") || "Viewer";
  };

  window.getCurrentUserDisplayName = function () {
    const role = window.getCurrentUserRole();
    const storedName = localStorage.getItem("sasana_display_name");
    // မြန်မာလို အမည်ရှိပါက ယူမည်၊ မရှိပါက ရာထူးအလိုက် မြန်မာလို အလိုအလျောက် ပြသမည်
    if (storedName && storedName !== window.getCurrentUser()) {
      return storedName;
    }
    return ROLE_BURMESE_MAP[role] || role;
  };

  window.canUserEdit = function () {
    const role = window.getCurrentUserRole();
    return role !== "Viewer";
  };

  // -----------------------------------------------------------------
  // 🏛️ 3. Workspace UI & User Badge Renderer
  // -----------------------------------------------------------------
  window.showWorkspace = function () {
    document.documentElement.className = "dark is-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");

    // Header Display (Date & Role Badge)
    const liveUserEl = document.getElementById("current-user-display") || document.getElementById("live-user-name");
    if (liveUserEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const formattedDate = `${yyyy}-${mm}-${dd}`;
      const username = window.getCurrentUser() || "Admin";
      const displayName = window.getCurrentUserDisplayName();
      
      // 🌟 "2026-10-02 | Admin (စီမံအုပ်ချုပ်သူ)" ဟု ခန့်ညားစွာ ပြသပေးခြင်း
      liveUserEl.textContent = `${formattedDate} | ${username} (${displayName})`;
    }
  };

  // -----------------------------------------------------------------
  // 🔒 4. Login Overlay UI
  // -----------------------------------------------------------------
  window.showLoginOverlay = function () {
    document.documentElement.className = "dark not-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (workspace) workspace.classList.add("hidden");
  };

  // -----------------------------------------------------------------
  // ⏰ 5. Check Existing Auth Session on Page Load
  // -----------------------------------------------------------------
  window.checkExistingSession = function () {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    const expiresAt = Number(localStorage.getItem("sasana_token_expires_at") || localStorage.getItem("yogi_token_expires_at") || 0);

    const isValid = token && expiresAt && Date.now() < expiresAt;

    if (isValid) {
      window.showWorkspace();
      return true;
    } else {
      window.showLoginOverlay();
      return false;
    }
  };

  // -----------------------------------------------------------------
  // 🚀 6. Login Submission Handler
  // -----------------------------------------------------------------
  window.handleLoginSubmit = async function (event) {
    if (event && event.preventDefault) event.preventDefault();

    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const errDiv = document.getElementById("login-error");
    const submitBtn = event && event.target ? event.target.querySelector("button[type='submit']") : null;
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";

    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!username || !password) {
      if (errDiv) {
        errDiv.textContent = "အသုံးပြုသူအမည် နှင့် လျှို့ဝှက်နံပါတ် ဖြည့်သွင်းပါခင်ဗျာ။";
        errDiv.classList.remove("hidden");
      }
      return;
    }

    if (errDiv) errDiv.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>ဝင်ရောက်နေပါသည်...</span> <i class="fa-solid fa-spinner fa-spin text-xs"></i>`;
    }

    try {
      const baseUrl = (window.CONFIG && (window.CONFIG.API_BASE_URL || window.CONFIG.API_URL))
        || (window.APP_CONFIG && (window.APP_CONFIG.API_BASE_URL || window.APP_CONFIG.API_URL))
        || "https://cashbook-api.dhammaaly.workers.dev";

      const res = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const json = await res.json().catch(() => ({ success: false, message: "Server response error" }));

      if (res.ok && json.success && json.token) {
        const expiresInMs = json.expiresInMs || (24 * 60 * 60 * 1000);
        const expiresAt = Date.now() + expiresInMs;
        const userObj = json.user || { username, role: username, name: username };

        // Local Storage သိမ်းဆည်းခြင်း
        localStorage.setItem("sasana_auth_token", json.token);
        localStorage.setItem("sasana_user_name", userObj.username);
        localStorage.setItem("sasana_user_role", userObj.role || username);
        localStorage.setItem("sasana_display_name", userObj.name || ROLE_BURMESE_MAP[userObj.role] || userObj.username);
        localStorage.setItem("sasana_token_expires_at", String(expiresAt));

        // Yogi Session Compatibility
        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("yogi_user_name", userObj.username);
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) passwordInput.value = "";

        // UI ဖွင့်လှစ်ခြင်း
        window.showWorkspace();

        // 🚀 Login ဝင်သည်နှင့် တစ်ပြိုင်နက် စာအုပ်အားလုံးကို Background မှ ကြိုတင်ဆွဲယူစေခြင်း (Preload)
        if (typeof window.bootstrapAppData === "function") {
          window.bootstrapAppData();
        }

        // Dashboard သို့ တန်းသွားခြင်း
        if (typeof window.switchTab === "function") {
          window.switchTab("Home");
        } else if (typeof window.initApp === "function") {
          window.initApp();
        }

        // Live Sync စတင်ခြင်း
        if (typeof window.startLiveSync === "function") {
          window.startLiveSync();
        }

      } else {
        if (errDiv) {
          errDiv.textContent = json.error || json.message || "အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
          errDiv.classList.remove("hidden");
        }
      }

    } catch (err) {
      console.error("[Login Exception]", err);
      if (errDiv) {
        if (!navigator.onLine) {
          errDiv.textContent = "အင်တာနက်လိုင်း မရှိသေးပါခင်ဗျာ။ စနစ်ကို အင်တာနက်ရှိချိန် အနည်းဆုံးတစ်ကြိမ် ဝင်ရောက်ထားရန် လိုအပ်ပါသည်။";
        } else {
          errDiv.textContent = "ကွန်ရက် သို့မဟုတ် ဆာဗာ အမှားဖြစ်ပေါ်နေပါသည်: " + (err.message || "Failed to fetch");
        }
        errDiv.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  };

  // -----------------------------------------------------------------
  // 🚪 7. Logout Handlers
  // -----------------------------------------------------------------
  window.handleLogout = function () {
    if (confirm("စနစ်မှ ထွက်ရန် သေချာပါသလား။")) {
      if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
      const ver = localStorage.getItem("sasana_app_version");
      localStorage.clear();
      if (ver) localStorage.setItem("sasana_app_version", ver);
      window.location.reload();
    }
  };

  window.handleLogoutSilent = function () {
    if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
    const ver = localStorage.getItem("sasana_app_version");
    localStorage.clear();
    if (ver) localStorage.setItem("sasana_app_version", ver);
    window.showLoginOverlay();
  };

  // Init Session Check on Load
  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
