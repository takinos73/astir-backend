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
  tbody.innerHTML = "";

  const mf = document.getElementById("machineFilter").value;
  const sf = document.getElementById("statusFilter").value;

  tasksData
    .filter(t => activeLine === "all" || t.line === activeLine)
    .filter(t => mf === "all" || t.machine_name === mf)
    .filter(t => {
      const st = getDueState(t);
      if (sf === "Overdue") return st === "overdue";
      if (sf === "Planned") return t.status === "Planned";
      if (sf === "Done") return t.status === "Done";
      return true;
    })
    .sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, done: 3 };
      return order[getDueState(a)] - order[getDueState(b)];
    })
    .forEach(t => tbody.appendChild(buildRow(t)));
}

/* =====================
   Load data
===================== */

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  updateKpis();
  rebuildMachineFilter();
  renderTable();
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

  document.getElementById("viewTaskOverlay").style.display = "flex";
}

document.getElementById("closeViewTask").onclick = () => {
  document.getElementById("viewTaskOverlay").style.display = "none";
};

/* =====================
   STEP 2A – Add Non-Planned Task
===================== */

document.getElementById("addTaskBtn").onclick = () => {
  document.getElementById("addTaskOverlay").style.display = "flex";
};

document.getElementById("cancelAddTask").onclick = () => {
  document.getElementById("addTaskOverlay").style.display = "none";
};

document.getElementById("saveTaskBtn").onclick = async () => {
  const payload = {
    line: document.getElementById("nt-line").value,
    machine_name: document.getElementById("nt-machine").value,
    section: document.getElementById("nt-section").value,
    unit: document.getElementById("nt-unit").value,
    task: document.getElementById("nt-task").value,
    type: document.getElementById("nt-type").value,
    due_date: document.getElementById("nt-due").value,
    notes: document.getElementById("nt-notes").value
  };

  if (!payload.machine_name || !payload.task) {
    return alert("Machine & task required");
  }

  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) return alert("Create failed");

  document.getElementById("addTaskOverlay").style.display = "none";
  loadTasks();
};

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

