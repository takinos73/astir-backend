// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";
let tasksData = [];
let pendingSnapshotJson = null;

// 📌 Helpers

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

// 🎨 UI Builders

function statusPill(task) {
  const st = getDueState(task);
  let txt = "Planned";
  let cls = "status-pill";

  if (task.status === "Done") {
    txt = "Done";
    cls += " status-done";
  } else if (st === "overdue") {
    txt = "Overdue";
    cls += " status-overdue";
  } else if (st === "soon") {
    txt = "Due Soon";
    cls += " status-soon";
  }

  return `<span class="${cls}">${txt}</span>`;
}

function buildRow(task) {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>${task.machine_name}</td>
    <td>${task.section || "-"}</td>
    <td>${task.task}</td>
    <td>${task.type || "-"}</td> 
    <td>${formatDate(task.due_date)}</td>
    <td>${statusPill(task)}</td>
    <td>
      ${
        task.status === "Done"
          ? `<span style="color:#555;font-size:12px;">✓ Done</span>`
          : `<button class="btn-table" onclick="markDone(${task.id})">✔ Done</button>`
      }
    </td>
  `;

  return tr;
}

// 📈 KPIs

function updateKpis() {
  const total = tasksData.length;
  let overdue = 0;
  let soon = 0;
  let done = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasksData.forEach(t => {
    if (t.status === "Done") {
      done++;
      return;
    }
    const state = getDueState(t);
    if (state === "overdue") overdue++;
    if (state === "soon") soon++;
  });

  document.getElementById("kpiTotal").textContent = total;
  document.getElementById("kpiOverdue").textContent = overdue;
  document.getElementById("kpiSoon").textContent = soon;
  document.getElementById("kpiDone").textContent = done;
}

// 🔽 Render Table

function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  tbody.innerHTML = "";

  const machineFilter = document.getElementById("machineFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;

  const filtered = tasksData
    .filter(t => machineFilter === "all" || t.machine_name === machineFilter)
    .filter(t => {
      const st = getDueState(t);
      if (statusFilter === "Overdue") return st === "overdue";
      if (statusFilter === "Planned") return t.status === "Planned";
      if (statusFilter === "Done") return t.status === "Done";
      return true;
    })
    // 🏆 Supervisor priority: Overdue first
    .sort((a, b) => {
      const da = getDueState(a);
      const db = getDueState(b);
      const order = { overdue: 0, soon: 1, ok: 2, done: 3 };
      return order[da] - order[db];
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}

// 🔁 Load Machines

async function loadFilters() {
  const res = await fetch(`${API}/machines`);
  const list = await res.json();
  const select = document.getElementById("machineFilter");
  list.forEach(m => {
    const o = document.createElement("option");
    o.value = m.name;
    o.textContent = m.name;
    select.appendChild(o);
  });
}

// 🔁 Load Tasks

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  updateKpis();
  renderTable();
}

// ✔ Mark Task Done

async function markDone(id) {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
  });

  if (res.ok) {
    const task = tasksData.find(t => t.id === id);
    if (task) task.status = "Done";
    updateKpis();
    renderTable();
  } else {
    alert("Failed to update!");
  }
}

// 📦 Snapshot Export

async function exportSnapshot() {
  const name = prompt("Snapshot name:", "Backup");
  if (!name) return;

  const res = await fetch(`${API}/snapshot/export`);
  const data = await res.json();

  const time = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}_${time}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ♻ Load Snapshot File

document.getElementById("snapshotFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const txt = await file.text();
    pendingSnapshotJson = JSON.parse(txt);
    document.getElementById("snapshotStatus").textContent =
      "Snapshot loaded — OK";
  } catch {
    alert("Invalid file!");
    pendingSnapshotJson = null;
  }
});

// ♻ Restore Snapshot

async function restoreSnapshot() {
  if (!pendingSnapshotJson) return alert("Load snapshot first!");

  if (!confirm("Are you sure? This will overwrite the DB!")) return;

  const res = await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingSnapshotJson),
  });

  if (!res.ok) return alert("Restore failed!");
  alert("DB restored from snapshot!");
  loadTasks();
}

// 🔗 Event Listeners

document
  .getElementById("exportSnapshot")
  .addEventListener("click", exportSnapshot);

document
  .getElementById("restoreSnapshot")
  .addEventListener("click", restoreSnapshot);

document
  .getElementById("machineFilter")
  .addEventListener("change", renderTable);

document
  .getElementById("statusFilter")
  .addEventListener("change", renderTable);

// 🚀 Init

loadFilters();
loadTasks();

