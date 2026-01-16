// ASTIR CMMS UI v2 - Supervisor Dashboard
console.log("APP.JS LOADED");

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let assetsData = [];
// =====================
// TASKS – DATE RANGE STATE
// =====================
let taskDateFrom = null;
let taskDateTo = null;

//let activeLine = "all";
let pendingTaskId = null;
let pendingSnapshotJson = null;
let loadedSnapshotName = null;
let importExcelFile = null;
let activeDateFilter = "all";
let activeAssetFilter = "all";
let executionsData = [];
let dueDateFrom = null; // Date | null
let dueDateTo = null;   // Date | null
// =====================
// HISTORY FILTER STATE
// =====================
let historyDateRange = 7;
let historyMachineQuery = "";
let historyTechnicianQuery = "";
let historyTypeFilter = "all";
// =====================
// EDIT BREAKDOWN STATE
// =====================
let editingBreakdownId = null;


/* =====================
   Helpers
===================== */

const getEl = id => document.getElementById(id);

function norm(v) {
  return (v ?? "").toString().trim().toUpperCase();
}

function taskLine(t) {
  return (t.line_code || "").toString().trim().toUpperCase();
}

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("el-GR");
}
function isPreventive(task) {
  return task.frequency_hours && Number(task.frequency_hours) > 0;
}

function isUnplanned(task) {
  return task.is_planned === false;
}

function isPlannedManual(task) {
  return (
    !isPreventive(task) &&
    !isUnplanned(task) &&
    !!task.due_date &&
    task.status !== "Done"
  );
}
let currentViewedTask = null;

function canEditTask(task) {
  return (
    task.status === "Planned" &&
    !task.frequency_hours &&   // όχι preventive
    !!task.due_date            // planned manual
  );
}

/* =====================
   DATE TIME FORMATTER
===================== */
function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("el-GR");
}
/* =====================
   DATE ONLY FORMATTER
===================== */
function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("el-GR");
}

function diffDays(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function getDueState(t) {
  if (t.status === "Done") return "done";
  if (!t.due_date) return "unknown";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);

  const d = diffDays(today, due);
  if (d < 0) return "overdue";
  if (d <= 7) return "soon";
  return "ok";
}

/* =====================
   CURRENT USER (DEV)
===================== */
const CURRENT_USER = {
  name: "Dev User",
  role: "planner" // technician | planner | admin
};


/* =====================
   ROLE HELPERS
===================== */
function hasRole(...roles) {
  return roles.includes(CURRENT_USER.role);
}


/* =====================
   DEV LOGIN AS ROLE
===================== */
function loginAsRole() {
   console.log("LOGIN CLICKED");

  const role = document.getElementById("roleSelect").value;

  CURRENT_USER.role = role;

  // Re-apply UI visibility
  applyRoleVisibility();

  alert(`Logged in as ${role}`);
}

document.getElementById("loginAsRoleBtn")
  ?.addEventListener("click", loginAsRole);

// =====================
// SHOW LAST RESTORED SNAPSHOT
// =====================
const last = localStorage.getItem("lastRestoredSnapshot");
const statusEl = document.getElementById("snapshotStatus");

if (statusEl && last) {
  statusEl.textContent = `Last restored: ${last}`;
  statusEl.classList.add("loaded");
}

/* =====================
   Date Filters
===================== */

function applyDateFilter(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return tasks.filter(t => {
    if (!t.due_date) return false;

    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);

    switch (activeDateFilter) {
      case "today":
        return due.getTime() === today.getTime();

      case "week":
        return due >= today && due <= weekEnd;

      case "overdue":
        return due < today;

      default: // "all"
        return true;
    }
  });
}

/* =====================
    SEARCH HIGHLIGHT
===================== */

function highlight(text, q) {
  if (!q) return text || "";
  if (!text) return "";

  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
  const regex = new RegExp(`(${safeQ})`, "gi");

  return text.toString().replace(
    regex,
    `<span class="search-highlight">$1</span>`
  );
}

// =====================
// PRINT WORK ORDER (CURRENT VIEWED TASK)
// =====================

