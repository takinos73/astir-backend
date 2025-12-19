// ASTIR CMMS UI v2 - Supervisor Dashboard
console.log("APP.JS LOADED");

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let assetsData = [];
//let activeLine = "all";
let pendingTaskId = null;
let pendingSnapshotJson = null;
let loadedSnapshotName = null;
let importExcelFile = null;
let activeDateFilter = "all";


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
/* =====================
   DATE TIME FORMATTER
===================== */
function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("el-GR");
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

/* =====================================================
   BUILD TASK TABLE ROW
   - Renders one task row in the Tasks table
   - View button calls viewTask(task.id)
   - Done / Undo handled separately
===================================================== */
function buildRow(task) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <!-- MACHINE / ASSET -->
    <td class="machine-cell">
      <div class="machine-name">${task.machine_name}</div>
      ${task.serial_number
        ? `<div class="machine-sn">SN: ${task.serial_number}</div>`
        : ""
      }
    </td>

    <!-- SECTION -->
    <td>${task.section || "-"}</td>

    <!-- UNIT -->
    <td>${task.unit || "-"}</td>

    <!-- TASK DESCRIPTION -->
    <td>${task.task}</td>

    <!-- TYPE -->
    <td>${task.type || "-"}</td>

    <!-- DATE (Due or Completed) -->
    <td>${
      task.status === "Done"
        ? "Completed: " + formatDate(task.completed_at)
        : formatDate(task.due_date)
    }</td>

    <!-- STATUS -->
    <td>${statusPill(task)}</td>

    <!-- ACTIONS -->
    <td>
      <button class="btn-secondary" onclick="viewTask(${task.id})">👁 View</button>
      ${
        task.status === "Done"
          ? `<button class="btn-undo" onclick="undoTask(${task.id})">↩ Undo</button>`
          : `<button class="btn-table" onclick="askTechnician(${task.id})">✔ Done</button>`
      }
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
    const history = await res.json();
    console.log("HISTORY DATA:", history); // 👈
    renderHistoryTable(history);
  } catch (err) {
    console.error("LOAD HISTORY ERROR:", err);
  }
}

function renderHistoryTable(data) {
  const tbody = document.querySelector("#historyTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(h => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateTime(h.executed_at)}</td>
      <td>
        <strong>${h.machine}</strong><br>
        <small>SN: ${h.serial_number} | ${h.line}</small>
      </td>
      <td>
        <div><strong>${h.task}</strong></div>
           <small> ${h.section || ""}
                ${h.section && h.unit ? " / " : ""}
                ${h.unit || ""}
           </small>
      </td>
      <td>${h.executed_by || "-"}</td>
    `;
    tbody.appendChild(tr);
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
  getEl("historyOverlay").style.display = "flex";
}

function closeHistory() {
  getEl("historyOverlay").style.display = "none";
}

getEl("openHistoryBtn")?.addEventListener("click", openHistory);
getEl("closeHistoryBtn")?.addEventListener("click", closeHistory);


/* =====================
   FILTERS
===================== */

function getFilteredTasksForPrint() {
  const mf = getEl("machineFilter").value;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return tasksData
    .filter(t => {
      if (mf === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === mf;
    })
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
    });
}

function populateAssetFilter() {
  const sel = getEl("machineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All Machines</option>`;

  const map = new Map();

  // Συλλογή μοναδικών assets
  tasksData.forEach(t => {
    if (!t.machine_name || !t.serial_number) return;

    const key = `${t.machine_name}||${t.serial_number}`;
    if (map.has(key)) return;

    map.set(key, {
      value: key,
      label: `${t.machine_name} (${t.serial_number})`
    });
  });

  // 🔹 SORT με βάση το label (ASSET)
  const sortedAssets = Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "el", { sensitivity: "base" })
  );

  // Δημιουργία options
  sortedAssets.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.value;
    opt.textContent = a.label;
    sel.appendChild(opt);
  });
}


