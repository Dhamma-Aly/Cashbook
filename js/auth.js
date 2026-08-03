// js/auth.js - Authentication & User Session Manager (Custom Header Badge Format)
window.currentUser = null;
let clockInterval = null;

window.initAuth = function() {
  const saved = localStorage.getItem("cashbook_user");
  if (saved) {
    try {
      window.currentUser = JSON.parse(saved);
      document.getElementById("login-overlay").classList.add("hidden");
      document.getElementById("erp-workspace").classList.remove("hidden");
      updateUserBadge();
      startLiveClock();
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
    startLiveClock();
    window.switchTab("Home");
  } else {
    errDiv.textContent = "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။ (Default: 123456)";
    errDiv.classList.remove("hidden");
  }
};

window.handleLogout = function() {
  if (clockInterval) clearInterval(clockInterval);
  localStorage.removeItem("cashbook_user");
  window.currentUser = null;
  location.reload();
};

// 💡 Format: Mon 3 Aug 26 I 1:05 PM
function formatCustomDate() {
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dayName = days[now.getDay()];
  const dayNum = now.getDate();
  const monthName = months[now.getMonth()];
  const yearTwoDigits = String(now.getFullYear()).slice(-2); // e.g. 2026 -> 26

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12

  return `${dayName} ${dayNum} ${monthName} ${yearTwoDigits} I ${hours}:${minutes} ${ampm}`;
}

function updateUserBadge() {
  if (!window.currentUser) return;
  const badgeStr = formatCustomDate();
  const badge = document.getElementById("current-user-display");
  if (badge) {
    // Result: DATE: Mon 3 Aug 26 I 1:05 PM I Admin
    badge.textContent = `DATE: ${badgeStr} I ${window.currentUser.username}`;
  }
}

// 💡 အချိန် (နာရီ/မိနစ်) ကို အလိုအလျောက် Live ပုံမှန် Update လုပ်ပေးခြင်း
function startLiveClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(updateUserBadge, 10000); // 10 စက္ကန့်တစ်ခါ အချိန်စစ်ပေးမည်
}
