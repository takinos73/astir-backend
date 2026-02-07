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
// =====================
// ASSET-SCOPED TASKS STATE
// =====================
let currentAssetSerial = null;
let assetScopedTasks = [];

let assetAllTasks = [];
let assetActiveTasks = [];
let assetHistoryTasks = [];
let currentViewedTask = null;
// =====================
// ASSET VIEW – MULTISELECT STATE (STEP 1)
// =====================
const assetSelectedTaskIds = new Set();
// =====================
// BULK DONE STATE
// =====================
let bulkDoneMode = false;
// =====================
// TASK TYPE FILTER STATE
// =====================
let activeTaskTypeFilter = "all"; 
// values: all | planned | preventive
let historyTypeFilters = new Set(["preventive", "planned", "breakdown"]);
let mttrData = [];


const ASSETS_VIEW_MODE = "cards"; // "cards" | "table"


function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("el-GR");
}

function canEditTask(task) {
  return (
    task.status === "Planned" &&
    !task.frequency_hours &&   // όχι preventive
    !!task.due_date            // planned manual
  );
}

/* =====================
   CURRENT USER (DEV)
===================== */
const CURRENT_USER = {
  name: "Dev User",
  role: "planner" // technician | planner | admin
};

/* =====================
   DEV LOGIN AS ROLE
===================== */

