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
// BREAKDOWN LIST DATA
//
// Full list loaded from GET /breakdowns.
// Filters operate locally on this array.
// ============================================================

let breakdownsData = [];

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

let breakdownCurrentPage = 1;

const breakdownPageSize = 10;

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
   SCHEDULED MAINTENANCE DATA

   Independent from breakdownsData.
===================== */

let scheduledMaintenanceData = [];

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


    breakdownsData =
      Array.isArray(breakdowns)
        ? breakdowns
        : [];


    /* =====================
       LOAD SCHEDULED MAINTENANCE

       A failure to load SM must not prevent
       existing Breakdowns from being displayed.
    ===================== */

    scheduledMaintenanceData = [];

    try {

      const smResponse =
        await fetch("/scheduled-maintenance");

      if (!smResponse.ok) {
        throw new Error(
          `Failed to load SM (${smResponse.status})`
        );
      }

      const smResult =
        await smResponse.json();

      scheduledMaintenanceData =
        Array.isArray(smResult)
          ? smResult
          : [];

    } catch (smError) {

      console.error(
        "LOAD SCHEDULED MAINTENANCE ERROR:",
        smError
      );

    }


    /* =====================
       REFRESH COMMON INCIDENT TABLE
    ===================== */

    populateBreakdownLineFilter();

    applyBreakdownFilters();


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

// =========================================================
// BREAKDOWN AUTO PAGE SIZE
// =========================================================

function getBreakdownPageSize() {

  const tbody =
    document.getElementById("breakdownsTableBody");

  const table =
    tbody?.closest("table");

  const pagination =
    document.querySelector(".breakdown-pagination");

  if (
    !table ||
    table.offsetParent === null
  ) {
    return breakdownPageSize;
  }

  const tableTop =
    table.getBoundingClientRect().top;

  const paginationHeight =
    pagination?.getBoundingClientRect().height || 54;

  const tableHeadHeight =
    table.querySelector("thead")
      ?.getBoundingClientRect().height || 40;

  const sampleRow =
    tbody.querySelector("tr");

  const rowHeight =
    sampleRow?.getBoundingClientRect().height || 62;

  const bottomMargin = 50;

  const availableHeight =
    window.innerHeight
    - tableTop
    - tableHeadHeight
    - paginationHeight
    - bottomMargin;

  const calculated =
    Math.floor(
      availableHeight / rowHeight
    );

  return Math.min(
    25,
    Math.max(10, calculated)
  );
}

/* =========================================================
   MAINTENANCE INCIDENTS — COMMON DISPLAY DATA

   BD and SM remain separate in memory.

   This function creates display-only rows
   for the common table, filters and pagination.

   Scheduled Start is used as the SM date.
   SM does NOT acquire BD downtime or BD actions.
========================================================= */

function getMaintenanceIncidentRows() {

  const bdRows =
    breakdownsData.map(b => ({

      ...b,

      incident_type: "BD"

    }));


  const smRows =
    scheduledMaintenanceData.map(sm => ({

      ...sm,

      incident_type: "SM",

      asset_model:
        sm.asset_model ||
        sm.model ||
        sm.asset_name ||
        "-",

      asset_serial:
        sm.asset_serial ||
        sm.serial_number ||
        "",

      line_name:
        sm.line_name ||
        sm.line_code ||
        sm.line ||
        "-",

      // Common date field used by existing filters.
      // This does NOT represent a Breakdown start.
      started_at:
        sm.scheduled_start_at || null

    }));


  /* =====================
     COMMON INCIDENT ORDER

     Combine BD and SM, then sort together
     by incident date (newest first).

     BD: Breakdown started date.
     SM: Scheduled start date.
         If not scheduled yet, use creation date
         for sorting only.

     Does not modify source data or downtime.
  ===================== */

  const incidentRows = [
    ...bdRows,
    ...smRows
  ];

  const getIncidentSortTime = incident => {

    const dateValue =
      incident.incident_type === "SM"
        ? (
            incident.scheduled_start_at ||
            incident.created_at
          )
        : (
            incident.started_at ||
            incident.created_at
          );

    if (!dateValue) return 0;

    const timestamp =
      new Date(dateValue).getTime();

    return Number.isFinite(timestamp)
      ? timestamp
      : 0;

  };

  return incidentRows.sort(
    (a, b) =>
      getIncidentSortTime(b) -
      getIncidentSortTime(a)
  );

}

/* =========================================================
   BREAKDOWN FILTERS
========================================================= */

function applyBreakdownFilters() {

  const lineValue =
    document
      .getElementById("breakdownLineFilter")
      ?.value || "ALL";


  const fromValue =
    document
      .getElementById("breakdownFromFilter")
      ?.value || "";


  const toValue =
    document
      .getElementById("breakdownToFilter")
      ?.value || "";


  const statusValue =
    document
      .getElementById("breakdownStatusFilter")
      ?.value || "ALL";


  const incidentTypeValue =
    document
      .getElementById("incidentTypeFilter")
      ?.value || "ALL";


  const filtered =
    getMaintenanceIncidentRows().filter(b => {

      /* =====================
         INCIDENT TYPE
      ===================== */

      if (
        incidentTypeValue !== "ALL" &&
        b.incident_type !== incidentTypeValue
      ) {
        return false;
      }

      /* =====================
         LINE
      ===================== */

      if (
        lineValue !== "ALL" &&
        String(b.line_name || "") !== lineValue
      ) {
        return false;
      }


      /* =====================
         STATUS
      ===================== */

      if (
        statusValue !== "ALL" &&
        String(
          b.status || ""
        ).toUpperCase() !== statusValue
      ) {
        return false;
      }


      /* =====================
         STARTED DATE
      ===================== */

      if (
        (fromValue || toValue) &&
        !b.started_at
      ) {
        return false;
      }


      if (b.started_at) {

        const startedAt =
          new Date(b.started_at);


        if (
          Number.isNaN(
            startedAt.getTime()
          )
        ) {
          return false;
        }


        /* =====================
           FROM
        ===================== */

        if (fromValue) {

          const fromDate =
            new Date(
              `${fromValue}T00:00:00`
            );


          if (
            startedAt < fromDate
          ) {
            return false;
          }

        }


        /* =====================
           TO
           Inclusive selected date
        ===================== */

        if (toValue) {

          const toExclusive =
            new Date(
              `${toValue}T00:00:00`
            );


          toExclusive.setDate(
            toExclusive.getDate() + 1
          );


          if (
            startedAt >= toExclusive
          ) {
            return false;
          }

        }

      }

      /* =====================
        SEARCH
      ===================== */

      const searchQuery =
        (
          document
            .getElementById("breakdownSearchFilter")
            ?.value || ""
        )
          .trim()
          .toLowerCase();

      if (searchQuery) {

        const breakdownCode =
          `${b.incident_type === "SM" ? "sm" : "bd"}-${String(
            b.id || ""
          )
            .padStart(5, "0")
            .toLowerCase()}`;

        const searchableText = [

          breakdownCode,
          String(b.id || ""),

          b.title,
          b.description,

          b.asset_model,
          b.asset_serial,

          b.line_name,

          b.reported_by,
          b.failure_cause,
          b.root_cause

        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(searchQuery)) {
          return false;
        }

    }

      return true;

    });

      const pageSize =
        getBreakdownPageSize();

      const totalPages =
        Math.max(
          1,
          Math.ceil(
            filtered.length /
            pageSize
          )
        );


  if (
    breakdownCurrentPage >
    totalPages
  ) {
    breakdownCurrentPage =
      totalPages;
  }


  const startIndex =
    (
      breakdownCurrentPage - 1
    ) * pageSize;


  const endIndex =
    startIndex +
    pageSize;


  const pageRows =
    filtered.slice(
      startIndex,
      endIndex
    );


  renderBreakdownsTable(
    pageRows
  );


  updateBreakdownPagination(
    filtered.length,
    totalPages,
    pageSize
  );

}

/* =========================================================
   UPDATE BREAKDOWN PAGINATION
========================================================= */

function updateBreakdownPagination(

  totalRows,
  totalPages,
  pageSize
) {

  const info =
    document.getElementById(
      "breakdownPaginationInfo"
    );


  const indicator =
    document.getElementById(
      "breakdownPageIndicator"
    );


  const prevBtn =
    document.getElementById(
      "breakdownPrevPageBtn"
    );


  const nextBtn =
    document.getElementById(
      "breakdownNextPageBtn"
    );


  /* =====================
     INFO
  ===================== */

  if (info) {

    if (totalRows === 0) {

      info.textContent =
        "Showing 0–0 of 0";

    } else {

      const from =
        (
          breakdownCurrentPage - 1
        ) * pageSize + 1;


      const to =
        Math.min(
          breakdownCurrentPage *
            pageSize,
          totalRows
        );

      info.textContent =
        `Showing ${from}–${to} of ${totalRows}`;

    }

  }


  /* =====================
     PAGE INDICATOR
  ===================== */

  if (indicator) {

    indicator.textContent =
      `${breakdownCurrentPage} / ${totalPages}`;

  }


  /* =====================
     BUTTON STATES
  ===================== */

  if (prevBtn) {

    prevBtn.disabled =
      breakdownCurrentPage <= 1;

  }


  if (nextBtn) {

    nextBtn.disabled =
      breakdownCurrentPage >= totalPages;

  }

}


/* =========================================================
   POPULATE BREAKDOWN LINE FILTER
========================================================= */

