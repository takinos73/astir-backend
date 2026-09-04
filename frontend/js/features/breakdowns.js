/* =========================================================
   BREAKDOWNS FEATURE
   New Breakdown Management System

   RESPONSIBILITIES:
   - Load Breakdown incidents
   - Render Breakdown table
   - Show empty state

   IMPORTANT:
   - Does NOT use legacy Breakdown Tasks
   - Reads only from GET /breakdowns
========================================================= */

/* =====================
   BREAKDOWN UI STATE

   Currently opened Breakdown
===================== */

let currentBreakdownId = null;
let currentBreakdownTasks = [];
let currentBreakdown = null;

// ============================================================
// RESTORATION LOCATION CATALOGUE
//
// Loaded fresh from:
// GET /assets/:id/locations
//
// We intentionally reload it every time the
// Add Restoration Task modal opens.
// This ensures newly created Sections / Units
// become immediately available.
// ============================================================

let currentRestorationLocations = [];
let currentRestorationLocationsAssetId = null;
// ============================================================
// RESTORATION TASK EDIT MODE
//
// null  → creating a new Restoration Task
// number → editing an existing Restoration Task
// ============================================================

let editingRestorationTaskId = null;


/* =========================================================
   BREAKDOWN STATUS CLASS
========================================================= */

function getBreakdownStatusClass(status) {

  switch (String(status || "").toUpperCase()) {

    case "OPEN":
      return "breakdown-status-open";

    case "IN_PROGRESS":
      return "breakdown-status-progress";

    case "CLOSED":
      return "breakdown-status-closed";

    default:
      return "";
  }

}


/* =====================
   LOAD BREAKDOWNS
===================== */

async function loadBreakdowns() {

  const tbody =
    document.getElementById("breakdownsTableBody");

  if (!tbody) return;


  /* =====================
     LOADING STATE
  ===================== */

  tbody.innerHTML = `
    <tr>
      <td colspan="8">
        Loading breakdowns...
      </td>
    </tr>
  `;


  try {

    const response =
      await fetch("/breakdowns");


    if (!response.ok) {
      throw new Error(
        `Failed to load breakdowns (${response.status})`
      );
    }


    const breakdowns =
      await response.json();


    renderBreakdownsTable(
      Array.isArray(breakdowns)
        ? breakdowns
        : []
    );


  } catch (err) {

    console.error(
      "LOAD BREAKDOWNS ERROR:",
      err
    );


    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          Failed to load breakdowns.
        </td>
      </tr>
    `;

  }

}

/* =====================
   RENDER BREAKDOWNS TABLE
===================== */

function renderBreakdownsTable(breakdowns) {

  const tbody =
    document.getElementById(
      "breakdownsTableBody"
    );

  if (!tbody) return;


  /* =====================
     CURRENT USER ROLE
  ===================== */

  const currentRole =
    String(
      localStorage.getItem("cmmsRole") || ""
    ).toLowerCase();

  const isAdmin =
    currentRole === "admin";


  /* =====================
     EMPTY STATE
  ===================== */

  if (
    !Array.isArray(breakdowns) ||
    breakdowns.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          No breakdowns recorded.
        </td>
      </tr>
    `;

    return;
  }


  /* =====================
     TABLE ROWS
  ===================== */

  tbody.innerHTML =
    breakdowns.map(b => {

      const id =
        b.id ?? "";

      const asset =
        b.asset_model || "-";

      const serial =
        b.asset_serial || "";

      const line =
        b.line_name || "-";

      const title =
        b.title || "-";

      const status =
        b.status || "-";

      const normalizedStatus =
        String(status).toUpperCase();

      const started =
        formatBreakdownDate(
          b.started_at
        );


      /* =====================
         ACTUAL DOWN TIME

         Source:
         breakdown_state_history

         This is NOT Incident Duration.
      ===================== */

      const downSeconds =
        Number(b.down_seconds || 0);

      const downTime =
        formatBreakdownSeconds(
          downSeconds
        );


      /* =====================
         REOPEN ACTION

         Admin only.
         Available only for CLOSED Breakdowns.
      ===================== */

      const canReopen =
        isAdmin &&
        normalizedStatus === "CLOSED";


      return `
        <tr>

          <td>
            BD-${String(id).padStart(5, "0")}
          </td>

          <td>
            <strong>
              ${escapeBreakdownHtml(asset)}
            </strong>

            ${
              serial
                ? `
                  <div class="task-meta">
                    ${escapeBreakdownHtml(serial)}
                  </div>
                `
                : ""
            }
          </td>

          <td>
            ${escapeBreakdownHtml(line)}
          </td>

          <td>
            ${escapeBreakdownHtml(title)}
          </td>

          <td>
            <span
              class="breakdown-status ${getBreakdownStatusClass(status)}"
            >
              ${escapeBreakdownHtml(
                status.replace("_", " ")
              )}
            </span>
          </td>

          <td>
            ${escapeBreakdownHtml(started)}
          </td>

          <td>
            ${escapeBreakdownHtml(downTime)}
          </td>

            <td class="breakdown-actions-cell">

              <div class="breakdown-actions-row">

                <button
                  class="btn-table breakdown-action-icon breakdown-view-btn"
                  type="button"
                  data-breakdown-id="${id}"
                  title="View Breakdown"
                  aria-label="View Breakdown"
                >
                  👁
                </button>

                ${
                  canReopen
                    ? `
                      <button
                        class="btn-table breakdown-action-icon breakdown-reopen-btn"
                        type="button"
                        data-breakdown-id="${id}"
                        title="Reopen Breakdown"
                        aria-label="Reopen Breakdown"
                      >
                        ↻
                      </button>
                    `
                    : ""
                }

              </div>

            </td>

        </tr>
      `;

    }).join("");

}

/* =====================
   FORMAT BREAKDOWN DATE
===================== */

function formatBreakdownDate(value) {

  if (!value) return "-";

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}

/* =====================
   FORMAT DOWNTIME

   OPEN / IN_PROGRESS:
   NOW - started_at

   CLOSED:
   closed_at - started_at
===================== */

function formatBreakdownDowntime(breakdown) {

  if (!breakdown?.started_at) {
    return "-";
  }


  const start =
    new Date(
      breakdown.started_at
    );


  const end =
    breakdown.closed_at
      ? new Date(breakdown.closed_at)
      : new Date();


  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return "-";
  }


  const diffMs =
    end.getTime() -
    start.getTime();


  if (diffMs < 0) {
    return "-";
  }


  const totalMinutes =
    Math.floor(
      diffMs / 60000
    );


  const hours =
    Math.floor(
      totalMinutes / 60
    );


  const minutes =
    totalMinutes % 60;


  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }


  return `${minutes}m`;

}

/* =========================================================
   FORMAT BREAKDOWN SECONDS

   Used for actual Machine State durations.
========================================================= */

function formatBreakdownSeconds(seconds) {

  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );


  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const secs =
    totalSeconds % 60;


  if (hours > 0) {

    return `${hours}h ${minutes}m`;

  }


  if (minutes > 0) {

    return `${minutes}m`;

  }


  return `${secs}s`;

}

  /* =========================================================
   FORMAT DATETIME FOR <input type="datetime-local">

   Keeps the displayed value in local browser time.
========================================================= */

function formatDateTimeLocalValue(value) {

  if (!value) return "";


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  const pad =
    number =>
      String(number)
        .padStart(2, "0");


  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );

}

/* =====================
   BASIC HTML ESCAPE

   Keeps API text safe when rendered
   through innerHTML.
===================== */

function escapeBreakdownHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

/* =========================================================
   NEW BREAKDOWN MODAL
   UI ONLY

   Responsibilities:
   - Open / close modal
   - Populate Asset dropdown
   - Set current local date/time
   - Prefill Reported By from logged-in user

   IMPORTANT:
   - NO Breakdown is created here yet
   - POST /breakdowns will be added in the next step
========================================================= */


/* =====================
   OPEN NEW BREAKDOWN
===================== */

