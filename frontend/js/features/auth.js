/* =====================
   FRONTEND LOGIN (ROLE)
===================== */

const ROLE_PASSWORDS = {
  technician: "tech123",
  planner: "plan123",
  admin: "admin123"
};

const ROLE_STORAGE_KEY = "cmmsRole";

/* =====================
   LOGIN OVERLAY
===================== */

function showLogin() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.style.display = "flex";
}

function hideLogin() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.style.display = "none";
}

function applyRoleUI(role) {
  document.body.dataset.role = role;

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = role === "admin" ? "" : "none";
  });

  // 🔹 Logged as badge
  const badge = document.getElementById("loggedRoleBadge");
  const text = document.getElementById("loggedRoleText");

  if (badge && text) {
    text.textContent = role;
    badge.style.display = "inline-block";
  }

  // 🔹 Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "inline-block";
}


/* =====================
   LOGIN HANDLER
===================== */
document.getElementById("loginBtn")?.addEventListener("click", () => {
  const role = document.getElementById("loginRole")?.value;
  const pass = document.getElementById("loginPassword")?.value;
  const error = document.getElementById("loginError");

  if (!ROLE_PASSWORDS[role] || ROLE_PASSWORDS[role] !== pass) {
    if (error) error.style.display = "block";
    return;
  }

  if (error) error.style.display = "none";

  localStorage.setItem(ROLE_STORAGE_KEY, role);
  hideLogin();
  applyRoleUI(role);
});

/* =====================
   INIT LOGIN ON LOAD
===================== */
document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem(ROLE_STORAGE_KEY);

  if (!role) {
    showLogin();
  } else {
    applyRoleUI(role);
  }
});

/* =====================
   LOGOUT
===================== */
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  localStorage.removeItem("cmmsRole");

  // hide badge + logout
  const badge = document.getElementById("loggedRoleBadge");
  const logoutBtn = document.getElementById("logoutBtn");
  if (badge) badge.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";

  // clear password field for safety
  const pass = document.getElementById("loginPassword");
  if (pass) pass.value = "";

  showLogin();
});

