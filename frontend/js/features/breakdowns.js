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
    document.getElementById("breakdownsTableBody");

  if (!tbody) return;


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

      const started =
        formatBreakdownDate(
          b.started_at
        );

      const downtime =
        formatBreakdownDowntime(b);


      return `
        <tr>

          <td>
            BD-${String(id).padStart(5, "0")}
          </td>

          <td>
            <strong>${escapeBreakdownHtml(asset)}</strong>
            ${
              serial
                ? `<div class="task-meta">${escapeBreakdownHtml(serial)}</div>`
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
            <span class="breakdown-status ${getBreakdownStatusClass(status)}">
              ${escapeBreakdownHtml(status.replace("_", " "))}
            </span>
          </td>

          <td>
            ${escapeBreakdownHtml(started)}
          </td>

          <td>
            ${escapeBreakdownHtml(downtime)}
          </td>

          <td>
            <td>
              <button
                class="btn-table breakdown-view-btn"
                type="button"
                data-breakdown-id="${id}"
              >
                View
              </button>
            </td>
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


  if (titleInput) {
    titleInput.value = "";
  }

  if (descriptionInput) {
    descriptionInput.value = "";
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
     DOWNTIME
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
  /* =====================
    STATUS-AWARE ACTIONS
  ===================== */

  updateBreakdownStatusUI(
    breakdown
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

  const saveBtn =
    document.getElementById("saveBreakdownBtn");

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


  /* =====================
     READ VALUES
  ===================== */

  const assetId =
    Number(assetSelect?.value);

  const title =
    String(titleInput?.value || "").trim();

  const description =
    String(descriptionInput?.value || "").trim();

  const startedAt =
    startedInput?.value || "";

  const reportedBy =
    String(reportedByInput?.value || "").trim();


  /* =====================
     VALIDATION
  ===================== */

  if (
    !Number.isInteger(assetId) ||
    assetId <= 0
  ) {

    alert("Please select an Asset.");

    assetSelect?.focus();

    return;
  }


  if (!title) {

    alert("Please enter the Fault / Title.");

    titleInput?.focus();

    return;
  }


  if (!startedAt) {

    alert("Please enter the Breakdown start date and time.");

    startedInput?.focus();

    return;
  }


  /* =====================
     DATETIME VALIDATION
  ===================== */

  const startedDate =
    new Date(startedAt);

  if (
    Number.isNaN(
      startedDate.getTime()
    )
  ) {

    alert("Invalid Breakdown start date and time.");

    startedInput?.focus();

    return;
  }


  /* =====================
     REQUEST BODY
  ===================== */

  const payload = {

    asset_id: assetId,

    title,

    description:
      description || null,

    started_at:
      startedDate.toISOString(),

    reported_by:
      reportedBy || null

  };


  /* =====================
     SAVE
  ===================== */

  try {

    if (saveBtn) {

      saveBtn.disabled = true;

      saveBtn.textContent =
        "Creating...";

    }

    const response =
      await fetch(
        "/breakdowns",
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
        "Failed to create Breakdown"
      );

    }


    /* =====================
       SUCCESS
    ===================== */

    closeNewBreakdownModal();


    /*
      Reload only the Breakdown list.

      We do NOT reload the whole app.
    */

    await loadBreakdowns();


  } catch (err) {

    console.error(
      "CREATE BREAKDOWN ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not create Breakdown."
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
              status === "Planned" ||
              status === "Overdue"
                ? `
                  <button
                    class="btn-table restoration-complete-btn"
                    type="button"
                    data-task-id="${id}"
                  >
                    Complete
                  </button>
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
     CREATE
  ===================== */

  try {

    if (saveBtn) {

      saveBtn.disabled = true;

      saveBtn.textContent =
        "Adding...";

    }


    const response =
      await fetch(
        `/breakdowns/${breakdownId}/tasks`,
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
        "Failed to create Restoration Task"
      );

    }


    /* =====================
       SUCCESS
    ===================== */

    closeRestorationTaskModal();


    /*
      Refresh child task list only.

      Breakdown status does not change.
    */

    await loadRestorationTasks(
      breakdownId
    );


  } catch (err) {

    console.error(
      "CREATE RESTORATION TASK ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not create Restoration Task."
    );


  } finally {

    if (saveBtn) {

      saveBtn.disabled = false;

      saveBtn.textContent =
        "Add Task";

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
   PATCH /tasks/:id

   Uses the existing CMMS task completion engine.

   RESULT:
   - maintenance_task → Done
   - task_execution is created
   - execution appears in History

   IMPORTANT:
   - Breakdown status is NOT changed
   - Breakdown is NOT automatically closed
========================================================= */

async function completeRestorationTask(taskId) {

  const id =
    Number(taskId);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }


  /* =====================
     CONFIRM
  ===================== */

  const confirmed =
    confirm(
      `Complete Restoration Task #${id}?`
    );


  if (!confirmed) {
    return;
  }


  /* =====================
     CURRENT USER
  ===================== */

  const completedBy =
    localStorage.getItem(
      "cmmsTechnicianName"
    ) || "Unknown";


  const technicianIdRaw =
    localStorage.getItem(
      "cmmsTechnicianId"
    );


  const technicianId =
    technicianIdRaw
      ? Number(technicianIdRaw)
      : null;


  /* =====================
     PAYLOAD
  ===================== */

  const payload = {

    completed_by:
      completedBy,

    completed_at:
      new Date().toISOString(),

    notes:
      "Completed from Breakdown Restoration Tasks",

    technician_id:
      Number.isInteger(technicianId) &&
      technicianId > 0
        ? technicianId
        : null

  };


  /* =====================
     COMPLETE
  ===================== */

  try {

    const response =
      await fetch(
        `/tasks/${id}`,
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
        "Failed to complete Restoration Task"
      );

    }


    /* =====================
       REFRESH RESTORATION LIST
    ===================== */

    if (currentBreakdownId) {

      await loadRestorationTasks(
        currentBreakdownId
      );

    }


  } catch (err) {

    console.error(
      "COMPLETE RESTORATION TASK ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not complete Restoration Task."
    );

  }

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
   POPULATE RESTORATION SECTIONS

   Loads the existing Sections for the Asset
   associated with the current Breakdown.

   Uses the existing CMMS helper:
   getSectionsForAsset(assetId)

   Behaviour:
   - Existing Sections found → show dropdown
   - No Sections found       → show manual input
   - Unit fields are reset whenever Sections reload
========================================================= */

function populateRestorationSections(assetId) {

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
     RESET SECTION
  ===================== */

  sectionSelect.innerHTML =
    `<option value="">Select section</option>`;

  sectionSelect.value = "";

  sectionInput.value = "";


  /* =====================
     RESET UNIT

     Unit depends on Section,
     so every Section reload
     must also reset Unit.
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
     GET EXISTING SECTIONS

     Same source used by
     the normal Add Task modal.
  ===================== */

  const sections =
    typeof getSectionsForAsset === "function"
      ? getSectionsForAsset(assetId)
      : [];


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


    // Show dropdown
    sectionSelect.style.display =
      "block";


    // Hide manual Section
    sectionInput.style.display =
      "none";

    sectionInput.value = "";


    return;
  }


  /* =====================
     NO EXISTING SECTIONS

     Allow operator to enter
     a Section manually.
  ===================== */

  sectionSelect.style.display =
    "none";


  sectionInput.style.display =
    "block";

  sectionInput.value = "";

}

/* =========================================================
   POPULATE RESTORATION UNITS

   Loads the existing Units for:
   Breakdown Asset + selected Section

   Uses the existing CMMS helper:
   getUnitsForAssetSection(assetId, section)

   Behaviour:
   - Existing Units found → show dropdown
   - Dropdown also includes "➕ New unit"
   - No Units found       → show manual input
   - No Section selected  → hide both Unit fields
========================================================= */

function populateRestorationUnits(assetId, section) {

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

     Unit depends on Section,
     so nothing should be shown yet.
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


  /* =====================
     GET EXISTING UNITS

     Same source used by
     the normal Add Task modal.
  ===================== */

  const units =
    typeof getUnitsForAssetSection === "function"
      ? getUnitsForAssetSection(
          assetId,
          String(section).trim()
        )
      : [];


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


    // Show Unit dropdown
    unitSelect.style.display =
      "block";


    // Manual Unit remains hidden
    // until "➕ New unit" is selected.
    unitInput.style.display =
      "none";

    unitInput.value = "";


    return;
  }


  /* =====================
     NO EXISTING UNITS

     Allow operator to enter
     a Unit manually.
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