function loginAsRole() {
  console.log("LOGIN CLICKED");

  const role = document.getElementById("roleSelect").value;

  CURRENT_USER.role = role;
  window.currentUserRole = role;   // ✅ ΑΥΤΟ ΛΕΙΠΕ

  // Re-apply UI visibility
  applyRoleVisibility();

  alert(`Logged in as ${role}`);
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
   TASK TABLE – STATUS PILL (FIXED)
===================== */

function statusPill(task) {
  const st = getDueState(task);

  let cls = "status-pill";
  let txt = "";

  // 1️⃣ DONE
  if (task.status === "Done") {
    cls += " status-done";
    txt = "Done";
  }

  // 2️⃣ OVERDUE
  else if (st === "overdue") {
    cls += " status-overdue";
    txt = "Overdue";
  }

  // 3️⃣ TODAY
  else if (st === "today") {
    cls += " status-today";
    txt = "Today";
  }

  // 4️⃣ DUE SOON
  else if (st === "soon") {
    cls += " status-soon";
    txt = "Due Soon";
  }

  // 5️⃣ PREVENTIVE
  else if (isPreventive(task)) {
    cls += " status-preventive";
    txt = "Preventive";
  }

  // 6️⃣ PLANNED MANUAL
  else if (isPlannedManual(task)) {
    cls += " status-planned";
    txt = "Planned";
  }

  // FALLBACK (safety)
  else {
    cls += " status-unknown";
    txt = task.status || "—";
  }

  return `<span class="${cls}">${txt}</span>`;
}
//----------------------
// ASSET TASK TYPE HELPERS
//----------------------

function assetStatusLabel(t) {
  let typeLabel = "Planned";
  let typeClass = "type-planned";

  if (isPreventive(t)) {
    typeLabel = "Preventive";
    typeClass = "type-preventive";
  }

  const dueState = getDueState(t);
  let dueLabel = "";

  if (dueState === "overdue") dueLabel = "Overdue";
  else if (dueState === "today") dueLabel = "Today";
  else if (dueState === "soon") dueLabel = "Due soon";

  return `
    <div class="asset-status ${typeClass}">
      <span class="asset-status-type">${typeLabel}</span>
      ${dueLabel ? `<span class="asset-status-due ${dueState}">${dueLabel}</span>` : ""}
    </div>
  `;
}


//----------------------
// TASK TYPE HELPER
//----------------------

function getStatusFilterLabel() {
  if (activeTaskTypeFilter === "planned") return "Planned (Manual)";
  if (activeTaskTypeFilter === "preventive") return "Preventive";
  return "ALL";
}

// =====================
// TASK TYPE FILTER UI
// - 2 active → ALL
// - 1 active → that type
// - 0 active → FORCED back to ALL
// =====================
document.addEventListener("click", e => {
  const btn = e.target.closest(".task-type-btn");
  if (!btn) return;

  const type = btn.dataset.type;
  if (!type) return;

  // toggle clicked button
  btn.classList.toggle("active");

  const buttons = Array.from(
    document.querySelectorAll(".task-type-btn")
  );

  const active = buttons.filter(b =>
    b.classList.contains("active")
  );

  // ❌ 0 active → force ALL (activate both)
  if (active.length === 0) {
    buttons.forEach(b => b.classList.add("active"));
    activeTaskTypeFilter = "all";
  }

  // ✅ 2 active → ALL
  else if (active.length === 2) {
    activeTaskTypeFilter = "all";
  }

  // 🎯 1 active → that type
  else {
    activeTaskTypeFilter = active[0].dataset.type;
  }

  renderTable();
});

// =====================
// TASK TYPE FILTER
// =====================
function filterByTaskType(tasks) {
  

  if (!Array.isArray(tasks)) return [];

  if (activeTaskTypeFilter === "planned") {
    return tasks.filter(t => isPlannedManual(t));
  }

  if (activeTaskTypeFilter === "preventive") {
    return tasks.filter(t => isPreventive(t));
  }
console.log("filterByTaskType():", activeTaskTypeFilter, "sample:", tasks?.[0]);
  // implicit ALL
  return tasks;
}
/* =====================
    ASSET DASHBOARD – DATA
===================== */
function showDefaultDashboard() {
  // tabs
  document.querySelectorAll(".main-tab").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-tab="assets"]').classList.add("active");

  // panels
  document.querySelectorAll('[id^="tab-"]').forEach(t => (t.style.display = "none"));
  document.getElementById("tab-assets").style.display = "block";

  // render dashboard
  if (typeof renderAssetDashboard === "function") {
    renderAssetDashboard();
  }
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
  <div
    class="machine-name clickable"
    onclick="openAssetViewBySerial('${task.serial_number}')"
    title="Open asset view"
  >
    ${highlight(task.machine_name || "", q)}
  </div>

  ${
    task.serial_number
      ? `
        <div
          class="machine-sn clickable"
          onclick="openAssetViewBySerial('${task.serial_number}')"
          title="Open asset view"
        >
          <small>${highlight(task.serial_number, q)}</small>
        </div>
      `
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
  // 🆕 εδώ ΜΟΝΟ
  updateCentralHistoryLegendCounts(executionsData);
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

// ====================================================
// VIEW HISTORY ENTRY – ASSET HEADER FIRST– WITH TYPE COLOR
// ======================================================

function viewHistoryEntry(executionId) {
  const h = executionsData.find(e => e.id === executionId);
  if (!h) return;

  const el = document.getElementById("historyViewContent");

  // 🎨 TYPE CLASS
  let typeClass = "history-type-planned";
  if (h.is_planned === false) {
    typeClass = "history-type-breakdown";
  } else if (h.frequency_hours) {
    typeClass = "history-type-preventive";
  }

  const durationLabel =
    Number.isFinite(Number(h.duration_min))
      ? `${h.duration_min} min`
      : "—";

  el.innerHTML = `
    <!-- =====================
         ASSET HEADER
    ====================== -->
    <div class="history-asset-header ${typeClass}">
      <div class="history-asset-main">
        ${h.machine}
      </div>
      <div class="history-asset-sub">
        SN: ${h.serial_number} • Line ${h.line}
      </div>
    </div>

    <!-- =====================
         EXECUTION DETAILS
    ====================== -->
    <div class="history-view-grid">

      <div class="history-view-section">
        <strong>Date</strong>
        <div>${formatDateTime(h.executed_at)}</div>
      </div>

      <div class="history-view-section">
        <strong>Service Time</strong>
        <div class="history-emphasis">${durationLabel}</div>
      </div>

      <div class="history-view-section">
        <strong>Executed By</strong>
        <div>${h.executed_by || "-"}</div>
      </div>

      <div class="history-view-section">
        <strong>Task</strong>
        <div>${h.task}</div>
      </div>

      <div class="history-view-section full-width">
        <strong>Section / Unit</strong>
        <div>
          ${h.section || "-"}${h.unit ? " / " + h.unit : ""}
        </div>
      </div>

      <div class="history-view-section full-width">
        <strong>Notes</strong>
        <div>${h.notes || "—"}</div>
      </div>

    </div>
  `;

  document.getElementById("historyViewOverlay").style.display = "flex";
}

function openHistoryViewByExecutionId(executionId) {
  const overlay = document.getElementById("historyViewOverlay");
  if (!overlay) {
    console.warn("HistoryView overlay not found");
    return;
  }

  // άνοιξε modal
  overlay.style.display = "flex";

  // γέμισε περιεχόμενο
  viewHistoryEntry(executionId);
}

// Close history view
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

// =====================
// CENTRAL HISTORY – LEGEND COUNTERS (CORRECT & SAFE)
// =====================
function updateCentralHistoryLegendCounts(history) {
   console.log("🔥 updateCentralHistoryLegendCounts CALLED", history?.length);
  if (!Array.isArray(history)) return;

  let breakdown = 0;
  let preventive = 0;
  let planned = 0;

  history.forEach(e => {
    // 🔴 Breakdown / Unplanned
    if (e.is_planned === false) {
      breakdown++;
      return;
    }

    // 🟢 Preventive
    if (
      e.is_planned === true &&
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ) {
      preventive++;
      return;
    }

    // 🟡 Planned manual
    if (e.is_planned === true) {
      planned++;
    }
  });

  const b = document.getElementById("centralHistoryBreakdownCount");
  const p = document.getElementById("centralHistoryPreventiveCount");
  const m = document.getElementById("centralHistoryPlannedCount");

  if (b) b.textContent = breakdown;
  if (p) p.textContent = preventive;
  if (m) m.textContent = planned;

  console.log("CENTRAL HISTORY COUNTS", {
    breakdown,
    preventive,
    planned
  });
}

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
//======================
// FILTERED TASKS FOR PRINTING
//======================

function getFilteredTasksForPrint() {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return filterByTaskType(tasksData)   // 🟢 ← ΜΟΝΗ ΑΛΛΑΓΗ

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

    // TASK DATE RANGE FILTER (From – To)
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

// =====================
// ACTIVATE ASSET TAB (STABLE VERSION)
// =====================

function activateAssetTab(tabName) {
  if (!tabName) return;

  // --- UI state ---
  document.querySelectorAll(".asset-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  document.querySelectorAll(".asset-tab-panel").forEach(panel => {
    panel.style.display =
      panel.dataset.panel === tabName ? "block" : "none";
  });

  // --- DATA render (SAFE) ---
  if (tabName === "active") {
    renderAssetTasksTable(
      Array.isArray(assetActiveTasks) ? assetActiveTasks : []
    );
  }

  if (tabName === "history") {
    renderAssetHistoryTable(
      Array.isArray(assetHistoryTasks) ? assetHistoryTasks : []
    );
  }
}

// =====================
// TAB CLICK HANDLER (SCOPED)
// =====================
function bindAssetTabs() {
  const container = document.getElementById("assetViewOverlay");
  if (!container) return;

  container.addEventListener("click", e => {
    const tab = e.target.closest(".asset-tab");
    if (!tab) return;

    const tabName = tab.dataset.tab;
    if (!tabName) return;

    activateAssetTab(tabName);
  });
}

// =====================
// RENDER TASKS TABLE (WITH FILTERS)
// =====================
function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const q = document.getElementById("taskSearch")?.value || "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const source = filterByTaskType(tasksData);
console.log("renderTable(): tasksData =", tasksData.length, "source(after type) =", source.length, "type =", activeTaskTypeFilter);

const filtered = source


  // 🔍 SEARCH
  .filter(t => matchesSearch(t, q))

  // 🟨🔵 TASK TYPE FILTER (MASTER)
  .filter(t => {
    if (activeTaskTypeFilter === "planned") {
      return isPlannedManual(t);
    }
    if (activeTaskTypeFilter === "preventive") {
      return isPreventive(t);
    }
    return true; // ALL
  })


    // MACHINE FILTER
    .filter(t => {
      if (activeAssetFilter === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === activeAssetFilter;
    })

    // =====================
    // DATE FILTER (UNIFIED – FIXED)
    // =====================
    .filter(t => {
      const hasDue = !!t.due_date;

      // 🔴 Custom date range (priority)
      if (taskDateFrom || taskDateTo) {
        if (!hasDue) return false;

        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);

        if (taskDateFrom && due < taskDateFrom) return false;
        if (taskDateTo && due > taskDateTo) return false;
        return true;
      }

      // 🟢 Quick date filters
      if (activeDateFilter === "today") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due.getTime() === today.getTime();
      }

      if (activeDateFilter === "week") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due >= today && due <= weekEnd;
      }

      if (activeDateFilter === "overdue") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due < today;
      }

      // ⚪ ALL → ΔΕΝ φιλτράρουμε τίποτα
      return true;
    })

    // =====================
    // SORT (STABLE & CORRECT)
    // =====================
    .sort((a, b) => {
      const order = {
        overdue: 0,
        today: 1,
        soon: 2,
        ok: 3,
        unknown: 4,
        done: 5
      };

      const da = order[getDueState(a)] ?? 99;
      const db = order[getDueState(b)] ?? 99;

      if (da !== db) return da - db;

      // secondary sort by due_date
      if (!a.due_date && b.due_date) return 1;
      if (!b.due_date && a.due_date) return -1;
      if (!a.due_date && !b.due_date) return 0;

      return new Date(a.due_date) - new Date(b.due_date);
    });

  // =====================
  // UPDATE TASKS COUNT + DURATION
  // =====================
  const countEl = document.getElementById("tasksCountLabel");
  if (countEl) {
    const n = filtered.length;

    const totalMinutes = filtered.reduce((sum, t) => {
      return t.duration_min != null ? sum + Number(t.duration_min) : sum;
    }, 0);

    let label = `${n} task${n === 1 ? "" : "s"}`;

    if (totalMinutes > 0) {
      label += ` • ${formatDuration(totalMinutes)}`;
    }

    countEl.textContent = label;
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
function printTasks() {
  const tasks = getFilteredTasksForPrint();

  if (!Array.isArray(tasks) || tasks.length === 0) {
    alert("No tasks to print");
    return;
  }

  const totalMinutes = tasks.reduce(
    (sum, t) => t.duration_min != null ? sum + Number(t.duration_min) : sum,
    0
  );

  window.printTaskSchedule({
    tasks,
    meta: {
      date: new Date().toLocaleDateString("el-GR"),
      period: getCurrentPeriodLabel(),
      asset: getAssetFilterLabel(),
      status: getStatusFilterLabel(),
      totalDuration: totalMinutes > 0 ? formatDuration(totalMinutes) : ""
    },
    helpers: {
      formatDate,
      formatDuration,
      getDueState
    }
  });
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
  // ✅ 🔥 ASSET DASHBOARD (TOP 6 WORST)
  if (typeof renderAssetDashboard === "function") {
    renderAssetDashboard();
  }
  // 🔄 Refresh asset cards if assets tab is active
  const assetsTab = document.getElementById("tab-assets");
  if (assetsTab?.classList.contains("active")) {
    renderAssetsCards();
  }

}
/* =====================
   ADD TASK TYPE LOGIC
   Planned vs Unplanned
===================== */

function applyAddTaskTypeUI(isPlanned) {

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

  // 🔹 Unplanned-only fields
  document.querySelectorAll(".unplanned-only").forEach(el => {
    el.style.display = isPlanned ? "none" : "block";
  });

  // 🔹 Visual cue on modal
  const modal = document.getElementById("addTaskModal");
  if (modal) {
    modal.classList.toggle("unplanned-mode", !isPlanned);
  }
}

// 🔁 Change handler
const taskTypeSelect = document.getElementById("taskPlannedType");

taskTypeSelect?.addEventListener("change", e => {
  applyAddTaskTypeUI(e.target.value === "planned");
});

// =====================
// OPEN ASSET VIEW BY SERIAL (FRONTEND)
// =====================
async function openAssetViewBySerial(serial) {
  try {
    console.group("ASSET VIEW DEBUG");

    // reset state
    assetAllTasks = [];
    assetActiveTasks = [];
    assetHistoryTasks = [];
    currentAssetSerial = serial;

    if (!serial) {
      alert("Missing serial number");
      console.groupEnd();
      return;
    }

    serial = String(serial).trim();

    const overlay = document.getElementById("assetViewOverlay");
    if (!overlay) {
      alert("Asset modal not found");
      console.groupEnd();
      return;
    }

    if (!Array.isArray(tasksData)) {
      alert("tasksData not ready");
      console.groupEnd();
      return;
    }

    // =====================
    // BUILD DATASETS FROM GLOBAL STATE
    // =====================
    assetAllTasks = tasksData.filter(
      t => String(t.serial_number || "").trim() === serial
    );

    assetActiveTasks = assetAllTasks.filter(
      t => t.status === "Planned" || t.status === "Overdue"
    );

    assetHistoryTasks = (Array.isArray(executionsData) ? executionsData : []).filter(
      e => String(e.serial_number || "").trim() === serial
    );

    if (assetAllTasks.length === 0 && assetHistoryTasks.length === 0) {
      alert("No records found for this asset");
      console.groupEnd();
      return;
    }

    // =====================
    // HEADER + KPIs
    // =====================
    const ref = assetAllTasks[0] || assetHistoryTasks[0];
    renderAssetViewHeader({
      machine_name: ref.machine_name || ref.machine || "-",
      serial_number: serial,
      line_code: ref.line_code || ref.line || "-"
    });

    renderAssetKpis(assetAllTasks, assetHistoryTasks);
    renderAssetMttrKpis(currentAssetSerial);

    // bind tabs ONCE
    bindAssetTabs();

    // open modal
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";

    // default tab
    activateAssetTab("active");

    // MTBF
    renderAssetMtbf(currentAssetSerial);

    console.log("✅ Asset view opened");
    console.groupEnd();

  } catch (err) {
    console.error("💥 openAssetViewBySerial crashed:", err);
    alert("Asset view error (see console).");
  }
}
// =====================
// REFRESH ASSET VIEW DATA (FROM GLOBALS)
// =====================
async function refreshAssetView() {
  if (!currentAssetSerial) return;

  // 🔄 1️⃣ reload GLOBAL data
  await loadTasks();
  await loadHistory();

  // 🔄 2️⃣ rebuild asset view data
  assetAllTasks = tasksData.filter(
    t => String(t.serial_number || "").trim() === currentAssetSerial
  );

  assetActiveTasks = assetAllTasks.filter(
    t => t.status === "Planned" || t.status === "Overdue"
  );

  assetHistoryTasks = executionsData.filter(
    e => String(e.serial_number || "").trim() === currentAssetSerial
  );

  // 🔄 3️⃣ re-render active tab
  const activeTab =
    document.querySelector(".asset-tab.active")?.dataset.tab || "active";

  activateAssetTab(activeTab);
}

// =====================
// RENDER ASSET MTBF + LAST BREAKDOWN
// =====================
function renderAssetMtbf(serial) {
  const mtbfEl = document.getElementById("assetMtbfValue");
  const lastEl = document.getElementById("assetLastBreakdown");

  if (!mtbfEl || !lastEl) return;

  // breakdowns μόνο
  const breakdowns = assetHistoryTasks.filter(
    e => e.is_planned === false
  );

  // MTBF
  const mtbfMin = calculateMtbfMinutes(breakdowns);

  if (mtbfMin == null) {
    mtbfEl.textContent = "—";
  } else {
    mtbfEl.textContent = formatDuration(mtbfMin);
  }

  // Last Breakdown
  const lastDate = getLastBreakdownDate(breakdowns);

  if (!lastDate) {
    lastEl.textContent = "No breakdowns recorded";
  } else {
    lastEl.textContent =
      `Last breakdown: ${formatDate(lastDate)}`;
  }
}

// =====================
// HEADER
// =====================
function renderAssetViewHeader(src) {
  document.getElementById("assetViewTitle").innerHTML = `
    ${src.machine_name}
    <small class="asset-sn">SN: ${src.serial_number}</small>
  `;

  document.getElementById("assetViewLine").textContent =
    src.line_code || "-";

  document.getElementById("assetViewStatus").textContent = "Active";
}

// =====================
// KPI COUNTS
// =====================

function renderAssetKpis(tasks, history) {
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(history)) history = [];

  // μόνο ενεργά (όχι Done)
  const activeTasks = tasks.filter(t => t.status !== "Done");

  const preventiveCount = activeTasks.filter(t => isPreventive(t)).length;

  const plannedManualCount = activeTasks.filter(t =>
    isPlannedManual(t)
  ).length;

  const overdueCount = activeTasks.filter(
    t => getDueState(t) === "overdue"
  ).length;

  const historyCount = history.length;

  // 🟨 Planned KPI → colored breakdown
  const plannedLabel = `
  <div class="asset-kpi-line">
    <span class="asset-status preventive">${preventiveCount} prev</span>
    <span class="sep">,</span>
    <span class="asset-status planned">${plannedManualCount} planned (manual)</span>
  </div>
`;

  document.getElementById("assetPlannedCount").innerHTML = plannedLabel;
  document.getElementById("assetOverdueCount").textContent = overdueCount;
  document.getElementById("assetHistoryCount").textContent = historyCount;
}
// =====================
// RENDER ASSET MTTR KPI
// =====================

