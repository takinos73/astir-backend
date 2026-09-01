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