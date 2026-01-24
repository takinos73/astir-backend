/* =====================
   STATUS REPORT – PDF (GROUPED BY LINE / ASSET)
===================== */
function generateStatusReportPdf() {
  const tasks = getFilteredTasksForStatusReport();

  if (tasks.length === 0) {
    alert("No tasks found for this report");
    return;
  }

  const from = document.getElementById("dateFrom")?.value || "—";
  const to = document.getElementById("dateTo")?.value || "—";
  const lineFilter = document.getElementById("reportLine")?.value || "ALL";
  const status = document.getElementById("reportStatus")?.value || "ALL";

  // 🔽 SORT: LINE → ASSET → DUE DATE
  const sorted = [...tasks].sort((a, b) => {
    const la = (a.line_code || a.line || "");
    const lb = (b.line_code || b.line || "");
    if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

    const aa = `${a.machine_name} ${a.serial_number || ""}`;
    const ab = `${b.machine_name} ${b.serial_number || ""}`;
    if (aa !== ab) return aa.localeCompare(ab, "el");

    return new Date(a.due_date || 0) - new Date(b.due_date || 0);
  });

  // ⏱ GRAND TOTAL
  const totalMinutes = tasks.reduce((sum, t) => {
    return t.duration_min != null ? sum + Number(t.duration_min) : sum;
  }, 0);

  let totalDurationLabel = "";
  if (totalMinutes > 0) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    totalDurationLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  let html = `
  <html>
  <head>
    <title>Maintenance Status Report</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: Arial, sans-serif; font-size: 12px; }
      h2 { margin-bottom: 6px; }
      h3 { margin: 14px 0 6px; border-bottom: 2px solid #ccc; padding-bottom: 2px; }
      h4 { margin: 10px 0 4px; font-size: 13px; }
      .meta { margin-bottom: 14px; color: #555; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      th, td {
        border: 1px solid #ddd;
        padding: 6px 8px;
        vertical-align: top;
      }
      th { background: #eee; }

      .sn { font-size: 11px; color: #666; }

      .status-overdue { color: #c62828; font-weight: bold; }
      .status-planned { color: #1e88e5; font-weight: bold; }

      .line-footer {
        margin: 8px 0 12px;
        padding-top: 4px;
        border-top: 1px dashed #d6d6d6;
        font-size: 11px;
        color: #666;
        text-align: right;
      }
    </style>
  </head>
  <body>

    <h2>Maintenance Status Report</h2>

    <div class="meta">
      Date: ${new Date().toLocaleDateString("el-GR")}<br>
      Period: ${from} → ${to}<br>
      Line: ${lineFilter.toUpperCase()}<br>
      Status: ${status.toUpperCase()}<br>
      <strong>Tasks: ${tasks.length}</strong>
      ${totalDurationLabel ? ` • Estimated duration: ${totalDurationLabel}` : ""}
    </div>
  `;

  let currentLine = null;
  let currentAsset = null;
  let lineMinutes = 0;

  sorted.forEach(t => {
    const line = t.line_code || t.line || "—";
    const assetKey = `${t.machine_name}||${t.serial_number || ""}`;

    // 🟦 NEW LINE
    if (line !== currentLine) {
      if (currentLine !== null) {
        html += `
          <div class="line-footer">
            LINE total duration: ${formatDuration(lineMinutes)}
          </div>
        `;
      }

      html += `<h3>LINE ${line}</h3>`;
      currentLine = line;
      currentAsset = null;
      lineMinutes = 0;
    }

    // 🟨 NEW ASSET
    if (assetKey !== currentAsset) {
      html += `
        <h4>
          ${t.machine_name}
          <span class="sn">SN: ${t.serial_number || "-"}</span>
        </h4>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Type</th>
              <th>Due Date</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;
      currentAsset = assetKey;
    }

    if (t.duration_min != null) {
      lineMinutes += Number(t.duration_min);
    }

    const isOverdue =
      t.status !== "Done" &&
      t.due_date &&
      new Date(t.due_date) < new Date();

    html += `
      <tr>
        <td>${t.task}</td>
        <td>${t.type || "-"}</td>
        <td>${formatDate(t.due_date)}</td>
        <td>${formatDuration(t.duration_min)}</td>
        <td class="${isOverdue ? "status-overdue" : "status-planned"}">
          ${isOverdue ? "Overdue" : "Planned"}
        </td>
      </tr>
    `;
  });

  // 🔚 LAST LINE FOOTER
  html += `
        </tbody>
      </table>
      <div class="line-footer">
        LINE total duration: ${formatDuration(lineMinutes)}
      </div>
  `;

  html += `
  </body>
  </html>
  `;

  // 🔹 PRINT VIA IFRAME (SAFE)
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
   COMPLETED REPORT – PDF (SORTED BY LINE)
===================== */
function generateCompletedReportPdf() {

  const data = getFilteredExecutionsForReport();
  const totalsByTech = getExecutionTotalsByTechnician(data);

  if (!Array.isArray(data) || data.length === 0) {
    alert("No completed tasks found for this report");
    return;
  }

  const from = document.getElementById("dateFrom")?.value || "—";
  const to = document.getElementById("dateTo")?.value || "—";
  const lineFilter = document.getElementById("reportLine")?.value || "ALL";

  // 🔽 SORT: LINE → DATE → TECHNICIAN
  const sorted = [...data].sort((a, b) => {
    const la = (a.line || "").toString();
    const lb = (b.line || "").toString();
    if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

    const da = new Date(a.executed_at || 0);
    const db = new Date(b.executed_at || 0);
    if (da.getTime() !== db.getTime()) return da - db;

    return (a.executed_by || "").localeCompare(b.executed_by || "");
  });

  // 📊 TOTAL INFO
  const totalTasks = sorted.length;
  const totalTechs = Object.keys(totalsByTech).length;
  const totalLines = new Set(sorted.map(e => e.line)).size;

  let html = `
    <html>
    <head>
      <title>Completed Tasks Report</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }

        h2 { margin-bottom: 6px; }
        h3 { margin: 14px 0 6px; }
        .meta { font-size: 12px; margin-bottom: 14px; color: #555; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td {
          border: 1px solid #ddd;
          padding: 6px 8px;
          font-size: 12px;
          vertical-align: top;
        }
        th { background: #eee; }

        /* COLUMN WIDTHS */
        th.col-date, td.col-date { width: 10%; }
        th.col-line, td.col-line { width: 7%; }
        th.col-machine, td.col-machine { width: 14%; }
        th.col-secunit, td.col-secunit { width: 20%; }
        th.col-task, td.col-task { width: 29%; }
        th.col-tech, td.col-tech { width: 20%; }

        .small { font-size: 11px; color: #666; }

        .report-summary {
          margin-top: 26px;
          padding-top: 10px;
          border-top: 1px solid #e0e0e0;
          font-size: 11px;
          color: #555;
        }

        .report-summary strong {
          color: #111;
        }
      </style>
    </head>
    <body>

      <h2>Completed Tasks Report</h2>

      <div class="meta">
        Period: ${from} → ${to}<br>
        Line: ${lineFilter.toUpperCase()}
      </div>

      <h3>Summary by Technician</h3>
      <table>
        <thead>
          <tr>
            <th>Technician</th>
            <th style="text-align:center;">Completed Tasks</th>
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

      <h3>Completed Tasks Details</h3>
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

  sorted.forEach(e => {
    html += `
      <tr>
        <td class="col-date">
          ${new Date(e.executed_at).toLocaleDateString("el-GR")}
        </td>
        <td class="col-line">${e.line}</td>
        <td class="col-machine">
          ${e.machine}<br>
          <span class="small">${e.serial_number || ""}</span>
        </td>
        <td class="col-secunit">
          <strong>${e.section || "-"}</strong><br>
          <span class="small">${e.unit || ""}</span>
        </td>
        <td class="col-task">${e.task}</td>
        <td class="col-tech">${e.executed_by || "-"}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

      <div class="report-summary">
        <strong>Total completed tasks:</strong> ${totalTasks}<br>
        <strong>Technicians involved:</strong> ${totalTechs}<br>
        <strong>Lines involved:</strong> ${totalLines}
      </div>

    </body>
    </html>
  `;

  /* 🔹 PRINT VIA HIDDEN IFRAME */
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

  const from = document.getElementById("dateFrom")?.value || "—";
  const to = document.getElementById("dateTo")?.value || "—";
  const lineFilter = document.getElementById("reportLine")?.value || "ALL";
  const technician =
    document.getElementById("reportTechnician")?.value || "ALL";

  // 🔽 SORT: LINE → ASSET → DATE
  const sorted = [...rows].sort((a, b) => {
    const la = (a.line || "");
    const lb = (b.line || "");
    if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

    const aa = `${a.machine} ${a.serial_number || ""}`;
    const ab = `${b.machine} ${b.serial_number || ""}`;
    if (aa !== ab) return aa.localeCompare(ab);

    return new Date(a.executed_at || 0) - new Date(b.executed_at || 0);
  });

  // 📊 TOTALS & SERVICE TIME
  const totalBreakdowns = rows.length;
  const totalLines = new Set(rows.map(r => r.line)).size;
  const totalAssets = new Set(
    rows.map(r => `${r.machine}||${r.serial_number || ""}`)
  ).size;

  const totalServiceMinutes = rows.reduce(
    (sum, r) =>
      r.duration_min != null ? sum + Number(r.duration_min) : sum,
    0
  );

  const avgServiceMinutes =
    totalServiceMinutes && totalBreakdowns
      ? Math.round(totalServiceMinutes / totalBreakdowns)
      : 0;

  let html = `
    <html>
    <head>
      <title>Non-Planned Maintenance Report</title>
      <style>
        @page { size: A4; margin: 15mm; }

        body {
          font-family: Arial, sans-serif;
          color: #111;
          font-size: 12px;
        }

        h2 { margin-bottom: 6px; }
        h3 {
          margin: 16px 0 6px;
          padding-bottom: 2px;
          border-bottom: 2px solid #ccc;
        }
        h4 {
          margin: 10px 0 4px;
          font-size: 13px;
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
          margin-bottom: 6px;
        }

        th, td {
          border: 1px solid #ddd;
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

        .line-footer {
          margin: 8px 0 14px;
          padding-top: 4px;
          border-top: 1px dashed #d6d6d6;
          font-size: 11px;
          color: #666;
          text-align: right;
        }

        .report-summary {
          margin-top: 30px;
          padding-top: 10px;
          border-top: 1px solid #e0e0e0;
          font-size: 11px;
          color: #555;
        }

        .report-summary strong {
          color: #111;
        }
      </style>
    </head>
    <body>

      <h2>Non-Planned Maintenance / Breakdown Report</h2>

      <div class="meta">
        Period: ${from} → ${to}<br>
        Line: ${lineFilter}<br>
        Technician: ${technician}<br>
        Generated: ${new Date().toLocaleDateString("en-GB")}
      </div>
  `;

  let currentLine = null;
  let currentAsset = null;
  let lineCount = 0;

  sorted.forEach(r => {
    const line = r.line || "—";
    const assetKey = `${r.machine}||${r.serial_number || ""}`;

    // 🟦 NEW LINE
    if (line !== currentLine) {
      if (currentLine !== null) {
        html += `
          <div class="line-footer">
            Breakdowns in LINE: ${lineCount}
          </div>
        `;
      }

      html += `<h3>LINE ${line}</h3>`;
      currentLine = line;
      currentAsset = null;
      lineCount = 0;
    }

    // 🟨 NEW ASSET
    if (assetKey !== currentAsset) {
      html += `
        <h4>
          ${r.machine}
          <span class="small">SN: ${r.serial_number || "-"}</span>
        </h4>
        <table>
          <thead>
            <tr>
              <th style="width:15%">Date</th>
              <th style="width:55%">Breakdown Description</th>
              <th style="width:15%">Technician</th>
              <th style="width:15%">Duration</th>
            </tr>
          </thead>
          <tbody>
      `;
      currentAsset = assetKey;
    }

    lineCount++;

    html += `
      <tr>
        <td>${formatDateOnly(r.executed_at)}</td>
        <td>
          <strong>${r.task}</strong><br>
          <span class="small">
            ${r.section || ""}
            ${r.section && r.unit ? " / " : ""}
            ${r.unit || ""}
          </span>
        </td>
        <td>${r.executed_by || "-"}</td>
        <td>${formatDuration(r.duration_min)}</td>
      </tr>
    `;
  });

  // 🔚 LAST LINE FOOTER + SUMMARY
  html += `
        </tbody>
      </table>
      <div class="line-footer">
        Breakdowns in LINE: ${lineCount}
      </div>

      <div class="report-summary">
        <strong>Total breakdowns:</strong> ${totalBreakdowns}<br>
        <strong>Lines affected:</strong> ${totalLines}<br>
        <strong>Assets affected:</strong> ${totalAssets}<br>
        <strong>Total service time:</strong> ${formatDuration(totalServiceMinutes)}<br>
        <strong>Average service time / breakdown:</strong>
        ${avgServiceMinutes ? formatDuration(avgServiceMinutes) : "—"}
      </div>

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
   OVERDUE TASKS REPORT – PDF (GROUPED BY LINE / ASSET)
===================== */

function generateOverdueReportPdf() {
  const rows = getFilteredOverdueTasksForReport();

  if (!rows.length) {
    alert("No overdue tasks found");
    return;
  }

  const lineFilter = document.getElementById("reportLine")?.value || "ALL";

  // 🔽 SORT: LINE → ASSET → DUE DATE
  const sorted = [...rows].sort((a, b) => {
    const la = (a.line_code || "");
    const lb = (b.line_code || "");
    if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

    const aa = `${a.machine_name} ${a.serial_number || ""}`;
    const ab = `${b.machine_name} ${b.serial_number || ""}`;
    if (aa !== ab) return aa.localeCompare(ab, "el");

    return new Date(a.due_date || 0) - new Date(b.due_date || 0);
  });

  // 📊 TOTALS
  const totalTasks = rows.length;
  const totalLines = new Set(rows.map(r => r.line_code)).size;
  const totalAssets = new Set(
    rows.map(r => `${r.machine_name}||${r.serial_number || ""}`)
  ).size;

  let html = `
    <html>
    <head>
      <title>Overdue Tasks Report</title>
      <style>
        @page { size: A4; margin: 15mm; }

        body {
          font-family: Arial, sans-serif;
          color: #111;
          font-size: 12px;
        }

        h2 { margin-bottom: 6px; }
        h3 {
          margin: 16px 0 6px;
          padding-bottom: 2px;
          border-bottom: 2px solid #ccc;
        }
        h4 {
          margin: 10px 0 4px;
          font-size: 13px;
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
          margin-bottom: 6px;
        }

        th, td {
          border: 1px solid #ddd;
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

        .line-footer {
          margin: 8px 0 14px;
          padding-top: 4px;
          border-top: 1px dashed #d6d6d6;
          font-size: 11px;
          color: #666;
          text-align: right;
        }

        .report-summary {
          margin-top: 30px;
          padding-top: 10px;
          border-top: 1px solid #e0e0e0;
          font-size: 11px;
          color: #555;
        }

        .report-summary strong {
          color: #111;
        }
      </style>
    </head>
    <body>

      <h2>Overdue Maintenance Tasks</h2>

      <div class="meta">
        Line: ${lineFilter}<br>
        Generated: ${new Date().toLocaleDateString("en-GB")}
      </div>
  `;

  let currentLine = null;
  let currentAsset = null;
  let lineCount = 0;

  sorted.forEach(t => {
    const line = t.line_code || "—";
    const assetKey = `${t.machine_name}||${t.serial_number || ""}`;

    // 🟦 NEW LINE
    if (line !== currentLine) {
      if (currentLine !== null) {
        html += `
          <div class="line-footer">
            Overdue tasks in LINE: ${lineCount}
          </div>
        `;
      }

      html += `<h3>LINE ${line}</h3>`;
      currentLine = line;
      currentAsset = null;
      lineCount = 0;
    }

    // 🟨 NEW ASSET
    if (assetKey !== currentAsset) {
      html += `
        <h4>
          ${t.machine_name}
          <span class="small">SN: ${t.serial_number || "-"}</span>
        </h4>
        <table>
          <thead>
            <tr>
              <th style="width:18%">Due Date</th>
              <th style="width:82%">Task</th>
            </tr>
          </thead>
          <tbody>
      `;
      currentAsset = assetKey;
    }

    lineCount++;

    html += `
      <tr>
        <td>${formatDate(t.due_date)}</td>
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

  // 🔚 LAST LINE FOOTER
  html += `
        </tbody>
      </table>
      <div class="line-footer">
        Overdue tasks in LINE: ${lineCount}
      </div>

      <div class="report-summary">
        <strong>Total overdue tasks:</strong> ${totalTasks}<br>
        <strong>Lines affected:</strong> ${totalLines}<br>
        <strong>Assets affected:</strong> ${totalAssets}
      </div>

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
