/* =====================
   GET FILTERED ASSET HISTORY
===================== */

function getFilteredAssetHistory(list) {

  if (!Array.isArray(list)) return [];

  let filtered = list;

   /* DATE FILTER */

  if (state.historyDateFrom) {

    const from = state.historyDateFrom;

    filtered = filtered.filter(e => {
      console.log("EXEC:", e.executed_at);

      const execDate = new Date(e.executed_at);

      if (isNaN(execDate)) return false;

      return execDate >= from;

    });

  }

  if (state.historyDateTo) {

    const to = state.historyDateTo;

    filtered = filtered.filter(e => {

      const execDate = new Date(e.executed_at);

      if (isNaN(execDate)) return false;

      return execDate <= to;

    });

  }
  
  /* TYPE FILTER */
  if (state.assetHistoryTypeFilter !== "all") {

    filtered = filtered.filter(e => {
      const type = getExecutionType(e);
      return type === state.assetHistoryTypeFilter;
    });

  }

  /* TASK FILTER */
  if (state.assetHistoryTaskFilter) {

    filtered = filtered.filter(e => {

      const key =
        `${e.task}||${e.section || ""}||${e.unit || ""}`;

      return key === state.assetHistoryTaskFilter;

    });

  }

  return filtered;

}
function bindHistoryRangeFilters(){

  document.querySelectorAll(".history-range-btn")
    .forEach(btn=>{

      btn.addEventListener("click",()=>{

        document
          .querySelectorAll(".history-range-btn")
          .forEach(b=>b.classList.remove("active"));

        btn.classList.add("active");

        const range = btn.dataset.range;

        if(range==="all"){
          state.historyDateFrom = null;
        }
        else{

          const days = parseInt(range);

          const d = new Date();
          d.setDate(d.getDate() - days);

          state.historyDateFrom = d;
        }

        renderAssetHistoryTable(state.assetHistoryTasks);

      });

    });

}
//* =====================
// PRINT ASSET HISTORY
// ===================== */

