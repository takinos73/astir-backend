// ASTIR CMMS UI v2 - Supervisor Dashboard
const API = "https://astir-backend.onrender.com";

/* =====================
   GLOBAL STATE
===================== */
let tasksData = [];
let assetsData = [];
let pendingTaskId = null;
let activeLine = "all";
let importExcelFile = null;

/* =====================
   HELPERS
===================== */
function getEl(id) {
  return document.getElementById(id);
}

function norm(v) {
  return (v ?? "").toString().trim().toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("el-GR");
}

function diffDays(from, to) {
  return Math.ceil((to - from) / (1000 * 60 * 60 * 24));
}

function getDueState(task) {
  if (task.status === "Done") return "done";
  if (!task.due_date) return "unknown";

  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(task.due_date); due.setHours(0,0,0,0);
  const d = diffDays(today, due);

  if (d < 0) return "overdue";
  if (d <= 7) return "soon";
  return "ok";
}

/* =====================
   🔑 SINGLE SOURCE OF TRUTH FOR LINE
===================== */
function taskLine(task) {
  const candidates = [
    task.line,
    task.line_code,
    task.asset_line,
    task?.asset?.line,
    task?.asset?.line_code,
    task?.asset?.line?.code
  ];
  const v = candidates.find(x => x && String(x).trim() !== "");
  return norm(v || "");
}

/* =====================
   ASSETS
===================== */
async function loadAssets() {
  const res = await fetch(`${API}/assets`);
  assetsData = await res.json();
}

getEl("addAssetBtn")?.addEventListener("click", () => {
  getEl("addAssetOverlay").style.display = "flex";
});

getEl("cancelAssetBtn")?.addEventListener("click", () => {
  getEl("addAssetOverlay").style.display = "none";
});

getEl("saveAssetBtn")?.addEventListener("click", async () => {
  const payload = {
    line: getEl("assetLine").value,
    model: getEl("assetMachine").value,
    serial_number: getEl("assetSn").value
  };

  if (!payload.line || !payload.model || !payload.serial_number) {
    return alert("Συμπλήρωσε όλα τα πεδία");
  }

  await fetch(`${API}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  getEl("addAssetOverlay").style.display = "none";
  getEl("assetSn").value = "";
  loadAssets();
});

/* =====================
   TASKS UI
===================== */
function statusPill(task) {
  const st = getDueState(task);
  let cls = "status-pill", txt = "Planned";

  if (task.status === "Done") { cls += " status-done"; txt = "Done"; }
  else if (st === "overdue") { cls += " status-overdue"; txt = "Overdue"; }
  else if (st === "soon") { cls += " status-soon"; txt = "Due Soon"; }

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
    <td>${formatDate(task.due_date)}</td>
    <td>${statusPill(task)}</td>
    <td>
      <button class="btn-secondary" onclick="viewTask(${task.id})">👁 View</button>
      ${
        task.status === "Done"
          ? `<button class="btn-undo" onclick="undoTask(${task.id})">↩ Undo</button>`
          : `<button class="btn-table" onclick="askTechnician(${task.id})">✔ Done</button>`
      }
    </td>`;
  return tr;
}

/* =====================
   LOAD + FILTER TASKS
===================== */
async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  rebuildMachineFilter();
  renderTable();
}

function rebuildMachineFilter() {
  const sel = getEl("machineFilter");
  if (!sel) return;

  const act = norm(activeLine);
  sel.innerHTML = `<option value="all">All Machines</option>`;

  [...new Set(
    tasksData
      .filter(t => act === "ALL" || taskLine(t) === act)
      .map(t => t.machine_name)
  )]
    .filter(Boolean)
    .sort()
    .forEach(m => {
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

  const mf = getEl("machineFilter")?.value || "all";
  const sf = getEl("statusFilter")?.value || "all";
  const act = norm(activeLine);

  const filtered = tasksData
    .filter(t => act === "ALL" || taskLine(t) === act)
    .filter(t => mf === "all" || t.machine_name === mf)
    .filter(t => {
      if (sf === "all") return true;
      if (sf === "Planned") return t.status === "Planned";
      if (sf === "Done") return t.status === "Done";
      if (sf === "Overdue") return getDueState(t) === "overdue";
      return true;
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}

/* =====================
   LINE TABS (🔥 FIXED)
===================== */
document.addEventListener("click", e => {
  const btn = e.target.closest(".line-tab");
  if (!btn) return;

  document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  activeLine = btn.dataset.line || "all";
  rebuildMachineFilter();
  renderTable();
});

/* =====================
   EXCEL IMPORT (FIXED)
===================== */
getEl("importExcelBtn")?.addEventListener("click", async () => {
  const file = getEl("excelFile")?.files?.[0];
  if (!file) return alert("Select Excel first");

  importExcelFile = file;
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API}/importExcel/preview`, { method: "POST", body: fd });
  if (!res.ok) return alert("Preview failed");

  const data = await res.json();
  const tbody = document.querySelector("#importPreviewTable tbody");
  tbody.innerHTML = "";

  getEl("importSummary").textContent =
    data.summary.errors > 0
      ? `❌ Errors: ${data.summary.errors}/${data.summary.total}`
      : `✅ OK: ${data.summary.ok}/${data.summary.total}`;

  data.rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.row}</td>
      <td>${r.key.line}</td>
      <td>${r.key.machine}</td>
      <td>${r.key.serial_number}</td>
      <td>${r.cleaned.task}</td>
      <td>${r.status}</td>
      <td>${r.error || ""}</td>`;
    tbody.appendChild(tr);
  });

  getEl("confirmImportBtn").disabled = data.summary.errors > 0;
  getEl("importPreviewOverlay").style.display = "flex";
});

getEl("confirmImportBtn")?.addEventListener("click", async () => {
  if (!importExcelFile) return alert("No file");

  const fd = new FormData();
  fd.append("file", importExcelFile);

  await fetch(`${API}/importExcel/commit`, { method: "POST", body: fd });
  getEl("importPreviewOverlay").style.display = "none";
  importExcelFile = null;
  loadTasks();
});

/* =====================
   INIT
===================== */
loadTasks();
loadAssets();

