// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let assetsData = [];
let activeLine = "all";
let pendingTaskId = null;
let pendingSnapshotJson = null;
let loadedSnapshotName = null;
let importExcelFile = null;

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
   TASK TABLE
===================== */

function statusPill(task) {
  const st = getDueState(task);
  let cls = "status-pill";
  let txt = "Planned";

  if (task.status === "Done") {
    cls += " status-done";
    txt = "Done";
  } else if (st === "overdue") {
    cls += " status-overdue";
    txt = "Overdue";
  } else if (st === "soon") {
    cls += " status-soon";
    txt = "Due Soon";
  }
  return `<span class="${cls}">${txt}</span>`;
}

function buildRow(task) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${task.machine_name}</td>
    <td>${task.section || "-"}</td>
    <td>${task.unit || "-"}</td>
    <td>${task.task}</td>
    <td>${task.type || "-"}</td>
    <td>${
      task.status === "Done"
        ? "Completed: " + formatDate(task.completed_at)
        : formatDate(task.due_date)
    }</td>
    <td>${statusPill(task)}</td>
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
   FILTERS
===================== */

function rebuildMachineFilter() {
  const sel = getEl("machineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All Machines</option>`;

  const machines = [
    ...new Set(
      tasksData
        .filter(t => activeLine === "all" || taskLine(t) === norm(activeLine))
        .map(t => t.machine_name)
    )
  ]
    .filter(Boolean)
    .sort();

  machines.forEach(m => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  });
}

function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const mf = getEl("machineFilter").value;
  const sf = getEl("statusFilter").value;

  const filtered = tasksData
    .filter(t => activeLine === "all" || taskLine(t) === norm(activeLine))
    .filter(t => mf === "all" || t.machine_name === mf)
    .filter(t => {
      if (sf === "all") return true;
      if (sf === "Planned") return t.status === "Planned";
      if (sf === "Done") return t.status === "Done";
      if (sf === "Overdue") return getDueState(t) === "overdue";
      return true;
    })
    .sort((a, b) => {
      const o = { overdue: 0, soon: 1, ok: 2, done: 3, unknown: 4 };
      return (o[getDueState(a)] ?? 99) - (o[getDueState(b)] ?? 99);
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}
/* =====================
   FILTER EVENTS
===================== */

getEl("machineFilter")?.addEventListener("change", () => {
  renderTable();
});

getEl("statusFilter")?.addEventListener("change", () => {
  renderTable();
});


/* =====================
   LOAD TASKS
===================== */

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
   console.log("SAMPLE TASK:", tasksData[0]); // 👈 ΕΔΩ
  updateKpis();
  rebuildMachineFilter();
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

getEl("confirmDone")?.addEventListener("click", async () => {
  const name = getEl("technicianInput").value.trim();
  if (!name) return alert("Δώσε όνομα");

  await fetch(`${API}/tasks/${pendingTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed_by: name })
  });

  getEl("modalOverlay").style.display = "none";
  loadTasks();
});

async function undoTask(id) {
  await fetch(`${API}/tasks/${id}/undo`, { method: "PATCH" });
  loadTasks();
}

/* =====================
   ASSETS (LIST ONLY)
===================== */

async function loadAssets() {
  const res = await fetch(`${API}/assets`);
  assetsData = await res.json();
  renderAssetsTable();
}

function renderAssetsTable() {
  const tbody = document.querySelector("#assetsTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  assetsData.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.line || "-"}</td>
      <td>${a.model || "-"}</td>
      <td>${a.serial_number || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =====================
   IMPORT EXCEL (PREVIEW + COMMIT)
===================== */

async function importExcel() {
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

loadTasks();