async function openNewBreakdownModal() {

  const overlay =
    document.getElementById("newBreakdownOverlay");

  if (!overlay) return;


  /* =====================
     ENSURE ASSETS EXIST
  ===================== */

  if (
    !Array.isArray(state.assetsData) ||
    state.assetsData.length === 0
  ) {
    await loadAssets();
  }


  /* =====================
     RESET FORM
  ===================== */

  const assetSelect =
    document.getElementById("bd-asset");

  const titleInput =
    document.getElementById("bd-title");

  const descriptionInput =
    document.getElementById("bd-description");

  const startedInput =
    document.getElementById("bd-started-at");

  const reportedByInput =
    document.getElementById("bd-reported-by");

  const historicalCheckbox =
    document.getElementById(
      "bd-already-restored"
    );

  const historicalFields =
    document.getElementById(
      "bd-historical-fields"
    );

  const restoredInput =
    document.getElementById(
      "bd-restored-at"
    );

  const failureCauseInput =
    document.getElementById(
      "bd-historical-failure-cause"
    );

  const rootCauseInput =
    document.getElementById(
      "bd-historical-root-cause"
    );

  const correctiveActionInput =
    document.getElementById(
      "bd-historical-corrective-action"
    );


  if (titleInput) {
    titleInput.value = "";
  }

  if (descriptionInput) {
    descriptionInput.value = "";
  }

  /* =====================
    RESET HISTORICAL MODE

    Every new modal opening starts
    as a normal LIVE Breakdown.
  ===================== */

  if (historicalCheckbox) {
    historicalCheckbox.checked = false;
  }

  if (historicalFields) {
    historicalFields.style.display = "none";
  }

  if (restoredInput) {
    restoredInput.value = "";
  }

  if (failureCauseInput) {
    failureCauseInput.value = "";
  }

  if (rootCauseInput) {
    rootCauseInput.value = "";
  }

  if (correctiveActionInput) {
    correctiveActionInput.value = "";
  }


  const saveBtn =
    document.getElementById(
      "saveBreakdownBtn"
    );

  if (saveBtn) {
    saveBtn.textContent =
      "Create Breakdown";
  }


  /* =====================
     POPULATE ASSETS
  ===================== */

  populateBreakdownAssetDropdown();


  if (assetSelect) {
    assetSelect.value = "";
  }


  /* =====================
     DEFAULT STARTED AT
     Current LOCAL date/time
  ===================== */

  if (startedInput) {
    startedInput.value =
      getBreakdownLocalDateTime();
  }


  /* =====================
     DEFAULT REPORTED BY
     Logged-in CMMS user
  ===================== */

  if (reportedByInput) {

    reportedByInput.value =
      localStorage.getItem(
        "cmmsTechnicianName"
      ) || "";

  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display = "flex";


  /* =====================
     UX
  ===================== */

  setTimeout(() => {
    assetSelect?.focus();
  }, 0);

}

/* =====================
   CLOSE NEW BREAKDOWN
===================== */

function closeNewBreakdownModal() {

  const overlay =
    document.getElementById("newBreakdownOverlay");

  if (!overlay) return;

  overlay.style.display = "none";

}

/* =========================================================
   OPEN EDIT BREAKDOWN

   Always loads the latest Breakdown record from backend
   before displaying the Edit modal.

   STATUS LOGIC:
   - OPEN / IN_PROGRESS:
     Edit only active incident information.
     Closure fields are hidden.

   - CLOSED:
     Closure fields are visible and editable.

   This prevents editing from stale / incomplete local data.
========================================================= */

async function openEditBreakdownModal() {

  const breakdownId =
    Number(
      currentBreakdownId ||
      currentBreakdown?.id
    );


  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {

    alert("Breakdown ID not available");
    return;

  }


  try {

    /* =====================
       LOAD CURRENT RECORD
    ===================== */

    const response =
      await fetch(
        `/breakdowns/${breakdownId}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Failed to load Breakdown"
      );

    }


    /*
      Support either:

      GET → { breakdown: {...} }

      or:

      GET → {...}
    */

    const breakdown =
      data.breakdown || data;


    if (!breakdown?.id) {

      throw new Error(
        "Invalid Breakdown data received"
      );

    }


    /* =====================
       KEEP LOCAL COPY CURRENT
    ===================== */

    currentBreakdown =
      breakdown;


    /* =====================
       STATUS
    ===================== */

    const isClosed =
      String(
        breakdown.status || ""
      ).toUpperCase() === "CLOSED";


    /* =====================
       BREAKDOWN CODE
    ===================== */

    const codeEl =
      document.getElementById(
        "editBreakdownCode"
      );


    if (codeEl) {

      codeEl.textContent =
        `BD-${String(
          breakdown.id
        ).padStart(5, "0")}`;

    }


    /* =====================
       PRELOAD TITLE
    ===================== */

    const titleEl =
      document.getElementById(
        "editBreakdownTitle"
      );


    if (titleEl) {

      titleEl.value =
        breakdown.title || "";

    }


    /* =====================
       PRELOAD DESCRIPTION
    ===================== */

    const descriptionEl =
      document.getElementById(
        "editBreakdownDescription"
      );


    if (descriptionEl) {

      descriptionEl.value =
        breakdown.description || "";

    }


    /* =====================
       PRELOAD STARTED AT
    ===================== */

    const startedAtEl =
      document.getElementById(
        "editBreakdownStartedAt"
      );


    if (startedAtEl) {

      startedAtEl.value =
        toBreakdownDateTimeLocal(
          breakdown.started_at
        );

    }


    /* =====================
       PRELOAD REPORTED BY
    ===================== */

    const reportedByEl =
      document.getElementById(
        "editBreakdownReportedBy"
      );


    if (reportedByEl) {

      reportedByEl.value =
        breakdown.reported_by || "";

    }


    /* =====================
       CLOSURE FIELDS

       Only visible when Breakdown is CLOSED.
    ===================== */

    const closureFields =
      document.getElementById(
        "editBreakdownClosureFields"
      );


    if (closureFields) {

      closureFields.style.display =
        isClosed
          ? "block"
          : "none";

    }


    /* =====================
       PRELOAD FAILURE CAUSE
    ===================== */

    const failureCauseEl =
      document.getElementById(
        "editBreakdownFailureCause"
      );


    if (failureCauseEl) {

      failureCauseEl.value =
        isClosed
          ? breakdown.failure_cause || ""
          : "";

    }


    /* =====================
       PRELOAD ROOT CAUSE
    ===================== */

    const rootCauseEl =
      document.getElementById(
        "editBreakdownRootCause"
      );


    if (rootCauseEl) {

      rootCauseEl.value =
        isClosed
          ? breakdown.root_cause || ""
          : "";

    }


    /* =====================
       PRELOAD CORRECTIVE ACTION
    ===================== */

    const correctiveActionEl =
      document.getElementById(
        "editBreakdownCorrectiveAction"
      );


    if (correctiveActionEl) {

      correctiveActionEl.value =
        isClosed
          ? breakdown.corrective_action || ""
          : "";

    }


    /* =====================
       SHOW AFTER PRELOAD
    ===================== */

    const overlay =
      document.getElementById(
        "incidentEditOverlay"
      );


    if (overlay) {

      overlay.style.display =
        "flex";

    }


  } catch (err) {

    console.error(
      "OPEN EDIT BREAKDOWN ERROR:",
      err
    );


    alert(
      err.message ||
      "Failed to load Breakdown"
    );

  }

}

/* =========================================================
   CLOSE EDIT BREAKDOWN
========================================================= */

function closeEditBreakdownModal() {

  const overlay =
    document.getElementById("incidentEditOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }

}

/* =========================================================
   SAVE EDIT BREAKDOWN

   PATCH /breakdowns/:id

   Updates incident information only.
   Lifecycle status is NOT changed here.
========================================================= */

async function saveEditBreakdown() {

  if (!currentBreakdown) {
    alert("Breakdown data not available");
    return;
  }


  const breakdownId =
    Number(currentBreakdown.id);


  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {
    alert("Invalid Breakdown ID");
    return;
  }


  /* =====================
     READ FORM
  ===================== */

  const title =
    document
      .getElementById("editBreakdownTitle")
      ?.value
      .trim();

  const description =
    document
      .getElementById("editBreakdownDescription")
      ?.value
      .trim() || "";

  const startedAtValue =
    document
      .getElementById("editBreakdownStartedAt")
      ?.value;

  const reportedBy =
    document
      .getElementById("editBreakdownReportedBy")
      ?.value
      .trim() || "";

  const failureCause =
    document
      .getElementById("editBreakdownFailureCause")
      ?.value || "";

  const rootCause =
    document
      .getElementById("editBreakdownRootCause")
      ?.value
      .trim() || "";

  const correctiveAction =
    document
      .getElementById("editBreakdownCorrectiveAction")
      ?.value
      .trim() || "";


  /* =====================
     BASIC VALIDATION
  ===================== */

  if (!title) {
    alert("Fault / Title is required");
    return;
  }


  if (!startedAtValue) {
    alert("Started At is required");
    return;
  }


  const startedAt =
    new Date(startedAtValue);


  if (
    Number.isNaN(
      startedAt.getTime()
    )
  ) {
    alert("Invalid Started At");
    return;
  }


  /* =====================
     REQUEST BODY
  ===================== */

  const payload = {

    title,

    description:
      description || null,

    started_at:
      startedAt.toISOString(),

    reported_by:
      reportedBy || null,

    /*
      We are editing the reporter name only.

      Do NOT accidentally replace an existing
      reported_by_id here.
    */

    failure_cause:
      failureCause || null,

    root_cause:
      rootCause || null,

    corrective_action:
      correctiveAction || null

  };


  /* =====================
     SAVE
  ===================== */

  const saveBtn =
    document.getElementById(
      "saveEditBreakdownBtn"
    );


  try {

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
    }


    const response =
      await fetch(
        `/breakdowns/${breakdownId}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );


    const data =
      await response.json();


    if (!response.ok) {
      throw new Error(
        data.error ||
        "Failed to update Breakdown"
      );
    }


    /* =====================
       UPDATE LOCAL COPY

       Backend returns the complete updated
       Breakdown record.
    ===================== */

    currentBreakdown =
      data.breakdown;


    /* =====================
       CLOSE EDIT MODAL
    ===================== */

    closeEditBreakdownModal();


    /* =====================
       REFRESH DETAIL

       Reuse the existing renderer.
    ===================== */

    populateBreakdownDetail(
      currentBreakdown
    );


    /* =====================
       REFRESH MACHINE STATE

       Editing incident data does not change
       Machine State, but Detail should remain
       fully synchronized.

       Use your existing loader if available.
    ===================== */

    if (
      typeof loadBreakdownMachineState ===
      "function"
    ) {

      await loadBreakdownMachineState(
        breakdownId
      );

    }


    /* =====================
       REFRESH RESTORATION TASKS
    ===================== */

    if (
      typeof loadRestorationTasks ===
      "function"
    ) {

      await loadRestorationTasks(
        breakdownId
      );

    }


    /* =====================
       REFRESH MAIN
       BREAKDOWNS TABLE
    ===================== */

    if (
      typeof loadBreakdowns ===
      "function"
    ) {

      await loadBreakdowns();

    }


  } catch (err) {

    console.error(
      "SAVE BREAKDOWN EDIT ERROR:",
      err
    );

    alert(
      err.message ||
      "Failed to update Breakdown"
    );


  } finally {

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent =
        "Save Changes";
    }

  }

}


/* =====================
   POPULATE ASSET DROPDOWN
===================== */

function populateBreakdownAssetDropdown() {

  const select =
    document.getElementById("bd-asset");

  if (!select) return;


  const assets =
    Array.isArray(state.assetsData)
      ? state.assetsData
      : [];


  /* =====================
     DEFAULT OPTION
  ===================== */

  select.innerHTML = `
    <option value="">
      Select asset...
    </option>
  `;


  /* =====================
     SORT ASSETS
     Line → Model → Serial
  ===================== */

  const sortedAssets =
    [...assets].sort((a, b) => {

      const lineA =
        String(
          a.line_name ||
          a.line_code ||
          a.line ||
          ""
        );

      const lineB =
        String(
          b.line_name ||
          b.line_code ||
          b.line ||
          ""
        );


      const lineCompare =
        lineA.localeCompare(
          lineB,
          undefined,
          { numeric: true }
        );


      if (lineCompare !== 0) {
        return lineCompare;
      }


      const modelCompare =
        String(a.model || "")
          .localeCompare(
            String(b.model || "")
          );


      if (modelCompare !== 0) {
        return modelCompare;
      }


      return String(
        a.serial_number || ""
      ).localeCompare(
        String(
          b.serial_number || ""
        )
      );

    });


  /* =====================
     CREATE OPTIONS
  ===================== */

  sortedAssets.forEach(asset => {

    if (!asset?.id) return;


    const option =
      document.createElement("option");


    option.value =
      asset.id;


    const line =
      asset.line_name ||
      asset.line_code ||
      asset.line ||
      "-";


    const model =
      asset.model ||
      "Unknown Asset";


    const serial =
      asset.serial_number ||
      "-";


    option.textContent =
      `${line} — ${model} — S/N ${serial}`;


    select.appendChild(option);

  });

}

/* =====================
   BREAKDOWN STATUS UI

   Controls which actions are available
   according to the Breakdown lifecycle.

   OPEN
   - Start Work
   - Close Breakdown

   IN_PROGRESS
   - Close Breakdown

   CLOSED
   - No Breakdown lifecycle actions

   Restoration Tasks remain independent
   from the Breakdown lifecycle.
===================== */

function updateBreakdownStatusUI(breakdown) {

  const status =
    String(
      breakdown?.status || ""
    ).toUpperCase();


  const statusEl =
    document.getElementById(
      "bd-detail-status"
    );

  const startBtn =
    document.getElementById(
      "startBreakdownBtn"
    );

  const closeBtn =
    document.getElementById(
      "closeBreakdownBtn"
    );

  const addTaskBtn =
    document.getElementById(
      "addRestorationTaskBtn"
    );


  /* =====================
     STATUS LABEL
  ===================== */

  if (statusEl) {

    statusEl.textContent =
      status || "-";

    /*
      Status-specific class.

      Used for Breakdown status badges.
    */

    statusEl.classList.remove(
      "status-open",
      "status-in-progress",
      "status-closed"
    );


    if (status === "OPEN") {

      statusEl.classList.add(
        "status-open"
      );

    }


    if (status === "IN_PROGRESS") {

      statusEl.classList.add(
        "status-in-progress"
      );

    }


    if (status === "CLOSED") {

      statusEl.classList.add(
        "status-closed"
      );

    }

  }


  /* =====================
     START RESTORATION

     Only OPEN Breakdowns
     can move to IN_PROGRESS.
  ===================== */

  if (startBtn) {

    startBtn.style.display =
      status === "OPEN"
        ? ""
        : "none";

  }


  /* =====================
     CLOSE BREAKDOWN

     OPEN and IN_PROGRESS
     Breakdowns can be closed.
  ===================== */

  if (closeBtn) {

    closeBtn.style.display =
      (
        status === "OPEN" ||
        status === "IN_PROGRESS"
      )
        ? ""
        : "none";

  }


  /* =====================
     ADD RESTORATION TASK

     New Restoration Tasks are allowed
     only while the Breakdown is active.

     CLOSED Breakdown:
     - Existing tasks remain visible
     - Existing open tasks may still be completed
     - New Restoration Tasks cannot be created
  ===================== */

  if (addTaskBtn) {

    addTaskBtn.style.display =
      status === "CLOSED"
        ? "none"
        : "";

  }

}