function printCurrentTask() {
  if (!currentViewedTask) return;

  const t = currentViewedTask;

  const safe = (v) => (v == null || v === "" ? "-" : String(v));
  const fmtDate = (d) => (d ? formatDate(d) : "-");

  const maintenanceType =
    isPreventive(t) ? "Preventive (Scheduled)" :
    isPlannedManual(t) ? "Planned (Manual)" :
    "Unplanned / Breakdown";

  // NOTE: Αν θες να τυπώνεται Ο,ΤΙ βλέπει ο χρήστης, μπορείς να πάρεις και innerHTML από taskViewContent,
  // αλλά αυτό είναι πιο "clean" / professional template (stable).

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Work Order #${safe(t.id)}</title>
  <style>
    /* --- PRINT THEME (professional, printable) --- */
    @page { size: A4; margin: 14mm; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .sheet { max-width: 780px; margin: 0 auto; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #111;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .brand {
      font-size: 11px;
      letter-spacing: .12em;
      text-transform: uppercase;
      opacity: .8;
    }
    .title {
      font-size: 18px;
      font-weight: 750;
      margin-top: 2px;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      line-height: 1.5;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #111;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 650;
      margin-top: 6px;
    }

    .grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 6px 14px;
      font-size: 12px;
      margin: 12px 0 14px;
    }
    .k { color: #333; font-weight: 650; }
    .v { color: #111; }

    .section {
      margin-top: 12px;
      border: 1px solid #111;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .section h3 {
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .text {
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .sign {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }
    .box {
      border: 1px dashed #333;
      border-radius: 10px;
      padding: 10px 12px;
      min-height: 70px;
      font-size: 12px;
    }
    .box strong { display:block; margin-bottom: 6px; }

    .footer {
      margin-top: 12px;
      font-size: 11px;
      opacity: .8;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    /* hide buttons/links if any */
    button, a { display: none !important; }
  </style>
</head>
<body>
  <div class="sheet">

    <div class="top">
      <div>
        <div class="brand">ASTIR CMMS • WORK ORDER</div>
        <div class="title">${safe(t.task)}</div>
        <div class="pill">${maintenanceType}</div>
      </div>
      <div class="meta">
        <div><strong>WO ID:</strong> ${safe(t.id)}</div>
        <div><strong>Status:</strong> ${safe(t.status)}</div>
        <div><strong>Due:</strong> ${fmtDate(t.due_date)}</div>
        <div><strong>Printed:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>

    <div class="grid">
      <div class="k">Asset</div><div class="v">${safe(t.machine_name)}</div>
      <div class="k">Serial No</div><div class="v">${safe(t.serial_number)}</div>
      <div class="k">Line</div><div class="v">${safe(t.line_code || t.line)}</div>
      <div class="k">Section</div><div class="v">${safe(t.section)}</div>
      <div class="k">Unit</div><div class="v">${safe(t.unit)}</div>
      <div class="k">Task Type</div><div class="v">${safe(t.type || "Maintenance Task")}</div>
      <div class="k">Frequency</div><div class="v">${t.frequency_hours ? safe(t.frequency_hours) + " h" : "-"}</div>
      <div class="k">Duration</div><div class="v">${t.duration_min ? safe(t.duration_min) + " min" : "-"}</div>
      <div class="k">Technician</div><div class="v">${safe(t.technician || t.completed_by)}</div>
    </div>

    <div class="section">
      <h3>Description</h3>
      <div class="text">${safe(t.task)}</div>
    </div>

    <div class="section">
      <h3>Notes</h3>
      <div class="text">${safe(t.notes)}</div>
    </div>

    <div class="sign">
      <div class="box">
        <strong>Execution / Findings</strong>
        ________________________________________________<br><br>
        ________________________________________________<br><br>
        ________________________________________________
      </div>
      <div class="box">
        <strong>Sign-Off</strong>
        <div><strong>Executed By:</strong> __________________________</div>
        <div><strong>Date:</strong> _________________________________</div>
        <div><strong>Supervisor:</strong> ___________________________</div>
      </div>
    </div>

    <div class="footer">
      <div>Asset: ${safe(t.machine_name)} • SN: ${safe(t.serial_number)}</div>
      <div>WO #${safe(t.id)}</div>
    </div>

  </div>

  <script>
    window.addEventListener('load', () => {
      window.focus();
      window.print();
      setTimeout(() => window.close(), 250);
    });
  </script>
</body>
</html>
`;

  const w = window.open(`/api/tasks/${currentViewedTask.id}/print`, "_blank");

  if (!w) {
    alert("Popup blocked. Please allow popups to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}


/* =====================
   TASK TABLE
===================== */

function statusPill(task) {
  const st = getDueState(task);

  let cls = "status-pill";
  let txt = "Planned";

  if (task.status === "Done") {
    cls += " status-done";
    txt = "Done";
  } 
  else if (st === "overdue") {
    cls += " status-overdue";
    txt = "Overdue";
  } 
  else if (st === "soon") {
    cls += " status-soon";
    txt = "Due Soon";
  } 
  else {
    // ⭐ ΕΔΩ Η ΔΙΟΡΘΩΣΗ
    cls += " status-planned";
    txt = "Planned";
  }

  return `<span class="${cls}">${txt}</span>`;
}

function buildRow(task) {
  const tr = document.createElement("tr");

  // 🔍 search query
  const q = document.getElementById("taskSearch")?.value || "";

  /* =====================================
     TASK TYPE CLASSIFICATION (SAFE)
  ===================================== */

  let rowClass = "";

  // 🟦 Preventive (Excel master plan)
  if (task.frequency_hours && Number(task.frequency_hours) > 0) {
    rowClass = "task-preventive";
  }
  // 🟥 Unplanned (manual, finished immediately)
  else if (task.is_planned === false || task.status === "Done") {
    rowClass = "task-unplanned";
  }
  // 🟨 Planned manual
  else {
    rowClass = "task-planned-manual";
  }

  tr.classList.add(rowClass);

  tr.innerHTML = `
    <!-- MACHINE / ASSET -->
    <td class="machine-cell">
      <div class="machine-name">${highlight(task.machine_name || "", q)}</div>
      ${
        task.serial_number
          ? `<div class="machine-sn"><small>${highlight(task.serial_number, q)}</small></div>`
          : ""
      }
    </td>

    <!-- SECTION -->
    <td>${task.section ? highlight(task.section, q) : "-"}</td>
    <!-- UNIT -->
    <td>${task.unit ? highlight(task.unit, q) : "-"}</td>

    <!-- TASK -->
    <td>${highlight(task.task || "", q)}</td>

    <!-- TYPE -->
    <td>${task.type ? highlight(task.type, q) : "-"}</td>

    <!-- DATE -->
    <td>${
      task.status === "Done"
        ? "Completed: " + formatDate(task.completed_at)
        : formatDate(task.due_date)
    }</td>

    <!-- STATUS -->
    <td>${statusPill(task)}</td>

    <!-- ACTIONS -->
<td>
  <div class="history-action-group">
    
    <!-- 👁 View task -->
    <button
      class="btn-icon btn-view"
      title="View task details"
      onclick="viewTask(${task.id})">
      👁
    </button>

    <!-- ✔ Mark as Done (only if not Done) -->
    ${
      task.status !== "Done"
        ? `
          <button
            class="btn-icon btn-done"
            title="Mark task as completed"
            onclick="askTechnician(${task.id})">
            ✔
          </button>
        `
        : ``
    }

  </div>
</td>

  `;

  return tr;
}


/* =====================
   LOAD TASK HISTORY
===================== */
async function loadHistory() {
  try {
    const res = await fetch(`${API}/executions`);
    executionsData = await res.json();   // 👈 ΚΡΙΣΙΜΟ: cache για reports
    console.log("HISTORY DATA:", executionsData);

    renderHistoryTable(executionsData);
  } catch (err) {
    console.error("LOAD HISTORY ERROR:", err);
  }
}

function getExecutionType(h) {
  // 🔴 Unplanned (manual breakdowns)
  if (h.is_planned === false) return "unplanned";

  // 🟢 Preventive (Excel / frequency based)
  if (h.frequency_hours && Number(h.frequency_hours) > 0) return "preventive";

  // 🔵 Manual Planned (no frequency)
  return "planned";
}
/* =====================
    PRINT History TASK
===================== */
function printExecution(executionId) {
  window.open(`${API}/api/executions/${executionId}/print`, "_blank");
}


/* =====================
   Render HISTORY table
===================== */

function wasEditedAfterExecution(h) {
  if (!h.updated_at || !h.executed_at) return false;
  return new Date(h.updated_at) > new Date(h.executed_at);
}

function renderHistoryTable(data) {
  const tbody = document.querySelector("#historyTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const fromDate =
    historyDateRange === "all"
      ? null
      : new Date(
          now.getTime() -
            Number(historyDateRange) * 24 * 60 * 60 * 1000
        );

  data
    // 📅 DATE FILTER
    .filter(h => {
      if (!fromDate) return true;
      const exec = new Date(h.executed_at);
      return exec >= fromDate;
    })

    // 🔍 MACHINE / SERIAL FILTER
    .filter(h => {
      if (!historyMachineQuery) return true;
      const txt = `${h.machine} ${h.serial_number || ""}`.toLowerCase();
      return txt.includes(historyMachineQuery);
    })

    // 🧩 TYPE FILTER
    .filter(h => {
      if (historyTypeFilter === "all") return true;
      const execType = getExecutionType(h);
      return execType === historyTypeFilter;
    })

    // 👤 TECHNICIAN FILTER
    .filter(h => {
      if (!historyTechnicianQuery) return true;
      return (h.executed_by || "")
        .toLowerCase()
        .includes(historyTechnicianQuery);
    })

    // ⬇️ RENDER ROWS
    .forEach(h => {
      const tr = document.createElement("tr");

      const execType = getExecutionType(h);
      tr.classList.add(`history-${execType}`);

      /* =====================
         ACTIONS (SAFE UX)
      ===================== */
      let actionHtml = `<span class="muted">—</span>`;

      // 🟩 Preventive & 🟨 Planned → View + Restore + Print
      if (execType === "planned" || execType === "preventive") {
        actionHtml = `
          <div class="history-action-group">
            <button
              class="btn-icon btn-view"
              title="View details"
              onclick="viewHistoryEntry(${h.id})">
              👁
            </button>
            
            <button
              class="btn-icon btn-restore"
              title="Restore task"
              onclick="undoExecution(${h.id})">
              ↩
            </button>

            <button
              class="btn-icon btn-print"
              title="Print job report"
              onclick="printExecution(${h.id})">
              🖨
            </button>

          </div>
        `;
      }

      // 🟥 Unplanned / Breakdown → View + Edit + Print
      else if (execType === "unplanned") {
        actionHtml = `
          <div class="history-action-group">
            <button
              class="btn-icon btn-view"
              title="View breakdown details"
              onclick="viewHistoryEntry(${h.id})">
              👁
            </button>
            
            <button
              class="btn-icon btn-edit"
              title="Edit breakdown details"
              onclick="editBreakdown(${h.id})">
              ✏️
            </button>

            <button
              class="btn-icon btn-print"
              title="Print job report"
              onclick="printExecution(${h.id})">
              🖨
            </button>
          </div>
        `;
      }

      // ✏️ Edited badge
      const editedBadge = wasEditedAfterExecution(h)
        ? `<span class="badge-edited" title="Edited after execution">✏️ Edited</span>`
        : "";

      tr.innerHTML = `
        <td title="${formatDateTime(h.executed_at)}">
          ${formatDateOnly(h.executed_at)}
        </td>

        <td>
          <strong>${h.machine}</strong><br>
          <small>SN: ${h.serial_number} | ${h.line}</small>
        </td>

        <td>
          <div class="task-title">
            <strong>${h.task}</strong> 
          </div>
          <small>
            ${h.section || ""}
            ${h.section && h.unit ? " / " : ""}
            ${h.unit || ""}
            ${editedBadge}
          </small>
        </td>

        <td>${h.executed_by || "-"}</td>

        <td>${actionHtml}</td>
      `;

      tbody.appendChild(tr);
    });
}

// =====================
// VIEW HISTORY ENTRY
// =====================
function viewHistoryEntry(executionId) {
  const h = executionsData.find(e => e.id === executionId);
  if (!h) return;

  const el = document.getElementById("historyViewContent");

  el.innerHTML = `
    <div class="history-view-section">
      <strong>Date</strong>
      <div>${formatDateTime(h.executed_at)}</div>
    </div>

    <div class="history-view-section">
      <strong>Asset</strong>
      <div>
        ${h.machine}<br>
        <small>SN: ${h.serial_number} • Line ${h.line}</small>
      </div>
    </div>

    <div class="history-view-section">
      <strong>Task</strong>
      <div>${h.task}</div>
    </div>

    <div class="history-view-section">
      <strong>Details</strong>
      <div>
        ${h.section || "-"} ${h.unit ? " / " + h.unit : ""}
      </div>
    </div>

    <div class="history-view-section">
      <strong>Executed By</strong>
      <div>${h.executed_by || "-"}</div>
    </div>

    <div class="history-view-section">
      <strong>Notes</strong>
      <div>${h.notes || "-"}</div>
    </div>
  `;

  document.getElementById("historyViewOverlay").style.display = "flex";
}
function closeHistoryView() {
  document.getElementById("historyViewOverlay").style.display = "none";
}


function editBreakdown(id) {
  alert("Breakdown edit coming next (id: " + id + ")");
}

   /* =====================
    HISTORY FILTER HANDLERS
   ===================== */

document.getElementById("historyDateFilter")?.addEventListener("change", e => {
  historyDateRange = e.target.value;
  renderHistoryTable(executionsData);
});

document.getElementById("historyMachineSearch")?.addEventListener("input", e => {
  historyMachineQuery = e.target.value.toLowerCase();
  renderHistoryTable(executionsData);
});
document.getElementById("historyTypeFilter")?.addEventListener("change", e => {
    historyTypeFilter = e.target.value;
    renderHistoryTable(executionsData);
  });

document.getElementById("historyTechnicianSearch")?.addEventListener("input", e => {
  historyTechnicianQuery = e.target.value.toLowerCase();
  renderHistoryTable(executionsData);
});


/* =====================
   KPIs
===================== */

function updateKpis() {
  let overdue = 0, soon = 0, done = 0;

  tasksData.forEach(t => {
    if (t.status === "Done") return done++;
    const st = getDueState(t);
    if (st === "overdue") overdue++;
    if (st === "soon") soon++;
  });

  getEl("kpiTotal").textContent = tasksData.length;
  getEl("kpiOverdue").textContent = overdue;
  getEl("kpiSoon").textContent = soon;
  getEl("kpiDone").textContent = done;
}

/* =====================
   DASHBOARD – KPI API
===================== */

async function fetchCompletedCount() {
  const res = await fetch(`${API}/executions/count`);
  const data = await res.json();
  return data.completed || 0;
}

async function fetchOpenTasks() {
  const res = await fetch(`${API}/tasks`);
  return await res.json(); // planned + overdue
}

async function fetchExecutions() {
  const res = await fetch(`${API}/executions`);
  return await res.json();
}

function calculateKPIs({ tasks, executions }) {
  const now = new Date();

  const openTasks = tasks.length;

  const overdueTasks = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < now
  ).length;

  const breakdowns30d = executions.filter(e => {
    if (e.is_planned !== false) return false;
    const d = new Date(e.executed_at);
    return (now - d) / (1000 * 60 * 60 * 24) <= 30;
  }).length;

  return {
    openTasks,
    overdueTasks,
    breakdowns30d
  };
}
/* =====================
   DASHBOARD KPIs
===================== */

async function loadDashboardKPIs() {
  try {
    // 1️⃣ Fetch active tasks (Planned + Overdue)
    const tasksRes = await fetch(`${API}/tasks`);
    const tasks = await tasksRes.json();

    const now = new Date();
    const soonLimit = new Date();
    soonLimit.setDate(now.getDate() + 7);

    let total = 0;
    let overdue = 0;
    let soon = 0;

    tasks.forEach(t => {
      total++;

      if (t.status === "Overdue") {
        overdue++;
      }

      if (t.status === "Planned" && t.due_date) {
        const due = new Date(t.due_date);
        if (due <= soonLimit) {
          soon++;
        }
      }
    });

    // 2️⃣ Fetch completed count (history)
    const doneRes = await fetch(`${API}/executions/count`);
    const doneData = await doneRes.json();
    const completed = doneData.completed || 0;

    // 3️⃣ Update DOM (safe)
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("kpiTotal", total);
    set("kpiOverdue", overdue);
    set("kpiSoon", soon);
    set("kpiDone", completed);

  } catch (err) {
    console.error("KPI LOAD ERROR:", err);
  }
  // 4️⃣ KPI coloring
    const cardTotal = document.getElementById("kpiTotal")?.closest(".kpi-card");
    const cardOverdue = document.getElementById("kpiOverdue")?.closest(".kpi-card");
    const cardSoon = document.getElementById("kpiSoon")?.closest(".kpi-card");
    const cardDone = document.getElementById("kpiDone")?.closest(".kpi-card");

setKpiClass(cardOverdue, colorOverdue(overdue));
setKpiClass(cardSoon, colorSoon(soon));
setKpiClass(cardDone, colorCompleted(completed));
}

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  loadDashboardKPIs();
});

/* =====================
   KPI COLORING HELPERS
===================== */

function setKpiClass(el, cls) {
  if (!el) return;
  el.classList.remove("kpi-ok", "kpi-warn", "kpi-bad");
  if (cls) el.classList.add(cls);
}

function colorOverdue(val) {
  if (val === 0) return "kpi-ok";
  if (val <= 3) return "kpi-warn";
  return "kpi-bad";
}

function colorSoon(val) {
  if (val <= 3) return "kpi-ok";
  if (val <= 7) return "kpi-warn";
  return "kpi-bad";
}

function colorCompleted(val) {
  return val > 0 ? "kpi-ok" : null;
}


/* =====================
   POPULATE ADD TASK LINES
===================== */
function populateAddTaskLines() {
  const sel = document.getElementById("nt-line");
  if (!sel) return;

  sel.innerHTML = `<option value="">Select Line</option>`;

  if (!Array.isArray(assetsData)) return;

  const lines = [...new Set(
    assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    sel.appendChild(opt);
  });
}
/* =====================
   POPULATE ASSETS BY LINE (ADD TASK)
===================== */
document.getElementById("nt-line")?.addEventListener("change", e => {
  const line = e.target.value;
  const assetSel = document.getElementById("nt-asset");
  if (!assetSel) return;

  assetSel.innerHTML = `<option value="">Select Asset</option>`;
  assetSel.disabled = true;

  if (!line) return;

  const filtered = assetsData.filter(a => a.line === line);

  filtered.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.model} (${a.serial_number})`;
    assetSel.appendChild(opt);
  });

  assetSel.disabled = false;
});


/* =====================
   VIEW TASK MODAL
===================== */

function viewTask(taskId) {
  const task = tasksData.find(t => t.id === taskId);
  if (!task) return;

  const el = document.getElementById("taskViewContent");

  // =====================
  // PRINT BUTTON
  // =====================
  const printBtn = document.getElementById("printTaskBtn");
  if (printBtn) {
    printBtn.style.display = "inline-flex";
    printBtn.onclick = () => printTask(task.id);
  }

  el.innerHTML = `

<!-- =====================
     TECHNICAL TASK VIEW
===================== -->

<!-- ASSET CONTEXT -->
<div class="task-view-asset tech">
  <div class="asset-main">
    🏭 ${task.machine_name}
  </div>
  <div class="asset-sub">
    ${task.serial_number ? `SN: ${task.serial_number}` : ""}
    • Line ${task.line_code}
  </div>
</div>

<!-- WORK ORDER TITLE -->
<div class="task-view-title tech">
  ${task.task}
</div>

<!-- STATUS / TYPE -->
<div class="task-view-meta tech">
  <span class="badge badge-type">
    ${task.type || "Maintenance Task"}
  </span>
  <span class="badge badge-status">
    ${task.status}
  </span>
  ${
    task.due_date
      ? `<span class="badge badge-date">
           Due: ${formatDate(task.due_date)}
         </span>`
      : ``
  }
</div>

<!-- TECHNICAL DETAILS -->
<div class="task-view-details tech">

  <div>
    <label>Section</label>
    <div>${task.section || "-"}</div>
  </div>

  <div>
    <label>Unit</label>
    <div>${task.unit || "-"}</div>
  </div>

  <div>
    <label>Maintenance Type</label>
    <div>
      ${
        isPreventive(task)
          ? "Preventive (Scheduled)"
          : isPlannedManual(task)
          ? "Planned (Manual)"
          : "Unplanned / Breakdown"
      }
    </div>
  </div>

  <div>
    <label>Frequency</label>
    <div>
      ${task.frequency_hours ? task.frequency_hours + " h" : "-"}
    </div>
  </div>

  <div>
    <label>Estimated Duration</label>
    <div>
      ${task.duration_min ? task.duration_min + " min" : "-"}
    </div>
  </div>

</div>

<!-- COMPLETION INFO -->
${
  task.status === "Done"
    ? `
<div class="task-view-completed tech">
  ✔ Completed<br>
  <span>
    Executed by <strong>${task.completed_by || "-"}</strong>
  </span>
  <span>
    • ${task.completed_at ? formatDate(task.completed_at) : ""}
  </span>
</div>
`
    : ""
}

`;

  document.getElementById("taskViewOverlay").style.display = "flex";

  // =====================
  // EDIT / DELETE VISIBILITY
  // =====================
  currentViewedTask = task;

  const editBtn = document.getElementById("editTaskBtn");
  const deleteBtn = document.getElementById("deleteTaskBtn");
  const editArea = document.getElementById("taskEditArea");

  if (canEditTask(task)) {
    editBtn.style.display = "inline-flex";
    deleteBtn.style.display = "inline-flex";
    editArea.style.display = "none";
  } else {
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
    editArea.style.display = "none";
  }

  // =====================
  // FOLLOW-UP BUTTON IN ACTION BAR (ALIGN WITH OTHER ACTIONS)
  // =====================
  const followupBtn = document.getElementById("createFollowupTaskBtn");

  if (
    followupBtn &&
    hasRole("planner", "admin") &&
    task.status !== "Done" &&
    (isPreventive(task) || isPlannedManual(task))
  ) {
    followupBtn.style.display = "inline-flex";
  } else if (followupBtn) {
    followupBtn.style.display = "none";
  }
}


// =====================
// TASK EDITING (COLLAPSE / EXPAND) — SAFE
// =====================

function enableTaskEdit() {
  if (!currentViewedTask) return;

  const t = currentViewedTask;

  // Fill edit fields (guarded)
  const descEl = document.getElementById("edit-task-desc");
  if (descEl) descEl.value = t.task || "";

  const typeEl = document.getElementById("edit-task-type");
  if (typeEl) typeEl.value = t.type || "";

  const secEl = document.getElementById("edit-task-section");
  if (secEl) secEl.value = t.section || "";

  const unitEl = document.getElementById("edit-task-unit");
  if (unitEl) unitEl.value = t.unit || "";

  const dueEl = document.getElementById("edit-task-due");
  if (dueEl) dueEl.value = t.due_date ? String(t.due_date).split("T")[0] : "";

  const notesEl = document.getElementById("edit-task-notes");
  if (notesEl) notesEl.value = t.notes || "";

  // Show edit area
  const editArea = document.getElementById("taskEditArea");
  if (editArea) editArea.style.display = "block";

  // (Optional) scroll into view (safe)
  if (editArea && editArea.scrollIntoView) {
    editArea.scrollIntoView({ block: "start" });
  }

  // Hide edit button while editing
  const editBtn = document.getElementById("editTaskBtn");
  if (editBtn) editBtn.style.display = "none";
}

function cancelTaskEdit() {
  const editArea = document.getElementById("taskEditArea");
  if (editArea) editArea.style.display = "none";

  // Show Edit button again (only if allowed)
  const editBtn = document.getElementById("editTaskBtn");
  if (editBtn && currentViewedTask && canEditTask(currentViewedTask)) {
    editBtn.style.display = "inline-flex";
  }
}

// =====================
// CONFIRM + SOFT DELETE TASK
// =====================
async function confirmDeleteTask() {
  if (!currentViewedTask) return;

  const ok = confirm(
    "Are you sure you want to cancel this planned task?\nThis action cannot be undone."
  );

  if (!ok) return;

  try {
    const res = await fetch(
      `${API}/tasks/${currentViewedTask.id}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Delete failed");
    }

    currentViewedTask = null;

    closeTaskView();
    loadTasks();

  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    alert(err.message);
  }
}

// Close modal
function closeTaskView() {
  document.getElementById("taskViewOverlay").style.display = "none";
}
/* =====================
   HISTORY MODAL (GLOBAL)
===================== */

function openHistory() {
  loadHistory(); // always refresh
  const overlay = getEl("historyOverlay");
  overlay.style.display = "flex";
  overlay.style.pointerEvents = "auto"; // 👈 ΚΡΙΣΙΜΟ
}


function closeHistory() {
  getEl("historyOverlay").style.display = "none";
}

getEl("openHistoryBtn")?.addEventListener("click", openHistory);
getEl("closeHistoryBtn")
  ?.addEventListener("click", () => {
    const overlay = getEl("historyOverlay");
    overlay.style.display = "none";
    overlay.style.pointerEvents = "none"; // 👈 ΚΡΙΣΙΜΟ
  });
// =====================
// OPEN EDIT BREAKDOWN
// =====================
function editBreakdown(executionId) {
  const h = executionsData.find(e => e.id === executionId);
  if (!h) return;

  editingBreakdownId = h.id;

  document.getElementById("eb-task").value = h.task || "";
  document.getElementById("eb-executed-by").value = h.executed_by || "";

  const notesEl = document.getElementById("eb-notes");
  if (notesEl) notesEl.value = h.notes || "";

  document.getElementById("editBreakdownOverlay").style.display = "flex";
}

// =====================
// SAVE BREAKDOWN EDIT (FINAL)
// =====================
async function saveBreakdownEdit() {
  if (!editingBreakdownId) return;

  const taskDesc = document.getElementById("eb-task").value.trim();
  const executedBy = document.getElementById("eb-executed-by").value.trim();
  const notesEl = document.getElementById("eb-notes");
  const notes = notesEl ? notesEl.value.trim() : null;

  if (!taskDesc) {
    alert("Task description is required");
    return;
  }

  if (!executedBy) {
    alert("Executed by is required");
    return;
  }

  const payload = {
    task: taskDesc,
    executed_by: executedBy,
    notes
  };

  try {
    const res = await fetch(`${API}/executions/${editingBreakdownId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    closeEditBreakdown();
    loadHistory(); // refresh history

  } catch (err) {
    console.error("EDIT BREAKDOWN ERROR:", err);
    alert(err.message);
  }
}


function closeEditBreakdown() {
  editingBreakdownId = null;
  document.getElementById("editBreakdownOverlay").style.display = "none";
}


/* =====================
   FILTERS
===================== */
function buildAssetDropdown() {
  const menu = getEl("assetDropdownMenu");
  const btn = getEl("assetDropdownBtn");

  if (!menu || !btn) return;

  menu.innerHTML = "";

  const map = new Map();

  tasksData.forEach(t => {
    if (!t.machine_name || !t.serial_number) return;

    const key = `${t.machine_name}||${t.serial_number}`;
    if (map.has(key)) return;

    map.set(key, {
      value: key,
      line: t.line_code || t.line || "",
      machine: t.machine_name,
      serial: t.serial_number
    });
  });

  const assets = Array.from(map.values()).sort((a, b) => {
    const la = `${a.line} ${a.machine} ${a.serial}`;
    const lb = `${b.line} ${b.machine} ${b.serial}`;
    return la.localeCompare(lb, "el", { sensitivity: "base" });
  });

  // All Machines option
  const all = document.createElement("div");
  all.className = "asset-option active";
  all.textContent = "All Machines";
  all.dataset.value = "all";
  menu.appendChild(all);

  btn.textContent = "All Machines";
  activeAssetFilter = "all";

  assets.forEach(a => {
    const div = document.createElement("div");
    div.className = "asset-option";
    div.dataset.value = a.value;

    // 🔥 RICH LABEL
    div.innerHTML = `
      <div><strong>${a.line} | ${a.machine}</strong></div>
      <small>SN: ${a.serial}</small>
    `;

    menu.appendChild(div);
  });
}

/* =====================
   ASSET DROPDOWN (INIT)
===================== */
function initAssetDropdown() {
  const btn = document.getElementById("assetDropdownBtn");
  const menu = document.getElementById("assetDropdownMenu");

  if (!btn || !menu) return;

  // 🔒 reset state κάθε φορά
  menu.classList.remove("open");

  // ❗ καθάρισε παλιούς handlers
  btn.onclick = null;
  menu.onclick = null;
  document.onclick = null;

  // Toggle dropdown
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle("open");
  };

  // Options (event delegation)
  menu.onclick = (e) => {
    const opt = e.target.closest(".asset-option");
    if (!opt) return;

    menu.querySelectorAll(".asset-option")
      .forEach(o => o.classList.remove("active"));

    opt.classList.add("active");

    activeAssetFilter = opt.dataset.value;

    // αν το label έχει HTML (line | machine | small SN)
    btn.innerHTML = opt.innerHTML;

    menu.classList.remove("open");
    renderTable();
  };

  // Close on outside click (ΜΟΝΟ ΕΝΑΣ)
  document.onclick = () => {
    menu.classList.remove("open");
  };

  console.log("INIT DROPDOWN ✅", {
    options: menu.querySelectorAll(".asset-option").length
  });
}


function getFilteredTasksForPrint() {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return tasksData

    // ASSET FILTER (CUSTOM DROPDOWN)
    .filter(t => {
      if (activeAssetFilter === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === activeAssetFilter;
    })

    // QUICK DATE FILTER (Today / Week / Overdue)
    .filter(t => {
      if (activeDateFilter === "all") return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);

      if (activeDateFilter === "today") {
        return due.getTime() === today.getTime();
      }

      if (activeDateFilter === "week") {
        return due >= today && due <= weekEnd;
      }

      if (activeDateFilter === "overdue") {
        return due < today;
      }

      return true;
    })

    // 🆕 TASK DATE RANGE FILTER (From – To)
    .filter(t => {
      if (!taskDateFrom && !taskDateTo) return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);

      if (taskDateFrom && due < taskDateFrom) return false;
      if (taskDateTo && due > taskDateTo) return false;

      return true;
    });
}

function populateAssetFilter() {
  const sel = getEl("machineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All Machines</option>`;

  const map = new Map();

  tasksData.forEach(t => {
    if (!t.machine_name || !t.serial_number) return;

    const key = `${t.machine_name}||${t.serial_number}`;
    if (map.has(key)) return;

    map.set(key, {
      value: key,
      line: t.line_code || t.line || "",
      machine: t.machine_name,
      serial: t.serial_number
    });
  });

  const sortedAssets = Array.from(map.values()).sort((a, b) => {
    const la = `${a.line} ${a.machine} ${a.serial}`;
    const lb = `${b.line} ${b.machine} ${b.serial}`;
    return la.localeCompare(lb, "el", { sensitivity: "base" });
  });

  sortedAssets.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.value;
    opt.textContent = `${a.line} | ${a.machine} — SN: ${a.serial}`;
    sel.appendChild(opt);
  });
}

// Search matching
function matchesSearch(task, q) {
  if (!q) return true;
  const s = q.toLowerCase();

  return (
    (task.task || "").toLowerCase().includes(s) ||
    (task.machine_name || "").toLowerCase().includes(s) ||
    (task.serial_number || "").toLowerCase().includes(s) ||
    (task.section || "").toLowerCase().includes(s) ||
    (task.unit || "").toLowerCase().includes(s)
  );
}

/* =====================
   ASSET LINE FILTER (Assets Tab)
===================== */
function populateAssetLineFilter() {
  const sel = document.getElementById("assetLineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All</option>`;

  const lines = [...new Set(
    assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;       // π.χ. "L1"
    opt.textContent = line;
    sel.appendChild(opt);
  });
}


function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const q = document.getElementById("taskSearch")?.value || "";


  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const filtered = tasksData
    
  .filter(t => matchesSearch(t, q))


    // MACHINE FILTER
    .filter(t => {
            if (activeAssetFilter === "all") return true;
           return `${t.machine_name}||${t.serial_number}` === activeAssetFilter;
     })  

// =====================
// DATE FILTER (UNIFIED)
// - Date range (From–To) has priority
// - Quick filters used only if range is empty
// =====================
.filter(t => {
  if (!t.due_date) return false;

  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);

  // 🔴 Custom date range (priority)
  if (taskDateFrom || taskDateTo) {
    if (taskDateFrom && due < taskDateFrom) return false;
    if (taskDateTo && due > taskDateTo) return false;
    return true;
  }

  // 🟢 Quick date filters
  if (activeDateFilter === "today") {
    return due.getTime() === today.getTime();
  }

  if (activeDateFilter === "week") {
    return due >= today && due <= weekEnd;
  }

  if (activeDateFilter === "overdue") {
    return due < today;
  }

  // ⚪ ALL
  return true;
})

    // SORT (kept as-is)
    .sort((a, b) => {
      const o = { overdue: 0, soon: 1, ok: 2, done: 3, unknown: 4 };
      return (o[getDueState(a)] ?? 99) - (o[getDueState(b)] ?? 99);
    });
    // =====================
// UPDATE TASKS COUNT
// =====================
const countEl = document.getElementById("tasksCountLabel");
if (countEl) {
  const n = filtered.length;
  countEl.textContent = `${n} task${n === 1 ? "" : "s"}`;
  countEl.classList.toggle("zero", n === 0);

}

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}

