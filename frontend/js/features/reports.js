/* =====================
   STATUS REPORT – PDF (WITH ESTIMATED DURATION)
===================== */
function generateStatusReportPdf() {
  const tasks = getFilteredTasksForStatusReport();

  if (tasks.length === 0) {
    alert("No tasks found for this report");
    return;
  }

  const from = document.getElementById("dateFrom")?.value || "—";
  const to = document.getElementById("dateTo")?.value || "—";
  const line = document.getElementById("reportLine")?.value || "ALL";
  const status = document.getElementById("reportStatus")?.value || "ALL";

  // ⏱ TOTAL ESTIMATED DURATION (ONLY NOT NULL)
  const totalMinutes = tasks.reduce((sum, t) => {
    return t.duration_min != null ? sum + Number(t.duration_min) : sum;
  }, 0);

  let totalDurationLabel = "";
  if (totalMinutes > 0) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) totalDurationLabel = `${h}h ${m}m`;
    else if (h > 0) totalDurationLabel = `${h}h`;
    else totalDurationLabel = `${m}m`;
  }

  let html = `
    <html>
    <head>
      <title>Maintenance Status Report</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; }
        h2 { margin-bottom: 6px; }
        .meta { margin-bottom: 14px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          vertical-align: top;
        }
        th { background: #eee; }
        .sn { font-size: 11px; color: #666; }
        .status-planned { color: #1e88e5; font-weight: bold; }
        .status-overdue { color: #c62828; font-weight: bold; }
      </style>
    </head>
    <body>

      <h2>Maintenance Status Report</h2>

      <div class="meta">
        Date: ${new Date().toLocaleDateString("el-GR")}<br>
        Period: ${from} → ${to}<br>
        Line: ${line.toUpperCase()}<br>
        Status: ${status.toUpperCase()}<br>
        <strong>Tasks: ${tasks.length}</strong>
        ${totalDurationLabel ? ` • Estimated duration: ${totalDurationLabel}` : ""}
      </div>

      <table>
        <thead>
          <tr>
            <th>Machine</th>
            <th>Section</th>
            <th>Unit</th>
            <th>Task</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Estimated Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  tasks.forEach(t => {
    const due = new Date(t.due_date);
    const isOverdue = due < new Date() && t.status !== "Done";
    const durLabel = formatDuration(t.duration_min);

    html += `
      <tr>
        <td>
          ${t.machine_name}<br>
          <span class="sn">${t.serial_number || ""}</span>
        </td>
        <td>${t.section || "-"}</td>
        <td>${t.unit || "-"}</td>
        <td>${t.task}</td>
        <td>${t.type || "-"}</td>
        <td>${due.toLocaleDateString("el-GR")}</td>
        <td>${durLabel}</td>
        <td class="${isOverdue ? "status-overdue" : "status-planned"}">
          ${isOverdue ? "Overdue" : "Planned"}
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  // Hidden iframe print
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