/* =========================================================
   START BREAKDOWN WORK
   PATCH /breakdowns/:id/start

   Lifecycle:
   OPEN → IN_PROGRESS

   IMPORTANT:
   - Does NOT create a Restoration Task
   - Does NOT create a task_execution
   - Does NOT modify started_at
========================================================= */

async function startBreakdownWork() {

  const breakdownId =
    Number(currentBreakdownId);

  const startBtn =
    document.getElementById(
      "startBreakdownBtn"
    );


  /* =====================
     VALIDATE CURRENT ID
  ===================== */

  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {

    console.error(
      "START BREAKDOWN: Invalid current Breakdown ID"
    );

    return;
  }


  /* =====================
     REQUEST
  ===================== */

  try {

    if (startBtn) {

      startBtn.disabled = true;

      startBtn.textContent =
        "Starting...";

    }


    const response =
      await fetch(
        `/breakdowns/${breakdownId}/start`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Failed to start Breakdown work"
      );

    }


    /* =====================
       REFRESH DETAIL

       Re-read from backend so the UI
       always reflects DB state.
    ===================== */

    const detailResponse =
      await fetch(
        `/breakdowns/${breakdownId}`
      );


    const breakdown =
      await detailResponse.json();


    if (!detailResponse.ok) {

      throw new Error(
        breakdown?.error ||
        "Failed to refresh Breakdown"
      );

    }


    populateBreakdownDetail(
      breakdown
    );


    /* =====================
       REFRESH TABLE
    ===================== */

    await loadBreakdowns();


  } catch (err) {

    console.error(
      "START BREAKDOWN ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not start Breakdown work."
    );


  } finally {

    /*
      If status changed to IN_PROGRESS,
      updateBreakdownStatusUI() has already
      hidden this button.

      We still restore its normal state
      for future OPEN Breakdowns.
    */

    if (startBtn) {

      startBtn.disabled = false;

      startBtn.textContent =
        "Start Work";

    }

  }

}


/* =====================
   LOCAL DATETIME FORMAT

   datetime-local requires:
   YYYY-MM-DDTHH:mm

   IMPORTANT:
   Do NOT use toISOString()
   because that converts to UTC.
===================== */

function getBreakdownLocalDateTime() {

  const now =
    new Date();


  const pad =
    value =>
      String(value)
        .padStart(2, "0");


  const year =
    now.getFullYear();

  const month =
    pad(now.getMonth() + 1);

  const day =
    pad(now.getDate());

  const hours =
    pad(now.getHours());

  const minutes =
    pad(now.getMinutes());


  return (
    `${year}-${month}-${day}` +
    `T${hours}:${minutes}`
  );

}


/* =========================================================
   EVENT LISTENERS
========================================================= */


/* =====================
   OPEN BUTTON
===================== */

document
  .getElementById("newBreakdownBtn")
  ?.addEventListener(
    "click",
    openNewBreakdownModal
  );


/* =====================
   CLOSE X
===================== */

document
  .getElementById("closeNewBreakdownBtn")
  ?.addEventListener(
    "click",
    closeNewBreakdownModal
  );


/* =====================
   CANCEL BUTTON
===================== */

document
  .getElementById("cancelNewBreakdownBtn")
  ?.addEventListener(
    "click",
    closeNewBreakdownModal
  );


/* =====================
   CLICK OUTSIDE MODAL
===================== */

document
  .getElementById("newBreakdownOverlay")
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "newBreakdownOverlay"
      ) {
        closeNewBreakdownModal();
      }

    }
  );

  /* =========================================================
   BREAKDOWN DETAIL
   GET /breakdowns/:id

   Responsibilities:
   - Load one Breakdown incident
   - Populate Breakdown Detail modal
   - Open / close Detail modal

   IMPORTANT:
   - Read only
   - Does NOT change Breakdown status
   - Does NOT load Restoration Tasks yet
========================================================= */


/* =====================
   OPEN BREAKDOWN DETAIL
===================== */

async function openBreakdownDetail(breakdownId) {

  const id =
    Number(breakdownId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }

  /* =====================
    CURRENT BREAKDOWN
  ===================== */

currentBreakdownId = id;


  try {

    const response =
      await fetch(
        `/breakdowns/${id}`
      );


    const breakdown =
      await response.json();


    if (!response.ok) {

      throw new Error(
        breakdown?.error ||
        "Failed to load Breakdown"
      );

    }


    /* =====================
       POPULATE DETAIL
    ===================== */

    populateBreakdownDetail(
      breakdown
    );
    await loadRestorationTasks(
      id
    );


    /* =====================
       OPEN MODAL
    ===================== */

    const overlay =
      document.getElementById(
        "breakdownDetailOverlay"
      );

    if (overlay) {
      overlay.style.display = "flex";
    }


  } catch (err) {

    console.error(
      "LOAD BREAKDOWN DETAIL ERROR:",
      err
    );

    alert(
      err.message ||
      "Could not load Breakdown."
    );

  }

}

/* =====================
   POPULATE DETAIL MODAL
===================== */

function populateBreakdownDetail(breakdown) {

  /* =====================
     CURRENT BREAKDOWN
  ===================== */

  currentBreakdown = breakdown;

  if (!breakdown) return;


  /* =====================
     ELEMENTS
  ===================== */

  const codeEl =
    document.getElementById(
      "bd-detail-code"
    );

  const statusEl =
    document.getElementById(
      "bd-detail-status"
    );

  const assetEl =
    document.getElementById(
      "bd-detail-asset"
    );

  const titleEl =
    document.getElementById(
      "bd-detail-title"
    );

  const descriptionEl =
    document.getElementById(
      "bd-detail-description"
    );

  const startedEl =
    document.getElementById(
      "bd-detail-started"
    );

  const reportedByEl =
    document.getElementById(
      "bd-detail-reported-by"
    );

  const downtimeEl =
    document.getElementById(
      "bd-detail-downtime"
    );

  const closedEl =
    document.getElementById(
      "bd-detail-closed"
    );


  /* =====================
     CLOSURE SUMMARY ELEMENTS
  ===================== */

  const closureSummaryEl =
    document.getElementById(
      "bd-closure-summary"
    );

  const failureCauseEl =
    document.getElementById(
      "bd-detail-failure-cause"
    );

  const rootCauseEl =
    document.getElementById(
      "bd-detail-root-cause"
    );

  const correctiveActionEl =
    document.getElementById(
      "bd-detail-corrective-action"
    );


  /* =====================
     BREAKDOWN CODE
  ===================== */

  if (codeEl) {

    codeEl.textContent =
      `BD-${String(
        breakdown.id
      ).padStart(5, "0")}`;

  }


  /* =====================
     STATUS
  ===================== */

  if (statusEl) {

    statusEl.textContent =
      breakdown.status || "-";

  }


  const isClosed =
    String(
      breakdown.status || ""
    ).toUpperCase() === "CLOSED";


  /* =====================
     ASSET / SERIAL / LINE
  ===================== */

  if (assetEl) {

    const parts = [];


    if (breakdown.asset_model) {

      parts.push(
        breakdown.asset_model
      );

    }


    if (breakdown.asset_serial) {

      parts.push(
        `S/N ${breakdown.asset_serial}`
      );

    }


    if (breakdown.line_name) {

      parts.push(
        breakdown.line_name
      );

    }


    assetEl.textContent =
      parts.length
        ? parts.join(" • ")
        : "-";

  }


  /* =====================
     FAULT
  ===================== */

  if (titleEl) {

    titleEl.textContent =
      breakdown.title || "-";

  }


  /* =====================
     DESCRIPTION
  ===================== */

  if (descriptionEl) {

    descriptionEl.textContent =
      breakdown.description || "-";

  }


  /* =====================
     STARTED AT
  ===================== */

  if (startedEl) {

    startedEl.textContent =
      formatBreakdownDate(
        breakdown.started_at
      );

  }


  /* =====================
     REPORTED BY
  ===================== */

  if (reportedByEl) {

    reportedByEl.textContent =
      breakdown.reported_by || "-";

  }


  /* =====================
     INCIDENT DURATION

     Total Breakdown incident time:
     started_at → closed_at
     or started_at → now if still open.

     NOTE:
     This is NOT Machine DOWN time.
  ===================== */

  if (downtimeEl) {

    downtimeEl.textContent =
      formatBreakdownDowntime(
        breakdown
      );

  }


  /* =====================
     RESTORED AT
  ===================== */

  if (closedEl) {

    closedEl.textContent =
      breakdown.closed_at
        ? formatBreakdownDate(
            breakdown.closed_at
          )
        : "-";

  }


  /* =========================================================
     CLOSURE SUMMARY

     Closure information is shown only when
     Breakdown status = CLOSED.

     OPEN / IN_PROGRESS:
     - Hidden

     CLOSED:
     - Failure Cause
     - Root Cause
     - Corrective Action
  ========================================================= */

  if (closureSummaryEl) {

    closureSummaryEl.style.display =
      isClosed
        ? "block"
        : "none";

  }


  if (failureCauseEl) {

    failureCauseEl.textContent =
      isClosed
        ? breakdown.failure_cause || "-"
        : "-";

  }


  if (rootCauseEl) {

    rootCauseEl.textContent =
      isClosed
        ? breakdown.root_cause || "-"
        : "-";

  }


  if (correctiveActionEl) {

    correctiveActionEl.textContent =
      isClosed
        ? breakdown.corrective_action || "-"
        : "-";

  }


  /* =====================
     STATUS-AWARE ACTIONS
  ===================== */

  updateBreakdownStatusUI(
    breakdown
  );


  /* =========================================================
     MACHINE STATE

     Load current Machine State + history
  ========================================================= */

  loadBreakdownMachineState(
    breakdown.id
  );

}

/* =========================================================
   LOAD BREAKDOWN MACHINE STATE
========================================================= */

async function loadBreakdownMachineState(breakdownId) {

  const container =
    document.getElementById("breakdownMachineStateContainer");

  if (!container) return;

  container.innerHTML = `
    <div class="machine-state-loading">
      Loading Machine State...
    </div>
  `;

  try {

    const response = await fetch(
      `/breakdowns/${breakdownId}/machine-state`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Failed to load Machine State"
      );
    }

    renderBreakdownMachineState(data);

  } catch (err) {

    console.error(
      "loadBreakdownMachineState error:",
      err
    );

    container.innerHTML = `
      <div class="machine-state-error">
        Unable to load Machine State
      </div>
    `;

  }

}


/* =========================================================
   RENDER MACHINE STATE
========================================================= */

function renderBreakdownMachineState(data) {

  const container =
    document.getElementById("breakdownMachineStateContainer");

  if (!container) return;


  const currentState =
    data.current_state || null;


  /*
    No active state means that the Machine State
    has not yet been defined by the technician.
  */

  const currentLabel =
    currentState
      ? formatMachineStateLabel(currentState)
      : "NOT SET";


  const history =
    Array.isArray(data.history)
      ? data.history
      : [];


  const totals =
    data.totals_seconds || {};


  container.innerHTML = `

    <div class="machine-state-header">

      <div>

        <div class="machine-state-title">
          Machine State
        </div>

        <div class="
          machine-state-current
          ${!currentState ? "machine-state-not-set" : ""}
        ">
          ${currentLabel}
        </div>

      </div>

    </div>


    ${renderMachineStateControls(data)}


    <div class="machine-state-totals">

      ${renderMachineStateTotal(
        "DOWN",
        totals.DOWN
      )}

      ${renderMachineStateTotal(
        "TRIAL",
        totals.TRIAL
      )}

      ${renderMachineStateTotal(
        "DEGRADED",
        totals.DEGRADED
      )}

      ${renderMachineStateTotal(
        "RUNNING",
        totals.RUNNING
      )}

    </div>


    <div class="machine-state-history">

      ${
        history.length
          ? history
              .map(renderMachineStateHistoryRow)
              .join("")
          : `
            <div class="machine-state-empty">
              Machine State has not been set yet.
            </div>
          `
      }

    </div>

  `;

}