function populateBreakdownLineFilter() {

  const select =
    document.getElementById(
      "breakdownLineFilter"
    );


  if (!select) return;


  const currentValue =
    select.value || "ALL";


  const lines =
    [
      ...new Set(
        getMaintenanceIncidentRows()
          .map(
            b =>
              String(
                b.line_name || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ]
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true
            }
          )
      );


  select.innerHTML = `
    <option value="ALL">
      All Lines
    </option>
  `;


  lines.forEach(line => {

    const option =
      document.createElement(
        "option"
      );


    option.value = line;
    option.textContent = line;


    select.appendChild(option);

  });


  if (
    currentValue === "ALL" ||
    lines.includes(currentValue)
  ) {
    select.value =
      currentValue;
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
          No maintenance incidents recorded.
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
            /* =====================
              SCHEDULED MAINTENANCE ROW

              Independent View and status.

              No Breakdown downtime.
              No Reopen / Assign Restoration.
            ===================== */

            if (b.incident_type === "SM") {

              const smId = Number(b.id);

              if (
                !Number.isInteger(smId) ||
                smId <= 0
              ) {
                return "";
              }

              const smCode =
                `SM-${String(smId).padStart(5, "0")}`;

              const smAsset =
                b.asset_model || "-";

              const smSerial =
                b.asset_serial || "";

              const smLine =
                b.line_name || "-";

              const smTitle =
                b.title || "-";

              const smStatus =
                String(b.status || "-");

              const smDate =
                formatBreakdownDate(
                  b.scheduled_start_at
                );


              return `
                <tr class="sm-incident-row">

                  <td>
                    <span class="breakdown-id">
                      ${smCode}
                    </span>
                  </td>

                  <td>
                    <strong>
                      ${escapeBreakdownHtml(smAsset)}
                    </strong>

                    ${
                      smSerial
                        ? `
                          <div class="task-meta">
                            ${escapeBreakdownHtml(smSerial)}
                          </div>
                        `
                        : ""
                    }
                  </td>

                  <td>
                    ${escapeBreakdownHtml(smLine)}
                  </td>

                  <td>
                    ${escapeBreakdownHtml(smTitle)}
                  </td>

                  <td>
                    <span class="breakdown-status">
                      ${escapeBreakdownHtml(
                        smStatus.replace("_", " ")
                      )}
                    </span>
                  </td>

                  <td>
                    ${escapeBreakdownHtml(smDate)}
                  </td>

                  <td>
                    —
                  </td>

                  <td class="breakdown-actions-cell">

                    <div class="breakdown-actions-row">

                      <button
                        class="btn-table breakdown-action-btn sm-view-btn"
                        type="button"
                        data-sm-id="${smId}"
                        title="View Scheduled Maintenance"
                        aria-label="View Scheduled Maintenance"
                      >
                        👁 View
                      </button>

                    </div>

                  </td>

                </tr>
              `;

            }


            /* =====================
              BREAKDOWN ROW

              Existing BD rendering continues below.
              No changes to BD actions or downtime.
            ===================== */

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
        EFFECTIVE DOWN TIME

        DT Model v1

        Priority:
        1. Verified DOWN Time
        2. Recorded Machine State DOWN Time

        This is the canonical downtime value
        used by the CMMS.

        This is NOT Incident Duration.
      ===================== */

      const downSeconds =
        Number(
          b.effective_down_seconds || 0
        );

      const downTime =
        formatBreakdownSeconds(
          downSeconds
        );

      const isVerifiedDowntime =
        b.downtime_mode === "VERIFIED";


      /* =====================
        REOPEN ACTION

        Admin only.
        Available only for CLOSED Breakdowns.
      ===================== */

      const canReopen =
        isAdmin &&
        normalizedStatus === "CLOSED";


      /* =====================
        ASSIGN RESTORATION ACTION

        Admin only.
        Available only for CLOSED Breakdowns.

        Allows the Admin to:
        - Link an existing completed task.
        - Create and complete a historical
          Restoration Task.

        Does NOT reopen the Breakdown
        or modify its downtime.
      ===================== */

      const canAssignRestoration =
        isAdmin &&
        normalizedStatus === "CLOSED";

      return `
        <tr>

          <td>
            <span class="breakdown-id">
              BD-${String(b.id || "").padStart(5, "0")}
            </span>
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

            ${
              isVerifiedDowntime
                ? `
                  <div class="breakdown-downtime-verified">
                    ✓ VERIFIED
                  </div>
                `
                : ""
            }
          </td>

            <td class="breakdown-actions-cell">

              <div class="breakdown-actions-row">

                <button
                  class="btn-table breakdown-action-btn breakdown-view-btn"
                  type="button"
                  data-breakdown-id="${id}"
                  title="View Breakdown"
                  aria-label="View Breakdown"
                >
                  👁 View
                </button>

                ${
                  canReopen
                    ? `
                  <button
                    class="btn-table breakdown-action-btn breakdown-reopen-btn"
                    type="button"
                    data-breakdown-id="${id}"
                    title="Reopen Breakdown"
                    aria-label="Reopen Breakdown"
                  >
                    ↻ Reopen
                  </button>
                    `
                    : ""
                }

                ${
                  canAssignRestoration
                    ? `
                      <button
                        class="btn-table breakdown-action-btn breakdown-assign-restoration-btn"
                        type="button"
                        data-breakdown-id="${id}"
                        title="Assign Restoration Task"
                        aria-label="Assign Restoration Task"
                      >
                        🔗 Assign Task
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


    /* =====================
       PATCH BREAKDOWN
    ===================== */

    const response =
      await fetch(
        `/breakdowns/${breakdownId}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            "x-cmms-role":
              localStorage.getItem("cmmsRole") || ""
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
       CLOSE EDIT MODAL
    ===================== */

    closeEditBreakdownModal();


    /* =====================================================
       FRESH BREAKDOWN RELOAD

       IMPORTANT:
       PATCH returns the updated DB record,
       but it does not necessarily include
       calculated downtime fields such as:

       - recorded_down_seconds
       - effective_down_seconds
       - downtime_mode

       Therefore we immediately reload the
       full Breakdown detail route.
    ===================================================== */

    const detailResponse =
      await fetch(
        `/breakdowns/${breakdownId}`
      );


    if (!detailResponse.ok) {

      throw new Error(
        "Breakdown updated, but detail reload failed."
      );

    }


    const freshBreakdown =
      await detailResponse.json();


    /* =====================
       UPDATE LOCAL COPY

       Use the fresh GET result as the
       authoritative current Breakdown.
    ===================== */

    currentBreakdown =
      freshBreakdown;


    /* =====================
       REFRESH DETAIL

       Now Recorded / Effective DOWN
       values are immediately correct.
    ===================== */

    populateBreakdownDetail(
      freshBreakdown
    );


    /* =====================
       REFRESH MACHINE STATE

       Editing incident data does not change
       Machine State, but Detail should remain
       fully synchronized.
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


  const role =
    String(
      localStorage.getItem("cmmsRole") || ""
    ).toLowerCase();

  const isAdmin =
    role === "admin";
  
  const canEditBreakdown =
    role === "admin" ||
    role === "planner";

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

  const editBreakdownBtn =
    document.getElementById(
      "editBreakdownBtn"
    );

  const verifyDowntimeBtn =
    document.getElementById(
      "verifyDowntimeBtn"
    );


  /* =====================
    EDIT BREAKDOWN

    Admin + Planner only
  ===================== */

  if (editBreakdownBtn) {
    editBreakdownBtn.style.display =
      canEditBreakdown
        ? "inline-flex"
        : "none";
  }

  /* =====================
     STATUS LABEL
  ===================== */

  if (statusEl) {

    statusEl.textContent =
      status || "-";

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
  ===================== */

  if (addTaskBtn) {

    addTaskBtn.style.display =
      status === "CLOSED"
        ? "none"
        : "";

  }


  /* =====================
     VERIFY DOWNTIME

     Admin only
     Closed Breakdowns only
  ===================== */

  if (verifyDowntimeBtn) {

    verifyDowntimeBtn.style.display =
      (
        isAdmin &&
        status === "CLOSED"
      )
        ? "inline-flex"
        : "none";

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

/* =========================================================
   BREAKDOWN FILTER EVENTS
========================================================= */

function handleBreakdownFilterChange() {

  breakdownCurrentPage = 1;

  applyBreakdownFilters();

}


document
  .getElementById("breakdownLineFilter")
  ?.addEventListener(
    "change",
    handleBreakdownFilterChange
  );


document
  .getElementById("breakdownFromFilter")
  ?.addEventListener(
    "change",
    handleBreakdownFilterChange
  );


document
  .getElementById("breakdownToFilter")
  ?.addEventListener(
    "change",
    handleBreakdownFilterChange
  );


document
  .getElementById("breakdownStatusFilter")
  ?.addEventListener(
    "change",
    handleBreakdownFilterChange
  );

document
  .getElementById("breakdownPrevPageBtn")
  ?.addEventListener(
    "click",
    () => {

      if (
        breakdownCurrentPage <= 1
      ) {
        return;
      }


      breakdownCurrentPage--;


      applyBreakdownFilters();

    }
  );


document
  .getElementById(
    "breakdownNextPageBtn"
  )
  ?.addEventListener(
    "click",
    () => {

      breakdownCurrentPage++;


      applyBreakdownFilters();

    }
  );

document
  .getElementById("breakdownSearchFilter")
  ?.addEventListener(
    "input",
    handleBreakdownFilterChange
  );

/* =====================
   MAINTENANCE INCIDENT — TYPE FILTER

   Reuses the existing common table filtering.
   Does not modify BD or SM data.
===================== */

document
  .getElementById("incidentTypeFilter")
  ?.addEventListener("change", () => {

    breakdownCurrentPage = 1;

    applyBreakdownFilters();

  });


/* =====================
   NEW INCIDENT BUTTON

   Opens the common BD / SM type selector.

   If the SM frontend is not loaded, preserve
   the existing New Breakdown functionality.
===================== */

document
  .getElementById("newBreakdownBtn")
  ?.addEventListener("click", () => {

    if (
      typeof window.openNewIncidentChooser === "function"
    ) {
      window.openNewIncidentChooser();
    } else {
      openNewBreakdownModal();
    }

  });


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
      DOWNTIME MODEL v1
      READ-ONLY SUMMARY

      Recorded DOWN:
      Raw Machine State DOWN intervals.

      Effective DOWN:
      Canonical CMMS downtime.

      If verified_down_seconds exists:
        Effective = Verified

      Otherwise:
        Effective = Recorded
    ========================================================= */

    const recordedDownEl =
      document.getElementById(
        "bd-detail-recorded-down"
      );

    const effectiveDownEl =
      document.getElementById(
        "bd-detail-effective-down"
      );

    const downtimeModeEl =
      document.getElementById(
        "bd-detail-downtime-mode"
      );

    const downtimeVerificationEl =
      document.getElementById(
        "bd-downtime-verification"
      );

    const downtimeReasonEl =
      document.getElementById(
        "bd-detail-downtime-reason"
      );

    const downtimeCorrectedByEl =
      document.getElementById(
        "bd-detail-downtime-corrected-by"
      );

    const downtimeCorrectedAtEl =
      document.getElementById(
        "bd-detail-downtime-corrected-at"
      );


    const recordedDownSeconds =
      Number(
        breakdown.recorded_down_seconds || 0
      );

    const effectiveDownSeconds =
      Number(
        breakdown.effective_down_seconds || 0
      );

    const isVerifiedDowntime =
      breakdown.downtime_mode === "VERIFIED";


    if (recordedDownEl) {

      recordedDownEl.textContent =
        formatBreakdownSeconds(
          recordedDownSeconds
        );

    }


    if (effectiveDownEl) {

      effectiveDownEl.textContent =
        formatBreakdownSeconds(
          effectiveDownSeconds
        );

    }


    if (downtimeModeEl) {

      downtimeModeEl.style.display =
        isVerifiedDowntime
          ? "inline-flex"
          : "none";

    }


    if (downtimeVerificationEl) {

      downtimeVerificationEl.style.display =
        isVerifiedDowntime
          ? "block"
          : "none";

    }


    if (downtimeReasonEl) {

      downtimeReasonEl.textContent =
        isVerifiedDowntime
          ? (
              breakdown
                .downtime_correction_reason ||
              "-"
            )
          : "-";

    }


    if (downtimeCorrectedByEl) {

      downtimeCorrectedByEl.textContent =
        isVerifiedDowntime
          ? (
              breakdown
                .downtime_corrected_by ||
              "-"
            )
          : "-";

    }


    if (downtimeCorrectedAtEl) {

      downtimeCorrectedAtEl.textContent =
        isVerifiedDowntime &&
        breakdown.downtime_corrected_at
          ? formatBreakdownDate(
              breakdown.downtime_corrected_at
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
   PRINT BREAKDOWN DETAIL
========================================================= */

function printBreakdownDetail() {

  if (!currentBreakdown) {

    alert("Breakdown not loaded.");
    return;

  }


  const b =
    currentBreakdown;


  const code =
    `BD-${String(
      b.id || ""
    ).padStart(5, "0")}`;


  const status =
    String(
      b.status || "-"
    ).toUpperCase();


  const isClosed =
    status === "CLOSED";


  const isVerified =
    b.verified_down_seconds !== null &&
    b.verified_down_seconds !== undefined;


  /* =====================
     DATES
  ===================== */

  const started =
    b.started_at
      ? formatBreakdownDate(
          b.started_at
        )
      : "-";


  const restored =
    b.closed_at
      ? formatBreakdownDate(
          b.closed_at
        )
      : "-";


  const correctedAt =
    b.downtime_corrected_at
      ? formatBreakdownDate(
          b.downtime_corrected_at
        )
      : "-";


  /* =====================
     INCIDENT DURATION
  ===================== */

  let incidentSeconds = 0;


  if (b.started_at) {

    const startDate =
      new Date(
        b.started_at
      );


    const endDate =
      b.closed_at
        ? new Date(
            b.closed_at
          )
        : new Date();


    if (
      !Number.isNaN(
        startDate.getTime()
      ) &&
      !Number.isNaN(
        endDate.getTime()
      )
    ) {

      incidentSeconds =
        Math.max(
          0,
          Math.round(
            (
              endDate -
              startDate
            ) / 1000
          )
        );

    }

  }


  const incidentDuration =
    formatBreakdownSeconds(
      incidentSeconds
    );


  const recordedDown =
    formatBreakdownSeconds(
      Number(
        b.recorded_down_seconds || 0
      )
    );


  const effectiveDown =
    formatBreakdownSeconds(
      Number(
        b.effective_down_seconds || 0
      )
    );


  /* =====================
     RESTORATION TASKS
  ===================== */

  const restorationRows =
    Array.isArray(
      currentBreakdownTasks
    ) &&
    currentBreakdownTasks.length
      ? currentBreakdownTasks
          .map(task => {

            const duration =
              task.duration_min != null
                ? formatBreakdownSeconds(
                    Number(
                      task.duration_min
                    ) * 60
                  )
                : "-";


            const due =
              task.due_date
                ? formatBreakdownDate(
                    task.due_date
                  )
                : "-";


            return `
              <tr>

                <td>
                  #${escapeBreakdownHtml(
                    task.id ?? ""
                  )}
                </td>

                <td>
                  ${escapeBreakdownHtml(
                    task.task || "-"
                  )}
                </td>

                <td>
                  ${escapeBreakdownHtml(
                    task.status || "-"
                  )}
                </td>

                <td>
                  ${escapeBreakdownHtml(
                    task.section || "-"
                  )}
                </td>

                <td>
                  ${escapeBreakdownHtml(
                    due
                  )}
                </td>

                <td>
                  ${escapeBreakdownHtml(
                    duration
                  )}
                </td>

              </tr>
            `;

          })
          .join("")
      : `
          <tr>
            <td
              colspan="6"
              class="empty"
            >
              No Correction Tasks recorded.
            </td>
          </tr>
        `;


  /* =====================
     PRINTED DATE
  ===================== */

  const printedAt =
    new Date()
      .toLocaleString(
        "en-GB"
      );


  /* =====================
     PRINT WINDOW
  ===================== */

const printFrame =
  document.createElement(
    "iframe"
  );


printFrame.style.position =
  "fixed";

printFrame.style.right =
  "0";

printFrame.style.bottom =
  "0";

printFrame.style.width =
  "1px";

printFrame.style.height =
  "1px";

printFrame.style.border =
  "0";

printFrame.style.opacity =
  "0";

printFrame.style.pointerEvents =
  "none";


document.body.appendChild(
  printFrame
);


const printDocument =
  printFrame.contentDocument ||
  printFrame.contentWindow.document;

  printDocument.write(`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>${code} - Breakdown Report</title>

<style>

@page {
  size: A4 portrait;
  margin: 8mm 10mm;
}


* {
  box-sizing: border-box;
}


body {
  margin: 0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  color: #172033;
  background: #ffffff;

  font-size: 10px;
}


.report {
  width: 100%;
}


/* =====================
   HEADER
===================== */

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  padding-bottom: 8px;
  margin-bottom: 10px;

  border-bottom: 2px solid #d6dde8;
}


