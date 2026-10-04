const ROLE_STORAGE_KEY = "cmmsRole";
const TECHNICIAN_ID_STORAGE_KEY = "cmmsTechnicianId";
const TECHNICIAN_NAME_STORAGE_KEY = "cmmsTechnicianName";

/* =====================
   NORMALIZE DATABASE ROLE
===================== */

function normalizeTechnicianRole(dbRole) {

  const role =
    String(dbRole || "")
      .trim()
      .toLowerCase();


  const roleMap = {

    technician: "technician",

    supervisor: "planner",

    planner: "planner",

    admin: "admin",

    manager: "manager"

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


  const isAdmin =
    role === "admin";

  const isPlanner =
    role === "planner";

  const isManager =
    role === "manager";


  /* =====================
     ADMIN ONLY
  ===================== */

  document
    .querySelectorAll(".admin-only")
    .forEach(element => {

      element.style.display =
        isAdmin
          ? ""
          : "none";

    });


  /* =====================
     PLANNER + ADMIN
  ===================== */

  document
    .querySelectorAll(".planner-admin-only")
    .forEach(element => {

      element.style.display =
        (
          isPlanner ||
          isAdmin
        )
          ? ""
          : "none";

    });


  /* =====================
     LOGGED USER INFO
  ===================== */

  const userInfo =
    document.getElementById(
      "loggedUserInfo"
    );


  const nameText =
    document.getElementById(
      "loggedTechnicianName"
    );


  const roleBadge =
    document.getElementById(
      "loggedRoleBadge"
    );


  const roleText =
    document.getElementById(
      "loggedRoleText"
    );


  const technicianName =
    localStorage.getItem(
      TECHNICIAN_NAME_STORAGE_KEY
    ) || "-";


  if (nameText) {

    nameText.textContent =
      technicianName;

  }


  if (roleText) {

    roleText.textContent =
      role;

  }


  if (userInfo) {

    userInfo.style.display =
      "flex";

  }


  if (roleBadge) {

    roleBadge.style.display =
      "inline-block";

  }


  /* =====================
     LOGOUT
  ===================== */

  const logoutBtn =
    document.getElementById(
      "logoutBtn"
    );


  if (logoutBtn) {

    logoutBtn.style.display =
      "inline-block";

  }


  /* =====================
     MANAGER VIEW
  ===================== */

  if (isManager) {

    /* ---------------------
       HIDE ALL MAIN TABS
    --------------------- */

    document
      .querySelectorAll(".main-tab")
      .forEach(tab => {

        tab.style.display =
          "none";

        tab.classList.remove(
          "active"
        );

      });


    /* ---------------------
       SHOW MANAGEMENT TAB
    --------------------- */

    const managementTab =
      document.querySelector(
        '.main-tab[data-tab="management"]'
      );


    if (managementTab) {

      managementTab.style.display =
        "";

      managementTab.classList.add(
        "active"
      );

    }


    /* ---------------------
       HIDE TOP TOOLS
    --------------------- */

    const topTools =
      document.querySelector(
        ".top-tools"
      );


    if (topTools) {

      topTools.style.display =
        "none";

    }


    /* ---------------------
       HIDE ALL PANELS
    --------------------- */

    document
      .querySelectorAll(".tab-panel")
      .forEach(panel => {

        panel.style.display =
          "none";

      });


    /* ---------------------
       SHOW MANAGEMENT PANEL
    --------------------- */

    const managementPanel =
      document.getElementById(
        "tab-management"
      );


    if (managementPanel) {

      managementPanel.style.display =
        "block";

    }


    /* ---------------------
       LOAD MANAGEMENT
       THROUGH EXISTING TAB LOGIC
    --------------------- */

    if (managementTab) {

      managementTab.click();

    }

  }


  /* =====================
     NORMAL CMMS VIEW
     ADMIN / PLANNER /
     TECHNICIAN
  ===================== */

  else {

    document
      .querySelectorAll(".main-tab")
      .forEach(tab => {

        tab.style.display =
          "";

      });


    const topTools =
      document.querySelector(
        ".top-tools"
      );


    if (topTools) {

      topTools.style.display =
        "";

    }

  }


  /* =====================
     REFRESH ASSET CARDS
  ===================== */

  if (
    !isManager &&
    typeof renderAssetsCards === "function"
  ) {

    renderAssetsCards();

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
    const response = await fetch( `${API}/technicians?include_managers=true`);

    if (!response.ok) {
      throw new Error(
        `Failed to load technicians: ${response.status}`
      );
    }

    const technicians = await response.json();

    select.innerHTML = `
      <option value="">Select User</option>
    `;

    technicians
      .filter(
          technician =>
          technician.active !== false &&
          technician.is_user === true
      )
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

async function handleLogin() {

  const select =
    document.getElementById(
      "loginTechnician"
    );

  const passwordInput =
    document.getElementById(
      "loginPassword"
    );

  const error =
    document.getElementById(
      "loginError"
    );


  if (
    !select ||
    !passwordInput
  ) {
    return;
  }


  const selectedOption =
    select.options[
      select.selectedIndex
    ];


  const technicianId =
    select.value;


  const technicianName =
    selectedOption
      ?.textContent
      ?.trim() || "";


  const password =
    passwordInput.value;


  /* =====================
     BASIC VALIDATION
  ===================== */

  if (
    !technicianId ||
    !technicianName ||
    !password
  ) {

    if (error) {

      error.style.display =
        "block";

      error.textContent =
        "❌ Invalid credentials";

    }

    return;
  }


  if (error) {

    error.style.display =
      "none";

  }


  /* =====================
     BACKEND LOGIN
  ===================== */

  try {

    const response =
      await fetch(
        `${API}/auth/login-v2`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            technician_id:
              Number(
                technicianId
              ),

            password

          })
        }
      );


    const data =
      await response.json();


    /* =====================
       INVALID LOGIN
    ===================== */

    if (
      !response.ok ||
      !data?.success ||
      !data?.role
    ) {

      if (error) {

        error.style.display =
          "block";

        error.textContent =
          "❌ Invalid credentials";

      }

      return;
    }


    /* =====================
       SUCCESS
    ===================== */

    const role =
      normalizeTechnicianRole(
        data.role
      );


    localStorage.setItem(
      TECHNICIAN_ID_STORAGE_KEY,
      String(
        data.technician_id
      )
    );


    localStorage.setItem(
      TECHNICIAN_NAME_STORAGE_KEY,
      data.technician_name ||
      technicianName
    );


    localStorage.setItem(
      ROLE_STORAGE_KEY,
      role
    );


    passwordInput.value = "";


    applyRoleUI(
      role
    );


  } catch (err) {

    console.error(
      "LOGIN ERROR:",
      err
    );


    if (error) {

      error.style.display =
        "block";

      error.textContent =
        "❌ Login service unavailable";

    }

  }

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

  const userInfo =
    document.getElementById("loggedUserInfo");

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

  const technicianName =
    document.getElementById("loggedTechnicianName");

  const roleText =
    document.getElementById("loggedRoleText");

  if (userInfo) {
    userInfo.style.display = "none";
  }

  if (badge) {
    badge.style.display = "none";
  }

  if (technicianName) {
    technicianName.textContent = "-";
  }

  if (roleText) {
    roleText.textContent = "-";
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