/* =========================================================
   MACHINE STATE LABEL
========================================================= */

function formatMachineStateLabel(state) {

  switch (String(state || "").toUpperCase()) {

    case "DOWN":
      return "🔴 DOWN";

    case "TRIAL":
      return "🟠 TRIAL";

    case "DEGRADED":
      return "🟡 DEGRADED";

    case "RUNNING":
      return "🟢 RUNNING";

    default:
      return state || "—";

  }

}


/* =========================================================
   MACHINE STATE TOTAL
========================================================= */

function renderMachineStateTotal(
  state,
  seconds
) {

  return `
    <div class="machine-state-total">

      <span>
        ${formatMachineStateLabel(state)}
      </span>

      <strong>
        ${formatMachineStateDuration(seconds)}
      </strong>

    </div>
  `;

}


/* =========================================================
   MACHINE STATE HISTORY ROW
========================================================= */

function renderMachineStateHistoryRow(item) {

  const started =
    formatMachineStateDateTime(
      item.started_at
    );


  const ended =
    item.ended_at
      ? formatMachineStateDateTime(
          item.ended_at
        )
      : "NOW";


  return `
    <div class="machine-state-history-row">

      <div class="machine-state-history-state">
        ${formatMachineStateLabel(item.state)}
      </div>

      <div class="machine-state-history-time">
        ${started} → ${ended}
      </div>

      <div class="machine-state-history-duration">
        ${formatMachineStateDuration(
          item.duration_seconds
        )}
      </div>

    </div>
  `;

}


/* =========================================================
   FORMAT MACHINE STATE DURATION
========================================================= */

function formatMachineStateDuration(seconds) {

  const totalSeconds =
    Math.max(
      0,
      Number(seconds) || 0
    );


  const hours =
    Math.floor(
      totalSeconds / 3600
    );


  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );


  const secs =
    totalSeconds % 60;


  if (hours > 0) {

    return `${hours}h ${minutes}m`;

  }


  if (minutes > 0) {

    return `${minutes}m ${secs}s`;

  }


  return `${secs}s`;

}


/* =========================================================
   FORMAT MACHINE STATE DATETIME
========================================================= */

function formatMachineStateDateTime(value) {

  if (!value) return "—";


  const date =
    new Date(value);


  if (Number.isNaN(date.getTime())) {
    return "—";
  }


  return date.toLocaleString(
    "el-GR",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}

/* =========================================================
   MACHINE STATE CONTROLS
========================================================= */

function renderMachineStateControls(data) {

  const breakdownStatus =
    String(
      data.breakdown_status || ""
    ).toUpperCase();


  const currentState =
    String(
      data.current_state || ""
    ).toUpperCase();


  const hasCurrentState =
    !!currentState;


  /* =====================================================
     CLOSED BREAKDOWN

     Machine State history is locked after closure.
  ===================================================== */

  if (breakdownStatus === "CLOSED") {

    return `
      <div class="machine-state-controls-closed">
        Machine State history is locked because
        this Breakdown is closed.
      </div>
    `;

  }


  const states = [
    {
      state: "DOWN",
      label: "🔴 DOWN"
    },
    {
      state: "TRIAL",
      label: "🟠 TRIAL"
    },
    {
      state: "DEGRADED",
      label: "🟡 DEGRADED"
    },
    {
      state: "RUNNING",
      label: "🟢 RUNNING"
    }
  ];


  return `
    <div class="machine-state-controls">

      <div class="machine-state-controls-label">
        ${
          hasCurrentState
            ? "Change Machine State"
            : "Select Machine State"
        }
      </div>


      ${
        !hasCurrentState
          ? `
            <div class="machine-state-controls-hint">
              Select the actual machine condition.
            </div>
          `
          : ""
      }


      <div class="machine-state-buttons">

        ${states.map(item => {

          const isActive =
            currentState === item.state;

          return `
            <button
              type="button"
              class="
                machine-state-btn
                ${isActive ? "active" : ""}
              "
              data-machine-state="${item.state}"
              ${isActive ? "disabled" : ""}
              onclick="
                changeBreakdownMachineState(
                  '${item.state}'
                )
              "
            >
              ${item.label}
            </button>
          `;

        }).join("")}

      </div>

    </div>
  `;

}


/* =========================================================
   CHANGE BREAKDOWN MACHINE STATE
========================================================= */

async function changeBreakdownMachineState(newState) {

  if (!currentBreakdownId) {

    console.error(
      "No active Breakdown selected"
    );

    return;

  }


  const breakdownStatus =
    String(
      currentBreakdown?.status || ""
    ).toUpperCase();


  if (breakdownStatus === "CLOSED") {

    alert(
      "This Breakdown is closed. Machine State cannot be changed."
    );

    return;

  }


  const state =
    String(
      newState || ""
    ).trim().toUpperCase();


  const validStates = [
    "DOWN",
    "TRIAL",
    "DEGRADED",
    "RUNNING"
  ];


  if (!validStates.includes(state)) {

    console.error(
      "Invalid Machine State:",
      state
    );

    return;

  }


  try {

    setMachineStateButtonsDisabled(true);


    const changedBy =
      localStorage.getItem(
        "cmmsTechnicianName"
      ) || null;


    const changedByIdRaw =
      localStorage.getItem(
        "cmmsTechnicianId"
      );


    const changedById =
      changedByIdRaw
        ? Number(changedByIdRaw)
        : null;


    const response = await fetch(
      `/breakdowns/${currentBreakdownId}/machine-state`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          state,

          changed_by:
            changedBy,

          changed_by_id:
            Number.isInteger(changedById)
              ? changedById
              : null

        })

      }
    );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Failed to change Machine State"
      );

    }


    /* Reload Machine State panel */

    await loadBreakdownMachineState(
      currentBreakdownId
    );


  } catch (err) {

    console.error(
      "changeBreakdownMachineState error:",
      err
    );


    alert(
      err.message ||
      "Failed to change Machine State"
    );


  } finally {

    setMachineStateButtonsDisabled(false);

  }

}


/* =========================================================
   DISABLE / ENABLE MACHINE STATE BUTTONS
========================================================= */

function setMachineStateButtonsDisabled(disabled) {

  const buttons =
    document.querySelectorAll(
      ".machine-state-btn"
    );


  buttons.forEach(button => {

    button.disabled =
      Boolean(disabled);

  });

}

/* =========================================================
   DATETIME LOCAL HELPER

   Converts an API timestamp into the format required by:
   <input type="datetime-local">

   Example:
   2026-09-04T18:05:00.000Z
   →
   2026-09-04T21:05
========================================================= */

function toBreakdownDateTimeLocal(value) {

  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = n =>
    String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}


/* =====================
   CLOSE DETAIL MODAL
===================== */

function closeBreakdownDetailModal() {

  const overlay =
    document.getElementById(
      "breakdownDetailOverlay"
    );

  if (!overlay) return;

  overlay.style.display = "none";
  currentBreakdownId = null;

}



/* =========================================================
   DETAIL EVENT LISTENERS
========================================================= */


/* =====================
   VIEW BUTTON

   Event delegation is used because
   Breakdown rows are rendered dynamically.
===================== */

document
  .getElementById("breakdownsTableBody")
  ?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".breakdown-view-btn"
        );


      if (!button) return;


      const breakdownId =
        button.dataset.breakdownId;


      openBreakdownDetail(
        breakdownId
      );

    }
  );



/* =====================
   CLOSE X
===================== */

document
  .getElementById(
    "closeBreakdownDetailBtn"
  )
  ?.addEventListener(
    "click",
    closeBreakdownDetailModal
  );



/* =====================
   CLICK OUTSIDE MODAL
===================== */

document
  .getElementById(
    "breakdownDetailOverlay"
  )
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "breakdownDetailOverlay"
      ) {

        closeBreakdownDetailModal();

      }

    }
  );

  /* =========================================================
   CREATE BREAKDOWN
   POST /breakdowns

   Creates the Breakdown incident.

   REQUIRED:
   - Asset
   - Fault / Title
   - Started At

   OPTIONAL:
   - Description
   - Reported By

   IMPORTANT:
   - Creates Breakdown only
   - Does NOT create Restoration Tasks
   - Backend creates it as OPEN
========================================================= */

async function createBreakdown() {

  /* =====================
     ELEMENTS
  ===================== */

  const saveBtn =
    document.getElementById(
      "saveBreakdownBtn"
    );

  const assetSelect =
    document.getElementById(
      "bd-asset"
    );

  const titleInput =
    document.getElementById(
      "bd-title"
    );

  const descriptionInput =
    document.getElementById(
      "bd-description"
    );

  const startedInput =
    document.getElementById(
      "bd-started-at"
    );

  const reportedByInput =
    document.getElementById(
      "bd-reported-by"
    );


  /* =====================
     HISTORICAL ELEMENTS
  ===================== */

  const historicalCheckbox =
    document.getElementById(
      "bd-already-restored"
    );

  const restoredInput =
    document.getElementById(
      "bd-restored-at"
    );

  const failureCauseInput =
    document.getElementById(
      "bd-historical-failure-cause"
    );

  const rootCauseInput =
    document.getElementById(
      "bd-historical-root-cause"
    );

  const correctiveActionInput =
    document.getElementById(
      "bd-historical-corrective-action"
    );


  /* =====================
     MODE
  ===================== */

  const isHistorical =
    historicalCheckbox?.checked === true;


  /* =====================
     READ VALUES
  ===================== */

  const assetId =
    Number(assetSelect?.value);

  const title =
    String(
      titleInput?.value || ""
    ).trim();

  const description =
    String(
      descriptionInput?.value || ""
    ).trim();

  const startedAt =
    startedInput?.value || "";

  const reportedBy =
    String(
      reportedByInput?.value || ""
    ).trim();


  /* =====================
     BASIC VALIDATION
  ===================== */

  if (
    !Number.isInteger(assetId) ||
    assetId <= 0
  ) {

    alert(
      "Please select an Asset."
    );

    assetSelect?.focus();

    return;
  }


  if (!title) {

    alert(
      "Please enter the Fault / Title."
    );

    titleInput?.focus();

    return;
  }


  if (!startedAt) {

    alert(
      "Please enter the Breakdown start date and time."
    );

    startedInput?.focus();

    return;
  }


  /* =====================
     START DATETIME
  ===================== */

  const startedDate =
    new Date(startedAt);


  if (
    Number.isNaN(
      startedDate.getTime()
    )
  ) {

    alert(
      "Invalid Breakdown start date and time."
    );

    startedInput?.focus();

    return;
  }


  /* =====================
     BASE PAYLOAD

     Used by BOTH modes.
  ===================== */

  const payload = {

    asset_id:
      assetId,

    title,

    description:
      description || null,

    started_at:
      startedDate.toISOString(),

    reported_by:
      reportedBy || null

  };


  /* =====================================================
     HISTORICAL MODE

     Additional validation + fields.
  ===================================================== */

  if (isHistorical) {

    const restoredAt =
      restoredInput?.value || "";


    if (!restoredAt) {

      alert(
        "Please enter the actual restoration date and time."
      );

      restoredInput?.focus();

      return;
    }


    const restoredDate =
      new Date(restoredAt);


    if (
      Number.isNaN(
        restoredDate.getTime()
      )
    ) {

      alert(
        "Invalid restoration date and time."
      );

      restoredInput?.focus();

      return;
    }


    /* =====================
       DATE ORDER
    ===================== */

    if (
      restoredDate.getTime() <
      startedDate.getTime()
    ) {

      alert(
        "Restored At cannot be earlier than Started At."
      );

      restoredInput?.focus();

      return;
    }


    /* =====================
       FUTURE DATE GUARD
    ===================== */

    if (
      startedDate.getTime() >
      Date.now()
    ) {

      alert(
        "Started At cannot be in the future."
      );

      startedInput?.focus();

      return;
    }


    if (
      restoredDate.getTime() >
      Date.now()
    ) {

      alert(
        "Restored At cannot be in the future."
      );

      restoredInput?.focus();

      return;
    }


    /* =====================
       HISTORICAL VALUES
    ===================== */

    const failureCause =
      String(
        failureCauseInput?.value || ""
      ).trim();

    const rootCause =
      String(
        rootCauseInput?.value || ""
      ).trim();

    const correctiveAction =
      String(
        correctiveActionInput?.value || ""
      ).trim();


    payload.restored_at =
      restoredDate.toISOString();

    payload.failure_cause =
      failureCause || null;

    payload.root_cause =
      rootCause || null;

    payload.corrective_action =
      correctiveAction || null;

  }


  /* =====================
     ENDPOINT

     LIVE
       POST /breakdowns

     HISTORICAL
       POST /breakdowns/historical
  ===================== */

  const endpoint =
    isHistorical
      ? "/breakdowns/historical"
      : "/breakdowns";


  /* =====================
     SAVE
  ===================== */

  try {

    if (saveBtn) {

      saveBtn.disabled = true;

      saveBtn.textContent =
        isHistorical
          ? "Recording..."
          : "Creating...";

    }


    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result?.error ||
        (
          isHistorical
            ? "Failed to record Historical Breakdown"
            : "Failed to create Breakdown"
        )
      );

    }


    /* =====================
       SUCCESS
    ===================== */

    closeNewBreakdownModal();


    /*
      Reload Breakdown list only.
    */

    await loadBreakdowns();


  } catch (err) {

    console.error(
      isHistorical
        ? "CREATE HISTORICAL BREAKDOWN ERROR:"
        : "CREATE BREAKDOWN ERROR:",
      err
    );


    alert(
      err.message ||
      (
        isHistorical
          ? "Could not record Historical Breakdown."
          : "Could not create Breakdown."
      )
    );


  } finally {

    if (saveBtn) {

      saveBtn.disabled = false;

      saveBtn.textContent =
        "Create Breakdown";

    }

  }

}