.brand {
  font-size: 21px;
  font-weight: 800;

  color: #17233c;
}


.brand span {
  color: #2588e8;
}


.brand-sub {
  margin-top: 2px;

  font-size: 7px;
  font-weight: 700;

  letter-spacing: 0.7px;

  color: #65738a;
}


.report-meta {
  text-align: right;

  font-size: 8px;
  line-height: 1.4;

  color: #59677d;
}


.report-meta strong {
  display: block;

  margin-bottom: 1px;

  font-size: 11px;

  color: #21304c;
}


/* =====================
   BREAKDOWN HEADER
===================== */

.breakdown-heading {
  display: flex;
  align-items: center;

  gap: 9px;

  margin-bottom: 2px;
}


.breakdown-code {
  font-size: 19px;
  font-weight: 800;
}


.status {
  display: inline-flex;
  align-items: center;

  padding: 3px 12px;

  border-radius: 20px;

  font-size: 8px;
  font-weight: 700;

  color: #ffffff;

  background:
    ${isClosed
      ? "#169c55"
      : "#d99b16"};
}


.asset-line {
  margin-bottom: 9px;

  font-size: 12px;
  font-weight: 600;

  color: #28354c;
}


/* =====================
   GRID
===================== */

.grid {
  display: grid;

  grid-template-columns:
    repeat(6, 1fr);

  gap: 5px;

  margin-bottom: 5px;

  align-items: start;
}


.card {
  padding: 6px 8px;

  border: 1px solid #d5dde8;
  border-radius: 5px;

  background: #fbfcfe;

  align-self: start;

  break-inside: avoid;
  page-break-inside: avoid;
}


.span-2 {
  grid-column: span 2;
}


.span-3 {
  grid-column: span 3;
}


.span-6 {
  grid-column: span 6;
}


.label {
  margin-bottom: 3px;

  font-size: 7px;
  font-weight: 700;

  text-transform: uppercase;

  color: #63728b;
}


.value {
  font-size: 10px;
  font-weight: 600;

  line-height: 1.25;

  white-space: normal;
  overflow-wrap: anywhere;
}


.value-large {
  font-size: 11px;
  font-weight: 700;
}


.verified {
  margin-left: 6px;

  font-size: 7px;
  font-weight: 700;

  color: #137848;
}


/* =====================
   CLOSURE SUMMARY
===================== */

.closure-card {
  padding: 7px 8px;
}


.closure-grid {
  display: grid;

  grid-template-columns:
    0.9fr 1.5fr 2fr;

  gap: 0;

  align-items: start;
}


.closure-item {
  min-width: 0;

  padding: 0 10px;
}


.closure-item:first-child {
  padding-left: 0;
}


.closure-item:last-child {
  padding-right: 0;
}


.closure-item + .closure-item {
  border-left: 1px solid #d8e0ea;
}


/* =====================
   SECTION
===================== */

.section-title {
  margin: 9px 0 5px 0;

  padding-bottom: 4px;

  border-bottom: 1px solid #d8e0ea;

  font-size: 10px;
  font-weight: 800;

  text-transform: uppercase;

  color: #263651;
}


/* =====================
   Correction TABLE
===================== */

table {
  width: 100%;

  border-collapse: collapse;

  font-size: 8px;

  break-inside: avoid;
}


th {
  padding: 5px 6px;

  text-align: left;

  background: #eef2f7;

  border: 1px solid #d6dee9;

  color: #34425a;
}


td {
  padding: 5px 6px;

  border: 1px solid #dfe5ed;

  vertical-align: top;
}


.empty {
  text-align: center;

  color: #748197;
}


/* =====================
   FOOTER
===================== */

.footer {
  display: flex;
  justify-content: space-between;

  margin-top: 10px;
  padding-top: 5px;

  border-top: 1px solid #cbd4df;

  font-size: 7px;

  color: #67758a;
}


/* =====================
   PRINT
===================== */

@media print {

  body {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }


  .report-header,
  .breakdown-heading,
  .card,
  .closure-card,
  .section-title {
    break-inside: avoid;
    page-break-inside: avoid;
  }

}

</style>

</head>


<body>