function getAssetFilterLabel() {
  if (activeAssetFilter === "all" || !activeAssetFilter) {
    return "ALL MACHINES";
  }

  // expected format: "PMC250||437063"
  const [machine, serial] = activeAssetFilter.split("||");

  if (!machine) return "ALL MACHINES";

  return serial
    ? `${machine} (${serial})`
    : machine;
}
function getCurrentPeriodLabel() {
  // 🟢 αν υπάρχει custom date range
  if (taskDateFrom || taskDateTo) {
    const from = taskDateFrom ? formatDate(taskDateFrom) : "—";
    const to = taskDateTo ? formatDate(taskDateTo) : "—";
    return `${from} → ${to}`;
  }

  // 🟢 αλλιώς quick filter
  if (activeDateFilter && activeDateFilter !== "all") {
    return activeDateFilter.toUpperCase();
  }

  return "ALL";
}
// =====================
// PRINT TASK (FRONTEND)
// =====================
function printTask(taskId) {
  if (!taskId) return;
  window.open(`${API}/api/tasks/${taskId}/print`, "_blank");
}


 /* =====================
    PRINT TASKS
  ===================== */

function printTasks() {
  const tasks = getFilteredTasksForPrint();

  if (tasks.length === 0) {
    alert("No tasks to print");
    return;
  }

  let html = `
    <html>
    <head>
      <title>Maintenance Tasks</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }
        body { font-family: Arial, sans-serif; padding: 0; }
        h2 { margin-bottom: 5px; }
        .meta { margin-bottom: 15px; font-size: 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          font-size: 12px;
        }
        th { background: #eee; }
      </style>
    </head>
    <body>
      <h2>Maintenance Tasks Schedule</h2>
      <div class="meta">
        Ημερομηνία: ${new Date().toLocaleDateString("el-GR")}<br>
        Περίοδος: ${getCurrentPeriodLabel()}<br>
        Asset: ${getAssetFilterLabel()}<br>
        <strong>Σύνολο εργασιών: ${tasks.length}</strong>
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
            <th>✔</th>
          </tr>
        </thead>
        <tbody>
  `;

  tasks.forEach(t => {
    html += `
      <tr>
        <td>${t.machine_name}<br><small>${t.serial_number || ""}</small></td>
        <td>${t.section || "-"}</td>
        <td>${t.unit || "-"}</td>
        <td>${t.task}</td>
        <td>${t.type || "-"}</td>
        <td>${formatDate(t.due_date)}</td>
        <td></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  // 🔹 HIDDEN IFRAME PRINT (NO NEW TAB)
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

  // cleanup
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}


/* =====================
   FILTER EVENTS
===================== */

getEl("machineFilter")?.addEventListener("change", () => {
  renderTable();
});
document
  .getElementById("taskSearch")
  ?.addEventListener("input", (e) => {
    console.log("SEARCH INPUT:", e.target.value);
    renderTable();
  });


/* =====================
   LOAD TASKS
===================== */

async function loadTasks() {
// 🔒 force-close asset dropdown before rebuild
const menu = document.getElementById("assetDropdownMenu");
if (menu) menu.classList.remove("open");

  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();

  console.log("SAMPLE TASK:", tasksData[0]);

  updateKpis();          // Total / Overdue / Soon (active tasks)
  loadCompletedKpi();    // ✅ Completed from task_executions

  buildAssetDropdown();
  initAssetDropdown();

  renderTable();
}
/* =====================
   ADD TASK TYPE LOGIC
   Planned vs Unplanned
===================== */

const taskTypeSelect = document.getElementById("taskPlannedType");

taskTypeSelect?.addEventListener("change", e => {
  const isPlanned = e.target.value === "planned";

  // 🔹 Title
  const title = document.getElementById("addTaskTitle");
  if (title) {
    title.textContent = isPlanned
      ? "New Planned Task"
      : "New Unplanned Task (Breakdown)";
  }

  // 🔹 Planned-only fields
  document.querySelectorAll(".planned-only").forEach(el => {
    el.style.display = isPlanned ? "block" : "none";
  });

  // 🔹 Unplanned-only fields (Technician)
  document.querySelectorAll(".unplanned-only").forEach(el => {
    el.style.display = isPlanned ? "none" : "block";
  });

  // 🔹 Visual cue on modal
  const modal = document.getElementById("addTaskModal");
  if (modal) {
    modal.classList.toggle("unplanned-mode", !isPlanned);
  }
});


/* =====================
   SAVE TASK (PLANNED / UNPLANNED)
===================== */
document.getElementById("saveTaskBtn")?.addEventListener("click", async () => {

  const isPlanned =
  document.getElementById("taskPlannedType")?.value === "planned";

// 🔒 Due date required for Planned tasks
if (isPlanned) {
  const due = document.getElementById("nt-due")?.value;
  if (!due) {
    alert("Please select a due date for a planned task.");
    return;
  }
}


  const technician =
    document.getElementById("nt-technician")?.value?.trim() || null;    

  const assetId = document.getElementById("nt-asset")?.value;

  // 🔒 Asset validation
  if (!assetId) {
    alert("Asset is required");
    return;
  }

  // 🔒 Task description validation
  const taskDesc = document.getElementById("nt-task")?.value?.trim();
  if (!taskDesc) {
    alert("Task description is required");
    return;
  }

  // 🔒 Technician required ONLY for unplanned
  if (!isPlanned && !technician) {
    alert("Technician is required for unplanned tasks");
    return;
  }

  const payload = {
    asset_id: assetId,
    section: document.getElementById("nt-section")?.value || null,
    unit: document.getElementById("nt-unit")?.value || null,
    task: taskDesc,
    type: document.getElementById("nt-type")?.value || null,
    notes: document.getElementById("nt-notes")?.value || null,

    is_planned: isPlanned,
    status: isPlanned ? "Planned" : "Done",

    due_date: isPlanned
      ? document.getElementById("nt-due")?.value
      : new Date().toISOString(),

    // 🔥 NEW — technician for unplanned history
    executed_by: technician
  };

  try {
    const res = await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save task");
    }

    // Close modal
    document.getElementById("addTaskOverlay").style.display = "none";

    // Reset form
    document.querySelectorAll(
      "#addTaskModal input, #addTaskModal textarea, #addTaskModal select"
    ).forEach(el => el.value = "");

    // Refresh data
    loadTasks();

  } catch (err) {
    console.error("SAVE TASK ERROR:", err);
    alert(err.message);
  }
});

// =====================
// SAVE TASK EDIT (PUT – METADATA ONLY)
// =====================
async function saveTaskEdit() {
  if (!currentViewedTask) return;

  // 🔒 Safety check
  if (!canEditTask(currentViewedTask)) {
    alert("This task cannot be edited");
    return;
  }

  const payload = {
    task: document.getElementById("edit-task-desc")?.value?.trim(),
    type: document.getElementById("edit-task-type")?.value || null,
    section: document.getElementById("edit-task-section")?.value || null,
    unit: document.getElementById("edit-task-unit")?.value || null,
    due_date: document.getElementById("edit-task-due")?.value || null,
    notes: document.getElementById("edit-task-notes")?.value || null
  };

  // 🔒 Validation
  if (!payload.task) {
    alert("Task description is required");
    return;
  }

  try {
    const res = await fetch(`${API}/tasks/${currentViewedTask.id}`, {
      method: "PUT", // 👈 ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    // success
    currentViewedTask = null;

    // Close modal
    closeTaskView();

    // Refresh tasks list
    loadTasks();

  } catch (err) {
    console.error("SAVE TASK EDIT ERROR:", err);
    alert(err.message);
  }
}


/* =====================
   OPEN ADD TASK MODAL
===================== */

document.getElementById("addTaskBtn")?.addEventListener("click", async e => {
  e.preventDefault();

  // 🔑 Ensure assets are loaded
  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    await loadAssets();
  }

  const overlay = document.getElementById("addTaskOverlay");
  if (!overlay) return;

  // Reset task type
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) typeSelect.value = "planned";

  // Reset title
  const title = document.getElementById("addTaskTitle");
  if (title) title.textContent = "New Planned Task";

  // Show planned-only fields
  document.querySelectorAll(".planned-only").forEach(el => {
    el.style.display = "block";
  });

  // Remove unplanned visual state
  document
    .getElementById("addTaskModal")
    ?.classList.remove("unplanned-mode");
console.log("ASSETS DATA:", assetsData);

  // Populate Line dropdown
  populateAddTaskLines();

  // Reset asset dropdown
  const assetSel = document.getElementById("nt-asset");
  if (assetSel) {
    assetSel.innerHTML = `<option value="">Select Asset</option>`;
    assetSel.disabled = true;
  }

  overlay.style.display = "flex";
});

// =====================
// FOLLOW-UP TASK (PREFILL FROM VIEW) — FINAL
// =====================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#createFollowupTaskBtn");
  if (!btn) return;

  if (!currentViewedTask) return;
  const t = currentViewedTask;

  // 🔒 Ensure assets loaded (CRITICAL)
  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    await loadAssets();
  }

  // 🔥 CRITICAL: ensure Line dropdown OPTIONS exist
  // (this was the missing piece on fresh reload)
  populateAddTaskLines();

  // 🔹 Reset Add Task form (SAFE)
  document.querySelectorAll(
    "#addTaskModal input, #addTaskModal textarea, #addTaskModal select"
  ).forEach(el => el.value = "");

  // 🔹 Default task type = Planned
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) typeSelect.value = "planned";

  // 🔹 Modal title
  const title = document.getElementById("addTaskTitle");
  if (title) title.textContent = "New Follow-up Task";

  // 🔹 Prefill Section / Unit
  const secEl = document.getElementById("nt-section");
  if (secEl) secEl.value = t.section || "";

  const unitEl = document.getElementById("nt-unit");
  if (unitEl) unitEl.value = t.unit || "";

  // 🔹 Prefill Line (AFTER options exist)
  const line = (t.line_code || t.line || "");
  const lineEl = document.getElementById("nt-line");

  if (lineEl && line) {
    // ⏳ Final set (defensive against any late resets)
    requestAnimationFrame(() => {
      lineEl.value = line;
    });
  }

  // 🔹 Populate Asset dropdown for selected line
  populateAssetSelectForLine(line);

  // 🔹 Robust asset match (case / trim safe)
  const normStr = (v) =>
    (v ?? "").toString().trim().toUpperCase();

  const match =
    (assetsData || []).find(a =>
      normStr(a.line) === normStr(line) &&
      normStr(a.model) === normStr(t.machine_name) &&
      normStr(a.serial_number) === normStr(t.serial_number)
    )
    // fallback: serial usually unique
    || (assetsData || []).find(a =>
      normStr(a.serial_number) === normStr(t.serial_number)
    );

  const assetEl = document.getElementById("nt-asset");
  if (assetEl && match) {
    // ⏳ Final asset select (defensive)
    requestAnimationFrame(() => {
      assetEl.value = match.id;
    });
  }

  // 🔹 Open Add Task modal
  document.getElementById("addTaskOverlay").style.display = "flex";

  // 🔹 Close Task View to save one click (UX win)
  const tv = document.getElementById("taskViewOverlay");
  if (tv) tv.style.display = "none";
});



function populateAssetSelectForLine(line) {
  const assetSel = document.getElementById("nt-asset");
  if (!assetSel) return;

  assetSel.innerHTML = `<option value="">Select Asset</option>`;
  assetSel.disabled = true;

  if (!line) return;

  const filtered = (assetsData || []).filter(a => (a.line || "") === line);

  filtered.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.model} (${a.serial_number})`;
    assetSel.appendChild(opt);
  });

  assetSel.disabled = false;
}