/* =====================
   CREATE BUTTON
===================== */

document
  .getElementById("saveBreakdownBtn")
  ?.addEventListener(
    "click",
    createBreakdown
  );

  /* =====================
   START WORK BUTTON
===================== */

document
  .getElementById(
    "startBreakdownBtn"
  )
  ?.addEventListener(
    "click",
    startBreakdownWork
  );

  /* =========================================================
   RESTORATION TASK MODAL
   UI ONLY

   IMPORTANT:
   - Uses currentBreakdownId
   - Does NOT create the task yet
========================================================= */


/* =====================
   OPEN MODAL
===================== */

function openRestorationTaskModal() {

  const breakdownId =
    Number(currentBreakdownId);

    /* =====================
   CREATE MODE
===================== */

editingRestorationTaskId = null;

const saveBtn =
  document.getElementById(
    "saveRestorationTaskBtn"
  );

if (saveBtn) {
  saveBtn.textContent = "Add Task";
}

  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {

    console.error(
      "ADD RESTORATION TASK: No active Breakdown"
    );

    return;
  }


  const overlay =
    document.getElementById(
      "restorationTaskOverlay"
    );

  if (!overlay) return;

/* =====================
    CLOSED BREAKDOWN GUARD

    A closed Breakdown may contain
    existing follow-up tasks,
    but no NEW Restoration Tasks
    can be created.
  ===================== */

  if (
    String(
      currentBreakdown?.status || ""
    ).toUpperCase() === "CLOSED"
  ) {

    alert(
      "This Breakdown is closed. New Restoration Tasks cannot be added."
    );

    return;
  }
  /* =====================
     RESET FIELDS
  ===================== */

  const taskInput =
    document.getElementById(
      "restoration-task"
    );

  const sectionInput =
    document.getElementById(
      "restoration-section"
    );

  const unitInput =
    document.getElementById(
      "restoration-unit"
    );

  const dueDateInput =
    document.getElementById(
      "restoration-due-date"
    );

  const durationInput =
    document.getElementById(
      "restoration-duration"
    );

  const notesInput =
    document.getElementById(
      "restoration-notes"
    );


  if (taskInput) {
    taskInput.value = "";
  }

  if (sectionInput) {
    sectionInput.value = "";
  }

  if (unitInput) {
    unitInput.value = "";
  }

  if (dueDateInput) {
    dueDateInput.value = "";
  }

  if (durationInput) {
    durationInput.value = "";
  }

  if (notesInput) {
    notesInput.value = "";
  }


  /* =====================
     BREAKDOWN REFERENCE
  ===================== */

  const referenceEl =
    document.getElementById(
      "restorationTaskBreakdownRef"
    );

  if (referenceEl) {

    referenceEl.textContent =
      `BD-${String(
        breakdownId
      ).padStart(5, "0")}`;

  }

  /* =====================
   LOAD SECTION / UNIT
   FROM BREAKDOWN ASSET
===================== */

const assetId =
  Number(
    currentBreakdown?.asset_id
  );


if (
  Number.isInteger(assetId) &&
  assetId > 0
) {

  populateRestorationSections(
    assetId
  );

}

  /* =====================
     SHOW
  ===================== */

  overlay.style.display = "flex";


  setTimeout(() => {
    taskInput?.focus();
  }, 0);

}


/* =====================
   CLOSE MODAL
===================== */

function closeRestorationTaskModal() {

  const overlay =
    document.getElementById(
      "restorationTaskOverlay"
    );

  if (!overlay) return;

  overlay.style.display = "none";
  editingRestorationTaskId = null;

}
/* =====================
   ADD RESTORATION BUTTON
===================== */

document
  .getElementById(
    "addRestorationTaskBtn"
  )
  ?.addEventListener(
    "click",
    openRestorationTaskModal
  );


/* =====================
   CLOSE X
===================== */

document
  .getElementById(
    "closeRestorationTaskBtn"
  )
  ?.addEventListener(
    "click",
    closeRestorationTaskModal
  );


/* =====================
   CANCEL
===================== */

document
  .getElementById(
    "cancelRestorationTaskBtn"
  )
  ?.addEventListener(
    "click",
    closeRestorationTaskModal
  );


/* =====================
   CLICK OUTSIDE
===================== */

document
  .getElementById(
    "restorationTaskOverlay"
  )
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "restorationTaskOverlay"
      ) {

        closeRestorationTaskModal();

      }

    }
  );

  /* =========================================================
   LOAD RESTORATION TASKS
   GET /breakdowns/:id/tasks

   Loads all work items linked to one Breakdown.
========================================================= */

async function loadRestorationTasks(breakdownId) {

  const container =
    document.getElementById(
      "bd-restoration-tasks"
    );

  if (!container) return;


  const id =
    Number(breakdownId);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }


  /* =====================
     LOADING STATE
  ===================== */

  container.innerHTML = `
    <div class="breakdown-empty-state">
      Loading restoration tasks...
    </div>
  `;


  try {

    const response =
      await fetch(
        `/breakdowns/${id}/tasks`
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Failed to load Restoration Tasks"
      );

    }


    const tasks =
      Array.isArray(result?.tasks)
        ? result.tasks
        : [];

    currentBreakdownTasks = tasks;

    renderRestorationTasks(
      tasks
    );


  } catch (err) {

    console.error(
      "LOAD RESTORATION TASKS ERROR:",
      err
    );


    container.innerHTML = `
      <div class="breakdown-empty-state">
        Failed to load restoration tasks.
      </div>
    `;

  }

}
/* =====================
   RENDER RESTORATION TASKS
===================== */

function renderRestorationTasks(tasks) {

  const container =
    document.getElementById(
      "bd-restoration-tasks"
    );

  if (!container) return;


  if (
    !Array.isArray(tasks) ||
    tasks.length === 0
  ) {

    container.innerHTML = `
      <div class="breakdown-empty-state">
        No restoration tasks yet.
      </div>
    `;

    return;
  }


  container.innerHTML =
    tasks.map(task => {

      const id =
        task.id ?? "";

      const title =
        task.task || "-";

      const status =
        task.status || "-";

      const normalizedStatus =
        String(status).toUpperCase();

      const isOpen =
        normalizedStatus === "PLANNED" ||
        normalizedStatus === "OVERDUE";

      const section =
        task.section || "";

      const unit =
        task.unit || "";

      const notes =
        task.notes || "";

      const duration =
        task.duration_min;

      const due =
        task.due_date
          ? formatBreakdownDate(
              task.due_date
            )
          : "-";


      return `
        <div
          class="restoration-task-item"
          data-task-id="${id}"
        >

          <div class="restoration-task-main">

            <div>

              <div class="restoration-task-title">
                ${escapeBreakdownHtml(title)}
              </div>

              <div class="task-meta">
                Task #${escapeBreakdownHtml(id)}
                • ${escapeBreakdownHtml(status)}
              </div>

            </div>


            ${
              isOpen
                ? `
                  <div class="restoration-task-actions">

                    <button
                      class="btn-table restoration-edit-btn"
                      type="button"
                      data-task-id="${id}"
                    >
                      Edit
                    </button>

                    <button
                      class="btn-table restoration-delete-btn"
                      type="button"
                      data-task-id="${id}"
                    >
                      Delete
                    </button>

                    <button
                      class="btn-table restoration-complete-btn"
                      type="button"
                      data-task-id="${id}"
                    >
                      Complete
                    </button>

                  </div>
                `
                : `
                  <span class="restoration-task-done">
                    ✓ Done
                  </span>
                `
            }

          </div>


          <div class="restoration-task-meta">

            ${
              section
                ? `
                  <div>
                    <strong>Section:</strong>
                    ${escapeBreakdownHtml(section)}
                  </div>
                `
                : ""
            }

            ${
              unit
                ? `
                  <div>
                    <strong>Unit:</strong>
                    ${escapeBreakdownHtml(unit)}
                  </div>
                `
                : ""
            }

            <div>
              <strong>Due:</strong>
              ${escapeBreakdownHtml(due)}
            </div>

            ${
              duration !== null &&
              duration !== undefined
                ? `
                  <div>
                    <strong>Est.:</strong>
                    ${escapeBreakdownHtml(duration)} min
                  </div>
                `
                : ""
            }

          </div>


          ${
            notes
              ? `
                <div class="restoration-task-notes">
                  ${escapeBreakdownHtml(notes)}
                </div>
              `
              : ""
          }

        </div>
      `;

    }).join("");

}

/* =========================================================
   CREATE RESTORATION TASK
   POST /breakdowns/:id/tasks

   Supports:
   - Existing Section dropdown
   - Manual Section input
   - Existing Unit dropdown
   - New / manual Unit input
========================================================= */