<div class="report">


  <!-- =====================
       HEADER
  ===================== -->

  <div class="report-header">

    <div>

      <div class="brand">
        ASTIR <span>CMMS</span>
      </div>

      <div class="brand-sub">
        MAINTENANCE MANAGEMENT SYSTEM
      </div>

    </div>


    <div class="report-meta">

      <strong>
        BREAKDOWN REPORT
      </strong>

      Breakdown Detail<br>

      Printed:
      ${escapeBreakdownHtml(
        printedAt
      )}

    </div>

  </div>


  <!-- =====================
       BREAKDOWN HEADER
  ===================== -->

  <div class="breakdown-heading">

    <div class="breakdown-code">
      ${escapeBreakdownHtml(
        code
      )}
    </div>

    <div class="status">
      ${escapeBreakdownHtml(
        status
      )}
    </div>

  </div>


  <div class="asset-line">

    ${escapeBreakdownHtml(
      b.asset_model || "-"
    )}

    • S/N

    ${escapeBreakdownHtml(
      b.asset_serial || "-"
    )}

    •

    ${escapeBreakdownHtml(
      b.line_name || "-"
    )}

  </div>


  <!-- =====================
       FAULT
  ===================== -->

  <div class="grid">

    <div class="card span-6">

      <div class="label">
        Fault
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          b.title || "-"
        )}
      </div>


      <div
        class="label"
        style="margin-top:12px;"
      >
        Description
      </div>

      <div class="value">
        ${escapeBreakdownHtml(
          b.description || "-"
        )}
      </div>

    </div>


    <!-- =====================
         ASSET
    ===================== -->

    <div class="card span-2">

      <div class="label">
        Line
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          b.line_name || "-"
        )}
      </div>

    </div>


    <div class="card span-2">

      <div class="label">
        Machine
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          b.asset_model || "-"
        )}
      </div>

    </div>


    <div class="card span-2">

      <div class="label">
        Serial Number
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          b.asset_serial || "-"
        )}
      </div>

    </div>


    <!-- =====================
         TIME
    ===================== -->

    <div class="card span-2">

      <div class="label">
        Started At
      </div>

      <div class="value">
        ${escapeBreakdownHtml(
          started
        )}
      </div>

    </div>


    <div class="card span-2">

      <div class="label">
        Restored At
      </div>

      <div class="value">
        ${escapeBreakdownHtml(
          restored
        )}
      </div>

    </div>


    <div class="card span-2">

      <div class="label">
        Incident Duration
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          incidentDuration
        )}
      </div>

    </div>


    <!-- =====================
         DOWNTIME
    ===================== -->

    <div class="card span-3">

      <div class="label">
        Recorded Down Time
      </div>

      <div class="value value-large">
        ${escapeBreakdownHtml(
          recordedDown
        )}
      </div>

    </div>


    <div class="card span-3">

      <div class="label">
        Effective Down Time
      </div>

      <div class="value value-large">

        ${escapeBreakdownHtml(
          effectiveDown
        )}

        ${
          isVerified
            ? `
              <span class="verified">
                ✓ VERIFIED
              </span>
            `
            : ""
        }

      </div>

    </div>


    <!-- =====================
         PEOPLE
    ===================== -->

    <div class="card span-3">

      <div class="label">
        Reported By
      </div>

      <div class="value">
        ${escapeBreakdownHtml(
          b.reported_by || "-"
        )}
      </div>

    </div>


    ${
      isVerified
        ? `

          <div class="card span-3">

            <div class="label">
              Corrected By
            </div>

            <div class="value">
              ${escapeBreakdownHtml(
                b.downtime_corrected_by ||
                "-"
              )}
            </div>

          </div>


          <div class="card span-3">

            <div class="label">
              Correction Reason
            </div>

            <div class="value">
              ${escapeBreakdownHtml(
                b.downtime_correction_reason ||
                "-"
              )}
            </div>

          </div>


          <div class="card span-3">

            <div class="label">
              Corrected At
            </div>

            <div class="value">
              ${escapeBreakdownHtml(
                correctedAt
              )}
            </div>

          </div>

        `
        : ""
    }


    <!-- =====================
         CLOSURE
    ===================== -->

      ${
        isClosed
          ? `

            <div class="card span-6 closure-card">

              <div class="closure-grid">


                <div class="closure-item">

                  <div class="label">
                    Failure Cause
                  </div>

                  <div class="value">
                    ${escapeBreakdownHtml(
                      b.failure_cause || "-"
                    )}
                  </div>

                </div>


                <div class="closure-item">

                  <div class="label">
                    Root Cause
                  </div>

                  <div class="value">
                    ${escapeBreakdownHtml(
                      b.root_cause || "-"
                    )}
                  </div>

                </div>


                <div class="closure-item">

                  <div class="label">
                    Corrective Action
                  </div>

                  <div class="value">
                    ${escapeBreakdownHtml(
                      b.corrective_action || "-"
                    )}
                  </div>

                </div>


              </div>

            </div>

          `
          : ""
      }

  </div>


  <!-- =====================
       Correction TASKS
  ===================== -->

  <div class="section-title">
    Correction Tasks
  </div>


  <table>

    <thead>

      <tr>

        <th style="width:7%;">
          ID
        </th>

        <th style="width:30%;">
          Task
        </th>

        <th style="width:13%;">
          Status
        </th>

        <th style="width:20%;">
          Section
        </th>

        <th style="width:17%;">
          Due
        </th>

        <th style="width:13%;">
          Service Time
        </th>

      </tr>

    </thead>


    <tbody>

      ${restorationRows}

    </tbody>

  </table>


  <!-- =====================
       FOOTER
  ===================== -->

  <div class="footer">

    <div>
      ASTIR S.A. | CMMS
    </div>

    <div>
      ${escapeBreakdownHtml(
        code
      )}
    </div>

  </div>


</div>


<script>

  window.addEventListener(
    "load",
    () => {

      setTimeout(
        () => window.print(),
        250
      );

    }
  );

<\/script>

</body>

