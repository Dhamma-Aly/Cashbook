// ===================================================================
// js/auth.js - Sāsana ERP Persistent Auth Controller (Long-Lived Session)
// Features: Persistent Login (Never auto-logout until manual sign out)
// ===================================================================

(function () {
  "use strict";

  // 🌟 သက်တမ်းကို ၁ နှစ် (ရက်ပေါင်း ၃၆၅ ရက်) သတ်မှတ်ခြင်း
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  const ROLE_BURMESE_MAP = {
    'Admin': 'စီမံအုပ်ချုပ်သူ',
    'Finance': 'ဘဏ္ဍာရေး',
    'Account': 'ငွေစာရင်းကိုင်',
    'Staff': 'ရုံးအကူ',
    'Viewer': 'ကြည့်ရှုသူ'
  };

  const getAppVersion = () => {
    return window.CONFIG?.APP_VERSION || window.APP_CONFIG?.APP_VERSION || "v3.1_D1_ENTERPRISE";
  };

  // 🌟 Version ပြောင်းလဲသော်လည်း Login ပျက်မသွားစေရန် Token မဖျက်ဘဲ Version နံပါတ်သာ Update လုပ်ခြင်း
  const storedVersion = localStorage.getItem("sasana_app_version");
  const targetVersion = getAppVersion();
  if (storedVersion !== targetVersion) {
    localStorage.setItem("sasana_app_version", targetVersion);
  }

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
    if (storedName && storedName !== window.getCurrentUser()) {
      return storedName;
    }
    return ROLE_BURMESE_MAP[role] || role;
  };

  window.canUserEdit = function () {
    return window.getCurrentUserRole() !== "Viewer";
  };

  window.showWorkspace = function () {
    document.documentElement.className = "dark is-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");

    const liveUserEl = document.getElementById("current-user-display") || document.getElementById("live-user-name");
    if (liveUserEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const username = window.getCurrentUser() || "Admin";
      const displayName = window.getCurrentUserDisplayName();
      liveUserEl.textContent = `${yyyy}-${mm}-${dd} | ${username} (${displayName})`;
    }
  };

  window.showLoginOverlay = function () {
    document.documentElement.className = "dark not-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (workspace) workspace.classList.add("hidden");
  };

  // 🌟 Persistent Check: Token ရှိနေသရွေ့ အမြဲတမ်း Workspace ကို တန်းပွင့်စေမည်
  window.checkExistingSession = function () {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    const expiresAt = Number(localStorage.getItem("sasana_token_expires_at") || localStorage.getItem("yogi_token_expires_at") || 0);

    // Token ရှိပြီး သက်တမ်း ၁ နှစ်အတွင်း ရှိနေပါက တန်းပွင့်မည်
    const isValid = Boolean(token && (!expiresAt || Date.now() < expiresAt));

    if (isValid) {
      window.showWorkspace();
      return true;
    } else {
      window.showLoginOverlay();
      return false;
    }
  };

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
      const baseUrl = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://cashbook-api.dhammaaly.workers.dev";
      const res = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const json = await res.json().catch(() => ({ success: false, message: "Server response error" }));

      if (res.ok && json.success && json.token) {
        // 🌟 သက်တမ်းကို ၁ နှစ် (ONE_YEAR_MS) အဖြစ် သတ်မှတ်ခြင်း
        const expiresInMs = json.expiresInMs || ONE_YEAR_MS;
        const expiresAt = Date.now() + expiresInMs;
        const userObj = json.user || { username, role: username, name: username };

        localStorage.setItem("sasana_auth_token", json.token);
        localStorage.setItem("sasana_user_name", userObj.username);
        localStorage.setItem("sasana_user_role", userObj.role || username);
        localStorage.setItem("sasana_display_name", userObj.name || ROLE_BURMESE_MAP[userObj.role] || userObj.username);
        localStorage.setItem("sasana_token_expires_at", String(expiresAt));

        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("yogi_user_name", userObj.username);
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) passwordInput.value = "";
        window.showWorkspace();

        if (typeof window.bootstrapAppData === "function") window.bootstrapAppData();
        if (typeof window.switchTab === "function") window.switchTab("Home");
        else if (typeof window.initApp === "function") window.initApp();

        if (typeof window.startLiveSync === "function") window.startLiveSync();

      } else {
        if (errDiv) {
          errDiv.textContent = json.error || json.message || "အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
          errDiv.classList.remove("hidden");
        }
      }

    } catch (err) {
      console.error("[Login Exception]", err);
      if (errDiv) {
        errDiv.textContent = !navigator.onLine 
          ? "အင်တာနက်လိုင်း မရှိသေးပါခင်ဗျာ။ စနစ်ကို အင်တာနက်ရှိချိန် အနည်းဆုံးတစ်ကြိမ် ဝင်ရောက်ထားရန် လိုအပ်ပါသည်။" 
          : "ကွန်ရက် သို့မဟုတ် ဆာဗာ အမှားဖြစ်ပေါ်နေပါသည်: " + (err.message || "Failed to fetch");
        errDiv.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  };

  // 🌟 Soft Re-Authentication Logic
  window.showReAuthModal = function() {
    const modal = document.getElementById("reauth-modal");
    if (modal) {
      modal.classList.remove("hidden");
      const userDisplay = document.getElementById("reauth-username-display");
      if (userDisplay) {
        userDisplay.textContent = window.getCurrentUser() || 'User';
      }
      const pwdInput = document.getElementById("reauth-password");
      if (pwdInput) {
        pwdInput.value = "";
        setTimeout(() => pwdInput.focus(), 100);
      }
    } else {
      window.handleLogoutSilent();
    }
  };

  window.handleReAuthSubmit = async function(event) {
    if (event && event.preventDefault) event.preventDefault();
    
    const passwordInput = document.getElementById("reauth-password");
    const errDiv = document.getElementById("reauth-error");
    const submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";

    const username = window.getCurrentUser();
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!password) return;

    if (errDiv) errDiv.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-sm"></i>`;
    }

    try {
      const baseUrl = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://cashbook-api.dhammaaly.workers.dev";
      const res = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success && json.token) {
        const expiresInMs = json.expiresInMs || ONE_YEAR_MS;
        const expiresAt = Date.now() + expiresInMs;

        localStorage.setItem("sasana_auth_token", json.token);
        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("sasana_token_expires_at", String(expiresAt));
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) passwordInput.value = "";
        document.getElementById("reauth-modal").classList.add("hidden");

        if (typeof window.triggerBackgroundSync === "function") {
          window.triggerBackgroundSync();
        }

      } else {
        if (errDiv) {
          errDiv.textContent = json.error || "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
          errDiv.classList.remove("hidden");
        }
      }
    } catch (err) {
      if (errDiv) {
        errDiv.textContent = "ကွန်ရက် အမှားဖြစ်ပေါ်နေပါသည်။ အင်တာနက်စစ်ဆေးပါ။";
        errDiv.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  };

  window.cancelReAuth = function() {
    window.handleLogoutSilent();
  };

  // 🌟 Logout ခလုတ်ကို ကိုယ်တိုင် နှိပ်မှသာ စနစ်မှ ထွက်ခွာခြင်း
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

  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