/* =====================
   COMPLETED REPORT – PDF
===================== */
function generateCompletedReportPdf() {

  const data = getFilteredExecutionsForReport();
  const totalsByTech = getExecutionTotalsByTechnician(data);

  if (!Array.isArray(data) || data.length === 0) {
    alert("No completed tasks found for this report");
    return;
  }

  let html = `
    <html>
    <head>
      <title>Completed Tasks Report</title>
      <style>
        body { font-family: Arial, sans-serif; }
        h2 { margin-bottom: 6px; }
        h3 { margin: 12px 0 6px; }
        .meta { font-size: 12px; margin-bottom: 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          font-size: 12px;
        }
        th { background: #eee; }
        /* COLUMN WIDTHS */
        th.col-date, td.col-date { width: 10%; }
        th.col-line, td.col-line { width: 7%; }
        th.col-machine, td.col-machine { width: 12%; }
        th.col-secunit, td.col-secunit { width: 22%; }
        th.col-task, td.col-task { width: 32%; }
        th.col-tech, td.col-tech { width: 20%; }
      </style>
    </head>
    <body>

      <h2>Completed Tasks Report</h2>

      <div class="meta">
        Period:
        ${document.getElementById("dateFrom")?.value || "—"}
        →
        ${document.getElementById("dateTo")?.value || "—"}<br>
        Line: ${document.getElementById("reportLine")?.value.toUpperCase()}
      </div>

      <h3>Summary by Technician</h3>
      <table style="margin-bottom:15px;">
        <thead>
          <tr>
            <th>Technician</th>
            <th>Completed Tasks</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(totalsByTech)
            .map(
              ([tech, count]) => `
                <tr>
                  <td>${tech}</td>
                  <td style="text-align:center;">${count}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th class="col-date">Date</th>
            <th class="col-line">Line</th>
            <th class="col-machine">Machine</th>
            <th class="col-secunit">Section / Unit</th>            
            <th class="col-task">Task</th>
            <th class="col-tech">Technician</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.forEach(e => {
    html += `
      <tr>
          <td class="col-date">
            ${new Date(e.executed_at).toLocaleDateString("el-GR")}
          </td>
          <td class="col-line">${e.line}</td>
          <td class="col-machine">
            ${e.machine}<br>
            <small>${e.serial_number || ""}</small>
          </td>
          <td class="col-secunit">
            <strong>${e.section || "-"}</strong><br>
            <small>${e.unit || ""}</small>
          </td>          
          <td class="col-task">${e.task}</td>
          <td class="col-tech">${e.executed_by || "-"}</td>   
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

/* =====================
   COMPLETED REPORT – DATA
===================== */

function getFilteredExecutionsForReport() {
  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "all";
  const technician = document
    .getElementById("reportTechnician")
    ?.value
    ?.trim()
    .toLowerCase();

  const fromDate = from ? new Date(from) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);

  const toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  return executionsData.filter(e => {
    if (!e.executed_at) return false;

    const execDate = new Date(e.executed_at);

    if (fromDate && execDate < fromDate) return false;
    if (toDate && execDate > toDate) return false;

    if (line !== "all" && e.line !== line) return false;

    if (
      technician &&
      !e.executed_by?.toLowerCase().includes(technician)
    ) {
      return false;
    }

    return true;
  });
}

/* =====================
   COMPLETED REPORT – TOTALS BY TECHNICIAN
===================== */
function getExecutionTotalsByTechnician(data) {
  const totals = {};

  data.forEach(e => {
    const tech = e.executed_by || "—";
    totals[tech] = (totals[tech] || 0) + 1;
  });

  return totals;
}

/* =====================
   GENERATE PDF BUTTON CLICK
===================== */

document.getElementById("generatePdfBtn")
  ?.addEventListener("click", () => {
    const type = document.getElementById("reportType")?.value;
    console.log("REPORT TYPE CLICK =", type); // 👈 DEBUG

    switch (type) {
      case "status":
        generateStatusReportPdf();
        break;

      case "technician":
        generateCompletedReportPdf();
        break;
        
      case "overdue":
        generateOverdueReportPdf();
        break;

      case "nonplanned":
        generateNonPlannedReportPdf();
        break;


      default:
        alert(`Report type "${type}" is not implemented yet.`);
    }
});
/* =====================
   RESET REPORT FILTERS
===================== */
document.getElementById("resetReportBtn")?.addEventListener("click", () => {
  resetReportBtn.innerText = "✔ Reset";
  setTimeout(() => resetReportBtn.innerText = "Reset", 800);

  // Report type
  const reportType = document.getElementById("reportType");
  if (reportType) reportType.value = "status";

  // Date range
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");
  if (dateFrom) dateFrom.value = "";
  if (dateTo) dateTo.value = "";

  // Line
  const line = document.getElementById("reportLine");
  if (line) line.value = "all";

  // Status
  const status = document.getElementById("reportStatus");
  if (status) status.value = "all";

  // Technician
  const tech = document.getElementById("reportTechnician");
  if (tech) tech.value = "";

  // Hide technician field if not needed
  document
    .getElementById("fieldTechnician")
    ?.classList.add("field-hidden");

  /* =====================
     RESET PREVIEW
  ===================== */
  document.getElementById("previewLines").innerText = "Lines: ALL";
  document.getElementById("previewDates").innerText = "Period: —";
  document.getElementById("previewType").innerText =
    "Report: Maintenance Status Report";
  document.getElementById("previewStatus").innerText = "Status: ALL";
});

/* =====================
   NON-PLANNED REPORT – DATA
   (Breakdowns only)
===================== */

function getFilteredNonPlannedExecutionsForReport() {
  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "all";
  const technician = document
    .getElementById("reportTechnician")
    ?.value
    ?.trim()
    .toLowerCase();

  const fromDate = from ? new Date(from) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);

  const toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  return executionsData.filter(e => {
    // ❌ must have execution date
    if (!e.executed_at) return false;

    // ✅ NON-PLANNED ONLY (Breakdowns)
    if (e.is_planned !== false) return false;

    const execDate = new Date(e.executed_at);

    if (fromDate && execDate < fromDate) return false;
    if (toDate && execDate > toDate) return false;

    if (line !== "all" && e.line !== line) return false;

    if (
      technician &&
      !e.executed_by?.toLowerCase().includes(technician)
    ) {
      return false;
    }

    return true;
  });
}
/* =====================
   NON-PLANNED (BREAKDOWN) REPORT – PDF
===================== */

function generateNonPlannedReportPdf() {
  const rows = getFilteredNonPlannedExecutionsForReport();

  if (!rows.length) {
    alert("No non-planned tasks found for selected criteria");
    return;
  }

  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "ALL";
  const technician =
    document.getElementById("reportTechnician")?.value || "ALL";

  let html = `
    <html>
    <head>
      <title>Non-Planned Maintenance Report</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }

        body {
          font-family: Arial, sans-serif;
          color: #111;
        }

        h2 {
          margin-bottom: 6px;
        }

        .meta {
          font-size: 12px;
          margin-bottom: 14px;
          color: #444;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          vertical-align: top;
        }

        th {
          background: #eee;
          text-align: left;
        }

        .small {
          font-size: 10px;
          color: #555;
        }
      </style>
    </head>
    <body>

      <h2>Non-Planned Maintenance / Breakdown Report</h2>

      <div class="meta">
        Period: ${from || "—"} → ${to || "—"}<br>
        Line: ${line}<br>
        Technician: ${technician}<br>
        Generated: ${new Date().toLocaleDateString("en-GB")}
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:10%">Date</th>
            <th style="width:12%">Line</th>
            <th style="width:20%">Machine</th>
            <th style="width:38%">Breakdown Description</th>
            <th style="width:20%">Executed By</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(r => {
    html += `
      <tr>
        <td>${formatDateOnly(r.executed_at)}</td>

        <td>${r.line || "-"}</td>

        <td>
          ${r.machine}<br>
          <span class="small">SN: ${r.serial_number || "-"}</span>
        </td>

        <td>
          <strong>${r.task}</strong><br>
          <span class="small">
            ${r.section || ""}
            ${r.section && r.unit ? " / " : ""}
            ${r.unit || ""}
          </span>
        </td>

        <td>${r.executed_by || "-"}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

    </body>
    </html>
  `;

  /* 🔹 PRINT VIA HIDDEN IFRAME (NO NEW TAB) */
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}
/* =====================
   OVERDUE REPORT – DATA
   (Active tasks only)
===================== */

function getFilteredOverdueTasksForReport() {
  const line = document.getElementById("reportLine")?.value || "all";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasksData.filter(t => {
    // ❌ must have due date
    if (!t.due_date) return false;

    // ❌ already completed
    if (t.status === "Done") return false;

    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);

    // ✅ overdue only
    if (due >= today) return false;

    // line filter
    if (line !== "all" && t.line_code !== line) return false;

    return true;
  });
}
/* =====================
   OVERDUE TASKS REPORT – PDF
===================== */

function generateOverdueReportPdf() {
  const rows = getFilteredOverdueTasksForReport();

  if (!rows.length) {
    alert("No overdue tasks found");
    return;
  }

  const line = document.getElementById("reportLine")?.value || "ALL";

  let html = `
    <html>
    <head>
      <title>Overdue Tasks Report</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }

        body {
          font-family: Arial, sans-serif;
          color: #111;
        }

        h2 {
          margin-bottom: 6px;
        }

        .meta {
          font-size: 12px;
          margin-bottom: 14px;
          color: #444;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          vertical-align: top;
        }

        th {
          background: #eee;
          text-align: left;
        }

        .small {
          font-size: 10px;
          color: #555;
        }
      </style>
    </head>
    <body>

      <h2>Overdue Maintenance Tasks</h2>

      <div class="meta">
        Line: ${line}<br>
        Generated: ${new Date().toLocaleDateString("en-GB")}
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:12%">Due Date</th>
            <th style="width:18%">Line</th>
            <th style="width:25%">Machine</th>
            <th style="width:45%">Task</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(t => {
    html += `
      <tr>
        <td>${formatDate(t.due_date)}</td>

        <td>${t.line_code}</td>

        <td>
          ${t.machine_name}<br>
          <span class="small">SN: ${t.serial_number || "-"}</span>
        </td>

        <td>
          <strong>${t.task}</strong><br>
          <span class="small">
            ${t.section || ""}
            ${t.section && t.unit ? " / " : ""}
            ${t.unit || ""}
          </span>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

    </body>
    </html>
  `;

  /* 🔹 PRINT VIA HIDDEN IFRAME */
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}