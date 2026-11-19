// ===================================================================
// js/auth.js - Sāsana ERP Persistent Auth & Role Controller (v4.1)
// Features: Revocable Session (30-Day + token_version), Role Matrix,
// Soft Re-Authentication, IndexedDB Cleanup on Silent Logout & Lockout UX
// ===================================================================

(function () {
  "use strict";

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const ROLE_BURMESE_MAP = {
    'Admin': 'စီမံအုပ်ချုပ်သူ',
    'Finance': 'ဘဏ္ဍာရေး',
    'Account': 'ငွေစာရင်းကိုင်',
    'Staff': 'ရုံးအကူ',
    'Viewer': 'ကြည့်ရှုသူ'
  };

  const getAppVersion = () => {
    return window.CONFIG?.APP_VERSION || window.APP_CONFIG?.APP_VERSION || "v3.2_D1_ENTERPRISE";
  };

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

  // 🌟 Role Permission Matrix (Matched 100% with worker.js v7.0)
  window.canUserEdit = function () {
    return window.getCurrentUserRole().toLowerCase() !== "viewer";
  };

  window.canUserDelete = function () {
    const role = window.getCurrentUserRole().toLowerCase();
    return role === "admin" || role === "finance" || role === "account";
  };

  window.isAdminUser = function () {
    return window.getCurrentUserRole().toLowerCase() === "admin";
  };

  window.showWorkspace = function () {
    document.documentElement.className = "dark is-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");

    const liveUserEl = document.getElementById("current-user-display") || document.getElementById("live-user-name");
    if (liveUserEl) {
      liveUserEl.textContent = window.getCurrentUser() || "User";
    }
  };

  window.showLoginOverlay = function () {
    document.documentElement.className = "dark not-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (workspace) workspace.classList.add("hidden");
  };

  window.checkExistingSession = function () {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    const expiresAt = Number(localStorage.getItem("sasana_token_expires_at") || localStorage.getItem("yogi_token_expires_at") || 0);
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
        const expiresInMs = json.expiresInMs || THIRTY_DAYS_MS;
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

        if (typeof window.initApp === "function") {
          window.initApp();
        } else {
          window.showWorkspace();
          if (typeof window.bootstrapAppData === "function") window.bootstrapAppData();
          if (typeof window.switchTab === "function") window.switchTab("Home");
          if (typeof window.startLiveSync === "function") window.startLiveSync();
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

  window.showReAuthModal = function () {
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

  window.handleReAuthSubmit = async function (event) {
    if (event && event.preventDefault) event.preventDefault();

    const passwordInput = document.getElementById("reauth-password");
    const errDiv = document.getElementById("reauth-error");
    const submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";

    const username = window.getCurrentUser();
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!username) {
      await window.handleLogoutSilent();
      return;
    }
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
        const expiresInMs = json.expiresInMs || THIRTY_DAYS_MS;
        const expiresAt = Date.now() + expiresInMs;

        localStorage.setItem("sasana_auth_token", json.token);
        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("sasana_token_expires_at", String(expiresAt));
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) passwordInput.value = "";
        const modal = document.getElementById("reauth-modal");
        if (modal) modal.classList.add("hidden");

        if (typeof window.triggerBackgroundSync === "function") {
          await window.triggerBackgroundSync();
        }
        if (typeof window.refreshCurrentTabSilent === "function") {
          window.refreshCurrentTabSilent();
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

  window.cancelReAuth = async function () {
    const modal = document.getElementById("reauth-modal");
    if (modal) modal.classList.add("hidden");
    await window.handleLogoutSilent();
  };

  window.handleLogout = async function () {
    let confirmMsg = "စနစ်မှ ထွက်ရန် သေချာပါသလား။";
    if (typeof window.getPendingSyncCount === "function") {
      try {
        const pending = await window.getPendingSyncCount();
        if (pending > 0) {
          confirmMsg = `Offline မှ Server သို့ မပို့ရသေးသော စာရင်း ${pending} ခု ကျန်ရှိနေပါသေးသည်။ ထွက်ရန် သေချာပါသလား။`;
        }
      } catch (_) {}
    }

    if (confirm(confirmMsg)) {
      if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
      if (typeof window.clearOfflineCache === "function") {
        await window.clearOfflineCache();
      }
      const ver = localStorage.getItem("sasana_app_version");
      localStorage.clear();
      if (ver) localStorage.setItem("sasana_app_version", ver);
      window.location.reload();
    }
  };

  // 🌟 Security Fix: Clear BOTH localStorage AND IndexedDB Cache on Silent Logout
  window.handleLogoutSilent = async function () {
    if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
    if (typeof window.clearOfflineCache === "function") {
      await window.clearOfflineCache();
    }
    const ver = localStorage.getItem("sasana_app_version");
    localStorage.clear();
    if (ver) localStorage.setItem("sasana_app_version", ver);
    window.showLoginOverlay();
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
// === END OF auth.js ===