document.getElementById("nt-line")?.addEventListener("change", e => {
  const line = e.target.value;
  const assetSel = document.getElementById("nt-asset");

  assetSel.innerHTML = `<option value="">Select Asset</option>`;
  assetSel.disabled = true;

  if (!line) return;

  const filtered = assetsData.filter(a => a.line === line);

  filtered.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.model} (${a.serial_number})`;
    assetSel.appendChild(opt);
  });

  assetSel.disabled = false;
});

  /* =====================
    CANCEL ADD TASK
  ===================== */ 
    
document.getElementById("cancelAddTask")?.addEventListener("click", () => {
  document.getElementById("addTaskOverlay").style.display = "none";
});


/* =====================
   OPEN CONFIRM DONE MODAL
   - Prefills technician date
   - Prefills existing task notes (if any)
===================== */
function askTechnician(id) {
  pendingTaskId = id;

  // 🔍 find task from loaded tasks
  const task = tasksData.find(t => t.id === id);

  if (!task) {
    alert("Task not found");
    return;
  }

  // 📅 default completion date = today
  const today = new Date().toISOString().split("T")[0];
  const dateInput = getEl("completedDateInput");
  if (dateInput) {
    dateInput.value = today;
  }

  // 📝 PREFILL NOTES (if exist)
  const notesInput = getEl("doneNotesInput");
  if (notesInput) {
    notesInput.value = task.notes || "";
  }

  // show modal
  getEl("modalOverlay").style.display = "flex";
}

/* =====================
   CANCEL TASK COMPLETION
   - Closes modal
   - Resets pending task
===================== */
getEl("cancelDone")?.addEventListener("click", () => {
  getEl("modalOverlay").style.display = "none";
  pendingTaskId = null;
});


/* =====================
   CONFIRM TASK DONE
===================== */
getEl("confirmDone")?.addEventListener("click", async () => {
  const name = getEl("technicianInput")?.value.trim();
  if (!name) return alert("Δώσε όνομα τεχνικού");

  const notes =
    getEl("doneNotesInput")?.value.trim() || null;

  const dateValue = getEl("completedDateInput")?.value;
  const completedAt = dateValue
    ? new Date(dateValue + "T12:00:00").toISOString()
    : new Date().toISOString();

  try {
    const res = await fetch(`${API}/tasks/${pendingTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completed_by: name,
        completed_at: completedAt,
        notes          // 🆕 execution notes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to complete task");
    }

    // cleanup
    getEl("modalOverlay").style.display = "none";
    getEl("technicianInput").value = "";
    if (getEl("completedDateInput")) {
      getEl("completedDateInput").value = "";
    }
    if (getEl("doneNotesInput")) {
      getEl("doneNotesInput").value = "";
    }

    pendingTaskId = null;

    // 🔄 REFRESH
    loadTasks();
    loadHistory();

  } catch (err) {
    alert(err.message);
    console.error("CONFIRM DONE ERROR:", err);
  }
});


