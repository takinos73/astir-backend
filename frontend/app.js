// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";

/* =====================
   GLOBAL STATE
===================== */
let tasksData = [];
let assetsData = [];
let pendingTaskId = null;
let pendingSnapshotJson = null;
let activeLine = "all";
let loadedSnapshotName = null;
let importExcelFile = null; // 👈 ΜΟΝΟ ΜΙΑ ΦΟΡΑ

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  due.setHours(0, 0, 0, 0);

  const d = diffDays(today, due);
  if (d < 0) return "overdue";
  if (d <= 7) return "soon";
  return "ok";
}

/* =====================
   ASSETS
===================== */
async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    if (!res.ok) throw new Error("Assets load failed");
    assetsData = await res.json();
    renderAssetsTable();
  } catch (err) {
    console.error("ASSETS ERROR:", err);
  }
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
      <td>
        <button class="btn-undo" onclick="deleteAsset(${a.id})">🗑 Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

  const res = await fetch(`${API}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error(txt);
    return alert("Create asset failed");
  }

  getEl("addAssetOverlay").style.display = "none";
  getEl("assetSn").value = "";
  loadAssets();
});

async function deleteAsset(id) {
  if (!confirm("Delete this asset?")) return;
  await fetch(`${API}/assets/${id}`, { method: "DELETE" });
  loadAssets();
}

/* =====================
   TASKS UI
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
    <td>${formatDate(task.due_date)}</td>
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
   TASKS LOAD / FILTER
===================== */
async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  updateKpis();
  rebuildMachineFilter();
  renderTable();
}

function updateKpis() {
  let overdue = 0, soon = 0, done = 0;
  tasksData.forEach(t => {
    if (t.status === "Done") done++;
    else if (getDueState(t) === "overdue") overdue++;
    else if (getDueState(t) === "soon") soon++;
  });

  getEl("kpiTotal").textContent = tasksData.length;
  getEl("kpiOverdue").textContent = overdue;
  getEl("kpiSoon").textContent = soon;
  getEl("kpiDone").textContent = done;
}

function rebuildMachineFilter() {
  const sel = getEl("machineFilter");
  if (!sel) return;
  sel.innerHTML = `<option value="all">All Machines</option>`;

  [...new Set(tasksData.map(t => t.machine_name))]
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

  const machineFilter = getEl("machineFilter")?.value || "all";
  const statusFilter = getEl("statusFilter")?.value || "all";
  const act = norm(activeLine);

  const filtered = tasksData
    // LINE FILTER
    .filter(t => {
      if (activeLine === "all") return true;
      return norm(t.line) === act;
    })

    // MACHINE FILTER
    .filter(t => {
      if (machineFilter === "all") return true;
      return t.machine_name === machineFilter;
    })

    // STATUS FILTER
    .filter(t => {
      if (statusFilter === "all") return true;
      if (statusFilter === "Planned") return t.status === "Planned";
      if (statusFilter === "Done") return t.status === "Done";
      if (statusFilter === "Overdue") return getDueState(t) === "overdue";
      return true;
    })

    // SORT: overdue → soon → ok → done
    .sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, done: 3, unknown: 4 };
      return order[getDueState(a)] - order[getDueState(b)];
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}


/* =====================
   TASK ACTIONS
===================== */
function askTechnician(id) {
  pendingTaskId = id;
  getEl("modalOverlay").style.display = "flex";
}

getEl("confirmDone")?.addEventListener("click", async () => {
  const name = getEl("technicianInput").value.trim();
  if (!name) return alert("Δώσε όνομα τεχνικού");

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
   EXCEL IMPORT (PREVIEW + COMMIT)
===================== */
async function importExcel() {
  const file = getEl("excelFile")?.files?.[0];
  if (!file) return alert("Select Excel file first");
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
      <td>${r.error || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  getEl("confirmImportBtn").disabled = data.summary.errors > 0;
  getEl("importPreviewOverlay").style.display = "flex";
}

async function confirmImport() {
  if (!importExcelFile) return alert("No preview data");

  const fd = new FormData();
  fd.append("file", importExcelFile);

  const res = await fetch(`${API}/importExcel/commit`, {
    method: "POST",
    body: fd
  });

  if (!res.ok) return alert("Import failed");

  const out = await res.json();
  alert(`Import completed! Inserted: ${out.inserted}`);
  getEl("importPreviewOverlay").style.display = "none";
  importExcelFile = null;
  loadTasks();
}

/* =====================
   INIT
===================== */
getEl("importExcelBtn")?.addEventListener("click", importExcel);
getEl("confirmImportBtn")?.addEventListener("click", confirmImport);
getEl("closeImportPreviewBtn")?.addEventListener("click", () => {
  getEl("importPreviewOverlay").style.display = "none";
});

loadTasks();
loadAssets();

