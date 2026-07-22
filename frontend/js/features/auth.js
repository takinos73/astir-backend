/* =====================
   FRONTEND LOGIN (ROLE)
===================== */

const ROLE_PASSWORDS = {
  technician: "tech123",
  planner: "plan123",
  admin: "admin1267"
};

const ROLE_STORAGE_KEY = "cmmsRole";
const TECHNICIAN_ID_STORAGE_KEY = "cmmsTechnicianId";
const TECHNICIAN_NAME_STORAGE_KEY = "cmmsTechnicianName";

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
   LOAD LOGIN TECHNICIANS
===================== */
async function loadLoginTechnicians() {
  const select = document.getElementById("loginTechnician");
  if (!select) return;

  try {
    const res = await fetch(`${API}/technicians`);

    if (!res.ok) {
      throw new Error("Failed to load technicians");
    }

    const technicians = await res.json();

    select.innerHTML = `
      <option value="">Select technician</option>
    `;

    technicians
      .filter(t => t.active !== false)
      .forEach(t => {
        const option = document.createElement("option");

        option.value = t.id;
        option.textContent = t.name;
        option.dataset.role = t.role || "technician";

        select.appendChild(option);
      });

  } catch (err) {
    console.error("LOAD LOGIN TECHNICIANS ERROR:", err);

    select.innerHTML = `
      <option value="">Unable to load technicians</option>
    `;
  }
}

/* =====================
   LOGIN HANDLER
===================== */
document.getElementById("loginBtn")?.addEventListener("click", () => {
  const select = document.getElementById("loginTechnician");
  const pass = document.getElementById("loginPassword")?.value;
  const error = document.getElementById("loginError");

  const selectedOption =
    select?.options[select.selectedIndex];

  const technicianId = select?.value;
  const technicianName =
    selectedOption?.textContent?.trim();

  const role =
    selectedOption?.dataset.role || "";

  if (
    !technicianId ||
    !technicianName ||
    !ROLE_PASSWORDS[role] ||
    ROLE_PASSWORDS[role] !== pass
  ) {
    if (error) error.style.display = "block";
    return;
  }

  if (error) error.style.display = "none";

  localStorage.setItem(
    TECHNICIAN_ID_STORAGE_KEY,
    technicianId
  );

  localStorage.setItem(
    TECHNICIAN_NAME_STORAGE_KEY,
    technicianName
  );

  localStorage.setItem(
    ROLE_STORAGE_KEY,
    role
  );

  applyRoleUI(role);
});

/* =====================
   INIT LOGIN ON LOAD
===================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLoginTechnicians();

  const role = localStorage.getItem(ROLE_STORAGE_KEY);

  if (!role) {
    showLogin();
  } else {
    applyRoleUI(role);

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-block";
  }
});

/* =====================
   LOGOUT
===================== */
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(TECHNICIAN_ID_STORAGE_KEY);
  localStorage.removeItem(TECHNICIAN_NAME_STORAGE_KEY);

  const badge = document.getElementById("loggedRoleBadge");
  const logoutBtn = document.getElementById("logoutBtn");

  if (badge) badge.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";

  const pass = document.getElementById("loginPassword");
  if (pass) pass.value = "";

  const technicianSelect =
    document.getElementById("loginTechnician");

  if (technicianSelect) {
    technicianSelect.value = "";
  }

  showLogin();
});