function printAssetHistory() {

  const data = getFilteredAssetHistory(state.assetHistoryTasks);

  if (!Array.isArray(data) || data.length === 0) {
    alert("No history records to print");
    return;
  }

  const asset = state.assetsData.find(
    a => a.serial_number === state.currentAssetSerial
  ) || {};
  let periodLabel = "All history";

if (state.historyDateFrom) {

  const days = Math.round(
    (new Date() - new Date(state.historyDateFrom)) / 86400000
  );

  periodLabel = `Last ${days} days`;
}

  let html = `
  <html>
  <head>
    <title>Asset History</title>

    <style>

      @page { size: A4; margin: 15mm; }

      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        color: #111;
      }

      h2{
        margin-bottom:8px;
        border-bottom:2px solid #333;
        padding-bottom:4px;
      }

      .asset-meta {
        font-size: 12px;
        margin-bottom: 12px;
        color: #444;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th, td {
        border: 1px solid #ddd;
        padding: 6px 8px;
        font-size: 12px;
      }

      th {
        background: #eee;
        text-align: left;
      }

      .small {
        font-size: 11px;
        color: #666;
      }

      .status {
        font-weight: bold;
      }

      .status-breakdown {
        color: #b00020;
      }

      .status-preventive {
        color: #1b5e20;
      }

      .status-planned {
        color: #fef900;
      }

    </style>

  </head>

  <body>

    <h2>Asset History</h2>

    <div class="asset-meta">
      <strong>Line:</strong> ${asset.line || "-"}<br>
      <strong>Asset:</strong> ${asset.model|| "-"}<br>
      <strong>Serial:</strong> ${asset.serial_number || "-"}<br>      
      <strong>Period:</strong> ${periodLabel}<br>
      <strong>Printed:</strong> ${new Date().toLocaleDateString()}
    </div>

    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Task</th>
          <th>Type</th>
          <th>Executed At</th>
          <th>Notes</th>
        </tr>
      </thead>

      <tbody>
  `;

  data.forEach(e => {

    const execType = getExecutionType(e);

    let statusClass = "";

    if (execType === "unplanned") statusClass = "status-breakdown";
    else if (execType === "preventive") statusClass = "status-preventive";
    else statusClass = "status-planned";

    html += `
      <tr>

        <td class="status ${statusClass}">
          ${execType}
        </td>

        <td>
          ${e.task}
          ${(e.section || e.unit)
            ? `<br><span class="small">${e.section || ""}${e.section && e.unit ? " / " : ""}${e.unit || ""}</span>`
            : ""}
        </td>

        <td>${e.type || "-"}</td>

        <td>${formatDate(e.executed_at)}</td>

        <td>${e.notes || "-"}</td>

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

  setTimeout(() => document.body.removeChild(iframe), 1000);
}

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

      .status-overdue {
  color: #c62828;
  font-weight: bold;
}

/* Preventive tasks */
.status-planned {
  color: #2e7d32;   /* πράσινο */
  font-weight: bold;
}

/* Planned manual tasks */
.status-planned_manual {
  color: #fe9c00;   /* amber */
  font-weight: bold;
}


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
  const lineSummary = {}; 

  sorted.forEach(t => {
  const line = t.line_code || t.line || "—";
  const assetKey = `${t.machine_name}||${t.serial_number || ""}`;

  // =====================
  // INIT LINE SUMMARY
  // =====================
  if (!lineSummary[line]) {
    lineSummary[line] = {
      preventive: 0,
      manual: 0,
      overdue: 0
    };
  }

  // 🔒 CLOSE PREVIOUS ASSET TABLE (when line changes)
  if (line !== currentLine && currentAsset !== null) {
    html += `
          </tbody>
        </table>
    `;
    currentAsset = null;
  }

  // 🟦 NEW LINE
  if (line !== currentLine) {
    if (currentLine !== null) {
      html += `
        <div class="line-footer">
          <strong>Summary:</strong>
          <span class="status-planned">
            Preventive: ${lineSummary[currentLine]?.preventive || 0}
          </span>
          &nbsp;•&nbsp;
          <span class="status-planned_manual">
            Planned (Manual): ${lineSummary[currentLine]?.manual || 0}
          </span>
          &nbsp;•&nbsp;
          <span class="status-overdue">
            Overdue: ${lineSummary[currentLine]?.overdue || 0}
          </span>
          <br>
          LINE total duration: ${formatDuration(lineMinutes)}
        </div>
      `;
    }

    html += `<h3>LINE ${line}</h3>`;
    currentLine = line;
    currentAsset = null;
    lineMinutes = 0;
  }

  // 🔒 CLOSE PREVIOUS ASSET TABLE (when asset changes)
  if (assetKey !== currentAsset && currentAsset !== null) {
    html += `
          </tbody>
        </table>
    `;
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

  // ✅ TYPE CLASS (preventive vs planned manual)
  let statusClass = "status-planned";
  let statusLabel = "Preventive";

  if (typeof isPlannedManual === "function" && isPlannedManual(t)) {
    statusClass = "status-planned_manual";
    statusLabel = "Planned (Manual)";
  }

  if (isOverdue) {
    statusClass = "status-overdue";
    statusLabel = "Overdue";
  }

  // =====================
  // UPDATE LINE SUMMARY
  // =====================
  if (isOverdue) {
    lineSummary[line].overdue++;
  } else if (typeof isPlannedManual === "function" && isPlannedManual(t)) {
    lineSummary[line].manual++;
  } else {
    lineSummary[line].preventive++;
  }

  html += `
    <tr>
      <td>
        <div>${t.task}</div>
        ${
          t.section || t.unit
            ? `<div style="font-size: 11px; color: #666; margin-top: 2px;">
                ${t.section || ""}
                ${t.section && t.unit ? " / " : ""}
                ${t.unit || ""}
              </div>`
            : ""
        }
      </td>
      <td>${t.type || "-"}</td>
      <td>${formatDate(t.due_date)}</td>
      <td>${formatDuration(t.duration_min)}</td>
      <td class="${statusClass}">
        ${statusLabel}
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
function generateExecutionMixPie(execPct) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { pct: execPct.preventive, color: "#2e7d32" },
    { pct: execPct.planned, color: "#f57c00" },
    { pct: execPct.breakdown, color: "#c62828" }
  ];

  let offset = 0;

  return `
    <svg width="220" height="220" viewBox="0 0 220 220">
      <g transform="translate(110,110) rotate(-90)">
        ${segments.map(seg => {
          const dash = (seg.pct / 100) * circumference;
          const svg = `
            <circle
              r="${radius}"
              cx="0"
              cy="0"
              fill="transparent"
              stroke="${seg.color}"
              stroke-width="40"
              stroke-dasharray="${dash} ${circumference}"
              stroke-dashoffset="${-offset}"
            />
          `;
          offset += dash;
          return svg;
        }).join("")}
      </g>
    </svg>
  `;
}

/* =====================
   COMPLETED REPORT – PDF (SORTED BY LINE → ASSET → DATE → TECH)
===================== */
function generateCompletedReportPdf() {

  const includeDetails =
  document.getElementById("reportIncludeDetails")?.checked;

  const data = getFilteredExecutionsForReport();

  if (!Array.isArray(data) || data.length === 0) {
    alert("No completed tasks found for this report");
    return;
  }

  const from = document.getElementById("dateFrom")?.value || "—";
  const to = document.getElementById("dateTo")?.value || "—";
  const lineFilter = document.getElementById("reportLine")?.value || "ALL";

  // 🔽 SORT: LINE → ASSET → DATE → TECHNICIAN
  const sorted = [...data].sort((a, b) => {
    // 1️⃣ LINE
    const la = (a.line || "").toString();
    const lb = (b.line || "").toString();
    if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

    // 2️⃣ ASSET (Machine + SN)
    const aa = `${a.machine || ""} ${a.serial_number || ""}`;
    const ab = `${b.machine || ""} ${b.serial_number || ""}`;
    if (aa !== ab) return aa.localeCompare(ab, "el");

    // 3️⃣ DATE
    const da = new Date(a.executed_at || 0);
    const db = new Date(b.executed_at || 0);
    if (da.getTime() !== db.getTime()) return da - db;

    // 4️⃣ TECHNICIAN (tie-break)
    return (a.executed_by || "").localeCompare(b.executed_by || "");
  });

  // 📊 TOTALS (on sorted dataset)
  const totalsByTech = getExecutionTotalsByTechnician(sorted);
  const totalTasks = sorted.length;
  const totalTechs = Object.keys(totalsByTech).length;
  const totalLines = new Set(
    sorted.map(e => e.line).filter(Boolean)
  ).size;

// =====================
// MTTR BY LINE (BREAKDOWNS)
// =====================
const mttrByLine = {};

sorted.forEach(e => {
  if (e.is_planned === false && e.duration_min != null) {
    const line = e.line || "—";
    if (!mttrByLine[line]) {
      mttrByLine[line] = { total: 0, count: 0 };
    }
    mttrByLine[line].total += Number(e.duration_min);
    mttrByLine[line].count += 1;
  }
});

const mttrLineRows = Object.entries(mttrByLine)
  .map(([line, v]) => ({
    line,
    avg: Math.round(v.total / v.count),
    count: v.count
  }))
  .sort((a, b) => b.avg - a.avg);
// =====================
// EXECUTION MIX
// =====================
const execMix = {
  preventive: 0,
  planned: 0,
  breakdown: 0
};

sorted.forEach(e => {
  if (e.is_planned === false) {
    execMix.breakdown++;
  } else if (e.frequency_hours != null && Number(e.frequency_hours) > 0) {
    execMix.preventive++;
  } else {
    execMix.planned++;
  }
});

const execTotal = execMix.preventive + execMix.planned + execMix.breakdown;

const execPct = {
  preventive: execTotal ? Math.round(execMix.preventive * 100 / execTotal) : 0,
  planned: execTotal ? Math.round(execMix.planned * 100 / execTotal) : 0,
  breakdown: execTotal ? Math.round(execMix.breakdown * 100 / execTotal) : 0
};
// =====================
// EXECUTIVE KPIs
// =====================

// 🔹 Breakdown Rate
const breakdownRate = execPct.breakdown;

// 🔹 Average MTTR (overall)
const avgMttrAll = mttrLineRows.length
  ? Math.round(
      mttrLineRows.reduce((s, r) => s + r.avg, 0) /
      mttrLineRows.length
    )
  : 0;

// 🔹 Top Technician
const sortedTech = Object.entries(totalsByTech)
  .sort((a, b) => b[1] - a[1]);

const topTech = sortedTech.length
  ? sortedTech[0]
  : ["—", 0];

const topTechShare = totalTasks
  ? Math.round((topTech[1] / totalTasks) * 100)
  : 0;

// 🔹 Total Downtime (Breakdowns)
const totalBreakdownMinutes = sorted
  .filter(e => e.is_planned === false && e.duration_min)
  .reduce((s, e) => s + Number(e.duration_min), 0);

const totalBreakdownHours = Math.round(totalBreakdownMinutes / 60);

// 🔹 Maintenance Profile
let maintenanceProfile = "Balanced";
let maintenanceIcon = "🟠";

if (breakdownRate < 15) {
  maintenanceProfile = "Preventive-Driven";
  maintenanceIcon = "🟢";
} else if (breakdownRate > 30) {
  maintenanceProfile = "Reactive / Breakdown-Heavy";
  maintenanceIcon = "🔴";
}

// 🔹 Workload Concentration
const workloadRisk =
  topTechShare > 60
    ? "🔴 High concentration risk"
    : topTechShare > 40
    ? "🟠 Moderate concentration"
    : "🟢 Balanced distribution";

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
          .page-break {
            page-break-before: always;
          }

      </style>
    </head>
    <body>

      <h2>Completed Tasks Report</h2>

      <div class="meta">
        Period: ${from} → ${to}<br>
        Line: ${lineFilter.toUpperCase()}
      </div>
      <h3>Executive Summary</h3>
        <table>
          <tbody>
            <tr>
              <td><strong>Total Completed Tasks</strong></td>
              <td style="text-align:right;"><strong>${totalTasks}</strong></td>
            </tr>
            <tr>
              <td>Technicians Involved</td>
              <td style="text-align:right;">${totalTechs}</td>
            </tr>
            <tr>
              <td>Lines Covered</td>
              <td style="text-align:right;">${totalLines}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <td><strong>Breakdown Rate</strong></td>
              <td style="text-align:right;"><strong>${breakdownRate}%</strong></td>
            </tr>
            <tr>
              <td>Total Downtime (Breakdowns)</td>
              <td style="text-align:right;">${totalBreakdownHours} h</td>
            </tr>
            <tr>
              <td>Average MTTR</td>
              <td style="text-align:right;">${formatDuration(avgMttrAll)}</td>
            </tr>
            <tr>
              <td>Top Technician</td>
              <td style="text-align:right;">
                ${topTech[0]} (${topTech[1]} tasks – ${topTechShare}%)
              </td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <td><strong>Maintenance Profile</strong></td>
              <td style="text-align:right;">
                ${maintenanceIcon} ${maintenanceProfile}
              </td>
            </tr>
            <tr>
              <td>Workload Distribution</td>
              <td style="text-align:right;">${workloadRisk}</td>
            </tr>
          </tbody>
        </table>


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
            .sort((a, b) => b[1] - a[1])
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
<h3>Execution Mix</h3>
<div style="display:flex; gap:40px; align-items:center;">
  <div>
    ${generateExecutionMixPie(execPct)}
  </div>
  <div>
    <p><strong>Preventive:</strong> ${execPct.preventive}%</p>
    <p><strong>Planned:</strong> ${execPct.planned}%</p>
    <p><strong>Breakdown:</strong> ${execPct.breakdown}%</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Type</th>
      <th style="text-align:center;">Tasks</th>
      <th style="text-align:right;">%</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Preventive</td>
      <td style="text-align:center;">${execMix.preventive}</td>
      <td style="text-align:right;">${execPct.preventive}%</td>
    </tr>
    <tr>
      <td>Planned (Manual)</td>
      <td style="text-align:center;">${execMix.planned}</td>
      <td style="text-align:right;">${execPct.planned}%</td>
    </tr>
    <tr>
      <td>Breakdown</td>
      <td style="text-align:center;">${execMix.breakdown}</td>
      <td style="text-align:right;"><strong>${execPct.breakdown}%</strong></td>
    </tr>
  </tbody>
</table>

      ${mttrLineRows.length ? `
<h3>MTTR by Line (Breakdowns)</h3>
${generateMttrBarChart(mttrLineRows)}

<table>
  <thead>
    <tr>
      <th>Line</th>
      <th style="text-align:center;">Breakdowns</th>
      <th style="text-align:right;">Avg MTTR</th>
    </tr>
  </thead>
  <tbody>
    ${mttrLineRows.map(r => `
      <tr>
        <td>${r.line}</td>
        <td style="text-align:center;">${r.count}</td>
        <td style="text-align:right;"><strong>${formatDuration(r.avg)}</strong></td>
      </tr>
    `).join("")}
  </tbody>
</table>
` : ""}

      ${includeDetails ? `
        <div class="page-break"></div>
        <h3>Completed Tasks Details</h3>
        <table>
      ` : ``}
          <thead>
            <tr>
              <th class="col-date">Date</th>              
              <th class="col-machine">Machine</th>
              <th class="col-secunit">Section / Unit</th>
              <th class="col-task">Task</th>
              <th class="col-tech">Technician</th>
            </tr>
          </thead>
        <tbody>
  `;

  if (includeDetails) {

      let currentLine = null;

  sorted.forEach(e => {

    if (e.line !== currentLine) {

      currentLine = e.line;

      html += `
        <tr>
          <td colspan="5" style="
            background:#f2f2f2;
            font-weight:bold;
            padding:8px;
            border-top:3px solid #444;
          ">
            LINE ${currentLine || "—"}
          </td>
        </tr>
      `;
    }

    html += `
      <tr>
        <td class="col-date">
          ${new Date(e.executed_at).toLocaleDateString("el-GR")}
        </td>

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
      `;
    }

    html += `
          <div class="report-summary">
            <strong>Total completed tasks:</strong> ${totalTasks}<br>
            <strong>Technicians involved:</strong> ${totalTechs}<br>
            <strong>Lines involved:</strong> ${totalLines}
          </div>

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

  setTimeout(() => document.body.removeChild(iframe), 1000);
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

  return state.executionsData.filter(e => {
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

        case "kpi": // ✅ NEW
        generateKpiReportPdf();
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

  return state.executionsData.filter(e => {
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
    // 🔒 CLOSE PREVIOUS ASSET TABLE (when line changes)
    if (line !== currentLine && currentAsset !== null) {
      html += `
            </tbody>
          </table>
      `;
      currentAsset = null;
}

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
      // 🔒 CLOSE PREVIOUS ASSET TABLE (when asset changes)
    if (assetKey !== currentAsset && currentAsset !== null) {
      html += `
            </tbody>
          </table>
      `;
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

  return state.tasksData.filter(t => {
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
        margin: 20px 0 8px;
        padding-bottom: 4px;
        border-bottom: 2px solid #333;
        font-size: 15px;
      }

      .asset-block {
        margin: 14px 0 10px;
        padding: 8px 10px;
        background: #f6f6f6;
        border-left: 4px solid #999;
      }

      .asset-title {
        font-size: 13px;
        font-weight: 600;
      }

      .asset-sn {
        font-size: 11px;
        color: #555;
      }

      .meta {
        font-size: 12px;
        margin-bottom: 16px;
        color: #444;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        margin-bottom: 10px;
      }

      th, td {
        border: 1px solid #ddd;
        padding: 8px 10px;
        vertical-align: top;
      }

      th {
        background: #eee;
        text-align: left;
      }

      .due-col {
        width: 22%;
        white-space: nowrap;
      }

      .task-col {
        width: 78%;
      }

      .small {
        font-size: 10px;
        color: #555;
      }

      .line-footer {
        margin: 6px 0 18px;
        padding-top: 6px;
        border-top: 1px dashed #ccc;
        font-size: 11px;
        color: #666;
        text-align: right;
      }

      .report-summary {
        margin-top: 30px;
        padding-top: 12px;
        border-top: 2px solid #333;
        font-size: 12px;
      }
    </style>
  </head>
  <body>

    <h2>Overdue Maintenance Tasks</h2>

    <div class="meta">
      Line filter: ${lineFilter}<br>
      Generated: ${new Date().toLocaleDateString("en-GB")}
    </div>
`;

  let currentLine = null;
  let currentAsset = null;
  let lineCount = 0;

  sorted.forEach(t => {
    const line = t.line_code || "—";
    const assetKey = `${t.machine_name}||${t.serial_number || ""}`;
    
    // 🔒 CLOSE PREVIOUS ASSET TABLE (when line changes)
    if (line !== currentLine && currentAsset !== null) {
      html += `
            </tbody>
          </table>
      `;
      currentAsset = null;
    }

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
    // 🔒 CLOSE PREVIOUS ASSET TABLE (when asset changes)
    if (assetKey !== currentAsset && currentAsset !== null) {
      html += `
            </tbody>
          </table>
      `;
    }

    // 🟨 NEW ASSET
    if (assetKey !== currentAsset) {
      html += `
        <div class="asset-block">
          <div class="asset-title">${t.machine_name}</div>
          <div class="asset-sn">SN: ${t.serial_number || "-"}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="due-col">Due Date</th>
              <th class="task-col">Overdue Task</th>
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
/* =====================
   KPI REPORT – PRINT (1 PAGE)
   Uses: tasksData, executionsData, formatDuration()
   Filters: #dateFrom, #dateTo, #reportLine
===================== */
function generateKpiReportPdf() {
  // --------- INPUTS ----------
  const fromVal = document.getElementById("dateFrom")?.value || "";
  const toVal = document.getElementById("dateTo")?.value || "";
  const lineSel = (document.getElementById("reportLine")?.value || "all").toString();

  const fromDate = fromVal ? new Date(fromVal) : null;
  const toDate = toVal ? new Date(toVal) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --------- SAFE HELPERS ----------
  const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const safe = (v) => (v == null || v === "" ? "—" : String(v));
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

  const inRange = (d) => {
    if (!d) return false;
    const x = new Date(d);
    if (fromDate && x < fromDate) return false;
    if (toDate && x > toDate) return false;
    return true;
  };

  const sameLine = (row) => {
    if (!row) return false;
    if (lineSel === "all") return true;
    const l = (row.line_code || row.line || "").toString();
    return l === lineSel;
  };

  const isPreventiveRow = (row) =>
    row && row.frequency_hours != null && safeNum(row.frequency_hours) > 0;

  const isBreakdownExec = (row) => row && row.is_planned === false;

  const addHours = (date, hours) =>
  new Date(date.getTime() + Number(hours) * 60 * 60 * 1000);

  const countPreventiveOccurrencesInRange = (task) => {
    if (!isPreventiveRow(task) || !task.due_date) return 0;

    // Αν δεν υπάρχει επιλεγμένη περίοδος, fallback σε 1 occurrence
    // γιατί "ALL" δεν μπορεί να υπολογίσει σωστά infinite recurrence.
    if (!fromDate && !toDate) return 1;

    const freqHours = safeNum(task.frequency_hours);
    if (freqHours <= 0) return 0;

    const rangeStart = fromDate || new Date(task.due_date);
    const rangeEnd = toDate || today;

    let due = new Date(task.due_date);
    due.setHours(0, 0, 0, 0);

    // Γύρνα πίσω σε προηγούμενες επαναλήψεις μέχρι να φτάσεις στην αρχή του range
    while (addHours(due, -freqHours) >= rangeStart) {
      due = addHours(due, -freqHours);
    }

    // Do NOT go backwards before the task's known due_date.
    // due_date is treated as the first known scheduled occurrence.

    let count = 0;

    while (due <= rangeEnd) {
      if (due >= rangeStart && due <= rangeEnd) {
        count++;
      }

      due = addHours(due, freqHours);

      // safety guard
      if (count > 10000) break;
    }

    return count;
  };

  const getExecType = (e) => {
    if (isBreakdownExec(e)) return "breakdown";
    if (isPreventiveRow(e)) return "preventive";
    return "planned";
  };

  // --------- DATASETS ----------
  const allTasks = Array.isArray(state.tasksData) ? state.tasksData : [];
  const allExec = Array.isArray(state.executionsData) ? state.executionsData : [];

  // Tasks scoped (for overdue + due-in-period)
  const scopedTasks = allTasks.filter(t => sameLine(t));
  const activeTasksWithDue = scopedTasks.filter(t => t.status !== "Done" && !!t.due_date);

  const overdueTasks = activeTasksWithDue.filter(t => {
    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });

  // Preventive expected occurrences in period
  // Counts recurring preventive tasks based on frequency_hours.
  const preventiveExpectedCount = scopedTasks
    .filter(t =>
      t.status !== "Done" &&
      isPreventiveRow(t) &&
      !!t.due_date
    )
    .reduce((sum, t) => {
      return sum + countPreventiveOccurrencesInRange(t);
    }, 0);

  // Executions scoped + period
  const scopedExecPeriod = allExec
    .filter(e => {
      if (lineSel === "all") return true;
      return (e.line || "").toString() === lineSel;
    })
    .filter(e => inRange(e.executed_at));

  if (scopedExecPeriod.length === 0 && activeTasksWithDue.length === 0) {
    alert("No KPI data found for selected criteria");
    return;
  }

  // Completed preventive in period (from executions)
  const preventiveCompleted = scopedExecPeriod.filter(e => getExecType(e) === "preventive");

  // Mix (period)
  const breakdownExec = scopedExecPeriod.filter(e => getExecType(e) === "breakdown");
  const plannedExec = scopedExecPeriod.filter(e => getExecType(e) === "planned");

  // Service time (period) from executions.duration_min
  const totalServiceMin = scopedExecPeriod.reduce((sum, e) => sum + safeNum(e.duration_min), 0);
  const avgServiceMin = scopedExecPeriod.length ? Math.round(totalServiceMin / scopedExecPeriod.length) : 0;

  // Top line impact (ONLY meaningful when scope=ALL)
  let topLine = "—";
  let topLineMin = 0;
  if (lineSel === "all") {
    const map = new Map(); // line -> minutes
    scopedExecPeriod.forEach(e => {
      const l = (e.line || "—").toString();
      map.set(l, (map.get(l) || 0) + safeNum(e.duration_min));
    });
    for (const [l, m] of map.entries()) {
      if (m > topLineMin) {
        topLineMin = m;
        topLine = l;
      }
    }
  } else {
    topLine = lineSel.toUpperCase();
    topLineMin = totalServiceMin;
  }

  // KPIs
  const overdueCount = overdueTasks.length;
  const overdueRate = pct(overdueCount, activeTasksWithDue.length);

  const prevDueCount = preventiveExpectedCount;
  const prevCompletedCount = preventiveCompleted.length;

  // Compliance should never display above 100%.
  // Extra executions are good, but not >100 compliance.
  const prevComplianceRaw = pct(prevCompletedCount, prevDueCount);
  const prevCompliance = Math.min(100, prevComplianceRaw);
  const preventiveExtraCount = Math.max(0, prevCompletedCount - prevDueCount);

  const execTotal = scopedExecPeriod.length;
  const breakdownCount = breakdownExec.length;

  const prevPct = pct(prevCompletedCount, execTotal);
  const plannedPct = pct(plannedExec.length, execTotal);
  const breakdownPct = pct(breakdownCount, execTotal);
// =====================
// MTTR per Asset (Top offenders)
// =====================
const mttrByAssetMap = new Map();

breakdownExec.forEach(e => {
  const key = `${e.machine}||${e.serial_number || "—"}||${e.line || "—"}`;
  const curr = mttrByAssetMap.get(key) || {
    machine: e.machine,
    serial: e.serial_number || "—",
    line: e.line || "—",
    totalMin: 0,
    count: 0
  };

  curr.totalMin += safeNum(e.duration_min);
  curr.count += 1;
  mttrByAssetMap.set(key, curr);
});

const mttrTopAssets = [...mttrByAssetMap.values()]
  .map(a => ({
    ...a,
    mttr: a.count ? Math.round(a.totalMin / a.count) : 0
  }))
  .filter(a => a.mttr > 0)
  .sort((a, b) => b.mttr - a.mttr)
  .slice(0, 5);


  // Insights (max 3)
  const insights = [];
  if (prevDueCount > 0 && prevCompliance < 90) {
    insights.push(`Preventive compliance below target (${prevCompliance}%).`);
  }
  if (overdueRate >= 10) {
    insights.push(`Overdue rate is ${overdueRate}%, review scheduling & staffing.`);
  }
  if (breakdownPct >= 25) {
    insights.push(`Breakdown ratio is high (${breakdownPct}%) — consider RCA / preventive reinforcement.`);
  }
  // top-line share insight (only for ALL)
  if (lineSel === "all" && totalServiceMin > 0 && topLineMin > 0) {
    const share = pct(topLineMin, totalServiceMin);
    if (share >= 35) insights.push(`Line ${topLine} accounts for ${share}% of service time.`);
  }
  const finalInsights = insights.slice(0, 3);

  const periodLabel =
    fromVal || toVal ? `${fromVal || "—"} → ${toVal || "—"}` : "ALL";

  const scopeLabel = lineSel === "all" ? "ALL LINES" : `LINE ${lineSel.toUpperCase()}`;
  // 🔹 KPI Status Flags
const overdueStatus =
  overdueRate >= 15 ? "🔴 Critical"
  : overdueRate >= 5 ? "🟠 Attention"
  : "🟢 Healthy";

const complianceStatus =
  prevCompliance >= 95 ? "🟢 Excellent"
  : prevCompliance >= 85 ? "🟠 Acceptable"
  : "🔴 At Risk";

const breakdownStatus =
  breakdownPct >= 30 ? "🔴 Reactive"
  : breakdownPct >= 15 ? "🟠 Monitor"
  : "🟢 Controlled";
  // 🔹 Maintenance Maturity Score (0–100)
let maturityScore = 100;

maturityScore -= overdueRate * 0.5;
maturityScore -= breakdownPct * 0.7;
maturityScore += (prevCompliance - 80) * 0.3;

maturityScore = Math.max(0, Math.min(100, Math.round(maturityScore)));

const maturityLevel =
  maturityScore >= 85 ? "🟢 Optimized"
  : maturityScore >= 65 ? "🟠 Controlled"
  : "🔴 Reactive";


  // --------- HTML ----------
  const html = `
<html>
<head>
  <title>Maintenance KPI Report</title>
  <style>
    @page { size: A4; margin: 15mm; }

    body {
      font-family: Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
      font-size: 12px;
    }

    h1 {
      font-size: 18px;
      margin: 0 0 6px;
      letter-spacing: .2px;
    }

    .meta {
      color: #555;
      font-size: 11px;
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }

    .card {
      border: 1px solid #d6d6d6;
      border-radius: 10px;
      padding: 10px 12px;
    }

    .kpi-title {
      font-size: 11px;
      color: #555;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
    }

    .kpi-sub {
      margin-top: 6px;
      color: #444;
      font-size: 11px;
      line-height: 1.4;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
    }

    .label { color: #666; }
    .value { font-weight: 700; }

    .mix {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }

    .divider {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #cfcfcf;
    }

    .insights {
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      padding: 10px 12px;
      color: #333;
      margin-bottom: 10px;
    }

    .insights h3 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .insights ul {
      margin: 0;
      padding-left: 16px;
    }

    .footer {
      margin-top: 10px;
      color: #777;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px solid #d9d9d9;
      padding-top: 8px;
    }

    .end-divider {
      margin-top: 8px;
      text-align: center;
      color: #8a8a8a;
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>

  <h1>Maintenance KPI Report</h1>
  <div class="meta">
    <div><strong>Period:</strong> ${periodLabel}</div>
    <div><strong>Scope:</strong> ${scopeLabel}</div>
    <div><strong>Generated:</strong> ${new Date().toLocaleDateString("el-GR")}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="kpi-title">Overdue Performance</div>
      <div class="kpi-value">${overdueCount}</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Overdue rate</span><span class="value">${overdueRate}%</span></div>
        <div class="row"><span class="label">Active tasks (with due)</span><span class="value">${activeTasksWithDue.length}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="kpi-title">Preventive Compliance • ${complianceStatus}</div>
      <div class="kpi-value">${prevCompliance}%</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Preventive expected</span><span class="value">${prevDueCount}</span></div>
        <div class="row"><span class="label">Preventive completed</span><span class="value">${prevCompletedCount}</span></div>
        ${preventiveExtraCount > 0 ? `
        <div class="row">
          <span class="label">Extra preventive executions</span>
          <span class="value">${preventiveExtraCount}</span>
        </div>
      ` : ""}
      </div>
    </div>

    <div class="card">
      <div class="kpi-title">Maintenance Mix</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Preventive</span><span class="value">${prevPct}%</span></div>
        <div class="row"><span class="label">Planned (manual)</span><span class="value">${plannedPct}%</span></div>
        <div class="row"><span class="label">Breakdown</span><span class="value">${breakdownPct}%</span></div>
      </div>
      <div class="divider kpi-sub">
        <div class="row"><span class="label">Executions (period)</span><span class="value">${execTotal}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="kpi-title">Service Time</div>
      <div class="kpi-value">${formatDuration(totalServiceMin)}</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Average per execution</span><span class="value">${avgServiceMin} min</span></div>
        <div class="row"><span class="label">Data source</span><span class="value">executions.duration_min</span></div>
      </div>
    </div>

    <div class="card">
      <div class="kpi-title">Top Line Impact</div>
      <div class="kpi-value">${safe(topLine)}</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Service time</span><span class="value">${formatDuration(topLineMin)}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="kpi-title">Execution Volume</div>
      <div class="kpi-value">${execTotal}</div>
      <div class="kpi-sub">
        <div class="row"><span class="label">Breakdowns</span><span class="value">${breakdownCount}</span></div>
        <div class="row"><span class="label">Non-breakdown</span><span class="value">${execTotal - breakdownCount}</span></div>
      </div>
    </div>
    ${mttrTopAssets.length ? `
  <div class="card" style="margin-top:10px;">
    <div class="kpi-title">Top 5 Assets by MTTR (Breakdowns)</div>

    <table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead>
        <tr style="background:#eee;">
          <th style="text-align:left; padding:6px;">Asset</th>
          <th style="text-align:left; padding:6px;">Line</th>
          <th style="text-align:center; padding:6px;">Breakdowns</th>
          <th style="text-align:right; padding:6px;">MTTR</th>
        </tr>
      </thead>
      <tbody>
        ${mttrTopAssets.map(a => `
          <tr>
            <td style="padding:6px;">
              <strong>${a.machine}</strong><br>
              <span style="font-size:10px; color:#666;">SN: ${a.serial}</span>
            </td>
            <td style="padding:6px;">${a.line}</td>
            <td style="padding:6px; text-align:center;">${a.count}</td>
            <td style="padding:6px; text-align:right;">
              <strong>${formatDuration(a.mttr)}</strong>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>    
` : ""}
<div class="card">
      <div class="kpi-title">Maintenance Health Index</div>
      <div class="kpi-value">${maturityScore}/100</div>
      <div class="kpi-sub">
        <div class="row">
          <span class="label">Maturity Level</span>
          <span class="value">${maturityLevel}</span>
        </div>
      </div>
    </div>

  </div>
    <div class="insights">
      <h3>Insights</h3>
      ${
        finalInsights.length
          ? `<ul>${finalInsights.map(x => `<li>${x}</li>`).join("")}</ul>`
          : `<div style="color:#666;">No notable exceptions detected for the selected scope.</div>`
      }
    </div>

  <div class="footer">
    <div>ASTIR CMMS • KPI Report</div>
    <div>${scopeLabel}</div>
  </div>

  <div class="end-divider">End of Report</div>

</body>
</html>
`;

  // --------- PRINT VIA HIDDEN IFRAME (no new tab) ----------
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

function generateMttrBarChart(mttrLineRows) {
  const max = Math.max(...mttrLineRows.map(r => r.avg), 1);

  return `
    <svg width="500" height="250">
      ${mttrLineRows.map((r, i) => {
        const barHeight = (r.avg / max) * 150;
        const x = 80 + i * 120;
        const y = 200 - barHeight;

        return `
          <rect x="${x}" y="${y}" width="60" height="${barHeight}" fill="#1976d2" />
          <text x="${x + 30}" y="220" text-anchor="middle" font-size="12">
            ${r.line}
          </text>
          <text x="${x + 30}" y="${y - 5}" text-anchor="middle" font-size="12">
            ${r.avg}m
          </text>
        `;
      }).join("")}
    </svg>
  `;
}