/* ===========================
   LOAD TASK DONE from HISTORY
==============================*/

async function loadCompletedKpi() {
  try {
    const res = await fetch(`${API}/executions/count`);
    const data = await res.json();

    const el = document.getElementById("kpiDone");
    if (!el) {
      console.warn("kpiDone not found (tab not active yet)");
      return;
    }

    el.textContent = data.completed;
  } catch (err) {
    console.error("Failed to load completed KPI", err);
  }
}


async function undoTask(id) {
  await fetch(`${API}/tasks/${id}/undo`, { method: "PATCH" });
  loadTasks();
}

/* =====================
   UNDO TASK EXECUTION
===================== */
async function undoExecution(executionId) {
  if (!hasRole("admin", "planner")) {
    alert("You are not allowed to undo executions");
    return;
  }

  if (!confirm("Undo this execution and restore previous schedule?")) return;

  await fetch(`${API}/executions/${executionId}/undo`, {
    method: "POST"
  });

  loadHistory();
  loadTasks();
  loadCompletedKpi();
}

// 👇 ΑΠΑΡΑΙΤΗΤΟ (λόγω type="module")
window.undoExecution = undoExecution;

/* =====================
   LOAD EXECUTIONS (HISTORY CACHE)
===================== */
async function loadExecutions() {
  try {
    const res = await fetch(`${API}/executions`);
    executionsData = await res.json();
    console.log("EXECUTIONS LOADED:", executionsData.length);
  } catch (err) {
    console.error("Failed to load executions", err);
  }
}