function renderAssetMttrKpis(serial) {
  const mttrEl = document.getElementById("assetMttrValue");
  if (!mttrEl) return;

  const mttr = getAssetMttrBySerial(serial);
  const last = getLastBreakdownInfo(serial);

  let mttrLabel = "—";
  let breakdownLabel = "";
  let lastLabel = "";

  // MTTR value
  if (
    mttr &&
    Number.isFinite(Number(mttr.mttrMinutes)) &&
    mttr.mttrMinutes > 0
  ) {
    mttrLabel = `${Math.round(mttr.mttrMinutes)}m`;

    if (Number.isFinite(Number(mttr.breakdownCount)) && mttr.breakdownCount > 0) {
      breakdownLabel = ` • ${mttr.breakdownCount} breakdowns`;
    }
  }

  // Last breakdown info
  if (last && last.executed_at && typeof formatRelativeDate === "function") {
    lastLabel = `
      <div class="kpi-sub">
        Last breakdown: ${formatRelativeDate(last.executed_at)}
      </div>
    `;
  }

  mttrEl.innerHTML = `
    ${mttrLabel}
    ${breakdownLabel}
    ${lastLabel}
  `;
}


// =====================
// ASSET ACTIVE TASKS TABLE – BULLETPROOF + MULTISELECT
// =====================
function renderAssetTasksTable(tasks) {
  const tasksWrap = document.querySelector(".asset-tasks-table");
  const historyWrap = document.querySelector(".asset-history-table");
  const tbody = document.querySelector("#assetTasksTable tbody");

  if (!tasksWrap || !tbody) return;

  // ✅ Toggle tables
  tasksWrap.style.display = "block";
  if (historyWrap) historyWrap.style.display = "none";

  tbody.innerHTML = "";
  assetSelectedTaskIds.clear(); // reset on render
  updateAssetBulkActionsBar();  // hide bar on refresh

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">No active tasks</td>
      </tr>
    `;
    tasksWrap.offsetHeight;
    tbody.offsetHeight;
    return;
  }

  tasks.forEach(t => {
    const tr = document.createElement("tr");
    tr.classList.add("clickable");

    const dur =
      t.duration_min != null ? formatDuration(t.duration_min) : "—";

    // =====================
    // STATUS (TYPE + DUE STATE)
    // =====================
    let typeLabel = "Planned";
    let typeClass = "planned";

    if (isPreventive(t)) {
      typeLabel = "Preventive";
      typeClass = "preventive";
    }

    const dueState = getDueState(t); // overdue | today | soon | ok
    let dueLabel = "";

    if (dueState === "overdue") dueLabel = "Overdue";
    else if (dueState === "today") dueLabel = "Today";
    else if (dueState === "soon") dueLabel = "Due soon";

    // =====================
    // CHECKBOX CELL
    // =====================
    const checkboxTd = document.createElement("td");
    checkboxTd.className = "select-cell";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "asset-task-checkbox";

    checkbox.addEventListener("click", e => {
      e.stopPropagation();

      if (checkbox.checked) {
        assetSelectedTaskIds.add(t.id);
      } else {
        assetSelectedTaskIds.delete(t.id);
      }

      updateAssetBulkActionsBar();
    });

    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);

    // =====================
    // ROW CONTENT
    // =====================
    tr.insertAdjacentHTML(
      "beforeend",
      `
      <td class="asset-status ${typeClass}">
        <span class="status-type">${typeLabel}</span>
        ${dueLabel ? `<span class="status-due ${dueState}">• ${dueLabel}</span>` : ""}
      </td>
      <td>${t.unit || "-"}</td>
      <td>${t.task}</td>
      <td>${t.type || "-"}</td>
      <td>${formatDate(t.due_date)}</td>
      <td>${dur}</td>
      `
    );

    tr.addEventListener("click", () => openTaskView(t.id));
    tbody.appendChild(tr);
  });

  // 🔥 force reflow (display:none → block safety)
  tasksWrap.offsetHeight;
  tbody.offsetHeight;
}

// =====================
// ASSET BULK ACTION BAR – UI ONLY (STEP 2)
// =====================
function updateAssetBulkActionsBar() {
  const bar = document.getElementById("assetBulkActionsBar");
  const countEl = document.getElementById("assetBulkSelectedCount");

  if (!bar || !countEl) return;

  const count = assetSelectedTaskIds.size;

  if (count > 0) {
    countEl.textContent = count;
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

function clearAssetBulkSelection() {
  assetSelectedTaskIds.clear();

  document
    .querySelectorAll("#assetTasksTable tbody input[type='checkbox']")
    .forEach(cb => (cb.checked = false));

  updateAssetBulkActionsBar();
}

// =====================
// KPI → TABLE FILTER
// =====================
function bindAssetKpiFilters() {
  document
    .querySelectorAll(".asset-kpis .kpi-card.clickable")
    .forEach(card => {
      card.onclick = () => {
        const filter = card.dataset.filter;

        const tasksWrap =
          document.querySelector(".asset-tasks-table");
        const historyWrap =
          document.querySelector(".asset-history-table");

        if (filter === "history") {
          // 🔄 Show history
          tasksWrap.style.display = "none";
          historyWrap.style.display = "block";
          renderAssetHistoryTable(assetScopedHistory);
          return;
        }

        // 🔄 Show active tasks
        historyWrap.style.display = "none";
        tasksWrap.style.display = "block";

        if (filter === "planned") {
          renderAssetTasksTable(
            assetScopedTasks.filter(t => t.status === "Planned")
          );
        } else if (filter === "overdue") {
          renderAssetTasksTable(
            assetScopedTasks.filter(t => t.status === "Overdue")
          );
        } else {
          renderAssetTasksTable(assetScopedTasks);
        }
      };
    });
}

// =====================
// ASSET HISTORY TABLE (EXECUTIONS) – TASK VIEW INTEGRATED
// =====================
function renderAssetHistoryTable(history) {
  const tasksWrap = document.querySelector(".asset-tasks-table");
  const historyWrap = document.querySelector(".asset-history-table");
  const tbody = document.querySelector("#assetHistoryTable tbody");

  if (!historyWrap || !tbody) return;

  // ✅ Toggle tables (SYMMETRIC)
  if (tasksWrap) tasksWrap.style.display = "none";
  historyWrap.style.display = "block";

  tbody.innerHTML = "";

  if (!history || history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">No history records</td>
      </tr>
    `;
    // 🔥 Force reflow on WRAPPER + TBODY
    historyWrap.offsetHeight;
    tbody.offsetHeight;
    return;
  }

  history.forEach(e => {
    const tr = document.createElement("tr");
    tr.classList.add("clickable");
        // 👇 👇 👇 CLASSIFICATION / COLOR LOGIC
          if (e.is_planned === false) {
        // 🔴 Breakdown / Unplanned
          tr.classList.add("history-unplanned");
      } else if (e.is_planned === true && e.frequency_hours == null) {
        // 🟡 Planned (Manual)
          tr.classList.add("history-planned");
      } else if (e.is_planned === true && e.frequency_hours != null) {
        // 🟢 Preventive
          tr.classList.add("history-preventive");
      }

    tr.innerHTML = `
      <td>${formatDate(e.executed_at)}</td>
      <td>${e.task}</td>
      <td>${e.type || "-"}</td>
      <td>${e.executed_by || "-"}</td>
      <td>${e.notes || "-"}</td>
      <td>
        <button class="btn-secondary btn-sm">View</button>
      </td>
    `;

    tr.querySelector("button").onclick = ev => {
  ev.stopPropagation();

  // 🔒 Κλείνουμε AssetView ΜΟΝΟ εδώ
  //document.getElementById("assetViewOverlay").style.display = "none";

  // 🔥 Ανοίγουμε History modal
  viewHistoryEntry(e.id);
};
    tbody.appendChild(tr);
  });

  // 🔥 Force reflow on WRAPPER + TBODY
  historyWrap.offsetHeight;
  tbody.offsetHeight;
}

