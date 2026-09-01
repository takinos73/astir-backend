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
            ${escapeBreakdownHtml(status)}
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

      Useful now and later for CSS badges.
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
     START WORK

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
     can be closed.
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
     RESTORATION TASKS

     Intentionally remain available
     even after Breakdown closure.
  ===================== */

  if (addTaskBtn) {

    addTaskBtn.style.display = "";

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