// js/auth.js - Authentication & User Session Manager (Cloudflare D1 Server Sync)
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

// 💡 Cloudflare Worker /api/login မှတစ်ဆင့် D1 Database တွင် လျှို့ဝှက် စစ်ဆေးခြင်း
window.handleLoginSubmit = async function(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const pass = document.getElementById("login-password").value;
  const errDiv = document.getElementById("login-error");
  const submitBtn = event.target.querySelector("button[type='submit']");

  if (!username || !pass) {
    errDiv.textContent = "အသုံးပြုသူအမည် နှင့် လျှို့ဝှက်နံပါတ် ဖြည့်ပါခင်ဗျာ။";
    errDiv.classList.remove("hidden");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  try {
    const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "https://cashbook.dhammaaly.workers.dev";
    
    // Server (D1 Database) ဆီသို့ လျှို့ဝှက် စစ်ဆေးခိုင်းခြင်း
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pass })
    });

    const json = await res.json();

    if (json.success && json.user) {
      window.currentUser = {
        username: json.user.username,
        role: json.user.role,
        loginTime: new Date().toLocaleString()
      };
      localStorage.setItem("cashbook_user", JSON.stringify(window.currentUser));
      errDiv.classList.add("hidden");
      document.getElementById("login-overlay").classList.add("hidden");
      document.getElementById("erp-workspace").classList.remove("hidden");
      updateUserBadge();
      startLiveClock();
      if (window.switchTab) window.switchTab("Home");
    } else {
      errDiv.textContent = json.message || "လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
      errDiv.classList.remove("hidden");
    }
  } catch (err) {
    errDiv.textContent = "ချိတ်ဆက်မှု မအောင်မြင်ပါ: " + err.message;
    errDiv.classList.remove("hidden");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.handleLogout = function() {
  if (clockInterval) clearInterval(clockInterval);
  localStorage.removeItem("cashbook_user");
  window.currentUser = null;
  location.reload();
};

// 💡 Format: Mon 3 Aug 26 | 1:05 PM
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

  // Pipe symbol '|' with subtle amber color
  return `${dayName} ${dayNum} ${monthName} ${yearTwoDigits} <span class="text-amber-500/40 font-normal px-1">|</span> ${hours}:${minutes} ${ampm}`;
}

function updateUserBadge() {
  if (!window.currentUser) return;
  const badgeStr = formatCustomDate();
  const badge = document.getElementById("current-user-display");
  if (badge) {
    // Result: DATE: Mon 3 Aug 26 | 1:05 PM | Admin
    badge.innerHTML = `DATE: ${badgeStr} <span class="text-amber-500/40 font-normal px-1">|</span> ${window.currentUser.username}`;
  }
}

function startLiveClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(updateUserBadge, 10000); // 10 စက္ကန့်တစ်ခါ အချိန်စစ်ပေးမည်
}