/* =====================
   ASSETS (CRUD)
===================== */

async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    assetsData = await res.json();
     console.log("ASSETS SAMPLE:", assetsData[0]); // 👈 ΕΔΩ
    populateAssetLineFilter(); // 👈 ΝΕΟ
    const sel = document.getElementById("assetLineFilter");
    if (sel) {
      sel.onchange = renderAssetsTable;   // 👈 ΕΔΩ
    }
    renderAssetsTable();
  } catch (err) {
    console.error("Failed to load assets", err);
  }
}

function renderAssetsTable() {
  const tbody = document.querySelector("#assetsTable tbody");
  if (!tbody) return;

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  tbody.innerHTML = "";

  const filteredAssets = assetsData.filter(a =>
    selectedLine === "all" || a.line === selectedLine
  );

  if (filteredAssets.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align:center;">No assets</td>`;
    tbody.appendChild(tr);
    return;
  }

  filteredAssets.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.line || "-"}</td>
      <td>${a.model || "-"}</td>
      <td>${a.serial_number || "-"}</td>
      <td class="asset-admin-only">
        <button class="btn-warning"
          onclick="deactivateAsset(${a.id})">
          🚫 Deactivate
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* =====================
   LOAD LINES (FOR ADD ASSET)
===================== */
async function loadLinesForAsset() {
  const select = document.getElementById("assetLine");
  if (!select) return;

  try {
    const res = await fetch(`${API}/lines`);
    const lines = await res.json();

    select.innerHTML = `<option value="">Select Line</option>`;

    lines.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.code;
      select.appendChild(opt);
    });

    // ➕ OTHER
    const other = document.createElement("option");
    other.value = "__other__";
    other.textContent = "➕ Other (new line)";
    select.appendChild(other);

  } catch (err) {
    console.error("LOAD LINES ERROR:", err);
  }
}