</html>
  `);


  printDocument.close();


  printFrame.contentWindow.onafterprint =
    () => {

      printFrame.remove();

    };

}

/* =========================================================
   MAINTENANCE INCIDENTS — VIEW BUTTON

   Shared table for Breakdown and Scheduled Maintenance.

   - BD rows use .breakdown-view-btn / data-breakdown-id.
   - SM rows use .sm-view-btn / data-sm-id.
   - Each incident opens its OWN Detail modal.
   - No BD actions are used for SM.
========================================================= */

document
  .getElementById("breakdownsTableBody")
  ?.addEventListener("click", event => {

    if (!(event.target instanceof Element)) {
      return;
    }

    /* =====================
       SCHEDULED MAINTENANCE VIEW
    ===================== */

    const smButton =
      event.target.closest(".sm-view-btn");

    if (smButton) {

      const smId =
        Number(smButton.dataset.smId);

      if (
        !Number.isInteger(smId) ||
        smId <= 0
      ) {
        console.error(
          "Invalid Scheduled Maintenance ID:",
          smButton.dataset.smId
        );
        return;
      }

      if (
        typeof openScheduledMaintenanceDetail !== "function"
      ) {
        console.error(
          "Scheduled Maintenance Detail is unavailable."
        );
        return;
      }

      openScheduledMaintenanceDetail(smId);

      return;
    }

    /* =====================
       BREAKDOWN VIEW
       Existing functionality
    ===================== */

    const breakdownButton =
      event.target.closest(".breakdown-view-btn");

    if (!breakdownButton) return;

    const breakdownId =
      breakdownButton.dataset.breakdownId;

    openBreakdownDetail(breakdownId);

  });

  /* =====================
    PRINT BREAKDOWN
  ===================== */

  document
    .getElementById(
      "printBreakdownBtn"
    )
    ?.addEventListener(
      "click",
      printBreakdownDetail
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
   - Does NOT create Correction Tasks
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
      "ADD CORRECTION TASK: No active Breakdown"
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
    but no NEW Correction Tasks
    can be created.
  ===================== */

  if (
    String(
      currentBreakdown?.status || ""
    ).toUpperCase() === "CLOSED"
  ) {

    alert(
      "This Breakdown is closed. New Correction Tasks cannot be added."
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

      /* =====================
        RESTORATION TASK TIME DATA

        OPEN TASK:
        - Show planned Due Date.
        - Show estimated duration.

        COMPLETED TASK:
        - Show actual completion date/time.
        - Show actual execution duration,
          only when available.

        IMPORTANT:
        - Estimated duration is NOT actual duration.
        - Due Date is NOT completion date.
        - No task or execution data is modified.
      ===================== */

      const isDone =
        normalizedStatus === "DONE";

      const estimatedDuration =
        task.duration_min;

      const due =
        task.due_date
          ? formatBreakdownDate(
              task.due_date
            )
          : "-";

      const completed =
        task.completed_at
          ? formatBreakdownDate(
              task.completed_at
            )
          : null;

      /* =====================
        ACTUAL RESTORATION EXECUTION

        These values come from the recorded
        task execution, not from planned data.

        Missing values remain hidden.
      ===================== */

      const actualDuration =
        task.actual_duration_min;

      const completedBy =
        task.completed_by || "";

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

          ${
            isDone
              ? `

                <!-- =====================
                    COMPLETED RESTORATION

                    Display actual completion details.
                    Never display Due / Estimated time
                    as completed execution values.
                ===================== -->

                ${
                  completed
                    ? `
                      <div>
                        <strong>Completed:</strong>
                        ${escapeBreakdownHtml(completed)}
                      </div>
                    `
                    : ""
                                }

                ${
                  completedBy
                    ? `
                      <div>
                        <strong>Completed By:</strong>
                        ${escapeBreakdownHtml(completedBy)}
                      </div>
                    `
                    : ""
                }

                ${
                  actualDuration !== null &&
                  actualDuration !== undefined
                    ? `
                      <div>
                        <strong>Actual Service Time:</strong>
                        ${escapeBreakdownHtml(actualDuration)} min
                      </div>
                    `
                    : ""
                }

              `
              : `

                <!-- =====================
                    OPEN RESTORATION

                    Display planned schedule
                    and estimated work duration.
                ===================== -->

                <div>
                  <strong>Due:</strong>
                  ${escapeBreakdownHtml(due)}
                </div>

                ${
                  estimatedDuration !== null &&
                  estimatedDuration !== undefined
                    ? `
                      <div>
                        <strong>Est.:</strong>
                        ${escapeBreakdownHtml(estimatedDuration)} min
                      </div>
                    `
                    : ""
                }

              `
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
   ASSIGN RESTORATION — LINK EXISTING TASK

   Admin-only assignment of an existing completed task
   to the selected CLOSED Breakdown.

   SAVE AVAILABILITY:
   - Link Existing: enabled only when a task is selected.
   - Create New & Complete: remains disabled until
     its separate backend flow is connected.

   IMPORTANT:
   - The backend validates task eligibility again.
   - The selected task becomes type = Restoration.
   - Its original execution details are preserved.
   - Does NOT reopen or modify the Breakdown.
   - Does NOT modify the existing Undo mechanism.
========================================================= */


/* =====================
   UPDATE SAVE BUTTON STATE
===================== */

function updateAssignRestorationSaveState() {

  const modeSelect =
    document.getElementById(
      "assignRestorationMode"
    );

  const taskSelect =
    document.getElementById(
      "assignRestorationExistingTask"
    );

  const saveBtn =
    document.getElementById(
      "saveAssignRestorationBtn"
    );

  if (
    !modeSelect ||
    !taskSelect ||
    !saveBtn
  ) {
    return;
  }


  const isExisting =
    modeSelect.value === "existing";


  saveBtn.textContent =
    isExisting
      ? "Link Task"
      : "Create & Complete";


/* =====================
   SAVE AVAILABILITY

   LINK EXISTING:
   - Requires an eligible selected task.

   CREATE NEW & COMPLETE:
   - Requires work description.
   - Requires technician.
   - Requires actual completion date/time.
   - Requires actual duration.

   Section, Unit and Notes remain optional.

   IMPORTANT:
   This function only controls the button state.
   It does NOT save or modify maintenance data.
===================== */

if (isExisting) {

  saveBtn.disabled =
    taskSelect.disabled ||
    !taskSelect.value;

  return;
}

  /* =====================
    HISTORICAL COMPLETION
    REQUIRED FIELDS

    Required:
    - Work performed
    - Section (existing or manual)
    - Unit (existing or manual)
    - Technician
    - Actual completion date/time
    - Actual duration

    IMPORTANT:
    - "➕ New unit" is not a valid Unit value.
    - The Admin must enter the new Unit name.
    - This function only controls Save availability.
    - No maintenance data is modified here.
  ===================== */

  const taskName =
    document.getElementById(
      "assignRestorationTask"
    )?.value.trim() || "";


  const sectionSelect =
    document.getElementById(
      "assignRestorationSection"
    );

  const sectionInput =
    document.getElementById(
      "assignRestorationSectionInput"
    );


  const section =
    sectionSelect?.style.display !== "none"
      ? String(sectionSelect?.value || "").trim()
      : String(sectionInput?.value || "").trim();


  const unitSelect =
    document.getElementById(
      "assignRestorationUnit"
    );

  const unitInput =
    document.getElementById(
      "assignRestorationUnitInput"
    );


  const unit =
    unitSelect?.style.display !== "none" &&
    unitSelect?.value !== "__new__"
      ? String(unitSelect?.value || "").trim()
      : String(unitInput?.value || "").trim();


  const technicianId =
    document.getElementById(
      "assignRestorationTechnician"
    )?.value || "";


  const completedAt =
    document.getElementById(
      "assignRestorationCompletedAt"
    )?.value || "";


  const durationValue =
    document.getElementById(
      "assignRestorationActualDuration"
    )?.value ?? "";


  const actualDuration =
    Number(durationValue);


  saveBtn.disabled =
    !taskName ||
    !section ||
    !unit ||
    !technicianId ||
    !completedAt ||
    durationValue === "" ||
    !Number.isInteger(actualDuration) ||
    actualDuration < 0;

  
}

/* =========================================================
   ASSIGN RESTORATION — TECHNICIAN DROPDOWN

   Populates the Admin Historical Restoration form
   using the existing CMMS techniciansData.

   IMPORTANT:
   - Uses the same active-technician list as the
     standard Task completion modal.
   - Stores technician ID, not technician name.
   - Does NOT modify the standard technicianSelect
     or populateTechnicianDropdown().
========================================================= */

function populateAssignRestorationTechnicians() {

  const select =
    document.getElementById(
      "assignRestorationTechnician"
    );

  if (!select) return;


  /* =====================
     RESET DROPDOWN
  ===================== */

  select.replaceChildren();

  const defaultOption =
    document.createElement("option");

  defaultOption.value = "";
  defaultOption.textContent =
    "Select technician";

  select.appendChild(defaultOption);


  /* =====================
     EXISTING TECHNICIAN DATA
  ===================== */

  if (
    !Array.isArray(state.techniciansData)
  ) {

    console.warn(
      "ASSIGN RESTORATION: Technician data not loaded."
    );

    return;
  }


  /* =====================
     ACTIVE TECHNICIANS

     Same eligibility and sorting
     as the standard completion modal.
  ===================== */

  state.techniciansData
    .filter(t => t.active !== false)
    .sort((a, b) =>
      a.name.localeCompare(b.name, "el")
    )
    .forEach(t => {

      const option =
        document.createElement("option");

      option.value =
        String(t.id);

      option.textContent =
        t.name;

      select.appendChild(option);

    });

}

/* =========================================================
   ASSIGN RESTORATION — SECTION CATALOGUE

   Loads Sections for the asset of the selected
   CLOSED Breakdown.

   Source:
   GET /assets/:id/locations

   Behaviour:
   - Existing Sections → dropdown
   - No Sections → manual Section input
   - Resets Section and Unit fields on every opening
   - Keeps an independent catalogue for the
     Admin assignment modal

   IMPORTANT:
   - Does NOT modify the normal Restoration modal.
   - Does NOT modify its location catalogue.
   - Does NOT create or update maintenance tasks.
========================================================= */

let assignRestorationLocations = [];

let assignRestorationLocationsAssetId = null;


async function populateAssignRestorationSections(assetId) {

  /* =====================
     ELEMENTS
  ===================== */

  const sectionSelect =
    document.getElementById(
      "assignRestorationSection"
    );

  const sectionInput =
    document.getElementById(
      "assignRestorationSectionInput"
    );

  const unitSelect =
    document.getElementById(
      "assignRestorationUnit"
    );

  const unitInput =
    document.getElementById(
      "assignRestorationUnitInput"
    );


  if (
    !sectionSelect ||
    !sectionInput ||
    !unitSelect ||
    !unitInput
  ) {
    return;
  }


  /* =====================
     RESET CATALOGUE
     AND FORM FIELDS
  ===================== */

  assignRestorationLocations = [];

  assignRestorationLocationsAssetId = null;


  sectionSelect.replaceChildren(
    new Option("Select section", "")
  );

  sectionSelect.value = "";

  sectionInput.value = "";


  unitSelect.replaceChildren(
    new Option("Select unit", "")
  );

  unitSelect.style.display = "none";

  unitSelect.value = "";

  unitInput.style.display = "none";

  unitInput.value = "";


  /* =====================
     VALIDATE ASSET
  ===================== */

  const resolvedAssetId =
    Number(assetId);


  if (
    !Number.isInteger(resolvedAssetId) ||
    resolvedAssetId <= 0
  ) {

    sectionSelect.style.display = "none";

    sectionInput.style.display = "block";

    return;
  }


  /* =====================
     LOAD ASSET LOCATIONS
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


    assignRestorationLocations =
      Array.isArray(data.locations)
        ? data.locations
        : [];


    assignRestorationLocationsAssetId =
      resolvedAssetId;


    /* =====================
       BUILD UNIQUE SECTIONS

       Same normalization and sorting
       as the normal Restoration modal.
    ===================== */

    const sectionMap =
      new Map();


    for (
      const location
      of assignRestorationLocations
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
      ).sort(
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
       EXISTING SECTIONS
    ===================== */

    if (sections.length > 0) {

      for (const section of sections) {

        sectionSelect.add(
          new Option(
            section,
            section
          )
        );

      }


      sectionSelect.style.display = "block";

      sectionInput.style.display = "none";

      return;
    }


    /* =====================
       NO EXISTING SECTIONS
    ===================== */

    sectionSelect.style.display = "none";

    sectionInput.style.display = "block";

  } catch (err) {

    /* =====================
       SAFE MANUAL FALLBACK

       Failure to load the catalogue
       must not affect other modals.
    ===================== */

    console.error(
      "ASSIGN RESTORATION SECTIONS ERROR:",
      err
    );


    assignRestorationLocations = [];

    assignRestorationLocationsAssetId = null;


    sectionSelect.style.display = "none";

    sectionInput.style.display = "block";

  }

}

/* =========================================================
   ASSIGN RESTORATION — POPULATE UNITS

   Uses the location catalogue already loaded by:
   populateAssignRestorationSections()

   Filters Units by the selected Section
   of the CLOSED Breakdown asset.

   Behaviour:
   - Existing Units found → show dropdown
   - Dropdown includes "➕ New unit"
   - No Units found → show manual input
   - No Section selected → hide both Unit fields

   IMPORTANT:
   - Does NOT modify the normal Restoration modal.
   - Does NOT modify its location catalogue.
   - Does NOT create or update maintenance tasks.
========================================================= */

function populateAssignRestorationUnits(section) {

  /* =====================
     ELEMENTS
  ===================== */

  const unitSelect =
    document.getElementById(
      "assignRestorationUnit"
    );

  const unitInput =
    document.getElementById(
      "assignRestorationUnitInput"
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

  unitSelect.replaceChildren(
    new Option("Select unit", "")
  );

  unitSelect.value = "";

  unitInput.value = "";


  /* =====================
     NO SECTION SELECTED
  ===================== */

  const resolvedSection =
    String(section || "").trim();

  if (!resolvedSection) {

    unitSelect.style.display = "none";
    unitInput.style.display = "none";

    return;
  }


  /* =====================
     NO LOADED CATALOGUE

     Allow manual Unit entry when
     asset locations are unavailable.
  ===================== */

  if (
    assignRestorationLocationsAssetId === null ||
    !Array.isArray(assignRestorationLocations)
  ) {

    unitSelect.style.display = "none";
    unitInput.style.display = "block";

    return;
  }


  /* =====================
     FIND UNITS FOR SECTION
  ===================== */

  const normalizedSection =
    resolvedSection.toLocaleLowerCase(
      "el-GR"
    );

  const unitMap =
    new Map();


  for (
    const location
    of assignRestorationLocations
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
      locationSection.toLocaleLowerCase(
        "el-GR"
      ) !== normalizedSection
    ) {
      continue;
    }


    const key =
      unit.toLocaleLowerCase(
        "el-GR"
      );


    if (!unitMap.has(key)) {

      unitMap.set(
        key,
        unit
      );

    }

  }


  /* =====================
     SORT UNIQUE UNITS
  ===================== */

  const units =
    Array.from(
      unitMap.values()
    ).sort(
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

    for (const unit of units) {

      unitSelect.add(
        new Option(
          unit,
          unit
        )
      );

    }


    unitSelect.add(
      new Option(
        "➕ New unit",
        "__new__"
      )
    );


    unitSelect.style.display = "block";
    unitInput.style.display = "none";

    return;
  }


  /* =====================
     NO EXISTING UNITS

     Allow manual Unit entry.
  ===================== */

  unitSelect.style.display = "none";
  unitInput.style.display = "block";

}

/* =========================================================
   ASSIGN RESTORATION — SECTION / UNIT EVENTS

   Handles:
   - Existing Section → load matching Units
   - Manual Section → load matching Units
   - New Unit selection → show manual Unit input

   IMPORTANT:
   - Uses only Admin assignment modal fields.
   - Does NOT modify existing Restoration listeners.
   - Does NOT create or update maintenance tasks.
========================================================= */


/* =====================
   EXISTING SECTION → UNITS
===================== */

document
  .getElementById(
    "assignRestorationSection"
  )
  ?.addEventListener(
    "change",
    event => {

      populateAssignRestorationUnits(
        event.target.value
      );

    }
  );


/* =====================
   MANUAL SECTION → UNITS
===================== */

document
  .getElementById(
    "assignRestorationSectionInput"
  )
  ?.addEventListener(
    "input",
    event => {

      populateAssignRestorationUnits(
        event.target.value.trim()
      );

    }
  );


/* =====================
   UNIT → NEW UNIT

   Selecting "➕ New unit" shows
   the manual Unit input.

   Selecting an existing Unit
   hides and clears manual input.
===================== */

document
  .getElementById(
    "assignRestorationUnit"
  )
  ?.addEventListener(
    "change",
    event => {

      const unitInput =
        document.getElementById(
          "assignRestorationUnitInput"
        );

      if (!unitInput) return;


      if (
        event.target.value === "__new__"
      ) {

        unitInput.style.display = "block";
        unitInput.value = "";
        unitInput.focus();

      } else {

        unitInput.style.display = "none";
        unitInput.value = "";

      }

    }
  );

/* =====================
   ASSIGNMENT MODE CHANGED
===================== */

document
  .getElementById(
    "assignRestorationMode"
  )
  ?.addEventListener(
    "change",
    updateAssignRestorationSaveState
  );


/* =====================
   EXISTING TASK SELECTION
===================== */

document
  .getElementById(
    "assignRestorationExistingTask"
  )
  ?.addEventListener(
    "change",
    updateAssignRestorationSaveState
  );

  /* =========================================================
    ASSIGN RESTORATION — HISTORICAL FORM VALIDATION

    Updates Save availability when the Admin changes
    the required Historical Restoration fields.

    IMPORTANT:
    - Does NOT submit the form.
    - Does NOT create a task or execution.
    - Does NOT modify the Breakdown.
    - Backend date/time validation will still apply
      when the Save action is connected.
  ========================================================= */

  [
    "assignRestorationTask",
    "assignRestorationSection",
    "assignRestorationSectionInput",
    "assignRestorationUnit",
    "assignRestorationUnitInput",
    "assignRestorationTechnician",
    "assignRestorationCompletedAt",
    "assignRestorationActualDuration"
  ].forEach(fieldId => {

    const field =
      document.getElementById(fieldId);

    if (!field) return;

    field.addEventListener(
      "input",
      updateAssignRestorationSaveState
    );

    field.addEventListener(
      "change",
      updateAssignRestorationSaveState
    );

  });

/* =====================
   SAVE — LINK EXISTING TASK
===================== */

document
  .getElementById(
    "saveAssignRestorationBtn"
  )
  ?.addEventListener(
    "click",
    async () => {

      const overlay =
        document.getElementById(
          "assignRestorationOverlay"
        );

      const modeSelect =
        document.getElementById(
          "assignRestorationMode"
        );

      const taskSelect =
        document.getElementById(
          "assignRestorationExistingTask"
        );

      const saveBtn =
        document.getElementById(
          "saveAssignRestorationBtn"
        );


      if (
        !overlay ||
        !modeSelect ||
        !taskSelect ||
        !saveBtn
      ) {
        return;
      }


  /* =====================================================
    ASSIGNMENT MODE

    EXISTING:
    - Continue to the existing Link Task flow below.

    NEW:
    - Record work already performed during the Breakdown.
    - Create the Restoration Task directly as Done.
    - Create its historical execution in the same
      backend transaction.

    IMPORTANT:
    - Admin only.
    - Does NOT reopen or modify the Breakdown.
    - Does NOT change the existing Link Task flow.
  ===================================================== */

  if (saveBtn.disabled) {
    return;
  }


  /* =====================
    CREATE NEW & COMPLETE
  ===================== */

  if (modeSelect.value === "new") {

    /* =====================
      ADMIN CHECK
    ===================== */

    const role =
      String(
        localStorage.getItem("cmmsRole") || ""
      ).toLowerCase();

    if (role !== "admin") {

      alert(
        "Only Admin can record Historical Restoration."
      );

      return;
    }


    /* =====================
      SELECTED BREAKDOWN
    ===================== */

    const breakdownId =
      Number(
        overlay.dataset.breakdownId
      );

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {

      alert("Invalid Breakdown ID.");

      return;
    }


    /* =====================
      WORK PERFORMED
    ===================== */

    const task =
      String(
        document.getElementById(
          "assignRestorationTask"
        )?.value || ""
      ).trim();


    /* =====================
      SECTION

      Existing dropdown or
      manual Section input.
    ===================== */

    const sectionSelect =
      document.getElementById(
        "assignRestorationSection"
      );

    const sectionInput =
      document.getElementById(
        "assignRestorationSectionInput"
      );

    const section =
      sectionSelect?.style.display !== "none"
        ? String(sectionSelect?.value || "").trim()
        : String(sectionInput?.value || "").trim();


    /* =====================
      UNIT

      Existing dropdown or
      manual / New Unit input.
    ===================== */

    const unitSelect =
      document.getElementById(
        "assignRestorationUnit"
      );

    const unitInput =
      document.getElementById(
        "assignRestorationUnitInput"
      );

    const unit =
      unitSelect?.style.display !== "none" &&
      unitSelect?.value !== "__new__"
        ? String(unitSelect?.value || "").trim()
        : String(unitInput?.value || "").trim();


    /* =====================
      ACTUAL EXECUTION DETAILS
    ===================== */

    const technicianId =
      Number(
        document.getElementById(
          "assignRestorationTechnician"
        )?.value
      );

    const completedValue =
      document.getElementById(
        "assignRestorationCompletedAt"
      )?.value || "";

    const durationValue =
      document.getElementById(
        "assignRestorationActualDuration"
      )?.value ?? "";

    const actualDuration =
      Number(durationValue);

    const notes =
      String(
        document.getElementById(
          "assignRestorationNotes"
        )?.value || ""
      ).trim();


    /* =====================
      VALIDATE REQUIRED FIELDS

      The button state is a UI aid.
      Validate again before submitting.
    ===================== */

    if (
      !task ||
      !section ||
      !unit ||
      !Number.isInteger(technicianId) ||
      technicianId <= 0 ||
      !completedValue ||
      durationValue === "" ||
      !Number.isInteger(actualDuration) ||
      actualDuration < 0
    ) {

      alert(
        "Please complete all required Restoration fields."
      );

      return;
    }


    /* =====================
      LOCAL DATE/TIME → UTC

      datetime-local contains the actual
      local completion date and time.

      Send its ISO timestamp to the backend.
      Do NOT use the current recording time.
    ===================== */

    const completedDate =
      new Date(completedValue);

    if (
      Number.isNaN(
        completedDate.getTime()
      )
    ) {

      alert("Invalid completion date/time.");

      return;
    }


    /* =====================
      CONFIRM HISTORICAL RECORDING

      The backend will verify that the
      actual completion time belongs to
      the CLOSED Breakdown period.
    ===================== */

    const confirmed =
      window.confirm(
        `Record completed Restoration for ` +
        `BD-${String(breakdownId).padStart(5, "0")}?\n\n` +
        `Work: ${task}\n` +
        `Completed: ${completedValue.replace("T", " ")}\n` +
        `Actual Duration: ${actualDuration} min\n\n` +
        `The Breakdown will remain CLOSED.`
      );

    if (!confirmed) {
      return;
    }


    /* =====================
      CREATE TASK + EXECUTION

      Both records are created together
      by the historical-restoration endpoint.
    ===================== */

    try {

      saveBtn.disabled = true;

      saveBtn.textContent =
        "Recording...";


      const response =
        await fetch(
          `/breakdowns/${breakdownId}/historical-restoration`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-cmms-role":
                role
            },

            body:
              JSON.stringify({

                task,

                section,

                unit,

                technician_id:
                  technicianId,

                executed_at:
                  completedDate.toISOString(),

                actual_duration_min:
                  actualDuration,

                notes:
                  notes || null

              })
          }
        );


      const result =
        await response.json();


      if (!response.ok) {

        throw new Error(
          result.error ||
          "Failed to record Historical Restoration"
        );

      }


      /* =====================
        SUCCESS

        The backend has created both
        the completed Restoration Task
        and its historical execution.
      ===================== */

      closeAssignRestorationModal();


      /* =====================
        REFRESH TASK DATA

        Refresh failures must not be
        reported as recording failures.
      ===================== */

      try {

        await loadTasks();

      } catch (refreshError) {

        console.error(
          "TASK REFRESH AFTER HISTORICAL RESTORATION:",
          refreshError
        );

      }


      alert(
        `Historical Restoration recorded successfully.\n\n` +
        `Task #${result.task?.id ?? "-"}\n` +
        `Breakdown: BD-${String(breakdownId).padStart(5, "0")}\n\n` +
        `The Breakdown remains CLOSED.`
      );


    } catch (err) {

      console.error(
        "CREATE HISTORICAL RESTORATION ERROR:",
        err
      );


      alert(
        err.message ||
        "Could not record Historical Restoration."
      );

    } finally {

      updateAssignRestorationSaveState();

    }


    /* =====================
      END NEW MODE

      Do not continue to the
      existing-task assignment flow.
    ===================== */

    return;

  }


  /* =====================
    LINK EXISTING TASK

    Existing assignment logic
    continues unchanged below.
  ===================== */

  if (modeSelect.value !== "existing") {
    return;
  }


      /* =====================
         ADMIN CHECK
      ===================== */

      const role =
        String(
          localStorage.getItem(
            "cmmsRole"
          ) || ""
        ).toLowerCase();


      if (role !== "admin") {

        alert(
          "Only Admin can assign Restoration Tasks."
        );

        return;
      }


      /* =====================
         VALIDATE SELECTED IDS
      ===================== */

      const breakdownId =
        Number(
          overlay.dataset.breakdownId
        );

      const taskId =
        Number(
          taskSelect.value
        );


      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0 ||
        !Number.isInteger(taskId) ||
        taskId <= 0
      ) {

        alert(
          "Invalid Breakdown or Task ID."
        );

        return;
      }


      /* =====================
         CONFIRM ASSIGNMENT

         This action changes the selected
         completed task to Restoration and
         links it to the CLOSED Breakdown.
      ===================== */

      const confirmed =
        window.confirm(
          `Link Task #${taskId} to ` +
          `BD-${String(breakdownId).padStart(5, "0")}?\n\n` +
          `The task will become Restoration.\n` +
          `Its existing execution will be preserved.\n` +
          `The Breakdown will remain CLOSED.`
        );


      if (!confirmed) return;


      /* =====================
         LINK EXISTING TASK
      ===================== */

      try {

        saveBtn.disabled = true;

        saveBtn.textContent =
          "Linking...";


        const response =
          await fetch(
            `/breakdowns/${breakdownId}/link-existing-task`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-cmms-role":
                  role
              },

              body:
                JSON.stringify({
                  task_id: taskId
                })
            }
          );


        const result =
          await response.json();


        if (!response.ok) {

          throw new Error(
            result.error ||
            "Failed to link existing task"
          );

        }


        /* =====================
           SUCCESS

           The backend has linked the task.
           Close the assignment modal.
        ===================== */

        closeAssignRestorationModal();


        /* =====================
           REFRESH TASK DATA

           The linked task is now classified
           as Restoration.
        ===================== */

        try {

          await loadTasks();

        } catch (refreshError) {

          console.error(
            "TASK REFRESH AFTER ASSIGN ERROR:",
            refreshError
          );

        }


        alert(
          `Task #${taskId} was linked to ` +
          `BD-${String(breakdownId).padStart(5, "0")}.\n\n` +
          `The Breakdown remains CLOSED.`
        );


      } catch (err) {

        console.error(
          "LINK EXISTING RESTORATION ERROR:",
          err
        );


        alert(
          err.message ||
          "Could not link existing task."
        );


        /* =====================
           RESTORE SAVE BUTTON
           AFTER FAILED REQUEST
        ===================== */

        updateAssignRestorationSaveState();

      }

    }
  );

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
   BREAKDOWNS TABLE — ASSIGN RESTORATION TASK

   Admin only.
   Available only for CLOSED Breakdowns.

   Supports retrospective assignment of maintenance
   work without reopening the Breakdown.

   Planned modes:
   - Link an existing completed task.
   - Create and complete a historical Restoration Task.

   CURRENT STEP:
   - Validate Admin role and Breakdown ID.
   - Verify that the Breakdown is still CLOSED.
   - Confirm that the correct Breakdown was selected.

   IMPORTANT:
   - Does NOT modify Breakdown status or downtime.
   - Does NOT create or update maintenance tasks yet.
   - Existing View / Reopen actions remain unchanged.
