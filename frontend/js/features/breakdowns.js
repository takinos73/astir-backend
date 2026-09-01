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
      await fetch(`${API_BASE}/breakdowns`);


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
            <!-- Future: View Breakdown -->
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