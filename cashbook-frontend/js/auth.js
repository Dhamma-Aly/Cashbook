// ===================================================================
// js/auth.js - Sāsana ERP Persistent Auth & Role Controller (v4.2)
// Features: 15s Mobile-Safe Fetch Timeout (No Infinite Spinner),
// Password Show/Hide Toggle, Revocable 30-Day Session, Role Matrix &
// iOS Safari Private Storage Protection
// ===================================================================

(function () {
  "use strict";

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const LOGIN_TIMEOUT_MS = 15000; // 15 seconds — prevents infinite mobile hang

  const ROLE_BURMESE_MAP = {
    'Admin': '',
    'Finance': '',
    'Account': '',
    'Staff': '',
    'Viewer': ''
  };

  function safeSetStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('[Storage] setItem failed:', e);
      return false;
    }
  }

  function safeGetStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  async function fetchWithTimeout(url, options, timeoutMs = LOGIN_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // 👁️ Toggle Password Visibility (Login & Re-Auth Inputs)
  window.togglePasswordVisibility = function (inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';

    const icon = btnEl ? btnEl.querySelector('i') : null;
    if (icon) {
      icon.classList.toggle('fa-eye', !isHidden);
      icon.classList.toggle('fa-eye-slash', isHidden);
    }
    if (btnEl) {
      btnEl.title = isHidden ? 'လျှို့ဝှက်နံပါတ် ဖျောက်ရန်' : 'လျှို့ဝှက်နံပါတ် ကြည့်ရန်';
      btnEl.setAttribute('aria-label', btnEl.title);
    }
  };

  const getAppVersion = () => {
    return window.CONFIG?.APP_VERSION || window.APP_CONFIG?.APP_VERSION || "v3.2_D1_ENTERPRISE";
  };

  const storedVersion = safeGetStorage("sasana_app_version");
  const targetVersion = getAppVersion();
  if (storedVersion !== targetVersion) {
    safeSetStorage("sasana_app_version", targetVersion);
  }

  window.getCurrentUser = function () {
    const token = safeGetStorage("sasana_auth_token") || safeGetStorage("yogi_auth_token");
    if (!token) return null;
    return safeGetStorage("sasana_user_name") || safeGetStorage("yogi_user_name") || null;
  };

  window.getCurrentUserRole = function () {
    return safeGetStorage("sasana_user_role") || "Viewer";
  };

  window.getCurrentUserDisplayName = function () {
    const role = window.getCurrentUserRole();
    const storedName = safeGetStorage("sasana_display_name");
    if (storedName && storedName !== window.getCurrentUser()) {
      return storedName;
    }
    return ROLE_BURMESE_MAP[role] || role;
  };

  // 🌟 Role Permission Matrix (Matched 100% with worker.js)
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
    const token = safeGetStorage("sasana_auth_token") || safeGetStorage("yogi_auth_token");
    const expiresAt = Number(safeGetStorage("sasana_token_expires_at") || safeGetStorage("yogi_token_expires_at") || 0);
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

    if (!navigator.onLine) {
      if (errDiv) {
        errDiv.textContent = "အင်တာနက်လိုင်း မရှိသေးပါခင်ဗျာ။ Login ဝင်ရန် အင်တာနက် ဖွင့်ပေးပါ။";
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
      const res = await fetchWithTimeout(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      }, LOGIN_TIMEOUT_MS);

      const json = await res.json().catch(() => ({ success: false, message: "Server response error" }));

      if (res.ok && json.success && json.token) {
        const expiresInMs = json.expiresInMs || THIRTY_DAYS_MS;
        const expiresAt = Date.now() + expiresInMs;
        const userObj = json.user || { username, role: username, name: username };

        const saved = safeSetStorage("sasana_auth_token", json.token);
        if (!saved) {
          if (errDiv) {
            errDiv.textContent = "Browser Storage ပိတ်ထားပါသည် (Safari Private Mode ဖြစ်ပါက ပုံမှန် Tab ဖြင့် ဖွင့်ပေးပါ)။";
            errDiv.classList.remove("hidden");
          }
          return;
        }

        safeSetStorage("sasana_user_name", userObj.username);
        safeSetStorage("sasana_user_role", userObj.role || username);
        safeSetStorage("sasana_display_name", userObj.name || ROLE_BURMESE_MAP[userObj.role] || userObj.username);
        safeSetStorage("sasana_token_expires_at", String(expiresAt));

        safeSetStorage("yogi_auth_token", json.token);
        safeSetStorage("yogi_user_name", userObj.username);
        safeSetStorage("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) {
          passwordInput.value = "";
          passwordInput.type = "password";
        }

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
        if (!navigator.onLine) {
          errDiv.textContent = "အင်တာနက်လိုင်း ပြတ်တောက်နေပါသည်။";
        } else if (err && err.name === "AbortError") {
          errDiv.textContent = "ဆာဗာ ချိတ်ဆက်ချိန် ကျော်လွန်သွားပါသည် (၁၅ စက္ကန့်)။ ဖုန်းအင်တာနက်လိုင်း သို့မဟုတ် VPN ဖွင့်ပြီး ပြန်လည်ဝင်ရောက်ပါ။";
        } else {
          errDiv.textContent = "ဆာဗာသို့ ချိတ်ဆက်၍ မရပါ (VPN သို့မဟုတ် အင်တာနက် စစ်ဆေးပါ): " + (err.message || "Network error");
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
        pwdInput.type = "password";
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
      const res = await fetchWithTimeout(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      }, LOGIN_TIMEOUT_MS);

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success && json.token) {
        const expiresInMs = json.expiresInMs || THIRTY_DAYS_MS;
        const expiresAt = Date.now() + expiresInMs;

        safeSetStorage("sasana_auth_token", json.token);
        safeSetStorage("yogi_auth_token", json.token);
        safeSetStorage("sasana_token_expires_at", String(expiresAt));
        safeSetStorage("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) {
          passwordInput.value = "";
          passwordInput.type = "password";
        }
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
        errDiv.textContent = (err && err.name === "AbortError")
          ? "ဆာဗာ ချိတ်ဆက်ချိန် ကျော်လွန်သွားပါသည်။ အင်တာနက် သို့မဟုတ် VPN စစ်ဆေးပါ။"
          : "ကွန်ရက် အမှားဖြစ်ပေါ်နေပါသည်။ အင်တာနက်စစ်ဆေးပါ။";
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
      const ver = safeGetStorage("sasana_app_version");
      try { localStorage.clear(); } catch (_) {}
      if (ver) safeSetStorage("sasana_app_version", ver);
      window.location.reload();
    }
  };

  window.handleLogoutSilent = async function () {
    if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
    if (typeof window.clearOfflineCache === "function") {
      await window.clearOfflineCache();
    }
    const ver = safeGetStorage("sasana_app_version");
    try { localStorage.clear(); } catch (_) {}
    if (ver) safeSetStorage("sasana_app_version", ver);
    window.showLoginOverlay();
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
// === END OF auth.js ===