========================================================= */

document
  .getElementById("breakdownsTableBody")
  ?.addEventListener(
    "click",
    async event => {

      const assignBtn =
        event.target.closest(
          ".breakdown-assign-restoration-btn"
        );

      if (!assignBtn) return;

      event.preventDefault();
      event.stopPropagation();


      /* =====================
         ADMIN CHECK
      ===================== */

      const role =
        String(
          localStorage.getItem("cmmsRole") || ""
        ).toLowerCase();

      if (role !== "admin") {

        alert(
          "Only Admin can assign Restoration Tasks."
        );

        return;
      }


      /* =====================
         BREAKDOWN ID
      ===================== */

      const breakdownId =
        Number(
          assignBtn.dataset.breakdownId
        );

      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0
      ) {

        alert("Invalid Breakdown ID");
        return;
      }


      /* =====================
         VERIFY CURRENT STATUS

         Read the current Breakdown status
         from the backend before opening
         the assignment workflow.
      ===================== */

      try {

        const response =
          await fetch(
            `/breakdowns/${breakdownId}`
          );

        const breakdown =
          await response.json();

        if (!response.ok) {

          throw new Error(
            breakdown.error ||
            "Failed to load Breakdown"
          );
        }

        if (
          String(
            breakdown.status || ""
          ).toUpperCase() !== "CLOSED"
        ) {

          alert(
            "This Breakdown is no longer CLOSED."
          );

          return;
        }


      /* =====================
        OPEN ADMIN ASSIGNMENT MODAL

        The selected CLOSED Breakdown
        is stored on this modal only.

        Does NOT use or modify
        currentBreakdownId.

        Does NOT reopen the Breakdown
        or modify any maintenance data.
      ===================== */

      const overlay =
        document.getElementById(
          "assignRestorationOverlay"
        );

      if (!overlay) {

        throw new Error(
          "Assign Restoration modal not found."
        );

      }


      /* =====================
        STORE SELECTED BREAKDOWN
      ===================== */

      overlay.dataset.breakdownId =
        String(breakdownId);


      /* =====================
        BREAKDOWN REFERENCE
      ===================== */

      const referenceEl =
        document.getElementById(
          "assignRestorationBreakdownRef"
        );

      if (referenceEl) {

        referenceEl.textContent =
          `BD-${String(breakdownId).padStart(5, "0")}`;

      }


      /* =====================
        ACTUAL BREAKDOWN PERIOD

        Display the real incident window.

        The backend will enforce this
        period when assigning tasks.
      ===================== */

      const periodEl =
        document.getElementById(
          "assignRestorationPeriod"
        );

      if (periodEl) {

        periodEl.textContent =
          `${formatBreakdownDate(breakdown.started_at)}` +
          ` → ` +
          `${formatBreakdownDate(breakdown.closed_at)}`;

      }

      /* =====================================================
        LOAD ASSIGNABLE EXISTING TASKS

        Loads eligible completed tasks for the selected
        CLOSED Breakdown.

        Eligibility is checked by the backend:
        - Same asset
        - Not linked to another Breakdown
        - Not Preventive or recurring
        - Completed, with exactly one execution
        - Execution time within the Breakdown period

        IMPORTANT:
        - Read-only operation.
        - Does NOT link or modify any task.
        - An empty candidate list is valid.
      ===================================================== */

      const existingTaskSelect =
        document.getElementById(
          "assignRestorationExistingTask"
        );

      if (!existingTaskSelect) {

        throw new Error(
          "Existing Task dropdown not found."
        );

      }


      /* =====================
        RESET PREVIOUS SELECTION
      ===================== */

      existingTaskSelect.replaceChildren();

      const defaultOption =
        document.createElement("option");

      defaultOption.value = "";
      defaultOption.textContent =
        "Select completed task";

      existingTaskSelect.appendChild(
        defaultOption
      );


      /* =====================
        FETCH ELIGIBLE TASKS
      ===================== */

      const tasksResponse =
        await fetch(
          `/breakdowns/${breakdownId}/assignable-tasks`,
          {
            headers: {
              "x-cmms-role": role
            }
          }
        );

      const tasksData =
        await tasksResponse.json();

      if (!tasksResponse.ok) {

        throw new Error(
          tasksData.error ||
          "Failed to load assignable tasks"
        );

      }


      /* =====================
        POPULATE DROPDOWN

        Display the actual execution time,
        not the task creation time.
      ===================== */

      const eligibleTasks =
        Array.isArray(tasksData.tasks)
          ? tasksData.tasks
          : [];

      for (const task of eligibleTasks) {

        const option =
          document.createElement("option");

        option.value =
          String(task.id);

        const executionTime =
          formatBreakdownDate(
            task.executed_at
          );

        const duration =
          task.duration_minutes != null
            ? `${task.duration_minutes} min`
            : "Duration not recorded";

        option.textContent =
          `#${task.id} · ${task.task} · ` +
          `${executionTime} · ${duration}`;

        existingTaskSelect.appendChild(
          option
        );

      }


      /* =====================
        EMPTY CANDIDATE LIST

        No matching task is not an error.
        Admin may use Create New & Complete
        once that workflow is connected.
      ===================== */

      const existingInfo =
        document.getElementById(
          "assignRestorationExistingInfo"
        );

      if (eligibleTasks.length === 0) {

        existingTaskSelect.disabled = true;

        defaultOption.textContent =
          "No eligible completed tasks found";

        if (existingInfo) {

          existingInfo.textContent =
            "No completed tasks match this Breakdown's " +
            "asset and incident period.";

        }

      } else {

        existingTaskSelect.disabled = false;

        if (existingInfo) {

          existingInfo.textContent =
            `${eligibleTasks.length} eligible completed ` +
            `task(s) found for this Breakdown.`;

        }

      }

      /* =====================
        RESET ASSIGNMENT MODE
      ===================== */

      const modeSelect =
        document.getElementById(
          "assignRestorationMode"
        );

      const existingFields =
        document.getElementById(
          "assignRestorationExistingFields"
        );

      const newFields =
        document.getElementById(
          "assignRestorationNewFields"
        );

      if (modeSelect) {
        modeSelect.value = "existing";
      }

      if (existingFields) {
        existingFields.style.display = "";
      }

      if (newFields) {
        newFields.style.display = "none";
      }


      /* =====================
        KEEP SAVE DISABLED

        No task may be assigned until
        the backend flow is connected.
      ===================== */

      const saveBtn =
        document.getElementById(
          "saveAssignRestorationBtn"
        );

      if (saveBtn) {
        saveBtn.disabled = true;
      }

    /* =====================
      RESET HISTORICAL WORK FIELDS

      Every new opening of the Admin
      assignment modal starts with
      an empty Historical Restoration form.

      Section and Unit are reset separately
      by populateAssignRestorationSections().

      IMPORTANT:
      - Does NOT modify existing tasks.
      - Does NOT affect the normal Restoration modal.
    ===================== */

    [
      "assignRestorationTask",
      "assignRestorationCompletedAt",
      "assignRestorationActualDuration",
      "assignRestorationNotes"
    ].forEach(fieldId => {

      const field =
        document.getElementById(fieldId);

      if (field) {
        field.value = "";
      }

    });      

    /* =====================
      POPULATE TECHNICIANS

      Uses the existing CMMS
      technician data.

      Does NOT open or modify the
      standard Task completion modal.
    ===================== */

    populateAssignRestorationTechnicians();


    /* =====================
      LOAD ASSET SECTIONS

      Uses the selected Breakdown asset.

      The Admin assignment modal has
      its own independent location catalogue.

      Unit selection will be connected
      in the next step.
    ===================== */

    await populateAssignRestorationSections(
      breakdown.asset_id
    );


    /* =====================
      SHOW MODAL
    ===================== */

    overlay.style.display = "flex";


    /* =====================
      SHOW MODAL
    ===================== */

    overlay.style.display = "flex";


      } catch (err) {

        console.error(
          "ASSIGN RESTORATION ERROR:",
          err
        );

        alert(
          err.message ||
          "Could not open Restoration assignment."
        );

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

/* =========================================================
   OPEN VERIFIED DOWNTIME MODAL
   Admin only
   Read / preload only
========================================================= */

document.getElementById("verifyDowntimeBtn")?.addEventListener("click", () => {

  if (!currentBreakdown) {
    return;
  }

  const overlay =
    document.getElementById(
      "verifiedDowntimeOverlay"
    );

  const refEl =
    document.getElementById(
      "verifiedDowntimeBreakdownRef"
    );

  const recordedEl =
    document.getElementById(
      "verifiedDowntimeRecorded"
    );

  const effectiveEl =
    document.getElementById(
      "verifiedDowntimeEffective"
    );

  const minutesInput =
    document.getElementById(
      "verifiedDowntimeMinutes"
    );

  const reasonInput =
    document.getElementById(
      "verifiedDowntimeReason"
    );

  const clearBtn =
    document.getElementById(
      "clearVerifiedDowntimeBtn"
    );


  const recordedSeconds =
    Number(
      currentBreakdown
        .recorded_down_seconds || 0
    );

  const effectiveSeconds =
    Number(
      currentBreakdown
        .effective_down_seconds || 0
    );


  /* =====================
     BREAKDOWN REFERENCE
  ===================== */

  if (refEl) {
    refEl.textContent =
      `BD-${String(
        currentBreakdown.id
      ).padStart(5, "0")}`;
  }


  /* =====================
     RECORDED DOWN
  ===================== */

  if (recordedEl) {
    recordedEl.textContent =
      formatBreakdownSeconds(
        recordedSeconds
      );
  }


  /* =====================
     CURRENT EFFECTIVE DOWN
  ===================== */

  if (effectiveEl) {
    effectiveEl.textContent =
      formatBreakdownSeconds(
        effectiveSeconds
      );
  }


  /* =====================
     VERIFIED VALUE PRELOAD

     Existing verification:
     preload verified value.

     No verification:
     preload recorded downtime.
  ===================== */

  if (minutesInput) {

    const secondsToUse =
      currentBreakdown
        .verified_down_seconds !== null &&
      currentBreakdown
        .verified_down_seconds !== undefined
        ? Number(
            currentBreakdown
              .verified_down_seconds
          )
        : recordedSeconds;

    minutesInput.value =
      Math.round(
        secondsToUse / 60
      );

  }


  /* =====================
     CORRECTION REASON
  ===================== */

  if (reasonInput) {

    reasonInput.value =
      currentBreakdown
        .downtime_correction_reason || "";

  }


  /* =====================
     CLEAR VERIFICATION BUTTON

     Visible only when a verified
     downtime correction already exists.
  ===================== */

  const hasVerification =
    currentBreakdown
      .verified_down_seconds !== null &&
    currentBreakdown
      .verified_down_seconds !== undefined;

  if (clearBtn) {

    clearBtn.style.display =
      hasVerification
        ? "inline-flex"
        : "none";

  }


  /* =====================
     OPEN MODAL
  ===================== */

  if (overlay) {
    overlay.style.display = "flex";
  }

});

  /* =========================================================
   CLOSE VERIFIED DOWNTIME MODAL
========================================================= */

function closeVerifiedDowntimeModal() {

  const overlay =
    document.getElementById(
      "verifiedDowntimeOverlay"
    );

  if (overlay) {
    overlay.style.display = "none";
  }

}


document
  .getElementById("closeVerifiedDowntimeBtn")
  ?.addEventListener(
    "click",
    closeVerifiedDowntimeModal
  );


document
  .getElementById("cancelVerifiedDowntimeBtn")
  ?.addEventListener(
    "click",
    closeVerifiedDowntimeModal
  );

  /* =========================================================
   SAVE VERIFIED DOWNTIME
   DT Model v1

   Admin only.

   IMPORTANT:
   - Does NOT modify Machine State History
   - Stores only the verified/corrected DOWN time
   - Backend remains the authority for validation
========================================================= */

document.getElementById("saveVerifiedDowntimeBtn") ?.addEventListener("click", async () => {

    if (!currentBreakdown) {
      alert("Breakdown not loaded.");
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
      alert("Admin only.");
      return;
    }


    /* =====================
       INPUTS
    ===================== */

    const minutesInput =
      document.getElementById(
        "verifiedDowntimeMinutes"
      );

    const reasonInput =
      document.getElementById(
        "verifiedDowntimeReason"
      );

    const minutesValue =
      String(
        minutesInput?.value || ""
      ).trim();

    const reason =
      String(
        reasonInput?.value || ""
      ).trim();


    /* =====================
       VALIDATION
    ===================== */

    if (minutesValue === "") {
      alert(
        "Please enter the verified DOWN time."
      );
      return;
    }


    const verifiedMinutes =
      Number(minutesValue);

    if (
      !Number.isFinite(verifiedMinutes) ||
      verifiedMinutes < 0
    ) {
      alert(
        "Verified DOWN time must be zero or greater."
      );
      return;
    }


    if (!reason) {
      alert(
        "Correction reason is required."
      );
      return;
    }


    const verifiedSeconds =
      Math.round(
        verifiedMinutes * 60
      );


    /* =====================
       INCIDENT DURATION CHECK

       Frontend safety only.
       Backend performs the authoritative
       validation as well.
    ===================== */

    if (
      currentBreakdown.status === "CLOSED" &&
      currentBreakdown.started_at &&
      currentBreakdown.closed_at
    ) {

      const startedAt =
        new Date(
          currentBreakdown.started_at
        );

      const closedAt =
        new Date(
          currentBreakdown.closed_at
        );

      const incidentSeconds =
        Math.floor(
          (
            closedAt.getTime() -
            startedAt.getTime()
          ) / 1000
        );


      if (
        verifiedSeconds >
        incidentSeconds
      ) {

        alert(
          "Verified DOWN time cannot exceed Incident Duration."
        );

        return;
      }

    }


    /* =====================
       CORRECTED BY

       Use logged-in CMMS user.
    ===================== */

    const correctedBy =
      localStorage.getItem(
        "cmmsTechnicianName"
      ) || "Admin";

    const technicianIdRaw =
      localStorage.getItem(
        "cmmsTechnicianId"
      );

    const correctedById =
      technicianIdRaw &&
      Number.isInteger(
        Number(technicianIdRaw)
      )
        ? Number(technicianIdRaw)
        : null;


    /* =====================
       SAVE
    ===================== */

    try {

      const response =
        await fetch(
          `/breakdowns/${currentBreakdown.id}/verified-downtime`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              "x-cmms-role":
                localStorage.getItem(
                  "cmmsRole"
                ) || ""
            },

            body: JSON.stringify({
              verified_down_seconds:
                verifiedSeconds,

              downtime_correction_reason:
                reason,

              downtime_corrected_by:
                correctedBy,

              downtime_corrected_by_id:
                correctedById
            })
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        alert(
          data.error ||
          "Failed to save verified downtime."
        );

        return;
      }


      /* =====================
         CLOSE EDIT MODAL
      ===================== */

      closeVerifiedDowntimeModal();


      /* =====================
         RELOAD BREAKDOWN

         Do not manually patch local values.

         Reload from backend so:
         - Recorded DOWN
         - Verified DOWN
         - Effective DOWN
         - audit metadata

         all come from one authoritative source.
      ===================== */

      const detailResponse =
        await fetch(
          `/breakdowns/${currentBreakdown.id}`
        );

      if (!detailResponse.ok) {
        throw new Error(
          "Failed to reload Breakdown"
        );
      }


      const freshBreakdown =
        await detailResponse.json();


      /* =====================
         REFRESH DETAIL
      ===================== */

      populateBreakdownDetail(
        freshBreakdown
      );


      /* =====================
         REFRESH MAIN LIST
      ===================== */

      await loadBreakdowns();


    } catch (err) {

      console.error(
        "Save verified downtime error:",
        err
      );

      alert(
        "Failed to save verified downtime."
      );

    }

  });

  /* =========================================================
   CLEAR VERIFIED DOWNTIME
   DT Model v1

   Admin only.

   IMPORTANT:
   - Clears only the Admin downtime verification
   - Does NOT modify Machine State History
   - Effective DOWN returns to Recorded DOWN
========================================================= */

document.getElementById("clearVerifiedDowntimeBtn") ?.addEventListener("click", async () => {

    if (!currentBreakdown) {
      alert("Breakdown not loaded.");
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
      alert("Admin only.");
      return;
    }


    /* =====================
       SAFETY CHECK

       Nothing to clear if the Breakdown
       is already using Recorded downtime.
    ===================== */

    const hasVerification =
      currentBreakdown
        .verified_down_seconds !== null &&
      currentBreakdown
        .verified_down_seconds !== undefined;

    if (!hasVerification) {
      alert(
        "This Breakdown has no verified downtime correction."
      );
      return;
    }


    /* =====================
       CONFIRM
    ===================== */

    const confirmed =
      window.confirm(
        "Clear the verified downtime correction?\n\n" +
        "Effective DOWN Time will return to the recorded Machine State downtime."
      );

    if (!confirmed) {
      return;
    }


    const breakdownId =
      Number(currentBreakdown.id);


    try {

      /* =====================
         CLEAR VERIFICATION

         Backend interprets NULL as:
         remove verified correction + audit fields.
      ===================== */

      const response =
        await fetch(
          `/breakdowns/${breakdownId}/verified-downtime`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              "x-cmms-role":
                localStorage.getItem(
                  "cmmsRole"
                ) || ""
            },

            body: JSON.stringify({
              verified_down_seconds: null
            })
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.error ||
          "Failed to clear verified downtime."
        );
      }


      /* =====================
         CLOSE VERIFICATION MODAL
      ===================== */

      closeVerifiedDowntimeModal();


      /* =====================
         RELOAD BREAKDOWN

         Backend remains the authority.
         Do not manually modify local values.
      ===================== */

      const detailResponse =
        await fetch(
          `/breakdowns/${breakdownId}`
        );


      if (!detailResponse.ok) {
        throw new Error(
          "Verification cleared, but Breakdown reload failed."
        );
      }


      const freshBreakdown =
        await detailResponse.json();


      /* =====================
         REFRESH DETAIL
      ===================== */

      populateBreakdownDetail(
        freshBreakdown
      );


      /* =====================
         REFRESH MAIN TABLE
      ===================== */

      if (
        typeof loadBreakdowns ===
        "function"
      ) {
        await loadBreakdowns();
      }


    } catch (err) {

      console.error(
        "CLEAR VERIFIED DOWNTIME ERROR:",
        err
      );

      alert(
        err.message ||
        "Failed to clear verified downtime."
      );

    }

  });

