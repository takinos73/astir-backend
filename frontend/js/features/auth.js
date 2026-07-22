/* =====================
   FRONTEND LOGIN
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
   NORMALIZE DATABASE ROLE
===================== */
function normalizeTechnicianRole(dbRole) {
  const role = String(dbRole || "")
    .trim()
    .toLowerCase();

  const roleMap = {
    technician: "technician",
    supervisor: "planner",
    planner: "planner",
    admin: "admin"
  };

  return roleMap[role] || "technician";
}

/* =====================
   LOGIN OVERLAY HELPERS
===================== */
function showLogin() {
  const overlay = document.getElementById("loginOverlay");

  if (overlay) {
    overlay.style.display = "flex";
  }
}

function hideLogin() {
  const overlay = document.getElementById("loginOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }
}

/* =====================
   APPLY ROLE UI
===================== */
function applyRoleUI(role) {
  window.currentUserRole = role;

  document.body.dataset.role = role;

  document.querySelectorAll(".admin-only").forEach(element => {
    element.style.display = role === "admin" ? "" : "none";
  });

  const badge = document.getElementById("loggedRoleBadge");
  const text = document.getElementById("loggedRoleText");

  if (badge && text) {
    text.textContent = role;
    badge.style.display = "inline-block";
  }

  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
  }

  hideLogin();
}

/* =====================
   LOAD LOGIN TECHNICIANS
===================== */
async function loadLoginTechnicians() {
  const select = document.getElementById("loginTechnician");

  if (!select) return;

  select.innerHTML = `
    <option value="">Loading technicians...</option>
  `;

  select.disabled = true;

  try {
    const response = await fetch(`${API}/technicians`);

    if (!response.ok) {
      throw new Error(
        `Failed to load technicians: ${response.status}`
      );
    }

    const technicians = await response.json();

    select.innerHTML = `
      <option value="">Select technician</option>
    `;

    technicians
      .filter(technician => technician.active !== false)
      .sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || ""),
          "el"
        )
      )
      .forEach(technician => {
        const option = document.createElement("option");

        option.value = technician.id;
        option.textContent = technician.name;
        option.dataset.role =
          normalizeTechnicianRole(technician.role);

        select.appendChild(option);
      });

    select.disabled = false;
  } catch (error) {
    console.error(
      "LOAD LOGIN TECHNICIANS ERROR:",
      error
    );

    select.innerHTML = `
      <option value="">Unable to load technicians</option>
    `;

    select.disabled = true;
  }
}

/* =====================
   LOGIN
===================== */
function handleLogin() {
  const select =
    document.getElementById("loginTechnician");

  const passwordInput =
    document.getElementById("loginPassword");

  const error =
    document.getElementById("loginError");

  if (!select || !passwordInput) return;

  const selectedOption =
    select.options[select.selectedIndex];

  const technicianId = select.value;

  const technicianName =
    selectedOption?.textContent?.trim() || "";

  const role =
    normalizeTechnicianRole(
      selectedOption?.dataset.role
    );

  const password = passwordInput.value;

  const validPassword = ROLE_PASSWORDS[role];

  if (
    !technicianId ||
    !technicianName ||
    !validPassword ||
    password !== validPassword
  ) {
    if (error) {
      error.style.display = "block";
      error.textContent = "❌ Invalid credentials";
    }

    return;
  }

  if (error) {
    error.style.display = "none";
  }

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

  passwordInput.value = "";

  applyRoleUI(role);
}

/* =====================
   TOGGLE PASSWORD
===================== */
function toggleLoginPassword() {
  const input =
    document.getElementById("loginPassword");

  const button =
    document.getElementById("toggleLoginPassword");

  if (!input || !button) return;

  const passwordIsHidden =
    input.type === "password";

  input.type =
    passwordIsHidden ? "text" : "password";

  button.textContent =
    passwordIsHidden ? "🙈" : "👁";

  button.title =
    passwordIsHidden
      ? "Hide password"
      : "Show password";

  button.setAttribute(
    "aria-label",
    passwordIsHidden
      ? "Hide password"
      : "Show password"
  );
}

/* =====================
   LOGOUT
===================== */
function handleLogout() {
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(
    TECHNICIAN_ID_STORAGE_KEY
  );
  localStorage.removeItem(
    TECHNICIAN_NAME_STORAGE_KEY
  );

  window.currentUserRole = null;

  delete document.body.dataset.role;

  const badge =
    document.getElementById("loggedRoleBadge");

  const logoutBtn =
    document.getElementById("logoutBtn");

  const passwordInput =
    document.getElementById("loginPassword");

  const technicianSelect =
    document.getElementById("loginTechnician");

  const loginError =
    document.getElementById("loginError");

  const passwordToggle =
    document.getElementById("toggleLoginPassword");

  if (badge) {
    badge.style.display = "none";
  }

  if (logoutBtn) {
    logoutBtn.style.display = "none";
  }

  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.type = "password";
  }

  if (passwordToggle) {
    passwordToggle.textContent = "👁";
    passwordToggle.title = "Show password";
    passwordToggle.setAttribute(
      "aria-label",
      "Show password"
    );
  }

  if (technicianSelect) {
    technicianSelect.value = "";
  }

  if (loginError) {
    loginError.style.display = "none";
  }

  showLogin();
}

/* =====================
   INIT LOGIN
===================== */
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn =
    document.getElementById("loginBtn");

  const logoutBtn =
    document.getElementById("logoutBtn");

  const passwordToggle =
    document.getElementById("toggleLoginPassword");

  const passwordInput =
    document.getElementById("loginPassword");

  const technicianSelect =
    document.getElementById("loginTechnician");

  loginBtn?.addEventListener(
    "click",
    handleLogin
  );

  logoutBtn?.addEventListener(
    "click",
    handleLogout
  );

  passwordToggle?.addEventListener(
    "click",
    toggleLoginPassword
  );

  passwordInput?.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        handleLogin();
      }
    }
  );

  technicianSelect?.addEventListener(
    "change",
    () => {
      const error =
        document.getElementById("loginError");

      if (error) {
        error.style.display = "none";
      }
    }
  );

  loadLoginTechnicians();

  const savedRole =
    localStorage.getItem(ROLE_STORAGE_KEY);

  const savedTechnicianId =
    localStorage.getItem(
      TECHNICIAN_ID_STORAGE_KEY
    );

  if (savedRole && savedTechnicianId) {
    applyRoleUI(
      normalizeTechnicianRole(savedRole)
    );
  } else {
    localStorage.removeItem(ROLE_STORAGE_KEY);
    localStorage.removeItem(
      TECHNICIAN_ID_STORAGE_KEY
    );
    localStorage.removeItem(
      TECHNICIAN_NAME_STORAGE_KEY
    );

    showLogin();
  }
});
