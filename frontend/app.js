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
   Render HISTORY table
===================== */

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
    // 📅 DATE FILTER (Last 7 / 30 / All)
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
    // 🧩 TYPE FILTER (Planned / Breakdown / Preventive)
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

      // 🎨 classify execution
      const execType = getExecutionType(h);
      tr.classList.add(`history-${execType}`);

      // =====================
// HISTORY ACTIONS (SAFE UX)
// =====================
// Rules:
// 🟩 Preventive        → Restore
// 🟨 Planned (manual)  → Restore
// 🟥 Unplanned / Breakdown → View + Edit
// — Default            → No action
// =====================

// default (no available action)
let actionHtml = `<span class="muted">—</span>`;

// 🟩 Preventive & 🟨 Planned (Manual)
// Restore execution back to active tasks list
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
  </div>
  `;
}

// 🟥 Unplanned / Breakdown
// View execution details + Edit breakdown metadata
else if (execType === "unplanned") {
  actionHtml = `
    <div class="history-action-group">
      <button
        class="btn-secondary"
        title="View breakdown details"
        onclick="viewHistoryEntry(${h.id})">
        👁
      </button>

      <button
        class="btn-history-edit"
        title="Edit breakdown details"
        onclick="editBreakdown(${h.id})">
        ✏️
      </button>
    </div>
  `;
}
      tr.innerHTML = `
        <td title="${formatDateTime(h.executed_at)}">
          ${formatDateOnly(h.executed_at)}
        </td>

        <td>
          <strong>${h.machine}</strong><br>
          <small>SN: ${h.serial_number} | ${h.line}</small>
        </td>

        <td>
          <div><strong>${h.task}</strong></div>
          <small>
            ${h.section || ""}
            ${h.section && h.unit ? " / " : ""}
            ${h.unit || ""}
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

  el.innerHTML = `

   <!-- =====================
       ASSET HEADER
  ====================== -->
  <div class="task-view-asset">
    <div class="asset-main">
      ${task.machine_name}
    </div>
    <div class="asset-sub">
      ${task.serial_number ? `SN: ${task.serial_number}` : ""}
      • Line ${task.line_code}
    </div>
  </div>

  <!-- =====================
       TASK TITLE
  ====================== -->
  <div class="task-view-title">
    ${task.task}
  </div>

  <!-- =====================
       TASK META
  ====================== -->
  <div class="task-view-meta">
    <span class="badge badge-type">${task.type || "Task"}</span>
    <span class="badge badge-status">${task.status}</span>
    <span class="badge badge-date">
      Due: ${formatDate(task.due_date)}
    </span>
  </div>

  <!-- =====================
       DETAILS
  ====================== -->
  <div class="task-view-details">
    <div>
      <label>Section</label>
      <div>${task.section || "-"}</div>
    </div>

    <div>
      <label>Unit</label>
      <div>${task.unit || "-"}</div>
    </div>

    <div>
      <label>Frequency</label>
      <div>${task.frequency_hours ? task.frequency_hours + " h" : "-"}</div>
    </div>

    <div>
      <label>Duration</label>
      <div>${task.duration_min ? task.duration_min + " min" : "-"}</div>
    </div>
  </div>
  ${task.status === "Done" ? `
  <div class="task-view-completed">
    ✔ Completed<br>
    <span>Done by <strong>${task.completed_by || "-"}</strong></span>
    <span> • ${task.completed_at ? formatDate(task.completed_at) : ""}</span>
  </div>
` : ""}

`;

  document.getElementById("taskViewOverlay").style.display = "flex";
// =====================
// EDIT BUTTON VISIBILITY
// =====================
currentViewedTask = task;

const editBtn = document.getElementById("editTaskBtn");
const editArea = document.getElementById("taskEditArea");

if (canEditTask(task)) {
  editBtn.style.display = "inline-flex";
  editArea.style.display = "none"; // αρχικά κρυφό
} else {
  editBtn.style.display = "none";
  editArea.style.display = "none";
}
const deleteBtn = document.getElementById("deleteTaskBtn");

if (canEditTask(task)) {
  editBtn.style.display = "inline-flex";
  deleteBtn.style.display = "inline-flex";
} else {
  editBtn.style.display = "none";
  deleteBtn.style.display = "none";
}

}
function enableTaskEdit() {
  if (!currentViewedTask) return;

  const t = currentViewedTask;

  // Fill edit fields
  document.getElementById("edit-task-desc").value = t.task || "";
  document.getElementById("edit-task-type").value = t.type || "";
  document.getElementById("edit-task-section").value = t.section || "";
  document.getElementById("edit-task-unit").value = t.unit || "";
  document.getElementById("edit-task-due").value =
    t.due_date ? t.due_date.split("T")[0] : "";
  document.getElementById("edit-task-notes").value = t.notes || "";

  // Show edit area
  document.getElementById("taskEditArea").style.display = "block";

  // Hide edit button while editing
  document.getElementById("editTaskBtn").style.display = "none";
}
function cancelTaskEdit() {
  document.getElementById("taskEditArea").style.display = "none";

  // επανεμφάνιση Edit button
  if (currentViewedTask && canEditTask(currentViewedTask)) {
    document.getElementById("editTaskBtn").style.display = "inline-flex";
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
   ADD ASSET
===================== */

// Open Add Asset modal
getEl("addAssetBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopImmediatePropagation(); // 🔥 ΣΤΑΜΑΤΑ ΟΛΑ ΤΑ ΑΛΛΑ LISTENERS

  if (!hasRole("planner", "admin")) {
    alert("You are not allowed to add assets");
    return;
  }

  getEl("addAssetOverlay").style.display = "flex";
});

// Cancel Add Asset
getEl("cancelAssetBtn")?.addEventListener("click", () => {
  getEl("addAssetOverlay").style.display = "none";
});

// Save Asset
getEl("saveAssetBtn")?.addEventListener("click", async () => {
  // ROLE GUARD — extra safety
  if (!hasRole("planner", "admin")) {
    alert("Not allowed");
    return;
  }

  const line = getEl("assetLine").value;
  const model = getEl("assetMachine").value;
  const sn = getEl("assetSn").value.trim();

  if (!line || !model || !sn) {
    return alert("Συμπλήρωσε όλα τα πεδία");
  }

  try {
    await fetch(`${API}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line,
        model,
        serial_number: sn
      })
    });

    getEl("addAssetOverlay").style.display = "none";
    getEl("assetSn").value = "";

    loadAssets();
  } catch (err) {
    alert("Failed to save asset");
    console.error(err);
  }
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
      case "nonplanned":

        generateNonPlannedReportPdf();
        break;

      default:
        alert(`Report type "${type}" is not implemented yet.`);
    }
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


