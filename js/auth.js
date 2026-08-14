/**
 * Sāsana ERP System — Pure D1 Auth Controller
 * File: js/auth.js 
 */

(function () {
  "use strict";

  // 🚨 Version Check: Version အသစ်တင်လိုက်ပါက Session အဟောင်းများကို Auto ရှင်းထုတ်မည်
  const CURRENT_APP_VERSION = "v3.0_D1_AUTH";
  if (localStorage.getItem("sasana_app_version") !== CURRENT_APP_VERSION) {
    localStorage.clear();
    localStorage.setItem("sasana_app_version", CURRENT_APP_VERSION);
  }

  // 1. Get Current User Name
  window.getCurrentUser = function () {
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    if (!token) return null;
    return localStorage.getItem("sasana_user_name") || localStorage.getItem("yogi_user_name") || null;
  };

  // 2. Show Workspace UI
  window.showWorkspace = function () {
    document.documentElement.className = "dark is-authed";
    const loginOverlay = document.getElementById("login-overlay");
    const workspace = document.getElementById("erp-workspace");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (workspace) workspace.classList.remove("hidden");

    const liveUserEl = document.getElementById("live-user-name") || document.getElementById("current-user-display");
    if (liveUserEl) {
      liveUserEl.textContent = window.getCurrentUser() || "Admin";
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
    const token = localStorage.getItem("sasana_auth_token") || localStorage.getItem("yogi_auth_token");
    const expiresAt = Number(localStorage.getItem("sasana_token_expires_at") || localStorage.getItem("yogi_token_expires_at") || 0);

    const isValid = token && expiresAt && Date.now() < expiresAt;

    if (isValid) {
      window.showWorkspace();
      // 💡 Note: initApp() ကို app.js ရဲ့ DOMContentLoaded ကပဲ တစ်ကြိမ်တည်း ခေါ်သုံးပါမည်
      return true;
    } else {
      window.showLoginOverlay();
      return false;
    }
  };

  // 5. Login Submission Handler
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
      const baseUrl = (window.CONFIG && window.CONFIG.API_BASE_URL)
        || (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
        || "https://cashbook-api.dhammaaly.workers.dev";

      const res = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      const json = await res.json().catch(() => ({ success: false, message: "Server response error" }));

      if (res.ok && json.success && json.token) {
        const expiresInMs = json.expiresInMs || (24 * 60 * 60 * 1000);
        const expiresAt = Date.now() + expiresInMs;

        const userObj = json.user || { username: username, role: "Staff" };

        localStorage.setItem("sasana_auth_token", json.token);
        localStorage.setItem("sasana_user_name", userObj.username);
        localStorage.setItem("sasana_user_role", userObj.role || "Staff");
        localStorage.setItem("sasana_token_expires_at", String(expiresAt));

        localStorage.setItem("yogi_auth_token", json.token);
        localStorage.setItem("yogi_user_name", userObj.username);
        localStorage.setItem("yogi_token_expires_at", String(expiresAt));

        if (passwordInput) passwordInput.value = "";

        window.showWorkspace();

        if (typeof window.initApp === "function") {
          window.initApp();
        } else if (typeof window.switchTab === "function") {
          window.switchTab("Home");
        }

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
        errDiv.textContent = "ကွန်ရက် သို့မဟုတ် ဆာဗာ အမှားဖြစ်ပေါ်နေပါသည်: " + (err.message || "Failed to fetch");
        errDiv.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  // 6. Direct Fail-Proof Logout Handler
  window.handleLogout = function () {
    if (confirm("စနစ်မှ ထွက်ရန် သေချာပါသလား။")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  window.handleLogoutSilent = function () {
    localStorage.clear();
    window.showLoginOverlay();
  };

  // Init Session Check on Load
  document.addEventListener("DOMContentLoaded", () => {
    window.checkExistingSession();
  });
})();
