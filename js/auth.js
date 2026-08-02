// js/auth.js

const USERS = {
  "Admin": { pass: "Admin123", role: "Admin" },
  "Account": { pass: "Account123", role: "Account" },
  "Viewer": { pass: "Viewer123", role: "Viewer" }
};

function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-username").value;
  const p = document.getElementById("login-password").value.trim();
  const err = document.getElementById("login-error");

  if (USERS[u] && USERS[u].pass === p) {
    const authData = { user: u, role: USERS[u].role, token: "AUTH-" + new Date().getTime() };
    localStorage.setItem("dhamma_auth", JSON.stringify(authData));
    err.classList.add("hidden");
    initApp();
  } else {
    err.innerText = "အသုံးပြုသူအမည် သို့မဟုတ် လျှို့ဝှက်နံပါတ် မှားယွင်းနေပါသည်။";
    err.classList.remove("hidden");
  }
}

function handleLogout() {
  localStorage.removeItem("dhamma_auth");
  location.reload();
}

function getAuthUser() {
  const data = localStorage.getItem("dhamma_auth");
  return data ? JSON.parse(data) : null;
}

// Check if user is allowed to edit based on 30-day rule
function canEditRecord(recordDateStr) {
  const auth = getAuthUser();
  if (!auth) return false;
  if (auth.role === "Admin") return true;
  if (auth.role === "Viewer") return false;

  if (auth.role === "Account") {
    if (!recordDateStr) return true;
    
    // Parse DD-MM-YYYY or YYYY-MM-DD
    let recDate;
    if (recordDateStr.includes("-")) {
      const parts = recordDateStr.split("-");
      if (parts[0].length === 4) {
        recDate = new Date(recordDateStr);
      } else {
        recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    } else {
      recDate = new Date(recordDateStr);
    }

    const today = new Date();
    const diffTime = Math.abs(today - recDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= 30; // Locked if older than 30 days
  }
  return false;
}