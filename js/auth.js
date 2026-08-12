/**
 * YOGI MANAGEMENT SYSTEM — Pure D1 Auth Controller (FULL FIXED)
 * File: js/auth.js
 * 
 * ✅ FIXES:
 * - Direct D1 Cloudflare Worker Authentication
 * - No hardcoded passwords in frontend
 * - Correct LocalStorage Keys (yogi_auth_token, yogi_user_name, yogi_token_expires_at)
 */

(function () {
  "use strict";

  // 1. Get Current User Name
  window.getCurrentUser = function () {
    return localStorage.getItem("yogi_user_name") || "Admin";
  };

  // 2. Check Existing Auth Session on Page Load
  window.checkExistingSession = function () {
    const token = localStorage.getItem("yogi_auth_token");
    const expiresAt = Number(localStorage.getItem("yogi_token_expires_at") || 0);

    // Token ရှိပြီး သက်တမ်းမကုန်သေးပါက Login အဖြစ် သတ်မှတ်မည်
    const isValid = token && expiresAt && Date.now() < expiresAt;

    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");
    const liveUserEl = document.getElementById("live-user-name");

    if (isValid) {
      document.documentElement.className = "dark is-authed";
      if (loginOverlay) loginOverlay.classList.add("hidden");
      if (workspace) workspace.classList.remove("hidden");
      if (liveUserEl) liveUserEl.textContent = window.getCurrentUser();

      // App စတင်မည်
      if (typeof window.initApp === "function") {
        window.initApp();
      }
      return true;
    } else {
      window.handleLogoutSilent();
      return false;
    }
  };

  // 3. Login Submission Handler (Queries Cloudflare D1 API)
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
        : "https://yogi-list.kotuntunwin1985.workers.dev";

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
        // D1 Login အောင်မြင်ပါက Token စသည်တို့ကို LocalStorage တွင် သိမ်းဆည်းမည်
        const expiresInMs = json.expiresInMs || (24 * 60 * 60 * 1000);
        const expiresAt = Date.now() + expiresInMs;

        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("yogi_user_name", json.user ? json.user.username : username);
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        // AppState တွင် Current User မှတ်သားမည်
        if (window.AppState) {
          window.AppState.currentUser = json.user ? json.user.username : username;
        }

        // UI ပြောင်းလဲမည်
        document.documentElement.className = "dark is-authed";
        const loginOverlay = document.getElementById("login-overlay");
        const workspace = document.getElementById("erp-workspace");
        if (loginOverlay) loginOverlay.classList.add("hidden");
        if (workspace) workspace.classList.remove("hidden");

        const liveUserEl = document.getElementById("live-user-name");
        if (liveUserEl) liveUserEl.textContent = json.user ? json.user.username : username;

        // Password Input ကွက်ကို ရှင်းထုတ်မည်
        if (passwordInput) passwordInput.value = "";

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
        // D1 Login မအောင်မြင်ပါက Error Message ပြမည်
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

  // 4. Logout Handlers
  window.handleLogout = function () {
    if (confirm("စနစ်မှ ထွက်ရန် သေချာပါသလား။")) {
      window.handleLogoutSilent();
    }
  };

  window.handleLogoutSilent = function () {
    localStorage.removeItem("yogi_auth_token");
    localStorage.removeItem("yogi_user_name");
    localStorage.removeItem("yogi_token_expires_at");

    document.documentElement.className = "dark not-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (workspace) workspace.classList.add("hidden");
  };

  // Init Session Check on Load
  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