async function createRestorationTask() {

  const breakdownId =
    Number(currentBreakdownId);

  const saveBtn =
    document.getElementById(
      "saveRestorationTaskBtn"
    );

  const taskInput =
    document.getElementById(
      "restoration-task"
    );

  const sectionSelect =
    document.getElementById(
      "restoration-section"
    );

  const sectionInput =
    document.getElementById(
      "restoration-section-input"
    );

  const unitSelect =
    document.getElementById(
      "restoration-unit"
    );

  const unitInput =
    document.getElementById(
      "restoration-unit-input"
    );

  const dueDateInput =
    document.getElementById(
      "restoration-due-date"
    );

  const durationInput =
    document.getElementById(
      "restoration-duration"
    );

  const notesInput =
    document.getElementById(
      "restoration-notes"
    );


  /* =====================
     CURRENT BREAKDOWN
  ===================== */

  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {

    alert(
      "No active Breakdown selected."
    );

    return;
  }


  /* =====================
     READ TASK
  ===================== */

  const task =
    String(
      taskInput?.value || ""
    ).trim();


  /* =====================
     READ SECTION

     Existing dropdown OR
     manual Section input.
  ===================== */

  let section = "";


  if (
    sectionSelect &&
    sectionSelect.style.display !== "none"
  ) {

    section =
      String(
        sectionSelect.value || ""
      ).trim();

  }

  else {

    section =
      String(
        sectionInput?.value || ""
      ).trim();

  }


  /* =====================
     READ UNIT

     Existing dropdown OR
     manual/new Unit input.
  ===================== */

  let unit = "";


  if (
    unitSelect &&
    unitSelect.style.display !== "none"
  ) {

    /*
      Operator selected:
      ➕ New unit
    */

    if (
      unitSelect.value === "__new__"
    ) {

      unit =
        String(
          unitInput?.value || ""
        ).trim();

    }

    /*
      Existing Unit selected
    */

    else {

      unit =
        String(
          unitSelect.value || ""
        ).trim();

    }

  }

  /*
    No known Units exist for
    Asset + Section.

    Use manual input.
  */

  else {

    unit =
      String(
        unitInput?.value || ""
      ).trim();

  }


  /* =====================
     READ OTHER VALUES
  ===================== */

  const notes =
    String(
      notesInput?.value || ""
    ).trim();

  const dueDateValue =
    dueDateInput?.value || "";

  const durationValue =
    durationInput?.value || "";


  /* =====================
     VALIDATION
  ===================== */

  if (!task) {

    alert(
      "Please enter the Restoration Task."
    );

    taskInput?.focus();

    return;
  }


  /* =====================
     VALIDATE NEW UNIT

     If operator selected
     "➕ New unit",
     a value must be entered.
  ===================== */

  if (
    unitSelect &&
    unitSelect.style.display !== "none" &&
    unitSelect.value === "__new__" &&
    !unit
  ) {

    alert(
      "Please enter the new Unit."
    );

    unitInput?.focus();

    return;
  }


  /* =====================
     DUE DATE
  ===================== */

  let dueDate = null;

  if (dueDateValue) {

    const parsedDueDate =
      new Date(dueDateValue);


    if (
      Number.isNaN(
        parsedDueDate.getTime()
      )
    ) {

      alert(
        "Invalid Due Date."
      );

      dueDateInput?.focus();

      return;
    }


    dueDate =
      parsedDueDate.toISOString();

  }


  /* =====================
     ESTIMATED DURATION
  ===================== */

  let durationMin = null;

  if (durationValue !== "") {

    durationMin =
      Number(durationValue);


    if (
      !Number.isFinite(durationMin) ||
      durationMin < 0
    ) {

      alert(
        "Estimated Duration must be zero or greater."
      );

      durationInput?.focus();

      return;
    }

  }

  /* =====================
     PAYLOAD
  ===================== */

  const payload = {

    task,

    section:
      section || null,

    unit:
      unit || null,

    due_date:
      dueDate,

    duration_min:
      durationMin,

    notes:
      notes || null

  };

  /* =====================
    CREATE / UPDATE
  ===================== */

  const isEditMode =
    Number.isInteger(
      editingRestorationTaskId
    ) &&
    editingRestorationTaskId > 0;


  try {

    if (saveBtn) {

      saveBtn.disabled = true;

      saveBtn.textContent =
        isEditMode
          ? "Saving..."
          : "Adding...";

    }


    /* =====================
      ENDPOINT / METHOD

      CREATE:
      POST /breakdowns/:id/tasks

      EDIT:
      PATCH /breakdowns/:id/tasks/:taskId
    ===================== */

    const url =
      isEditMode

        ? `/breakdowns/${breakdownId}/tasks/${editingRestorationTaskId}`

        : `/breakdowns/${breakdownId}/tasks`;


    const method =
      isEditMode
        ? "PATCH"
        : "POST";


    const response =
      await fetch(
        url,
        {
          method,

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(

        result?.error ||

        (
          isEditMode
            ? "Failed to update Restoration Task"
            : "Failed to create Restoration Task"
        )

      );

    }


    /* =====================
      SUCCESS
    ===================== */

    closeRestorationTaskModal();


    /*
      Reset edit mode BEFORE
      refreshing the list.
    */

    editingRestorationTaskId =
      null;


    /*
      Refresh child task list only.

      Breakdown status does not change.
    */

    /* =====================
   REFRESH AFTER CREATE / EDIT
    ===================== */

    if (currentBreakdownId) {
      await loadRestorationTasks(
        currentBreakdownId
      );
    }

    // Refresh Main Tasks table as well
    await loadTasks();


  } catch (err) {

    console.error(
      isEditMode
        ? "UPDATE RESTORATION TASK ERROR:"
        : "CREATE RESTORATION TASK ERROR:",
      err
    );


    alert(
      err.message ||
      (
        isEditMode
          ? "Could not update Restoration Task."
          : "Could not create Restoration Task."
      )
    );


  } finally {

    if (saveBtn) {

      saveBtn.disabled = false;

      saveBtn.textContent =
        editingRestorationTaskId
          ? "Save Changes"
          : "Add Task";

    }

  }

}

/* =====================
   SAVE RESTORATION TASK
===================== */

document
  .getElementById(
    "saveRestorationTaskBtn"
  )
  ?.addEventListener(
    "click",
    createRestorationTask
  );

 /* =========================================================
   COMPLETE RESTORATION TASK

   Uses the standard CMMS completion modal.

   IMPORTANT:
   Completed By is selected explicitly by the user
   and is NOT inherited from the Breakdown reporter.
========================================================= */

function completeRestorationTask(taskId) {

  const id = Number(taskId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }


  /* =====================
     OPEN STANDARD
     COMPLETION MODAL
  ===================== */

  askTechnician(id);

}

/* =====================
   COMPLETE RESTORATION TASK BUTTON

   Event delegation because task rows
   are dynamically rendered.
===================== */

document
  .getElementById(
    "bd-restoration-tasks"
  )
  ?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".restoration-complete-btn"
        );


      if (!button) return;


      const taskId =
        button.dataset.taskId;


      completeRestorationTask(
        taskId
      );

    }
  );

  /* =========================================================
   DELETE RESTORATION TASK

   Soft-delete through backend:

   DELETE /breakdowns/:breakdownId/tasks/:taskId

   Completed tasks are already protected by backend.
========================================================= */

async function deleteRestorationTask(taskId) {

  const breakdownId =
    Number(currentBreakdownId);

  const resolvedTaskId =
    Number(taskId);


  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0 ||
    !Number.isInteger(resolvedTaskId) ||
    resolvedTaskId <= 0
  ) {

    console.error(
      "DELETE RESTORATION TASK: Invalid IDs"
    );

    return;
  }


  /* =====================
     CONFIRMATION
  ===================== */

  const confirmed =
    window.confirm(
      "Delete this Restoration Task?\n\n" +
      "The task will be removed from the active list."
    );


  if (!confirmed) {
    return;
  }


  try {

    const response =
      await fetch(
        `/breakdowns/${breakdownId}/tasks/${resolvedTaskId}`,
        {
          method: "DELETE"
        }
      );


    const data =
      await response.json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Failed to delete Restoration Task"
      );

    }


    /* =====================
       RELOAD TASK LIST
    ===================== */

    await loadRestorationTasks(
      breakdownId
    );

  }

  catch (err) {

    console.error(
      "DELETE RESTORATION TASK:",
      err
    );


    alert(
      err.message ||
      "Failed to delete Restoration Task."
    );

  }

}

/* =========================================================
   RESTORATION TASK ACTIONS
========================================================= */

document.addEventListener(
  "click",
  async event => {

    /* =====================
       DELETE
    ===================== */

    const deleteButton =
      event.target.closest(
        ".restoration-delete-btn"
      );


    if (deleteButton) {

      const taskId =
        Number(
          deleteButton.dataset.taskId
        );


      await deleteRestorationTask(
        taskId
      );

      return;
    }


    /* =====================
       EDIT
    ===================== */

    const editButton =
      event.target.closest(
        ".restoration-edit-btn"
      );


    if (editButton) {

      const taskId =
        Number(
          editButton.dataset.taskId
        );


      openEditRestorationTaskModal(
        taskId
      );

      return;
    }

  }
);

document
  .getElementById(
    "bd-already-restored"
  )
  ?.addEventListener(
    "change",
    toggleHistoricalBreakdownMode
  );

/* =========================================================
   TOGGLE HISTORICAL BREAKDOWN MODE

   LIVE:
   - normal Breakdown creation
   - initial Machine State = DOWN
   - Breakdown remains OPEN

   HISTORICAL:
   - failure was already restored
   - Restored At becomes required
   - Breakdown is created CLOSED
   - historical DOWN interval is created
========================================================= */

function toggleHistoricalBreakdownMode() {

  const checkbox =
    document.getElementById(
      "bd-already-restored"
    );

  const fields =
    document.getElementById(
      "bd-historical-fields"
    );

  const saveBtn =
    document.getElementById(
      "saveBreakdownBtn"
    );


  if (!checkbox || !fields) {
    return;
  }


  const isHistorical =
    checkbox.checked;


  /* =====================
     SHOW / HIDE FIELDS
  ===================== */

  fields.style.display =
    isHistorical
      ? "block"
      : "none";


  /* =====================
     SAVE BUTTON TEXT
  ===================== */

  if (saveBtn) {

    saveBtn.textContent =
      isHistorical
        ? "Record Historical Breakdown"
        : "Create Breakdown";

  }

}

  /* =========================================================
   CLOSE BREAKDOWN MODAL
   UI ONLY

   The actual PATCH /close is added in 4A.6.2.
========================================================= */

function openCloseBreakdownModal() {

  const breakdownId =
    Number(currentBreakdownId);


  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {
    return;
  }


  const overlay =
    document.getElementById(
      "closeBreakdownOverlay"
    );

  if (!overlay) return;


  /* =====================
     BREAKDOWN REFERENCE
  ===================== */

  const referenceEl =
    document.getElementById(
      "closeBreakdownRef"
    );

  if (referenceEl) {

    referenceEl.textContent =
      `BD-${String(
        breakdownId
      ).padStart(5, "0")}`;

  }


  /* =====================
     DEFAULT RESTORED AT
     Current local date/time
  ===================== */

  const restoredAtInput =
    document.getElementById(
      "close-breakdown-restored-at"
    );

  if (restoredAtInput) {

    restoredAtInput.value =
      getBreakdownLocalDateTime();

  }


  /* =====================
     RESET CLOSE DETAILS
  ===================== */

  const failureCause =
    document.getElementById(
      "close-breakdown-failure-cause"
    );

  const rootCause =
    document.getElementById(
      "close-breakdown-root-cause"
    );

  const correctiveAction =
    document.getElementById(
      "close-breakdown-corrective-action"
    );


  if (failureCause) {
    failureCause.value = "";
  }

  if (rootCause) {
    rootCause.value = "";
  }

  if (correctiveAction) {
    correctiveAction.value = "";
  }


  /* =====================
     OPEN RESTORATION TASKS
  ===================== */

  const openTasks =
    Array.isArray(currentBreakdownTasks)
      ? currentBreakdownTasks.filter(
          task =>
            task.status === "Planned" ||
            task.status === "Overdue"
        )
      : [];


  const warning =
    document.getElementById(
      "closeBreakdownTaskWarning"
    );

  const warningText =
    document.getElementById(
      "closeBreakdownTaskWarningText"
    );


  if (warning) {

    if (openTasks.length > 0) {

      warning.style.display =
        "block";


      if (warningText) {

        warningText.textContent =
          `This Breakdown still has ${openTasks.length} open Restoration Task${
            openTasks.length === 1
              ? ""
              : "s"
          }.`;

      }

    } else {

      warning.style.display =
        "none";

    }

  }


  /* =====================
     SHOW
  ===================== */

  overlay.style.display = "flex";

}
function closeCloseBreakdownModal() {

  const overlay =
    document.getElementById(
      "closeBreakdownOverlay"
    );

  if (!overlay) return;

  overlay.style.display = "none";

}

