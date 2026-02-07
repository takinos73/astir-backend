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
   LOGIN OVERLAY HELPERS
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
  window.currentUserRole = role;

  document.body.dataset.role = role;

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = role === "admin" ? "" : "none";
  });

  const badge = document.getElementById("loggedRoleBadge");
  const text = document.getElementById("loggedRoleText");

  if (badge && text) {
    text.textContent = role;
    badge.style.display = "inline-block";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = "inline-block";

  hideLogin(); // ✅ ΑΥΤΟ ΛΕΙΠΕ
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
  applyRoleUI(role);
  hideLogin(); // ⬅️ ΠΑΝΤΑ ΤΕΛΕΥΤΑΙΟ
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

    // ✅ FORCE logout visibility (single source of truth)
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-block";
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

