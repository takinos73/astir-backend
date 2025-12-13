// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let pendingTaskId = null;
let pendingSnapshotJson = null;
let activeLine = "all";
let loadedSnapshotName = null;

/* =====================
   Helpers
===================== */

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
   UI builders
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

  document.getElementById("kpiTotal").textContent = tasksData.length;
  document.getElementById("kpiOverdue").textContent = overdue;
  document.getElementById("kpiSoon").textContent = soon;
  document.getElementById("kpiDone").textContent = done;
}

/* =====================
   Filters & render
===================== */

function rebuildMachineFilter() {
  const select = document.getElementById("machineFilter");
  if (!select) return;

  const machines = [
    ...new Set(
      tasksData
        .filter(t => activeLine === "all" || t.line === activeLine)
        .map(t => t.machine_name)
    )
  ].sort();

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

  const machineFilter = document.getElementById("machineFilter")?.value || "all";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";

  const filtered = tasksData
    .filter(t => activeLine === "all" || t.line === activeLine)
    .filter(t => machineFilter === "all" || t.machine_name === machineFilter)
    .filter(t => {
      if (statusFilter === "all") return true;
      if (statusFilter === "Planned") return t.status === "Planned";
      if (statusFilter === "Done") return t.status === "Done";
      if (statusFilter === "Overdue") return getDueState(t) === "overdue";
      return true;
    })
    .sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, done: 3 };
      return order[getDueState(a)] - order[getDueState(b)];
    });

  filtered.forEach(task => tbody.appendChild(buildRow(task)));
}

/* =====================
   Load data
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
  document.getElementById("modalOverlay").style.display = "flex";
}

document.getElementById("cancelDone").onclick = () => {
  document.getElementById("modalOverlay").style.display = "none";
  pendingTaskId = null;
};

document.getElementById("confirmDone").onclick = async () => {
  const name = document.getElementById("technicianInput").value.trim();
  if (!name) return alert("Δώσε όνομα τεχνικού");

  const res = await fetch(`${API}/tasks/${pendingTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed_by: name })
  });

  if (!res.ok) return alert("Update failed");

  pendingTaskId = null;
  document.getElementById("modalOverlay").style.display = "none";
  loadTasks();
};

async function undoTask(id) {
  const res = await fetch(`${API}/tasks/${id}/undo`, { method: "PATCH" });
  if (!res.ok) return alert("Undo failed");
  loadTasks();
}

/* =====================
   View Task (STEP 1)
===================== */

function viewTask(id) {
  const t = tasksData.find(x => x.id === id);
  if (!t) return;

  const overlay = document.getElementById("viewTaskOverlay");
  if (!overlay) {
    console.warn("viewTaskOverlay not found");
    return;
  }

  document.getElementById("vt-machine").textContent = t.machine_name;
  document.getElementById("vt-line").textContent = t.line || "-";
  document.getElementById("vt-section").textContent = t.section || "-";
  document.getElementById("vt-unit").textContent = t.unit || "-";
  document.getElementById("vt-task").textContent = t.task;
  document.getElementById("vt-type").textContent = t.type || "-";
  document.getElementById("vt-due").textContent = formatDate(t.due_date);
  document.getElementById("vt-status").textContent = t.status;
  document.getElementById("vt-by").textContent = t.completed_by || "-";
  document.getElementById("vt-at").textContent =
    t.completed_at ? formatDate(t.completed_at) : "-";

  overlay.style.display = "flex";
}

document.getElementById("closeViewTask").onclick = () => {
  document.getElementById("viewTaskOverlay").style.display = "none";
};

/* =====================
   Import Excel
===================== */

async function importExcel() {
  const fileInput = document.getElementById("excelFile");
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
      const txt = await res.text();
      throw new Error(txt || "Import failed");
    }

    alert("Excel imported successfully!");

    // 🔁 RESET UI STATE (ΑΠΑΡΑΙΤΗΤΟ)
    activeLine = "all";

    document.querySelectorAll(".line-tab").forEach(b =>
      b.classList.remove("active")
    );
    document
      .querySelector('.line-tab[data-line="all"]')
      ?.classList.add("active");

    document.getElementById("machineFilter").value = "all";
    document.getElementById("statusFilter").value = "all";

    // 🔄 Reload data
    await loadTasks();

  } catch (err) {
    console.error("IMPORT ERROR:", err);
    alert("Excel import failed");
  }
}


/* =====================
   Snapshot
===================== */

document.getElementById("snapshotFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  pendingSnapshotJson = JSON.parse(await file.text());
  loadedSnapshotName = file.name;
  document.getElementById("snapshotStatus").textContent =
    `Snapshot Loaded: ${loadedSnapshotName}`;
});

document.getElementById("exportSnapshot").onclick = async () => {
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
};

document.getElementById("restoreSnapshot").onclick = async () => {
  if (!pendingSnapshotJson) return alert("Load snapshot first");

  await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingSnapshotJson)
  });

  document.getElementById("snapshotStatus").textContent =
    `Snapshot Active: ${loadedSnapshotName}`;
  loadTasks();
};

/* =====================
   Line tabs
===================== */

document.querySelectorAll(".line-tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".line-tab").forEach(b =>
      b.classList.remove("active")
    );
    btn.classList.add("active");
    activeLine = btn.dataset.line;
    rebuildMachineFilter();
    renderTable();
  };
});

/* =====================
   Init
===================== */

loadTasks();

