// ASTIR CMMS UI v2 - Supervisor Dashboard

const API = "https://astir-backend.onrender.com";

let tasksData = [];
let pendingSnapshotJson = null;
let pendingTaskId = null;
let activeLine = "all"; // Current line filter

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
    <td>${task.line || "-"}</td>
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


// 📈 KPIs

function updateKpis() {
  const total = tasksData.length;
  let overdue = 0;
  let soon = 0;
  let doneCount = 0;

  tasksData.forEach(t => {
    if (t.status === "Done") {
      doneCount++;
      return;
    }
    const state = getDueState(t);
    if (state === "overdue") overdue++;
    if (state === "soon") soon++;
  });

  document.getElementById("kpiTotal").textContent = total;
  document.getElementById("kpiOverdue").textContent = overdue;
  document.getElementById("kpiSoon").textContent = soon;
  document.getElementById("kpiDone").textContent = doneCount;
}

// 🔽 Machine filter options based on activeLine

function rebuildMachineFilter() {
  const select = document.getElementById("machineFilter");
  if (!select) return;

  const machinesSet = new Set();

  tasksData.forEach(t => {
    if (activeLine === "all" || t.line_code === activeLine) {
      machinesSet.add(t.machine_name);
    }
  });

  const machines = Array.from(machinesSet).sort((a, b) =>
    a.localeCompare(b)
  );

  select.innerHTML = `<option value="all">All Machines</option>`;
  machines.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// 🔽 Render Table

function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  tbody.innerHTML = "";

  const machineFilter = document.getElementById("machineFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;

  const filtered = tasksData
    .filter(t => activeLine === "all" || t.line_code === activeLine)
    .filter(t => machineFilter === "all" || t.machine_name === machineFilter)
    .filter(t => activeLine === "all" || t.line === activeLine)
    .filter(t => {
      const st = getDueState(t);
      if (statusFilter === "Overdue") return st === "overdue";
      if (statusFilter === "Planned") return t.status === "Planned";
      if (statusFilter === "Done") return t.status === "Done";
      return true;
    })
    .sort((a, b) => {
      const da = getDueState(a);
      const db = getDueState(b);
      const order = { overdue: 0, soon: 1, ok: 2, done: 3 };
      return order[da] - order[db];
    });

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
}

// 🔁 Load Lines (for tabs)

async function loadLines() {
  const res = await fetch(`${API}/lines`);
  const lines = await res.json();

  const tabs = document.getElementById("lineTabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  // ALL tab
  const allTab = document.createElement("div");
  allTab.textContent = "ALL";
  allTab.className = "line-tab active";
  allTab.onclick = () => setActiveLine("all");
  tabs.appendChild(allTab);

  lines.forEach(line => {
    const tab = document.createElement("div");
    tab.textContent = line.code;
    tab.className = "line-tab";
    tab.onclick = () => setActiveLine(line.code);
    tabs.appendChild(tab);
  });
}

function setActiveLine(lineCode) {
  activeLine = lineCode;

  document.querySelectorAll(".line-tab").forEach(tab => {
    const label = tab.textContent;
    const shouldBeActive =
      (lineCode === "all" && label === "ALL") ||
      (lineCode !== "all" && label === lineCode);

    tab.classList.toggle("active", shouldBeActive);
  });

  rebuildMachineFilter();
  renderTable();
}

// 🔁 Load Tasks

async function loadTasks() {
  const res = await fetch(`${API}/tasks`);
  tasksData = await res.json();
  updateKpis();
  rebuildMachineFilter();
  renderTable();
}

// ✔ Modal handling

function askTechnician(id) {
  pendingTaskId = id;
  document.getElementById("modalOverlay").style.display = "flex";
}

document.getElementById("cancelDone").onclick = () => {
  document.getElementById("modalOverlay").style.display = "none";
  document.getElementById("technicianInput").value = "";
};

document.getElementById("confirmDone").onclick = () => {
  const name = document.getElementById("technicianInput").value.trim();
  if (!name) {
    alert("Παρακαλώ εισάγετε όνομα τεχνικού");
    return;
  }
  markDone(pendingTaskId, name);

  document.getElementById("modalOverlay").style.display = "none";
  document.getElementById("technicianInput").value = "";
};

// ✔ Mark Done

async function markDone(id, name) {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed_by: name }),
  });

  if (!res.ok) {
    alert("Update failed");
    return;
  }

  const updated = await res.json();
  const task = tasksData.find(t => t.id === id);

  if (task) {
    task.status = updated.status;
    task.completed_by = updated.completed_by;
    task.completed_at = updated.completed_at;
  }

  updateKpis();
  renderTable();
}

// ↩ Undo

async function undoTask(id) {
  const res = await fetch(`${API}/tasks/${id}/undo`, {
    method: "PATCH",
  });

  if (!res.ok) {
    alert("Undo failed");
    return;
  }

  const updated = await res.json();
  const t = tasksData.find(t => t.id === id);

  if (t) {
    t.status = updated.status;
    t.completed_by = updated.completed_by;
    t.completed_at = updated.completed_at;
  }

  updateKpis();
  renderTable();
}

// 📦 Snapshot

async function exportSnapshot() {
  const name = prompt("Snapshot name:", "Backup");
  if (!name) return;

  const res = await fetch(`${API}/snapshot/export`);
  const data = await res.json();

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `${name}_${ts}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fname;
  link.click();
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
  if (!confirm("Are you sure? This will overwrite DB!")) return;

  const res = await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingSnapshotJson),
  });

  if (!res.ok) {
    alert("Restore failed!");
    return;
  }

  alert("DB restored!");
  loadTasks();
}

// 📥 Import Excel Upload

async function importExcel() {
  const file = document.getElementById("excelFile").files[0];
  if (!file) return alert("Select Excel file first!");

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API}/importExcel`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("Import error:", txt);
    return alert("Excel import failed!");
  }

  alert("Excel imported!");
  // reload everything (lines & tasks)
  await loadLines();
  await loadTasks();
}

document
  .getElementById("importExcelBtn")
  ?.addEventListener("click", importExcel);

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

document.querySelectorAll(".line-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    activeLine = btn.dataset.line;
    renderTable();
  });
});


// 🚀 Init
loadLines();
loadTasks();