// =====================
// CLOSE
// =====================
 function closeAssetView() {
  document.getElementById("assetViewOverlay").style.display = "none";

  assetAllTasks = [];
  assetActiveTasks = [];
  assetHistoryTasks = [];
  currentAssetSerial = null;

  document.querySelector("#assetTasksTable tbody").innerHTML = "";
}
// =====================
// ASSET BULK ACTIONS – EVENT HANDLERS (STEP 2)
// =====================
document.addEventListener("click", e => {
  if (e.target.id === "assetBulkClearBtn") {
    clearAssetBulkSelection();
  }

  if (e.target.id === "assetBulkDoneBtn") {
    if (assetSelectedTaskIds.size === 0) return;
    bulkDoneMode = true;
    openBulkDoneModal();
  }
});

/* =====================
   SAVE TASK (PLANNED / UNPLANNED)
===================== */
document.getElementById("saveTaskBtn")?.addEventListener("click", async () => {

  const isPlanned =
    document.getElementById("taskPlannedType")?.value === "planned";

  // Due date required for Planned tasks
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

  // Asset validation
  if (!assetId) {
    alert("Asset is required");
    return;
  }

  // Task description validation
  const taskDesc = document.getElementById("nt-task")?.value?.trim();
  if (!taskDesc) {
    alert("Task description is required");
    return;
  }

  // Technician required ONLY for unplanned
  if (!isPlanned && !technician) {
    alert("Technician is required for unplanned tasks");
    return;
  }

  /* =====================
     DURATION HANDLING
  ===================== */

  let durationMin = null;

  if (isPlanned) {
    const d = document.getElementById("nt-duration")?.value;
    const n = Number(d);
    if (Number.isFinite(n) && n > 0) {
      durationMin = n;
    }
  } else {
    const input = document.getElementById("nt-breakdown-duration");

    if (!input) {
      alert("Internal error: breakdown duration field not found");
      return;
    }

    const n = Number(input.value);

    if (!Number.isFinite(n) || n <= 0) {
      alert("Service time (minutes) is required for breakdown tasks.");
      input.focus();
      return;
    }

    durationMin = n;
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

    // Planned → due date | Breakdown → execution date
    due_date: isPlanned
      ? document.getElementById("nt-due")?.value
      : null,

    /* =====================
       DURATION & EXECUTION
    ===================== */

    // Estimated (planned)
    duration_min: isPlanned ? durationMin : null,

    // Breakdown ONLY
    execution_duration_min: !isPlanned ? durationMin : null,

    execution_date: !isPlanned
      ? document.getElementById("nt-breakdown-date")?.value || null
      : null,

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

    // Close Add Task modal
    const addOverlay = document.getElementById("addTaskOverlay");
    if (addOverlay) {
      addOverlay.style.display = "none";

      // NEW: reset z-index in case it was opened from Asset View
      addOverlay.style.zIndex = "";
    }

    // Reset form
    document.querySelectorAll(
      "#addTaskModal input, #addTaskModal textarea, #addTaskModal select"
    ).forEach(el => el.value = "");

    // Refresh data
  loadTasks();

  // NEW: keep Asset View in sync if it is open
  if (currentAssetSerial) {

  if (!isPlanned) {
    await loadHistory();
  }

  await refreshAssetView();

  if (isPlanned) {
    activateAssetTab("active");

    // NEW: auto-scroll to first active task row
    requestAnimationFrame(() => {
      const row = document.querySelector(
        "#assetTasksTable tbody tr"
      );
      if (row) {
        row.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        row.classList.add("row-highlight");
      }
    });

  } else {
    activateAssetTab("history");

    // NEW: auto-scroll to first history entry
    requestAnimationFrame(() => {
      const row = document.querySelector(
        "#assetHistoryTable tbody tr"
      );
      if (row) {
        row.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        row.classList.add("row-highlight");
      }
    });
  }
}
    } catch (err) {
      console.error("SAVE TASK ERROR:", err);
      alert(err.message);
  }
});