function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const mf = getEl("machineFilter").value;
  //const sf = getEl("statusFilter").value;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const filtered = tasksData
    // LINE FILTER
    //.filter(t => activeLine === "all" || taskLine(t) === norm(activeLine))

    // MACHINE FILTER
    .filter(t => {if (mf === "all") return true;return `${t.machine_name}||${t.serial_number}` === mf;})  

    // DATE FILTER (NEW)
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

    // SORT (kept as-is)
    .sort((a, b) => {
      const o = { overdue: 0, soon: 1, ok: 2, done: 3, unknown: 4 };
      return (o[getDueState(a)] ?? 99) - (o[getDueState(b)] ?? 99);
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}

function getAssetFilterLabel() {
  const sel = getEl("machineFilter");
  if (!sel || sel.value === "all") return "ALL MACHINES";

  return sel.options[sel.selectedIndex].text;
}

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
        Περίοδος: ${activeDateFilter.toUpperCase()}<br>
        Asset: ${getAssetFilterLabel()}
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


/* =====================
   LOAD TASKS
===================== */

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
   console.log("SAMPLE TASK:", tasksData[0]); // 👈 ΕΔΩ
   populateAssetFilter();   // ⭐ εδώ
   updateKpis();
   populateAssetFilter();
   renderTable();
}

/* =====================
   TASK ACTIONS
===================== */

function askTechnician(id) {
  pendingTaskId = id;
  getEl("modalOverlay").style.display = "flex";
}

getEl("cancelDone")?.addEventListener("click", () => {
  getEl("modalOverlay").style.display = "none";
  pendingTaskId = null;
});

/* =====================
   CONFIRM TASK DONE
===================== */
getEl("confirmDone")?.addEventListener("click", async () => {
  const name = getEl("technicianInput").value.trim();
  if (!name) return alert("Δώσε όνομα");

  try {
    const res = await fetch(`${API}/tasks/${pendingTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_by: name })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to complete task");
    }

    getEl("modalOverlay").style.display = "none";
    getEl("technicianInput").value = "";

    // 🔄 REFRESH BOTH
    loadTasks();
    loadHistory();

  } catch (err) {
    alert(err.message);
    console.error("CONFIRM DONE ERROR:", err);
  }
});



async function undoTask(id) {
  await fetch(`${API}/tasks/${id}/undo`, { method: "PATCH" });
  loadTasks();
}

/* =====================
   ASSETS (CRUD)
===================== */

async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    assetsData = await res.json();
    renderAssetsTable();
  } catch (err) {
    console.error("Failed to load assets", err);
  }
}

function renderAssetsTable() {
  const tbody = document.querySelector("#assetsTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (assetsData.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align:center;">No assets</td>`;
    tbody.appendChild(tr);
    return;
  }

  assetsData.forEach(a => {
    const tr = document.createElement("tr");
    // μέσα στο forEach(a => { ... })
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

/* =====================
   IMPORT EXCEL (PREVIEW + COMMIT)
===================== */

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

  const res = await fetch(`${API}/importExcel/preview`, { method: "POST", body: fd });
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

async function confirmImport() {
  const fd = new FormData();
  fd.append("file", importExcelFile);

  await fetch(`${API}/importExcel/commit`, { method: "POST", body: fd });
  getEl("importPreviewOverlay").style.display = "none";
  loadTasks();
}

getEl("importExcelBtn")?.addEventListener("click", importExcel);
getEl("confirmImportBtn")?.addEventListener("click", confirmImport);
getEl("closeImportPreviewBtn")?.addEventListener("click", () => {
  getEl("importPreviewOverlay").style.display = "none";
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
    document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    ["tasks", "assets", "docs", "reports"].forEach(t => {
      const el = getEl(`tab-${t}`);
      if (el) el.style.display = "none";
    });

    const sel = tab.dataset.tab;
    const active = getEl(`tab-${sel}`);
    if (active) active.style.display = "block";

    if (sel === "assets") loadAssets();
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
document.addEventListener("DOMContentLoaded", () => {

  const btns = document.querySelectorAll(".date-filter-btn");
  console.log("Date filter buttons found:", btns.length);

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeDateFilter = btn.dataset.filter;

      console.log("Date filter clicked:", activeDateFilter);

      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      renderTable();
    });
  });

});

