/**
 * YOGI MANAGEMENT SYSTEM — Pure D1 Auth Controller (FULL FIXED)
 * File: js/auth.js 
 * 
 * ✅ FIXES:
 * - Added window.showWorkspace and window.showLoginOverlay
 * - Direct D1 Cloudflare Worker Authentication
 * - No hardcoded passwords in frontend
 */

(function () {
  "use strict";

  // 1. Get Current User Name
  window.getCurrentUser = function () {
    return localStorage.getItem("yogi_user_name") || localStorage.getItem("cashbook_user_name") || "Admin";
  };

  // 2. Show Workspace UI (Fixes ReferenceError)
  window.showWorkspace = function () {
    document.documentElement.className = "dark is-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");

    const liveUserEl = document.getElementById("live-user-name") || document.getElementById("current-user-display");
    if (liveUserEl) {
      liveUserEl.textContent = window.getCurrentUser();
    }
  };

  // 3. Show Login Overlay UI
  window.showLoginOverlay = function () {
    document.documentElement.className = "dark not-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (workspace) workspace.classList.add("hidden");
  };

  // 4. Check Existing Auth Session on Page Load
  window.checkExistingSession = function () {
    const token = localStorage.getItem("yogi_auth_token") || localStorage.getItem("cashbook_auth_token");
    const expiresAt = Number(localStorage.getItem("yogi_token_expires_at") || localStorage.getItem("cashbook_token_expires_at") || 0);

    const isValid = token && expiresAt && Date.now() < expiresAt;

    if (isValid) {
      window.showWorkspace();

      // App စတင်မည်
      if (typeof window.initApp === "function") {
        window.initApp();
      }
      return true;
    } else {
      window.showLoginOverlay();
      return false;
    }
  };

  // 5. Login Submission Handler (Queries Cloudflare D1 API)
  window.handleLoginSubmit = async function (event) {
    if (event && event.preventDefault) event.preventDefault();

    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const errDiv = document.getElementById("login-error");
    const submitBtn = event && event.target ? event.target.querySelector("button[type='submit']") : null;

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
    if (submitBtn) submitBtn.disabled = true;

    try {
      // getApiUrl() ထံမှ Cloudflare Worker URL ကို ယူမည်
      const apiUrl = typeof window.getApiUrl === "function" 
        ? window.getApiUrl() 
        : (window.CONFIG && window.CONFIG.API_URL) 
        || "https://cashbook-api.dhammaaly.workers.dev";

      // Cloudflare D1 Worker API သို့ Login Request ပို့မည်
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkLogin",
          username: username,
          password: password
        })
      });

      const json = await res.json().catch(() => ({ success: false, message: "Server response error" }));

      if (res.ok && json.success && json.token) {
        // D1 Login အောင်မြင်ပါက Session သိမ်းဆည်းမည်
        const expiresInMs = json.expiresInMs || (24 * 60 * 60 * 1000);
        const expiresAt = Date.now() + expiresInMs;

        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("yogi_user_name", json.user ? json.user.username : username);
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (window.AppState) {
          window.AppState.currentUser = json.user ? json.user.username : username;
        }

        if (passwordInput) passwordInput.value = "";

        // UI ပြောင်းလဲမည်
        window.showWorkspace();

        // App နှင့် Live Sync စတင်မည်
        if (typeof window.initApp === "function") {
          window.initApp();
        } else if (typeof window.switchTab === "function") {
          window.switchTab("home");
        }

        if (typeof window.startLiveSync === "function") {
          window.startLiveSync();
        }

      } else {
        // D1 Login မအောင်မြင်ပါက Error ပြမည်
        if (errDiv) {
          errDiv.textContent = json.message || "အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
          errDiv.classList.remove("hidden");
        }
      }

    } catch (err) {
      console.error("[Login Exception]", err);
      if (errDiv) {
        errDiv.textContent = "ကွန်ရက် သို့မဟုတ် ဆာဗာ အမှားဖြစ်ပေါ်နေပါသည်: " + (err.message || "Failed to fetch");
        errDiv.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  // 6. Logout Handlers
  window.handleLogout = function () {
    if (confirm("စနစ်မှ ထွက်ရန် သေချာပါသလား။")) {
      window.handleLogoutSilent();
    }
  };

  window.handleLogoutSilent = function () {
    localStorage.removeItem("yogi_auth_token");
    localStorage.removeItem("yogi_user_name");
    localStorage.removeItem("yogi_token_expires_at");

    window.showLoginOverlay();
  };

  // Init Session Check on Load
  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