function resetAddTaskAssetContext() {
  const lineSel = document.getElementById("nt-line");
  const assetSel = document.getElementById("nt-asset");

  if (!lineSel || !assetSel) return;

  // Enable dropdowns
  lineSel.disabled = false;
  assetSel.disabled = false;

  // Remove visual lock (if used)
  lineSel.classList.remove("locked");
  assetSel.classList.remove("locked");
}


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
  resetAddTaskAssetContext();
  e.preventDefault();

  // 🔑 Ensure assets are loaded
  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    await loadAssets();
  }

  const overlay = document.getElementById("addTaskOverlay");
  if (!overlay) return;

  // 🔹 Reset task type → Planned (DEFAULT)
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    applyAddTaskTypeUI(true); // ✅ FORCE correct UI state
  }

  // 🔹 Populate Line dropdown
  populateAddTaskLines();

  // 🔹 Reset asset dropdown
  const assetSel = document.getElementById("nt-asset");
  if (assetSel) {
    assetSel.innerHTML = `<option value="">Select Asset</option>`;
    assetSel.disabled = false; // allow asset selection in free Add Task
  }
  console.log("ASSETS DATA:", assetsData);

  overlay.style.display = "flex";
});

// =====================
// OPEN ADD TASK WITH ASSET CONTEXT (FROM DASHBOARD)
// =====================
async function openAddTaskForAsset(machine, serial, line) {
  console.group("ADD TASK FROM DASHBOARD");

  if (!machine || !serial) {
    alert("Missing asset context");
    console.groupEnd();
    return;
  }

  // 🔑 Ensure assets are loaded
  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    await loadAssets();
  }

  const overlay = document.getElementById("addTaskOverlay");
  if (!overlay) {
    console.groupEnd();
    return;
  }

  // 🔹 Default Planned
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    applyAddTaskTypeUI(true);
  }

  // 🔹 Context labels
  const ctxAsset = document.getElementById("ctx-asset");
  const ctxLocation = document.getElementById("ctx-location");

  if (ctxAsset) ctxAsset.textContent = `🏭 ${machine} • SN ${serial}`;
  if (ctxLocation) ctxLocation.textContent = `Line ${line || "—"}`;

  // 🔹 Populate lines
  populateAddTaskLines();

  // 🔹 Preselect + LOCK line
  const lineSelect = document.getElementById("nt-line");
  if (lineSelect && line) {
    lineSelect.value = line;
    lineSelect.dispatchEvent(new Event("change"));
    lineSelect.disabled = true;
    lineSelect.classList.add("locked");
  }

  // 🔁 Wait until asset dropdown is populated, then select + LOCK by SERIAL
  const waitForAssetDropdown = () => {
    const assetSel = document.getElementById("nt-asset");
    if (!assetSel) return;

    // enable temporarily (in case it's disabled by default)
    assetSel.disabled = false;

    const option = [...assetSel.options].find(opt =>
      opt.textContent.includes(serial)
    );

    if (option) {
      assetSel.value = option.value;
      assetSel.disabled = true;
      assetSel.classList.add("locked");
      return;
  }

  // ⏳ retry until options exist
  setTimeout(waitForAssetDropdown, 30);
};
  waitForAssetDropdown();
  waitForAssetDropdown();

  overlay.style.display = "flex";
  console.log("Context:", { machine, serial, line });
  console.groupEnd();

  // ✨ UX polish
  document.getElementById("nt-task")?.focus();
}
// =====================
// ASSET ADD TASK BUTTON (USING CURRENT ASSET CONTEXT)
// =====================