/* =====================
   LOAD MACHINE MODELS (FOR ADD ASSET)
   Backend returns: ["PMC250","PMC300",...]
===================== */
async function loadMachineModelsForAsset() {
  const select = document.getElementById("assetMachine");
  if (!select) return;

  try {
    const res = await fetch(`${API}/asset-models`);
    const models = await res.json();

    select.innerHTML = `<option value="">Select Machine</option>`;

    models.forEach(model => {
      if (!model) return;

      const opt = document.createElement("option");
      opt.value = model;
      opt.textContent = model;
      select.appendChild(opt);
    });

    // ➕ OTHER OPTION
    const other = document.createElement("option");
    other.value = "__other__";
    other.textContent = "➕ Other (new machine)";
    select.appendChild(other);

  } catch (err) {
    console.error("LOAD MACHINE MODELS ERROR:", err);
  }
}


/* =====================
   ADD ASSET MODAL – SAFE OPEN
===================== */

document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("addAssetBtn");
  const overlay = document.getElementById("addAssetOverlay");
  const cancelBtn = document.getElementById("cancelAssetBtn");

  if (!addBtn || !overlay) {
    console.warn("Add Asset elements not found");
    return;
  }

  // OPEN MODAL
  addBtn.addEventListener("click", e => {
    e.preventDefault();

    if (!hasRole("planner", "admin")) {
      alert("You are not allowed to add assets");
      return;
    }
    loadLinesForAsset(); // 👈 ΕΔΩ
    loadMachineModelsForAsset();

    overlay.style.display = "flex";
  });

  // CLOSE MODAL
  cancelBtn?.addEventListener("click", () => {
    overlay.style.display = "none";
  });
});
/* =====================
   ADD ASSET – OTHER TOGGLE (FINAL, SAFE)
   Works with value="__other__"
===================== */
document.addEventListener("DOMContentLoaded", () => {
  const lineSelect = document.getElementById("assetLine");
  const machineSelect = document.getElementById("assetMachine");

  const newLineField = document.getElementById("newLineField");
  const newMachineField = document.getElementById("newMachineField");

  // LINE → Other
  lineSelect?.addEventListener("change", () => {
    const isOther = lineSelect.value === "__other__";

    if (newLineField) {
      newLineField.style.display = isOther ? "block" : "none";
    }

    if (!isOther) {
      const input = document.getElementById("assetNewLine");
      if (input) input.value = "";
    }
  });

  // MACHINE → Other
  machineSelect?.addEventListener("change", () => {
    const isOther = machineSelect.value === "__other__";

    if (newMachineField) {
      newMachineField.style.display = isOther ? "block" : "none";
    }

    if (!isOther) {
      const input = document.getElementById("assetNewMachine");
      if (input) input.value = "";
    }
  });
});


/* =====================
   SAVE ASSET (WITH OTHER LINE / MACHINE)
===================== */
getEl("saveAssetBtn")?.addEventListener("click", async () => {
  if (!hasRole("planner", "admin")) {
    alert("Not allowed");
    return;
  }

  // --- LINE ---
  const lineSelect = getEl("assetLine").value;
  const newLineVal = getEl("assetNewLine")?.value.trim();

  const line =
    lineSelect === "__other__"
      ? newLineVal
      : lineSelect;

  // --- MACHINE ---
  const machineSelect = getEl("assetMachine").value;
  const newMachineVal = getEl("assetNewMachine")?.value.trim();

  const model =
    machineSelect === "__other__"
      ? newMachineVal
      : machineSelect;

  // --- SERIAL ---
  const serial = getEl("assetSn").value.trim();

  // 🔒 VALIDATION
  if (!line) {
    alert("Line is required");
    return;
  }

  if (!model) {
    alert("Machine is required");
    return;
  }

  if (!serial) {
    alert("Serial Number is required");
    return;
  }

  try {
    await fetch(`${API}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line,              // είτε existing είτε new
        model,             // είτε existing είτε new
        serial_number: serial
      })
    });

    // ✅ CLOSE MODAL
    getEl("addAssetOverlay").style.display = "none";

    // ✅ RESET FORM (SAFE)
    getEl("assetLine").value = "";
    getEl("assetMachine").value = "";
    getEl("assetSn").value = "";

    if (getEl("assetNewLine")) getEl("assetNewLine").value = "";
    if (getEl("assetNewMachine")) getEl("assetNewMachine").value = "";

    getEl("newLineField").style.display = "none";
    getEl("newMachineField").style.display = "none";

    // 🔄 REFRESH ASSETS
    loadAssets();

  } catch (err) {
    console.error("SAVE ASSET ERROR:", err);
    alert("Failed to save asset");
  }
});

/* =====================
   ADD ASSET – OTHER HANDLERS
===================== */

// LINE → show/hide new line field
getEl("assetLine")?.addEventListener("change", () => {
  const isOther = getEl("assetLine").value === "__other__";
  const field = getEl("newLineField");

  if (!field) return;

  field.style.display = isOther ? "block" : "none";
  if (!isOther) getEl("assetNewLine").value = "";
});

// MACHINE → show/hide new machine field
getEl("assetMachine")?.addEventListener("change", () => {
  const isOther = getEl("assetMachine").value === "__other__";
  const field = getEl("newMachineField");

  if (!field) return;

  field.style.display = isOther ? "block" : "none";
  if (!isOther) getEl("assetNewMachine").value = "";
});


/* =====================
   DELETE ASSET
===================== */

async function deleteAsset(id) {
  // ROLE GUARD — only planner / admin
  if (!hasRole("planner", "admin")) {
    alert("You are not allowed to delete assets");
    return;
  }

  if (!confirm("Διαγραφή asset;")) return;

  try {
    await fetch(`${API}/assets/${id}`, { method: "DELETE" });
    loadAssets();
  } catch (err) {
    alert("Failed to delete asset");
    console.error(err);
  }
}

/* =====================
   DEACTIVATE ASSET
===================== */
async function deactivateAsset(id) {
  // ROLE GUARD
  if (!hasRole("planner", "admin")) {
    alert("You are not allowed to deactivate assets");
    return;
  }

  if (!confirm("Deactivate this asset?")) return;

  try {
    await fetch(`${API}/assets/${id}/deactivate`, {
      method: "PATCH"
    });

    loadAssets();
  } catch (err) {
    alert("Failed to deactivate asset");
    console.error(err);
  }
}
/*============================
    POPULATE ASSET LINE FILTER
 ============================*/

function populateAssetLineFilter() {
  const sel = document.getElementById("assetLineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All</option>`;

  const lines = [...new Set(
    assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    sel.appendChild(opt);
  });
}
async function loadAssetLines() {
  const sel = document.getElementById("assetLine");
  if (!sel) return;

  sel.innerHTML = `<option value="">Select Line</option>`;

  const res = await fetch(`${API}/lines`);
  const lines = await res.json();

  lines.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.code;
    sel.appendChild(opt);
  });

  // keep Other
  sel.appendChild(new Option("➕ Other…", "_other"));
}
// LINE → Other
document.getElementById("assetLine")?.addEventListener("change", e => {
  document.getElementById("newLineField").style.display =
    e.target.value === "_other" ? "block" : "none";
});

// MACHINE → Other
document.getElementById("assetMachine")?.addEventListener("change", e => {
  document.getElementById("newMachineField").style.display =
    e.target.value === "_other" ? "block" : "none";
});


/* =====================
   LOAD REPORTS TAB
===================== */
async function loadReports() {
  // 🔴 αν δεν έχουμε assets, φόρτωσέ τα πρώτα
  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    await loadAssets();
  }

  // Γ: populate dynamic lines
  populateReportLines();

  // Β: initial preview render
  updateReportsPreview();

  // Α: initial technician field visibility
  const type = document.getElementById("reportType")?.value;
  const techField = document.getElementById("fieldTechnician");
  if (techField) {
    techField.style.display = type === "technician" ? "flex" : "none";
  }
}

/* =====================
   REPORT LINES (C)
===================== */
function populateReportLines() {

  console.log("REPORT LINES assetsData =", assetsData);

  const sel = document.getElementById("reportLine");
  if (!sel) return;

  sel.innerHTML = `<option value="all">ALL</option>`;

  if (!Array.isArray(assetsData)) return;

  const lines = [...new Set(
    assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    sel.appendChild(opt);
  });
}

/* =====================
   REPORTS PREVIEW (B)
===================== */
function updateReportsPreview() {
  const type = document.getElementById("reportType")?.value || "status";
  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "all";
  const status = document.getElementById("reportStatus")?.value || "all";
  document.getElementById("previewStatus").textContent =
  `Status: ${status.toUpperCase()}`;


  const typeMap = {
    status: "Maintenance Status Report",
    overdue: "Overdue Tasks Report",
    technician: "Completed by Technician",
    nonplanned: "Non-Planned Tasks Report"
  };

  document.getElementById("previewType").textContent =
    `Report: ${typeMap[type] || type}`;

  document.getElementById("previewLines").textContent =
    `Lines: ${line.toUpperCase()}`;

  document.getElementById("previewDates").textContent =
    from || to
      ? `Period: ${from || "—"} → ${to || "—"}`
      : "Period: ALL";
}
[
  "reportType",
  "dateFrom",
  "dateTo",
  "reportLine",
  "reportStatus",
  "reportTechnician"
].forEach(id => {
  document.getElementById(id)?.addEventListener("change", updateReportsPreview);
  document.getElementById(id)?.addEventListener("input", updateReportsPreview);
});

