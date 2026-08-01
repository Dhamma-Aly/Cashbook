const USERS = {
  "Admin": { pass: "Admin123", role: "Admin" },
  "Account": { pass: "Account123", role: "Account" },
  "Viewer": { pass: "Viewer123", role: "Viewer" }
};

function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-username").value.trim();
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

function canEditRecord(recordDate) {
  const auth = getAuthUser();
  if (!auth) return false;
  if (auth.role === "Admin") return true;
  if (auth.role === "Viewer") return false;

  if (auth.role === "Account") {
    if (!recordDate) return true;
    const recDate = new Date(recordDate);
    const today = new Date();
    const diffTime = Math.abs(today - recDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30; // Cannot edit if > 30 days old
  }
  return false;
}