// js/auth.js - Authentication & User Session Manager
window.currentUser = null;

window.initAuth = function() {
  const saved = localStorage.getItem("cashbook_user");
  if (saved) {
    try {
      window.currentUser = JSON.parse(saved);
      document.getElementById("login-overlay").classList.add("hidden");
      document.getElementById("erp-workspace").classList.remove("hidden");
      updateUserBadge();
      return true;
    } catch(e) {}
  }
  document.getElementById("login-overlay").classList.remove("hidden");
  document.getElementById("erp-workspace").classList.add("hidden");
  return false;
};

window.handleLoginSubmit = function(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const pass = document.getElementById("login-password").value;
  const errDiv = document.getElementById("login-error");

  if (pass === "123456" || pass === "admin") {
    window.currentUser = {
      username: username,
      role: username === "Admin" ? "ADMIN" : (username === "Account" ? "ACCOUNT" : "VIEWER"),
      loginTime: new Date().toLocaleString()
    };
    localStorage.setItem("cashbook_user", JSON.stringify(window.currentUser));
    errDiv.classList.add("hidden");
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("erp-workspace").classList.remove("hidden");
    updateUserBadge();
    window.switchTab("Home");
  } else {
    errDiv.textContent = "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။ (Default: 123456)";
    errDiv.classList.remove("hidden");
  }
};

window.handleLogout = function() {
  localStorage.removeItem("cashbook_user");
  window.currentUser = null;
  location.reload();
};

function updateUserBadge() {
  if (!window.currentUser) return;
  const dateStr = new Date().toLocaleDateString("my-MM");
  const badge = document.getElementById("current-user-display");
  if (badge) {
    badge.textContent = `Date: ${dateStr} | ${window.currentUser.username} (${window.currentUser.role})`;
  }
}