/* =====================
   OPEN CLOSE BREAKDOWN
===================== */

document
  .getElementById(
    "closeBreakdownBtn"
  )
  ?.addEventListener(
    "click",
    openCloseBreakdownModal
  );


/* =====================
   CLOSE X
===================== */

document
  .getElementById(
    "closeBreakdownModalBtn"
  )
  ?.addEventListener(
    "click",
    closeCloseBreakdownModal
  );


/* =====================
   CANCEL
===================== */

document
  .getElementById(
    "cancelCloseBreakdownBtn"
  )
  ?.addEventListener(
    "click",
    closeCloseBreakdownModal
  );


/* =====================
   CLICK OUTSIDE
===================== */

document
  .getElementById(
    "closeBreakdownOverlay"
  )
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "closeBreakdownOverlay"
      ) {

        closeCloseBreakdownModal();

      }

    }
  );

  /* =========================================================
   CLOSE BREAKDOWN
   PATCH /breakdowns/:id/close

   Closes the Breakdown incident.

   IMPORTANT:
   - Open Restoration Tasks are allowed to remain open.
   - Breakdown downtime stops at closed_at.
   - Restoration Tasks are NOT auto-completed.
========================================================= */

async function closeBreakdown() {

  const breakdownId =
    Number(currentBreakdownId);


  if (
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {
    return;
  }


  /* =====================
     READ FORM VALUES
  ===================== */

  const restoredAtRaw =
    document.getElementById(
      "close-breakdown-restored-at"
    )?.value;


  const failureCause =
    document.getElementById(
      "close-breakdown-failure-cause"
    )?.value?.trim() || null;


  const rootCause =
    document.getElementById(
      "close-breakdown-root-cause"
    )?.value?.trim() || null;


  const correctiveAction =
    document.getElementById(
      "close-breakdown-corrective-action"
    )?.value?.trim() || null;


  /* =====================
     VALIDATION
  ===================== */

  if (!restoredAtRaw) {

    alert(
      "Please select the restoration date and time."
    );

    return;
  }


  const restoredAt =
    new Date(restoredAtRaw);


  if (
    Number.isNaN(
      restoredAt.getTime()
    )
  ) {

    alert(
      "Invalid restoration date/time."
    );

    return;
  }


  /* =====================
     OPEN RESTORATION TASKS

     Final safety check before closing.

     Breakdown may still be closed
     with pending Restoration Tasks,
     but the technician must confirm it.
  ===================== */

  const openTasks =
    Array.isArray(currentBreakdownTasks)
      ? currentBreakdownTasks.filter(
          task =>
            task.status === "Planned" ||
            task.status === "Overdue"
        )
      : [];


  /* =====================
     CLOSE CONFIRMATION
  ===================== */

  let confirmationMessage;


  if (openTasks.length > 0) {

    confirmationMessage =
      `This Breakdown still has ${openTasks.length} open Restoration Task${
        openTasks.length === 1
          ? ""
          : "s"
      }.\n\n` +
      "Closing the Breakdown will end the downtime, " +
      "but the open Restoration Tasks will remain pending.\n\n" +
      "Are you sure the asset has been restored and you want to close this Breakdown?";

  } else {

    confirmationMessage =
      "There are no pending Restoration Tasks.\n\n" +
      "Please confirm that the asset has been restored " +
      "and this Breakdown can be closed.";

  }


  const confirmed =
    window.confirm(
      confirmationMessage
    );


  if (!confirmed) {
    return;
  }


  /* =====================
     PAYLOAD
  ===================== */

  const payload = {

    closed_at:
      restoredAt.toISOString(),

    failure_cause:
      failureCause,

    root_cause:
      rootCause,

    corrective_action:
      correctiveAction

  };


  const button =
    document.getElementById(
      "confirmCloseBreakdownBtn"
    );


  const originalText =
    button?.textContent;


  try {

    if (button) {

      button.disabled = true;

      button.textContent =
        "Closing...";

    }


    /* =====================
       API
    ===================== */

    const response =
      await fetch(
        `/breakdowns/${breakdownId}/close`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Failed to close Breakdown"
      );

    }


    /* =====================
       CLOSE CHILD MODAL
    ===================== */

    closeCloseBreakdownModal();


    /* =====================
       REFRESH DETAIL
    ===================== */

    const detailResponse =
      await fetch(
        `/breakdowns/${breakdownId}`
      );


    if (!detailResponse.ok) {

      throw new Error(
        "Breakdown closed, but detail refresh failed."
      );

    }


    const breakdown =
      await detailResponse.json();


    populateBreakdownDetail(
      breakdown
    );


    await loadRestorationTasks(
      breakdownId
    );


    /* =====================
       REFRESH MAIN LIST
    ===================== */

    await loadBreakdowns();


  } catch (err) {

    console.error(
      "CLOSE BREAKDOWN ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not close Breakdown."
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        originalText ||
        "Close Breakdown";

    }

  }

}

/* =====================
   CONFIRM CLOSE BREAKDOWN
===================== */

document
  .getElementById(
    "confirmCloseBreakdownBtn"
  )
  ?.addEventListener(
    "click",
    closeBreakdown
  );

  /* =========================================================
   OPEN EDIT RESTORATION TASK

   Uses the SAME modal as Add Restoration Task.

   Loads:
   - Task
   - Section
   - Unit
   - Due Date
   - Estimated Duration
   - Notes

   Section / Unit catalogue comes from:
   GET /assets/:id/locations
========================================================= */