/* =====================
   REPORT TYPE LOGIC (A)
===================== */
document.getElementById("reportType")?.addEventListener("change", e => {
  const type = e.target.value;
  const techField = document.getElementById("fieldTechnician");
  if (!techField) return;

  techField.style.display = type === "technician" ? "flex" : "none";
});
/* =====================
   OPEN REPORTS TAB
===================== */
document.getElementById("reportsTabBtn")?.addEventListener("click", () => {
  // Κλείσε όλα τα tabs
  document.querySelectorAll('[id^="tab-"]').forEach(tab => {
    tab.style.display = "none";
  });

  // Άνοιξε το Reports tab
  const reportsTab = document.getElementById("tab-reports");
  if (reportsTab) {
    reportsTab.style.display = "block";
  }

  // 🔥 ΚΡΙΣΙΜΟ: φόρτωσε Reports logic
  loadReports();
});

/* =====================
   STATUS REPORT – DATA
===================== */
function getFilteredTasksForStatusReport() {
  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "all";
  const status = document.getElementById("reportStatus")?.value || "all";

  const fromDate = from ? new Date(from) : null;
  if (fromDate) {
    fromDate.setHours(0, 0, 0, 0);
  }

  const toDate = to ? new Date(to) : null;
  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasksData

    // LINE FILTER
    .filter(t => {
      if (line === "all") return true;
      return t.line_code === line || t.line === line;
    })

    // DATE FILTER (due_date)
    .filter(t => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      if (fromDate && due < fromDate) return false;
      if (toDate && due > toDate) return false;
      return true;
    })

    // STATUS FILTER
    .filter(t => {
      if (status === "all") return true;

      if (status === "planned") {
        return t.status === "Planned" && new Date(t.due_date) >= today;
      }

      if (status === "overdue") {
        return t.status !== "Done" && new Date(t.due_date) < today;
      }

      if (status === "done") {
        return t.status === "Done";
      }

      return true;
    });
}


/* =====================
   STATUS REPORT – PDF
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
        Status: ${status.toUpperCase()}
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
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  tasks.forEach(t => {
    const due = new Date(t.due_date);
    const isOverdue = due < new Date() && t.status !== "Done";

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



/*================================
   IMPORT EXCEL (PREVIEW + COMMIT)
 =================================*/

async function importExcel() {
  if (!hasRole("planner", "admin")) {
    alert("Not allowed");
    return;
  }

  const file = getEl("excelFile").files[0];
  if (!file) return alert("Select Excel");

  importExcelFile = file;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API}/importExcel/preview`, {
    method: "POST",
    body: fd
  });

  const data = await res.json();

  const tbody = getEl("importPreviewTable").querySelector("tbody");
  tbody.innerHTML = "";

  data.rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.row}</td>
      <td>${r.key?.line}</td>
      <td>${r.key?.machine}</td>
      <td>${r.key?.serial_number}</td>
      <td>${r.cleaned?.task}</td>
      <td>${r.status}</td>
      <td>${r.error || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  getEl("importSummary").textContent =
    data.summary.errors > 0
      ? `❌ Errors: ${data.summary.errors}`
      : `✅ Ready: ${data.summary.ok}`;

  getEl("confirmImportBtn").disabled = data.summary.errors > 0;
  getEl("importPreviewOverlay").style.display = "flex";
}

/* 🔥 STEP 2 — STORE IMPORT METADATA */
async function confirmImport() {
  const fd = new FormData();
  fd.append("file", importExcelFile);

  await fetch(`${API}/importExcel/commit`, {
    method: "POST",
    body: fd
  });

  // 🔥 SAVE LAST IMPORT INFO (PERSISTENT)
  const info = {
    file: importExcelFile?.name || "Unknown file",
    at: new Date().toISOString()
  };
  localStorage.setItem("lastExcelImport", JSON.stringify(info));

  // 🔥 UPDATE HEADER UI
  updateImportStatusUI();

  getEl("importPreviewOverlay").style.display = "none";
  loadTasks();
}

/* 🔥 UI HELPER — HEADER STATUS */
function updateImportStatusUI() {
  const el = getEl("importStatus");
  if (!el) return;

  const raw = localStorage.getItem("lastExcelImport");
  if (!raw) {
    el.textContent = "No Excel imported yet";
    return;
  }

  const info = JSON.parse(raw);
  el.textContent =
    `📄 ${info.file} · ${new Date(info.at).toLocaleString("el-GR")}`;
}

/* 🔥 CALL ON APP LOAD */
document.addEventListener("DOMContentLoaded", updateImportStatusUI);

getEl("importExcelBtn")?.addEventListener("click", importExcel);
getEl("confirmImportBtn")?.addEventListener("click", confirmImport);
getEl("closeImportPreviewBtn")?.addEventListener("click", () => {
getEl("importPreviewOverlay").style.display = "none";
});

/* =====================
   SNAPSHOT EXPORT
===================== */
document.getElementById("exportSnapshot")?.addEventListener("click", async (e) => {
  e.preventDefault();   // 🔥 ΚΡΙΣΙΜΟ
  e.stopPropagation();

  const res = await fetch(`${API}/snapshot/export`);
  const data = await res.json();

  const name = `CMMS_snapshot_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
// =====================
// SNAPSHOT FILE LOAD LABEL
// =====================
document.getElementById("snapshotFile")?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  const statusEl = document.getElementById("snapshotStatus");

  if (!statusEl) return;

  if (!file) {
    statusEl.textContent = "No snapshot loaded";
    statusEl.classList.remove("loaded");
    return;
  }

  statusEl.textContent = `Loaded: ${file.name}`;
  statusEl.classList.add("loaded");
});


/* =====================
   SNAPSHOT RESTORE
===================== */
document.getElementById("restoreSnapshot")?.addEventListener("click", async () => {
  const file = document.getElementById("snapshotFile")?.files[0];
  if (!file) return alert("Select snapshot file");

  const text = await file.text();
  const json = JSON.parse(text);

  if (!confirm("⚠️ This will fully restore the system. Continue?")) return;
  localStorage.setItem(
  "lastRestoredSnapshot",
  file.name
);

  const res = await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });

  if (!res.ok) {
    const err = await res.json();
    return alert(err.error || "Restore failed");
  }

  alert("Snapshot restored successfully");
  location.reload();
});


/* =====================
   LINE TABS
===================== */

document.querySelectorAll(".line-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeLine = btn.dataset.line;
    rebuildMachineFilter();
    renderTable();
  });
});

/* =====================
   MAIN TABS
===================== */

document.querySelectorAll(".main-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    // Active state
    document.querySelectorAll(".main-tab")
      .forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // Hide all tabs
    ["tasks", "assets", "docs", "reports"].forEach(t => {
      const el = getEl(`tab-${t}`);
      if (el) el.style.display = "none";
    });

    // Show selected tab
    const sel = tab.dataset.tab;
    const active = getEl(`tab-${sel}`);
    if (active) active.style.display = "block";

    // Tab-specific loaders
    if (sel === "assets") {
      loadAssets();
    }

    if (sel === "reports") {
      loadHistory();   // 👈 γεμίζει executionsData
      loadReports();   // 👈 populate lines + preview
    }
  });
});

/* =====================
   INIT
===================== */
console.log("BEFORE LOAD TASKS");

loadTasks();
loadHistory();
/* =====================
   APPLY ROLE VISIBILITY
===================== */
function applyRoleVisibility() {

  const isAdmin = hasRole("planner", "admin");

  // Admin-only elements (generic)
  document.querySelectorAll(".admin-only")
    .forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });

  // Asset admin actions (legacy)
  document.querySelectorAll(".asset-admin-only")
    .forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });

  // Optional: specific buttons by id (αν υπάρχουν)
  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) addTaskBtn.style.display = isAdmin ? "" : "none";

  const importBtn = document.getElementById("importExcelBtn");
  if (importBtn) importBtn.style.display = isAdmin ? "" : "none";
}
applyRoleVisibility();

getEl("printTasksBtn")?.addEventListener("click", printTasks);

// =====================
// DATE FILTER BUTTONS
// =====================

(function initDateFilters() {
  const btns = document.querySelectorAll(".date-filter-btn");
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeDateFilter = btn.dataset.filter;

      // 🔴 RESET custom date range (MASTER FIX)
      taskDateFrom = null;
      taskDateTo = null;

      const fromEl = document.getElementById("taskDateFrom");
      const toEl = document.getElementById("taskDateTo");
      if (fromEl) fromEl.value = "";
      if (toEl) toEl.value = "";

      // UI state
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

  renderTable();
});
  });
})();
// =====================
// TASKS – DATE RANGE HANDLER (MASTER FILTER)
// =====================
function onTaskDateRangeChange() {
  const fromVal = document.getElementById("taskDateFrom")?.value;
  const toVal = document.getElementById("taskDateTo")?.value;

  taskDateFrom = fromVal ? new Date(fromVal) : null;
  taskDateTo = toVal ? new Date(toVal) : null;

  if (taskDateFrom) taskDateFrom.setHours(0, 0, 0, 0);
  if (taskDateTo) taskDateTo.setHours(23, 59, 59, 999);

  // 🔁 RESET QUICK DATE FILTERS (ALL / TODAY / WEEK / OVERDUE)
  activeDateFilter = "all";

  document
    .querySelectorAll(".date-filter-btn")
    .forEach(btn => btn.classList.remove("active"));

  renderTable();
}


