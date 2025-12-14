// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let assetsData = [];
let pendingTaskId = null;
let pendingSnapshotJson = null;
let activeLine = "all";
let loadedSnapshotName = null;

/* =====================
   Helpers
===================== */

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

function getEl(id) {
  return document.getElementById(id);
}

function showTab(tabId, isVisible) {
  const el = getEl(tabId);
  if (!el) return;
  el.style.display = isVisible ? "block" : "none";
}

/* =====================
   ASSETS (UI)
===================== */

async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    if (!res.ok) throw new Error("Failed to load assets");
    assetsData = await res.json();
    renderAssetsTable();
  } catch (err) {
    console.error("ASSETS LOAD ERROR:", err);
    // δεν κάνουμε alert για να μην ενοχλεί, αλλά μπορείς να το αλλάξεις
  }
}

// Fallback mapping: supports either {line,machine,sn} OR {line,model,serial_number}
function assetLine(a) {
  return a.line ?? a.line_code ?? a.lineCode ?? "-";
}
function assetMachine(a) {
  return a.machine ?? a.model ?? a.machine_name ?? "-";
}
function assetSn(a) {
  return a.sn ?? a.serial_number ?? a.serialNumber ?? "-";
}

function renderAssetsTable() {
  const tbody = document.querySelector("#assetsTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  assetsData.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${assetLine(a)}</td>
      <td>${assetMachine(a)}</td>
      <td>${assetSn(a)}</td>
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
  line: document.getElementById("assetLine").value,
  model: document.getElementById("assetMachine").value,
  serial_number: document.getElementById("assetSn").value
};

  if (!payload.line || !payload.machine || !payload.sn) {
    return alert("Συμπλήρωσε όλα τα πεδία");
  }

  try {
    const res = await fetch(`${API}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("CREATE ASSET ERROR:", res.status, txt);
      return alert("Create asset failed");
    }

    getEl("addAssetOverlay").style.display = "none";
    getEl("assetSn").value = "";
    await loadAssets();
  } catch (err) {
    console.error("CREATE ASSET ERROR:", err);
    alert("Create asset failed");
  }
});

async function deleteAsset(id) {
  if (!confirm("Delete this asset?")) return;

  try {
    const res = await fetch(`${API}/assets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("DELETE ASSET ERROR:", res.status, txt);
      return alert("Delete failed");
    }
    await loadAssets();
  } catch (err) {
    console.error("DELETE ASSET ERROR:", err);
    alert("Delete failed");
  }
}

/* =====================
   UI builders (TASKS)
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
      task.status === "Done" && task.completed_at
        ? "Completed: " + formatDate(task.completed_at)
        : formatDate(task.due_date)
    }</td>
    <td>${statusPill(task)}</td>
    <td>
      <button class="btn-secondary" onclick="viewTask(${task.id})">👁 View</button>
      ${
        task.status === "Done"
          ? `
            <button class="btn-undo" onclick="undoTask(${task.id})">↩ Undo</button>
            <div class="tech-meta">✔ ${task.completed_by || "—"}</div>
          `
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
  let overdue = 0,
    soon = 0,
    done = 0;

  tasksData.forEach(t => {
    if (t.status === "Done") {
      done++;
      return;
    }
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
   Filters & render (TASKS)
===================== */

function rebuildMachineFilter() {
  const select = getEl("machineFilter");
  if (!select) return;

  const act = norm(activeLine);

  const machines = [
    ...new Set(
      tasksData
        .filter(t => (activeLine === "all" ? true : norm(t.line) === act))
        .map(t => t.machine_name)
    )
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  select.innerHTML = `<option value="all">All Machines</option>`;
  machines.forEach(m => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    select.appendChild(o);
  });
}

function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const machineFilterRaw = getEl("machineFilter")?.value || "all";
  const statusFilter = getEl("statusFilter")?.value || "all";

  const act = norm(activeLine);
  const mf = norm(machineFilterRaw);

  const filtered = tasksData
    .filter(t => (activeLine === "all" ? true : norm(t.line) === act))
    .filter(t => (machineFilterRaw === "all" ? true : norm(t.machine_name) === mf))
    .filter(t => {
      if (statusFilter === "all") return true;
      if (statusFilter === "Planned") return t.status === "Planned";
      if (statusFilter === "Done") return t.status === "Done";
      if (statusFilter === "Overdue") return getDueState(t) === "overdue";
      return true;
    })
    .sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, done: 3, unknown: 4 };
      return (order[getDueState(a)] ?? 99) - (order[getDueState(b)] ?? 99);
    });

  filtered.forEach(task => tbody.appendChild(buildRow(task)));
}

/* =====================
   Load data (TASKS)
===================== */

async function loadTasks() {
  try {
    const res = await fetch(`${API}/tasks`);
    if (!res.ok) throw new Error("Failed to load tasks");

    tasksData = await res.json();

    updateKpis();
    rebuildMachineFilter();
    renderTable();
  } catch (err) {
    console.error(err);
    alert("Failed to load tasks from server");
  }
}

/* =====================
   Task actions
===================== */

function askTechnician(id) {
  pendingTaskId = id;
  getEl("modalOverlay").style.display = "flex";
  getEl("technicianInput").value = "";
  getEl("technicianInput")?.focus?.();
}

getEl("cancelDone")?.addEventListener("click", () => {
  getEl("modalOverlay").style.display = "none";
  getEl("technicianInput").value = "";
  pendingTaskId = null;
});