/* =========================================================
   ASSIGN RESTORATION MODAL — UI CONTROLS

   Handles:
   - Assignment mode selection
   - Close button
   - Cancel button

   IMPORTANT:
   - Does NOT create or link maintenance tasks.
   - Does NOT modify the Breakdown.
   - Save remains disabled until the backend
     assignment flows are connected.
========================================================= */


/* =====================
   ASSIGNMENT MODE
===================== */

document
  .getElementById(
    "assignRestorationMode"
  )
  ?.addEventListener(
    "change",
    event => {

      const isExisting =
        event.target.value === "existing";

      const existingFields =
        document.getElementById(
          "assignRestorationExistingFields"
        );

      const newFields =
        document.getElementById(
          "assignRestorationNewFields"
        );

      if (existingFields) {

        existingFields.style.display =
          isExisting ? "" : "none";

      }

      if (newFields) {

        newFields.style.display =
          isExisting ? "none" : "";

      }

    }
  );


/* =====================
   CLOSE ASSIGNMENT MODAL

   Clears the selected Breakdown
   reference from the modal.

   Does NOT change Breakdown data.
===================== */

function closeAssignRestorationModal() {

  const overlay =
    document.getElementById(
      "assignRestorationOverlay"
    );

  if (!overlay) return;

  overlay.style.display = "none";

  delete overlay.dataset.breakdownId;

}


/* =====================
   CLOSE / CANCEL BUTTONS
===================== */

[
  "closeAssignRestorationBtn",
  "cancelAssignRestorationBtn"
].forEach(buttonId => {

  document
    .getElementById(buttonId)
    ?.addEventListener(
      "click",
      closeAssignRestorationModal
    );

});

  // =========================================================
  // BREAKDOWN AUTO PAGE SIZE – RESIZE
  // =========================================================

  let breakdownResizeTimer = null;

  window.addEventListener("resize", () => {

    clearTimeout(
      breakdownResizeTimer
    );

    breakdownResizeTimer =
      setTimeout(() => {

        const tab =
          document.getElementById("tab-breakdowns");

        if (
          tab &&
          tab.offsetParent !== null
        ) {
          breakdownCurrentPage = 1;
          applyBreakdownFilters();
        }

      }, 150);

  });

/* =========================================================
   OPEN ASSET BREAKDOWN TAB 
    Used by:
    - Asset Details → Breakdowns
========================================================= */

async function openAssetBreakdowns(serial) {

  if (!serial) return;

  // Open Asset View
  await openAssetViewBySerial(serial);

  // Open directly on Breakdowns tab
  activateAssetTab("breakdowns");

}
