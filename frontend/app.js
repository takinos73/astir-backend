// ASTIR CMMS UI v2 – Supervisor Dashboard
const API = "https://astir-backend.onrender.com";

/* =====================
   GLOBAL STATE
===================== */
let tasksData = [];
let assetsData = [];
let activeLine = "all";
let pendingTaskId = null;
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

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("el-GR");
}

function diffDays(from, to) {
  return Math.ceil((to - from) / (1000 * 60 * 60 * 24));
}

function getDueState(t) {
  if (t.status === "Done") return "done";
  if (!t.due_date) return "unknown";

  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(t.due_date); due.setHours(0,0,0,0);
  const d = diffDays(today, due);

  if (d < 0) return "overdue";
  if (d <= 7) return "soon";
  return "ok";
}

/* =====================
   🔑 SINGLE SOURCE OF LINE
===================== */
function taskLine(t) {
  return norm(
    t.line ||
    t.line_code ||
    t.asset_line ||
    t?.asset?.line ||
    t?.asset?.line_code ||
    t?.asset?.line?.code ||
    ""
  );
}

/* =====================
   ASSETS
===================== */
async function loadAssets() {
  const res = await fetch(`${API}/assets`);
  assetsData = await res.json();
}

/* =====================
   TASKS – UI
===================== */
function statusPill(t) {
  const st = getDueState(t);
  let cls = "status-pill", txt = "Planned";

  if (t.status === "Done") { cls += " status-done"; txt = "Done"; }
  else if (st === "overdue") { cls += " status-overdue"; txt = "Overdue"; }
  else if (st === "soon") { cls += " status-soon"; txt = "Due Soon"; }

  return `<span class="${cls}">${txt}</span>`;
}

function buildRow(t) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${t.machine_name}</td>
    <td>${t.section || "-"}</td>
    <td>${t.unit || "-"}</td>
    <td>${t.task}</td>
    <td>${t.type || "-"}</td>
    <td>${formatDate(t.due_date)}</td>
    <td>${statusPill(t)}</td>
    <td>
      <button class="btn-secondary" onclick="viewTask(${t.id})">👁 View</button>
      ${
        t.status === "Done"
          ? `<button class="btn-undo" onclick="undoTask(${t.id})">↩ Undo</button>`
          : `<button class="btn-table" onclick="askTechnician(${t.id})">✔ Done</button>`
      }
    </td>
  `;
  return tr;
}

/* =====================
   LOAD TASKS
===================== */
async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  rebuildMachineFilter();
  renderTable();
}

/* =====================
   FILTERS
===================== */
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
   LINE TABS (FIXED)
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
   STATUS / MACHINE CHANGE
===================== */
getEl("statusFilter")?.addEventListener("change", renderTable);
getEl("machineFilter")?.addEventListener("change", renderTable);

/* =====================
   EXCEL IMPORT (WORKING)
===================== */
getEl("importExcelBtn")?.addEventListener("click", async () => {
  const file = getEl("excelFile")?.files?.[0];
  if (!file) return alert("Επίλεξε Excel πρώτα");

  importExcelFile = file;
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API}/importExcel/preview`, { method: "POST", body: fd });
  if (!res.ok) return alert("Import preview failed");

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
      <td>${r.error || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  getEl("confirmImportBtn").disabled = data.summary.errors > 0;
  getEl("importPreviewOverlay").style.display = "flex";
});

getEl("confirmImportBtn")?.addEventListener("click", async () => {
  if (!importExcelFile) return;

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