getEl("confirmDone")?.addEventListener("click", async () => {
  const name = getEl("technicianInput").value.trim();
  if (!name) return alert("Δώσε όνομα τεχνικού");
  if (!pendingTaskId) return;

  const res = await fetch(`${API}/tasks/${pendingTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed_by: name })
  });

  if (!res.ok) return alert("Update failed");

  pendingTaskId = null;
  getEl("modalOverlay").style.display = "none";
  getEl("technicianInput").value = "";
  loadTasks();
});

async function undoTask(id) {
  const res = await fetch(`${API}/tasks/${id}/undo`, { method: "PATCH" });
  if (!res.ok) return alert("Undo failed");
  loadTasks();
}

/* =====================
   View Task
===================== */

function viewTask(id) {
  const t = tasksData.find(x => x.id === id);
  if (!t) return;

  const overlay = getEl("viewTaskOverlay");
  if (!overlay) {
    console.warn("viewTaskOverlay not found");
    return;
  }

  getEl("vt-machine").textContent = t.machine_name;
  getEl("vt-line").textContent = t.line || "-";
  getEl("vt-section").textContent = t.section || "-";
  getEl("vt-unit").textContent = t.unit || "-";
  getEl("vt-task").textContent = t.task;
  getEl("vt-type").textContent = t.type || "-";
  getEl("vt-due").textContent = formatDate(t.due_date);
  getEl("vt-status").textContent = t.status;
  getEl("vt-by").textContent = t.completed_by || "-";
  getEl("vt-at").textContent = t.completed_at ? formatDate(t.completed_at) : "-";

  overlay.style.display = "flex";
}

getEl("closeViewTask")?.addEventListener("click", () => {
  getEl("viewTaskOverlay").style.display = "none";
});

/* =====================
   Import Excel
===================== */

async function importExcel() {
  const fileInput = getEl("excelFile");
  const file = fileInput?.files?.[0];

  if (!file) {
    alert("Επίλεξε αρχείο Excel πρώτα");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API}/importExcel`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Import failed");
    }

    alert("Excel imported successfully!");

    // RESET UI STATE
    activeLine = "all";
    document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
    document.querySelector('.line-tab[data-line="all"]')?.classList.add("active");

    getEl("machineFilter").value = "all";
    getEl("statusFilter").value = "all";

    await loadTasks();
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    alert("Excel import failed");
  }
}

getEl("importExcelBtn")?.addEventListener("click", importExcel);

/* =====================
   Snapshot
===================== */

getEl("snapshotFile")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  pendingSnapshotJson = JSON.parse(await file.text());
  loadedSnapshotName = file.name;
  getEl("snapshotStatus").textContent = `Snapshot Loaded: ${loadedSnapshotName}`;
});

getEl("exportSnapshot")?.addEventListener("click", async () => {
  const name = prompt("Snapshot name:", "Backup");
  if (!name) return;

  const res = await fetch(`${API}/snapshot/export`);
  const data = await res.json();

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${Date.now()}.json`;
  a.click();
});

getEl("restoreSnapshot")?.addEventListener("click", async () => {
  if (!pendingSnapshotJson) return alert("Load snapshot first");

  const res = await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingSnapshotJson)
  });

  if (!res.ok) return alert("Restore failed");

  getEl("snapshotStatus").textContent = `Snapshot Active: ${loadedSnapshotName || "Loaded snapshot"}`;
  loadTasks();
});

/* =====================
   Documentation (PDF)
===================== */

function loadPdfPreview() {
  const iframe = getEl("pdfViewer");
  if (!iframe) return;
  iframe.src = `${API}/documentation/masterplan?t=${Date.now()}`;
}

function openPdfViewer() {
  window.open(`${API}/documentation/masterplan?t=${Date.now()}`, "_blank");
}

async function uploadPdf() {
  const file = getEl("pdfInput")?.files?.[0];
  if (!file) return alert("Επίλεξε PDF πρώτα!");

  const fd = new FormData();
  fd.append("pdf", file);

  const res = await fetch(`${API}/documentation/upload`, {
    method: "POST",
    body: fd
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("PDF upload error:", res.status, txt);
    return alert("PDF upload failed!");
  }

  alert("PDF uploaded!");
  loadPdfPreview();
}

getEl("pdfInput")?.addEventListener("change", uploadPdf);
getEl("openPdfBtn")?.addEventListener("click", openPdfViewer);

/* =====================
   Line tabs
===================== */

document.querySelectorAll(".line-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeLine = btn.dataset.line; // raw
    rebuildMachineFilter();
    renderTable();
  });
});

/* =====================
   Filter listeners (refresh fix)
===================== */

function wireFilterListeners() {
  const statusEl = getEl("statusFilter");
  const machineEl = getEl("machineFilter");

  statusEl?.addEventListener("change", () => renderTable());
  machineEl?.addEventListener("change", () => renderTable());
}

/* =====================
   Main Tabs Switching
===================== */

document.querySelectorAll(".main-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const selected = tab.dataset.tab;

    showTab("tab-tasks", selected === "tasks");
    showTab("tab-docs", selected === "docs");
    showTab("tab-assets", selected === "assets");
    showTab("tab-reports", selected === "reports"); // safe even if missing

    // όταν μπαίνουμε docs, refresh preview 1 φορά (optional)
    if (selected === "docs") {
      loadPdfPreview();
    }
    if (selected === "assets") {
      loadAssets();
    }
  });
});

/* =====================
   Init
===================== */

wireFilterListeners();
loadTasks();
loadPdfPreview(); // μία φορά
loadAssets();