async function openEditRestorationTaskModal(taskId) {

  const resolvedTaskId =
    Number(taskId);

  const breakdownId =
    Number(currentBreakdownId);


  if (
    !Number.isInteger(resolvedTaskId) ||
    resolvedTaskId <= 0 ||
    !Number.isInteger(breakdownId) ||
    breakdownId <= 0
  ) {

    console.error(
      "EDIT RESTORATION TASK: Invalid IDs"
    );

    return;
  }


  /* =====================
     FIND TASK
  ===================== */

  const task =
    currentBreakdownTasks.find(
      item =>
        Number(item.id) ===
        resolvedTaskId
    );


  if (!task) {

    alert(
      "Restoration Task not found."
    );

    return;
  }


  /* =====================
     COMPLETED GUARD
  ===================== */

  const status =
    String(
      task.status || ""
    ).toUpperCase();


  if (
    status !== "PLANNED" &&
    status !== "OVERDUE"
  ) {

    alert(
      "Completed Restoration Tasks cannot be edited."
    );

    return;
  }


  const overlay =
    document.getElementById(
      "restorationTaskOverlay"
    );

  if (!overlay) return;


  /* =====================
     EDIT MODE
  ===================== */

  editingRestorationTaskId =
    resolvedTaskId;


  /* =====================
     ELEMENTS
  ===================== */

  const taskInput =
    document.getElementById(
      "restoration-task"
    );

  const sectionSelect =
    document.getElementById(
      "restoration-section"
    );

  const sectionInput =
    document.getElementById(
      "restoration-section-input"
    );

  const unitSelect =
    document.getElementById(
      "restoration-unit"
    );

  const unitInput =
    document.getElementById(
      "restoration-unit-input"
    );

  const dueDateInput =
    document.getElementById(
      "restoration-due-date"
    );

  const durationInput =
    document.getElementById(
      "restoration-duration"
    );

  const notesInput =
    document.getElementById(
      "restoration-notes"
    );

  const saveBtn =
    document.getElementById(
      "saveRestorationTaskBtn"
    );


  /* =====================
     BREAKDOWN REFERENCE
  ===================== */

  const referenceEl =
    document.getElementById(
      "restorationTaskBreakdownRef"
    );


  if (referenceEl) {

    referenceEl.textContent =
      `BD-${String(
        breakdownId
      ).padStart(5, "0")}`;

  }


  /* =====================
     BASIC VALUES
  ===================== */

  if (taskInput) {
    taskInput.value =
      task.task || "";
  }


  if (durationInput) {

    durationInput.value =
      task.duration_min ??
      "";

  }


  if (notesInput) {

    notesInput.value =
      task.notes || "";

  }


  /* =====================
     DUE DATE
     Convert ISO → datetime-local
  ===================== */

  if (dueDateInput) {

    dueDateInput.value =
      task.due_date
        ? formatDateTimeLocalValue(
            task.due_date
          )
        : "";

  }


  /* =====================
     LOAD SECTION CATALOGUE
  ===================== */

  const assetId =
    Number(
      currentBreakdown?.asset_id
    );


  if (
    Number.isInteger(assetId) &&
    assetId > 0
  ) {

    await populateRestorationSections(
      assetId
    );


    /* =====================
       SELECT SECTION
    ===================== */

    const taskSection =
      String(
        task.section || ""
      ).trim();


    if (taskSection) {

      /*
        Normally the Section will exist
        in the historical catalogue.
      */

      const sectionExists =
        sectionSelect &&
        Array.from(
          sectionSelect.options
        ).some(
          option =>
            option.value ===
            taskSection
        );


      if (
        sectionSelect &&
        sectionExists
      ) {

        sectionSelect.style.display =
          "block";

        sectionInput.style.display =
          "none";

        sectionSelect.value =
          taskSection;


        /* =====================
           LOAD UNITS
        ===================== */

        populateRestorationUnits(
          assetId,
          taskSection
        );


        const taskUnit =
          String(
            task.unit || ""
          ).trim();


        if (taskUnit) {

          const unitExists =
            unitSelect &&
            Array.from(
              unitSelect.options
            ).some(
              option =>
                option.value ===
                taskUnit
            );


          if (
            unitSelect &&
            unitExists
          ) {

            unitSelect.value =
              taskUnit;

          }

          else {

            /*
              Safety fallback if the
              historical Unit is no longer
              available in the catalogue.
            */

            if (unitSelect) {

              unitSelect.style.display =
                "none";

            }

            if (unitInput) {

              unitInput.style.display =
                "block";

              unitInput.value =
                taskUnit;

            }

          }

        }

      }

      else {

        /*
          Safety fallback for a historical
          Section not found in catalogue.
        */

        if (sectionSelect) {

          sectionSelect.style.display =
            "none";

        }

        if (sectionInput) {

          sectionInput.style.display =
            "block";

          sectionInput.value =
            taskSection;

        }


        if (unitSelect) {

          unitSelect.style.display =
            "none";

        }


        if (unitInput) {

          unitInput.style.display =
            "block";

          unitInput.value =
            task.unit || "";

        }

      }

    }

  }


  /* =====================
     SAVE BUTTON
  ===================== */

  if (saveBtn) {
    saveBtn.textContent =
      "Save Changes";
  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display =
    "flex";


  setTimeout(() => {
    taskInput?.focus();
  }, 0);

}

/* =========================================================
   POPULATE RESTORATION SECTIONS

   Loads the historical Section / Unit catalogue
   directly from the backend:

   GET /assets/:id/locations

   Source:
   maintenance_tasks - all statuses
   excluding soft-deleted tasks.

   Behaviour:
   - Existing Sections found → show dropdown
   - No Sections found       → show manual input
   - Unit fields reset whenever Sections reload
   - Catalogue reloads fresh every modal opening
========================================================= */

async function populateRestorationSections(assetId) {

  /* =====================
     ELEMENTS
  ===================== */

  const sectionSelect =
    document.getElementById(
      "restoration-section"
    );

  const sectionInput =
    document.getElementById(
      "restoration-section-input"
    );

  const unitSelect =
    document.getElementById(
      "restoration-unit"
    );

  const unitInput =
    document.getElementById(
      "restoration-unit-input"
    );


  if (
    !sectionSelect ||
    !sectionInput
  ) {
    return;
  }


  /* =====================
     RESET CATALOGUE
  ===================== */

  currentRestorationLocations = [];
  currentRestorationLocationsAssetId = null;


  /* =====================
     RESET SECTION
  ===================== */

  sectionSelect.innerHTML =
    `<option value="">Select section</option>`;

  sectionSelect.value = "";

  sectionInput.value = "";


  /* =====================
     RESET UNIT
  ===================== */

  if (unitSelect) {

    unitSelect.innerHTML =
      `<option value="">Select unit</option>`;

    unitSelect.value = "";

    unitSelect.style.display =
      "none";

  }


  if (unitInput) {

    unitInput.value = "";

    unitInput.style.display =
      "none";

  }


  /* =====================
     VALIDATE ASSET
  ===================== */

  const resolvedAssetId =
    Number(assetId);


  if (
    !Number.isInteger(resolvedAssetId) ||
    resolvedAssetId <= 0
  ) {

    sectionSelect.style.display =
      "none";

    sectionInput.style.display =
      "block";

    return;
  }


  /* =====================
     LOAD LOCATION CATALOGUE
     FROM BACKEND
  ===================== */

  try {

    const response =
      await fetch(
        `/assets/${resolvedAssetId}/locations`
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    currentRestorationLocations =
      Array.isArray(data.locations)
        ? data.locations
        : [];


    currentRestorationLocationsAssetId =
      resolvedAssetId;


    /* =====================
       BUILD UNIQUE SECTIONS

       Endpoint already returns
       normalized locations, but
       we still protect the UI
       from duplicate Sections.
    ===================== */

    const sectionMap =
      new Map();


    for (
      const location
      of currentRestorationLocations
    ) {

      const section =
        String(
          location?.section || ""
        ).trim();


      if (!section) continue;


      const key =
        section.toLocaleLowerCase(
          "el-GR"
        );


      if (!sectionMap.has(key)) {

        sectionMap.set(
          key,
          section
        );

      }

    }


    const sections =
      Array.from(
        sectionMap.values()
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            "el",
            {
              sensitivity: "base"
            }
          )
      );


    /* =====================
       EXISTING SECTIONS FOUND
    ===================== */

    if (sections.length > 0) {

      sectionSelect.innerHTML =
        `<option value="">Select section</option>` +

        sections
          .map(
            section =>
              `<option value="${escapeBreakdownHtml(section)}">${escapeBreakdownHtml(section)}</option>`
          )
          .join("");


      sectionSelect.style.display =
        "block";


      sectionInput.style.display =
        "none";

      sectionInput.value = "";


      return;
    }


    /* =====================
       NO EXISTING SECTIONS
    ===================== */

    sectionSelect.style.display =
      "none";


    sectionInput.style.display =
      "block";

    sectionInput.value = "";

  }

  catch (err) {

    console.error(
      "RESTORATION LOCATIONS: Failed to load asset locations:",
      err
    );


    /*
      Safe fallback:

      If catalogue cannot be loaded,
      do not block task creation.
      Allow manual Section entry.
    */

    currentRestorationLocations = [];
    currentRestorationLocationsAssetId = null;


    sectionSelect.style.display =
      "none";


    sectionInput.style.display =
      "block";

    sectionInput.value = "";

  }

}

/* =========================================================
   POPULATE RESTORATION UNITS

   Uses the location catalogue already loaded by:

   GET /assets/:id/locations

   Filters Units by:
   Asset + selected Section

   Behaviour:
   - Existing Units found → show dropdown
   - Dropdown includes "➕ New unit"
   - No Units found       → show manual input
   - No Section selected  → hide both Unit fields
========================================================= */

function populateRestorationUnits(
  assetId,
  section
) {

  /* =====================
     ELEMENTS
  ===================== */

  const unitSelect =
    document.getElementById(
      "restoration-unit"
    );

  const unitInput =
    document.getElementById(
      "restoration-unit-input"
    );


  if (
    !unitSelect ||
    !unitInput
  ) {
    return;
  }


  /* =====================
     RESET UNIT
  ===================== */

  unitSelect.innerHTML =
    `<option value="">Select unit</option>`;

  unitSelect.value = "";

  unitInput.value = "";


  /* =====================
     NO SECTION SELECTED
  ===================== */

  if (
    !section ||
    String(section).trim() === ""
  ) {

    unitSelect.style.display =
      "none";

    unitInput.style.display =
      "none";

    return;
  }


  const resolvedAssetId =
    Number(assetId);

  const resolvedSection =
    String(section).trim();


  /* =====================
     SAFETY CHECK

     Make sure the loaded catalogue
     belongs to this Asset.
  ===================== */

  if (
    currentRestorationLocationsAssetId !==
    resolvedAssetId
  ) {

    console.warn(
      "RESTORATION UNITS: Location catalogue does not match Asset",
      resolvedAssetId
    );

    unitSelect.style.display =
      "none";

    unitInput.style.display =
      "block";

    return;
  }


  /* =====================
     FIND UNITS FOR SECTION
  ===================== */

  const normalizedSection =
    resolvedSection
      .toLocaleLowerCase(
        "el-GR"
      );


  const unitMap =
    new Map();


  for (
    const location
    of currentRestorationLocations
  ) {

    const locationSection =
      String(
        location?.section || ""
      ).trim();


    const unit =
      String(
        location?.unit || ""
      ).trim();


    if (
      !locationSection ||
      !unit
    ) {
      continue;
    }


    if (
      locationSection
        .toLocaleLowerCase(
          "el-GR"
        ) !== normalizedSection
    ) {
      continue;
    }


    const unitKey =
      unit.toLocaleLowerCase(
        "el-GR"
      );


    if (!unitMap.has(unitKey)) {

      unitMap.set(
        unitKey,
        unit
      );

    }

  }


  const units =
    Array.from(
      unitMap.values()
    )
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          "el",
          {
            sensitivity: "base"
          }
        )
    );


  /* =====================
     EXISTING UNITS FOUND
  ===================== */

  if (units.length > 0) {

    unitSelect.innerHTML =
      `<option value="">Select unit</option>` +

      units
        .map(
          unit =>
            `<option value="${escapeBreakdownHtml(unit)}">${escapeBreakdownHtml(unit)}</option>`
        )
        .join("") +

      `<option value="__new__">➕ New unit</option>`;


    unitSelect.style.display =
      "block";


    unitInput.style.display =
      "none";

    unitInput.value = "";


    return;
  }


  /* =====================
     NO EXISTING UNITS
  ===================== */

  unitSelect.style.display =
    "none";


  unitInput.style.display =
    "block";

  unitInput.value = "";

}

/* =========================================================
   RESTORATION SECTION → UNITS

   Existing Section dropdown:
   loads Units for the current Breakdown Asset + Section
========================================================= */

document
  .getElementById(
    "restoration-section"
  )
  ?.addEventListener(
    "change",
    event => {

      const assetId =
        Number(
          currentBreakdown?.asset_id
        );

      const section =
        event.target.value;

      populateRestorationUnits(
        assetId,
        section
      );

    }
  );

  /* =========================================================
   RESTORATION MANUAL SECTION → UNITS
========================================================= */

document
  .getElementById(
    "restoration-section-input"
  )
  ?.addEventListener(
    "input",
    event => {

      const assetId =
        Number(
          currentBreakdown?.asset_id
        );

      const section =
        event.target.value.trim();

      populateRestorationUnits(
        assetId,
        section
      );

    }
  );

  /* =========================================================
   RESTORATION UNIT → NEW UNIT

   When the operator selects "➕ New unit",
   show the manual Unit input.

   When an existing Unit is selected,
   hide and clear the manual input.
========================================================= */

document
  .getElementById(
    "restoration-unit"
  )
  ?.addEventListener(
    "change",
    event => {

      const unitInput =
        document.getElementById(
          "restoration-unit-input"
        );


      if (!unitInput) {
        return;
      }


      /* =====================
         NEW UNIT SELECTED
      ===================== */

      if (
        event.target.value === "__new__"
      ) {

        unitInput.style.display =
          "block";

        unitInput.value = "";

        unitInput.focus();

      }


      /* =====================
         EXISTING UNIT
         OR EMPTY SELECTION
      ===================== */

      else {

        unitInput.style.display =
          "none";

        unitInput.value = "";

      }

    }
  );

  /* =========================================================
   BREAKDOWNS TABLE ACTIONS
========================================================= */

document.addEventListener(
  "click",
  async (event) => {

    const reopenBtn =
      event.target.closest(
        ".breakdown-reopen-btn"
      );


    if (!reopenBtn) return;


    event.preventDefault();
    event.stopPropagation();


    const breakdownId =
      Number(
        reopenBtn.dataset.breakdownId
      );


    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {

      alert("Invalid Breakdown ID");
      return;

    }


    /* =====================
       ADMIN CHECK
    ===================== */

    const role =
      String(
        localStorage.getItem("cmmsRole") || ""
      ).toLowerCase();


    if (role !== "admin") {

      alert(
        "Only Admin can reopen a Breakdown."
      );

      return;

    }


    /* =====================
       CONFIRMATION
    ===================== */

    const confirmed =
      window.confirm(
        `Reopen BD-${String(
          breakdownId
        ).padStart(5, "0")}?\n\n` +
        `The Breakdown will return to IN PROGRESS.\n` +
        `Machine State will be NOT SET until selected manually.`
      );


    if (!confirmed) return;


    /* =====================
       REOPEN
    ===================== */

    const originalText =
      reopenBtn.textContent;


    try {

      reopenBtn.disabled = true;
      reopenBtn.textContent =
        "Reopening...";


      const response =
        await fetch(
          `/breakdowns/${breakdownId}/reopen`,
          {
            method: "PATCH",

            headers: {
              "x-cmms-role": role
            }
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "Failed to reopen Breakdown"
        );

      }


      /* =====================
         REFRESH TABLE

         loadBreakdowns() will reload the
         latest Breakdown status from backend.
      ===================== */

      await loadBreakdowns();


    } catch (err) {

      console.error(
        "REOPEN BREAKDOWN ERROR:",
        err
      );


      alert(
        err.message ||
        "Failed to reopen Breakdown"
      );


      /*
        Restore button only on failure.

        On success the table is re-rendered,
        so the CLOSED Reopen button disappears.
      */

      reopenBtn.disabled = false;
      reopenBtn.textContent =
        originalText;

    }

  }
);

/* =========================================================
   EDIT BREAKDOWN EVENTS
========================================================= */

document
  .getElementById("editBreakdownBtn")
  ?.addEventListener(
    "click",
    openEditBreakdownModal
  );


/* =====================
   CLOSE EDIT BREAKDOWN
   Scoped to NEW incident modal
===================== */

const incidentEditOverlay =
  document.getElementById("incidentEditOverlay");

incidentEditOverlay
  ?.querySelector("#closeEditBreakdownBtn")
  ?.addEventListener(
    "click",
    (event) => {

      event.preventDefault();
      event.stopPropagation();

      closeEditBreakdownModal();

    }
  );


document
  .getElementById("cancelEditBreakdownBtn")
  ?.addEventListener(
    "click",
    closeEditBreakdownModal
  );


document
  .getElementById("saveEditBreakdownBtn")
  ?.addEventListener(
    "click",
    saveEditBreakdown
  );