document.getElementById("assetAddTaskBtn")
  ?.addEventListener("click", () => {

    if (!currentAssetSerial) {
      alert("Asset context missing");
      return;
    }

    const ref =
      assetAllTasks[0] ||
      assetsData.find(a =>
        String(a.serial_number).trim() === String(currentAssetSerial).trim()
      );

    if (!ref) {
      alert("Asset data not found");
      return;
    }

    // Bring Add Task modal above Asset View
    const addOverlay = document.getElementById("addTaskOverlay");
    if (addOverlay) {
      addOverlay.style.zIndex = "1200"; // higher than assetViewOverlay
    }

    openAddTaskForAsset(
      ref.machine_name || ref.model,
      currentAssetSerial,
      ref.line_code || ref.line
    );
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

// =====================
// POPULATE LINES IN ADD TASK MODAL
// =====================

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
   OPEN CONFIRM DONE MODAL (BULK)
===================== */
function openBulkDoneModal() {
  pendingTaskId = null;

  // 📅 default completion date = today
  const today = new Date().toISOString().split("T")[0];
  const dateInput = getEl("completedDateInput");
  if (dateInput) {
    dateInput.value = today;
  }

  // 📝 clear notes (bulk = mixed tasks)
  const notesInput = getEl("doneNotesInput");
  if (notesInput) {
    notesInput.value = "";
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
   CONFIRM TASK DONE (SINGLE + BULK)
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
    // =====================
    // 🟢 BULK DONE PATH
    // =====================
    if (bulkDoneMode === true) {
      const res = await fetch(`${API}/tasks/bulk-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds: [...assetSelectedTaskIds],
          completed_by: name,
          completed_at: completedAt,
          notes
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk complete failed");
      }

      const completedCount = assetSelectedTaskIds.size;

      // =====================
      // 🧹 RESET BULK STATE + UI
      // =====================
      bulkDoneMode = false;
      assetSelectedTaskIds.clear();

      document
        .querySelectorAll(".asset-task-checkbox")
        .forEach(cb => (cb.checked = false));

      const bar = getEl("assetBulkActionsBar");
      if (bar) bar.style.display = "none";

      // 🔄 REFRESH GLOBAL DATA
      await loadTasks();
      await loadHistory();

      // 🔄 REFRESH ASSET CARDS (stats, risk dots, counts)
      if (typeof renderAssetsCards === "function") {
        renderAssetsCards();
      }

      // 🔄 REFRESH ASSET VIEW (AFTER DATA IS FRESH)
      if (currentAssetSerial) {
        await openAssetViewBySerial(currentAssetSerial);
        activateAssetTab("active");
      }

      // =====================
      // ✅ FEEDBACK
      // =====================
      alert(`✔ ${completedCount} εργασίες ολοκληρώθηκαν`);
    }

    // =====================
    // 🔵 SINGLE DONE PATH
    // =====================
    else {
      const res = await fetch(`${API}/tasks/${pendingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_by: name,
          completed_at: completedAt,
          notes
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to complete task");
      }

      pendingTaskId = null;
    }

    // =====================
    // 🧹 COMMON CLEANUP
    // =====================
    getEl("modalOverlay").style.display = "none";
    getEl("technicianInput").value = "";
    if (getEl("completedDateInput")) {
      getEl("completedDateInput").value = "";
    }
    if (getEl("doneNotesInput")) {
      getEl("doneNotesInput").value = "";
    }

    // 🔄 COMMON REFRESH
    loadTasks();
    loadHistory();

    // 🔄 ENSURE ASSET CARDS STAY IN SYNC
    if (typeof renderAssetsCards === "function") {
      renderAssetsCards();
    }

    if (typeof refreshAssetView === "function") {
      refreshAssetView();
    }

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
   GET LAST ACTIVITY FOR ASSET
===================== */

function getLastActivityForAsset(serial) {
  if (!Array.isArray(executionsData) || !serial) return null;

  const list = executionsData
    .filter(e => String(e.serial_number || "").trim() === String(serial).trim())
    .sort((a, b) => new Date(b.executed_at || 0) - new Date(a.executed_at || 0));

  if (!list.length) return null;

  const last = list[0];

  const when = typeof formatRelativeDate === "function"
    ? formatRelativeDate(last.executed_at)
    : new Date(last.executed_at).toLocaleDateString("el-GR");

  return {
    is_breakdown: last.is_planned === false,
    when
  };
}


/* =====================
   ASSETS (CRUD)
===================== */

async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    assetsData = await res.json();
    console.log("ASSETS SAMPLE:", assetsData[0]);

    populateAssetLineFilter();

    const sel = document.getElementById("assetLineFilter");
    if (sel) {
      sel.onchange = renderAssetsCards; // use unified renderer (cards / table)
    }

    renderAssetsCards(); // default render (cards)
  } catch (err) {
    console.error("Failed to load assets", err);
  }
}
/* =====================
    RENDER ASSETS CARDS VIEW
===================== */

function renderAssetsCards() {

  // Hide legacy table completely
  const tableWrap = document.querySelector(".table-card.assets-scroll");
  if (tableWrap) tableWrap.style.display = "none";

  const wrap = document.getElementById("assetsCardsView");
  if (!wrap) return;

  wrap.style.display = "grid";

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  wrap.innerHTML = "";

  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    wrap.innerHTML = `<div class="empty">No assets</div>`;
    return;
  }

  const filteredAssets = assetsData.filter(a =>
    selectedLine === "all" || a.line === selectedLine
  );

  if (filteredAssets.length === 0) {
    wrap.innerHTML = `<div class="empty">No assets for this line</div>`;
    return;
  }

  filteredAssets.forEach(a => {
    const card = document.createElement("div");
    card.className = "asset-card";
    card.dataset.serial = a.serial_number || "";

    // Card click → open asset view
    card.addEventListener("click", () => {
      const serial = card.dataset.serial;
      if (!serial) return;
      openAssetViewBySerial(serial);
    });

    const activity = getLastActivityForAsset(a.serial_number);    


    let activityHtml = `
      <span class="activity muted">
        🕒 No activity
      </span>
    `;

    if (activity) {
      activityHtml = activity.is_breakdown
        ? `<span class="activity danger activity-badge">⚠ Breakdown · ${activity.when}</span>`
        : `<span class="activity ok activity-badge">🕒 ${activity.when}</span>`;
    }
    const stats = getAssetTaskStats(a.id);
    const hasOverdue = stats.overdue > 0;

    card.innerHTML = `
      <div class="asset-card-header">
        <div class="asset-card-title">
          ${a.model || "-"}
          ${hasOverdue ? `<span class="asset-risk-dot"></span>` : ""}
        </div>

        <div class="asset-card-sn">SN: ${a.serial_number || "-"}</div>
      </div>      

      <div class="asset-card-meta">
        Line: <strong>${a.line || "-"}</strong>
      </div>

      <div class="asset-card-preventive">
        <span class="pill">
          ⏱ ~${stats.workloadHours30d}h / next 30d
        </span>        
      </div>

      <div class="asset-card-stats">
        <span class="stat">
          🛠 Active: <strong>${stats.active}</strong>
        </span>

        <span class="stat">
          ⏰ Overdue: <strong>${stats.overdue}</strong>
        </span>
      </div>

      <div class="asset-card-activity">
        ${activityHtml}
      </div>

      <div class="asset-card-actions asset-admin-only">
        <button
          class="asset-card-more"
          type="button"
          title="More actions">
          ...more
        </button>

        <div class="asset-card-menu" style="display:none;">
          <button class="asset-card-menu-item add-task">➕ Add Task</button>
          <button class="asset-card-menu-item edit">✏️ Edit</button>
          <button class="asset-card-menu-item archive">🚫 Archive</button>
        </div>
      </div>
    `;

    // ---- Activity click → Asset History tab ----
    
    const activityEl = card.querySelector(".activity-badge");
    if (activityEl) {
      activityEl.addEventListener("click", e => {
        e.stopPropagation();

        openAssetViewBySerial(a.serial_number);

        requestAnimationFrame(() => {
          activateAssetTab("history");
        });
      });
    }
    // ---- Menu & actions ----
    const moreBtn = card.querySelector(".asset-card-more");
    const menu = card.querySelector(".asset-card-menu");
    const addTaskItem = card.querySelector(".asset-card-menu-item.add-task");
    const editItem = card.querySelector(".asset-card-menu-item.edit");
    const archiveItem = card.querySelector(".asset-card-menu-item.archive");

    moreBtn?.addEventListener("click", e => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });

    // Close menu when clicking elsewhere
    document.addEventListener("click", () => {
      if (menu) menu.style.display = "none";
    });

    // Add Task
    addTaskItem?.addEventListener("click", e => {
      e.stopPropagation();
      menu.style.display = "none";
      openAddTaskForAsset(
        a.model,
        a.serial_number,
        a.line
      );
    });

    // Edit
    editItem?.addEventListener("click", e => {
      e.stopPropagation();
      menu.style.display = "none";
      editAsset(a.id);
    });

    // Archive
    archiveItem?.addEventListener("click", e => {
      e.stopPropagation();
      menu.style.display = "none";

      const ok = confirm(
        "Archive this asset?\n\nThis will hide it from active views."
      );

      if (ok) {
        deactivateAsset(a.id);
      }
    });

    wrap.appendChild(card);
  });

  // Apply role visibility on newly rendered action areas
  if (typeof applyRoleVisibility === "function") {
    applyRoleVisibility();
  }
}


/*==========================================
 LEGACY: Assets table view (kept as fallback)
============================================*/

function renderAssetsTable() {
  const tbody = document.querySelector("#assetsTable tbody");
  if (!tbody) return;
  
  if (!Array.isArray(tasksData) || tasksData.length === 0) {
  console.log("Assets cards waiting for tasks...");
  return;
}

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  tbody.innerHTML = "";

  // ✅ Guard: αν δεν έχει φορτώσει assetsData ακόμα
  if (!Array.isArray(assetsData)) {
    console.warn("renderAssetsTable: assetsData is not ready", assetsData);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" style="text-align:center;">No assets</td>`;
    tbody.appendChild(tr);
    return;
  }

  const filteredAssets = assetsData.filter(a =>
    selectedLine === "all" || a.line === selectedLine
  );

  if (filteredAssets.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" style="text-align:center;">No assets</td>`;
    tbody.appendChild(tr);
    return;
  }

  // ✅ Guard: executionsData μπορεί να μην υπάρχει καν σαν μεταβλητή
  const hasExecutionsData =
    (typeof executionsData !== "undefined") && Array.isArray(executionsData);

  if (!hasExecutionsData) {
    console.warn("renderAssetsTable: executionsData not ready yet (Last Activity will be —)");
  }

  filteredAssets.forEach(a => {
  try {
    const tr = document.createElement("tr");
    tr.classList.add("clickable-asset-row");
    tr.dataset.serial = a.serial_number || "";

// =====================
// LAST ACTIVITY (ICON + DURATION + "X ago")
// =====================
let lastActivityHtml = "—";

// local relative (no dependency)
const relativeAgo = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "—";

  const now = new Date();
  let diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  // future date safeguard
  if (diffSec < 0) diffSec = 0;

  const min = Math.floor(diffSec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  return `${day}d ago`;
};

if (Array.isArray(executionsData)) {
  const serialA = String(a.serial_number || "").trim();

  const lastExec = executionsData
    .filter(e => String(e.serial_number || "").trim() === serialA)
    .sort((x, y) => new Date(y.executed_at || 0) - new Date(x.executed_at || 0))[0];

  if (lastExec?.executed_at) {
    const when = relativeAgo(lastExec.executed_at);

    // ⏱ duration (minutes)
    const rawDuration = lastExec.duration_minutes ?? lastExec.duration_min ?? null;
    const durMin = Number.isFinite(Number(rawDuration)) ? Number(rawDuration) : null;
    const durLabel = durMin ? `${durMin}m` : "—";

    // 🎯 type → icon + class
    let icon = "🛠";
    let cls = "activity-planned";

    if (lastExec.is_planned === false) {
      icon = "⚠";
      cls = "activity-breakdown";
    } else if (
      (lastExec.type || "").toLowerCase().includes("ΕΛΕΓΧΟΣ") ||
      (lastExec.type || "").toLowerCase().includes("ΛΙΠΑΝΣΗ")
    ) {
      icon = "🟢";
      cls = "activity-check";
    }

    lastActivityHtml = `
      <span
        class="activity-badge ${cls}"
        data-exec-id="${lastExec.id}"
        title="View history entry"
      >
        ${icon}
        <span class="activity-duration">${durLabel}</span>
        <span class="activity-sep">•</span>
        <span class="activity-when">${when}</span>
      </span>
    `;

  }
}
      //  RENDER ROW (LOCKED)    

      tr.innerHTML = `
        <td>${a.line || "-"}</td>
        <td>${a.model || "-"}</td>
        <td>${a.serial_number || "-"}</td>

        <td class="last-activity">
          <div class="last-activity-cell">
            ${lastActivityHtml}
          </div>
        </td>

        <td class="asset-admin-only">
          <div class="asset-actions">
            <button class="btn-secondary btn-sm"
              onclick="editAsset(${a.id}); event.stopPropagation();">
              ✏️ Edit
            </button>

            <button class="btn-warning btn-sm"
              onclick="deactivateAsset(${a.id}); event.stopPropagation();">
              🚫 Archive
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);

    } catch (err) {
      // ❌ ΠΟΤΕ μην αφήσεις ένα row να σπάσει όλο το table
      console.error("renderAssetsTable row crash:", err, a);
    }
  });
}
  // =====================
  // LAST ACTIVITY → OPEN HISTORY ENTRY
  // =====================
  document.addEventListener("click", e => {
  // πιάσε badge Ή child του badge
  const badge = e.target.closest(".activity-badge");
  if (!badge) return;

  e.stopPropagation(); // ⛔ μην ανοίξει AssetView row

  const execId = Number(badge.dataset.execId);
  if (!Number.isFinite(execId)) {
    console.warn("No execId on activity badge", badge);
    return;
  }

  console.log("🕘 Open History Entry:", execId);

  openHistoryViewByExecutionId(execId);
});

// =====================
// ASSET INDEX → OPEN ASSET VIEW (FIX)
// =====================

document.addEventListener("click", e => {

  // ❌ ΜΗΝ ανοίγεις asset view αν το click είναι σε action
  if (e.target.closest(".asset-actions")) {
    return;
  }

  const row = e.target.closest(".clickable-asset-row");
  if (!row) return;

  const serial = row.dataset.serial;
  if (!serial) return;

  console.log("🟢 OPEN ASSET VIEW FROM ASSET INDEX", serial);
  openAssetViewBySerial(serial);
});

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

  // =====================
  // EDIT ASSET MODAL
  // =====================

let editingAssetId = null;

async function editAsset(assetId) {
  try {
    const asset = assetsData.find(a => a.id === assetId);
    if (!asset) return alert("Asset not found");

    editingAssetId = assetId;

    // ⬇️ LOAD LINES SAFELY
    const lines = await loadLinesOnce();

    // Populate fields
    getEl("edit-asset-model").value = asset.model || "";
    getEl("edit-asset-serial").value = asset.serial_number || "";
    getEl("edit-asset-description").value = asset.description || "";

    // Populate line dropdown
    const lineSel = getEl("edit-asset-line");
    lineSel.innerHTML = "";

    lines.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.code;
      if (l.id === asset.line_id) opt.selected = true;
      lineSel.appendChild(opt);
    });

    getEl("editAssetOverlay").style.display = "flex";
  } catch (err) {
    console.error("editAsset ERROR:", err);
    alert("Failed to open edit asset");
  }
}

  function closeEditAsset() {
    editingAssetId = null;
    document.getElementById("editAssetOverlay").style.display = "none";
  }

  /* =====================
      SAVE EDIT ASSET (PATCH)
  ===================== */

getEl("saveEditAssetBtn")?.addEventListener("click", async () => {
  if (!editingAssetId) return;

  const payload = {
    model: getEl("edit-asset-model").value.trim(),
    serial_number: getEl("edit-asset-serial").value.trim(),
    description: getEl("edit-asset-description").value.trim(),
    line_id: Number(getEl("edit-asset-line").value)
  };

  if (!payload.model || !payload.serial_number || !payload.line_id) {
    return alert("Line, Machine and Serial are required");
  }

  try {
    const res = await fetch(`${API}/assets/${editingAssetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    closeEditAsset();
    await loadAssets(); // 🔄 refresh table
    await loadTasks(); // 🔄 refresh tasks for updated asset
  } catch (err) {
    alert(err.message);
  }
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
   LOAD MTTR DATA
===================== */

async function loadMttrData() {
  try {
    const res = await fetch(`${API}/kpis/mttr`);
    mttrData = await res.json();
  } catch (err) {
    console.error("Failed to load MTTR data", err);
    mttrData = [];
  }
}
// =====================
// MTTR PER ASSET (minutes)
// =====================
function getAssetMttrBySerial(serial) {
  if (!serial || !Array.isArray(executionsData)) {
    return null;
  }

  const serialKey = String(serial).trim();

  // 🔥 ΜΟΝΟ breakdown executions
  const breakdowns = executionsData.filter(e =>
    String(e.serial_number || "").trim() === serialKey &&
    e.is_planned === false &&
    Number.isFinite(Number(e.duration_min)) &&
    Number(e.duration_min) > 0
  );

  if (breakdowns.length === 0) {
    return null;
  }

  let totalMin = 0;

  breakdowns.forEach(e => {
    totalMin += Number(e.duration_min);
  });

  return {
    mttrMinutes: Math.round(totalMin / breakdowns.length),
    breakdownCount: breakdowns.length
  };
}

/* =====================
   GET LAST BREAKDOWN INFO BY SERIAL
===================== */

function getLastBreakdownInfo(serial) {
  const list = (Array.isArray(executionsData) ? executionsData : [])
    .filter(e =>
      String(e.serial_number || "").trim() === String(serial).trim() &&
      e.is_planned === false
    )
    .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));

  if (!list.length) return null;

  return {
    executed_at: list[0].executed_at
  };
}


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
  if (fromDate) fromDate.setHours(0, 0, 0, 0);

  const toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

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

      // Planned (ALL: preventive + manual, not overdue)
      if (status === "planned") {
        return isPreventive(t) && new Date(t.due_date) >= today;
      }

      // Planned (Manual ONLY)
      if (status === "planned_manual") {
        return isPlannedManual(t) && new Date(t.due_date) >= today;
      }

      // Overdue
      if (status === "overdue") {
        return t.status !== "Done" && new Date(t.due_date) < today;
      }

      return true;
    });
}


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
  console.log("MAIN TABS SCRIPT LOADED");

  tab.addEventListener("click", () => {
    // 1️⃣ Active state
    document.querySelectorAll(".main-tab")
      .forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    console.log("TAB CLICKED:", tab.dataset.tab);

    // 2️⃣ Hide all panels
    ["dashboard", "tasks", "assets", "library", "docs", "reports"].forEach(t => {
      const el = getEl(`tab-${t}`);
      if (el) el.style.display = "none";
    });

    // 3️⃣ Show selected panel
    const sel = tab.dataset.tab;
    const active = getEl(`tab-${sel}`);
    if (active) active.style.display = "block";

    // 4️⃣ Existing logic (unchanged)
    if (sel === "assets") {
      loadAssets();
    }

    if (sel === "reports") {
      loadHistory();
      loadReports();
    }

    if (sel === "dashboard" && typeof renderAssetDashboard === "function") {
      renderAssetDashboard();
    }

    // ✅ 🔥 THE FIX – LIBRARY
    if (sel === "library") {
      (async () => {
        if (!Array.isArray(assetsData) || assetsData.length === 0) {
          await loadAssets(); // ⬅️ ΤΟ ΕΛΕΙΠΕ
        }
        loadLibrary();
        populateLibraryModels();
        renderLibraryTable();
      })();
    }

  });
});


