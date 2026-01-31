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

/* =====================
   APPLY ROLE UI
===================== */
function applyRoleUI(role) {
  document.body.dataset.role = role;

  // Admin-only elements
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = role === "admin" ? "" : "none";
  });

  // Show logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
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
   LOGOUT
===================== */
function logout() {
  console.log("LOGOUT");

  localStorage.removeItem(ROLE_STORAGE_KEY);
  document.body.dataset.role = "";

  // Hide admin-only
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = "none";
  });

  // Hide logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "none";

  showLogin();
}

document.getElementById("logoutBtn")
  ?.addEventListener("click", logout);

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