/* =====================
   EVENT LISTENERS
===================== */

// Open button
document
  .getElementById("openAnalyticsBtn")
  ?.addEventListener("click", openAnalyticsModal);

// Close button
document
  .getElementById("closeAnalyticsBtn")
  ?.addEventListener("click", closeAnalyticsModal);

// Click outside modal box → close
document
  .getElementById("analyticsOverlay")
  ?.addEventListener("click", (e) => {
    if (e.target.id === "analyticsOverlay") {
      closeAnalyticsModal();
    }
  });

// ESC key → close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAnalyticsModal();
  }
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
// =====================
// SNAPSHOT EXPORT (DELEGATED - SAFE)
// =====================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#exportSnapshot");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  console.log("EXPORT SNAPSHOT CLICKED");

  try {
    const res = await fetch(`${API}/snapshot/export`);
    if (!res.ok) {
      alert("Snapshot export failed");
      return;
    }

    const data = await res.json();

    const name = `CMMS_snapshot_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error("Snapshot export error:", err);
    alert("Snapshot export error");
  }
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
// =====================
// SHOW LAST RESTORED SNAPSHOT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem("lastRestoredSnapshot");
  const statusEl = document.getElementById("snapshotStatus");

  if (!statusEl) return;

  if (last) {
    statusEl.textContent = `Last restored: ${last}`;
    statusEl.classList.add("loaded");
  } else {
    statusEl.textContent = "No snapshot loaded";
    statusEl.classList.remove("loaded");
  }
});

document.addEventListener(
  "click",
  e => {
    const row = e.target.closest(".clickable-asset-row");
    if (!row) return;

    console.log(
      "🔍 KPI CLICK DETECTED",
      {
        target: e.target,
        row,
        serial: row.dataset.serial
      }
    );
  },
  true // capture
);
// =====================
// DEFAULT TAB ON LOAD
// =====================
window.addEventListener("DOMContentLoaded", () => {
  const dashTab = document.querySelector('.main-tab[data-tab="assets"]');
  if (dashTab) dashTab.click();
});

