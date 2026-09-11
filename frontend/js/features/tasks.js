//----------------------
// TASK TYPE HELPER
//----------------------

function getStatusFilterLabel() {
  if (state.activeTaskTypeFilter === "planned") return "Planned (Manual)";
  if (state.activeTaskTypeFilter === "preventive") return "Preventive";
  return "ALL";
}

function getAssetFilterLabel() {
  if (state.activeAssetFilter === "all" || !state.activeAssetFilter) {
    return "ALL MACHINES";
  }

  // expected format: "PMC250||437063"
  const [machine, serial] = state.activeAssetFilter.split("||");

  if (!machine) return "ALL MACHINES";

  return serial
    ? `${machine} (${serial})`
    : machine;
}


function getCurrentPeriodLabel() {
  // 🟢 αν υπάρχει custom date range
  if (state.taskDateFrom || state.taskDateTo) {
    const from = state.taskDateFrom ? formatDate(state.taskDateFrom) : "—";
    const to = state.taskDateTo ? formatDate(state.taskDateTo) : "—";
    return `${from} → ${to}`;
  }

  // 🟢 αλλιώς quick filter
  if (state.activeDateFilter && state.activeDateFilter !== "all") {
    return state.activeDateFilter.toUpperCase();
  }

  return "ALL";
}

// =====================
// TASK TYPE FILTER
// =====================
function filterByTaskType(tasks) {
  

  if (!Array.isArray(tasks)) return [];

  if (state.activeTaskTypeFilter === "planned") {
    return tasks.filter(t => isPlannedManual(t));
  }

  if (state.activeTaskTypeFilter === "preventive") {
    return tasks.filter(t => isPreventive(t));
  }
console.log("filterByTaskType():", state.activeTaskTypeFilter, "sample:", tasks?.[0]);
  // implicit ALL
  return tasks;
}

//======================
// FILTERED TASKS FOR PRINTING
//======================

function getFilteredTasksForPrint() {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return filterByTaskType(state.tasksData)   // 🟢 ← ΜΟΝΗ ΑΛΛΑΓΗ

    // ASSET FILTER (CUSTOM DROPDOWN)
    .filter(t => {
      if (state.activeAssetFilter === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === state.activeAssetFilter;
    })

    // QUICK DATE FILTER (Today / Week / Overdue)
    .filter(t => {
      if (state.activeDateFilter === "all") return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);

      if (state.activeDateFilter === "today") {
        return due.getTime() === today.getTime();
      }

      if (state.activeDateFilter === "week") {
        return due >= today && due <= weekEnd;
      }

      if (state.activeDateFilter === "overdue") {
        return due < today;
      }

      return true;
    })

    // TASK DATE RANGE FILTER (From – To)
    .filter(t => {
      if (!state.taskDateFrom && !state.taskDateTo) return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);

      if (state.taskDateFrom && due < state.taskDateFrom) return false;
      if (state.taskDateTo && due > state.taskDateTo) return false;

      return true;
    });
}

function canEditTask(task) {
  return (
    task.status === "Planned" &&
    !task.frequency_hours &&   // όχι preventive
    !!task.due_date            // planned manual
  );
}

/* =====================
   TASK TABLE – STATUS PILL (FIXED)
===================== */

function statusPill(task) {
  const st = getDueState(task);

  let cls = "status-pill";
  let txt = "";

  // 1️⃣ DONE
  if (task.status === "Done") {
    cls += " status-done";
    txt = "Done";
  }

  // 2️⃣ OVERDUE
  else if (st === "overdue") {
    cls += " status-overdue";
    txt = "Overdue";
  }

  // 3️⃣ TODAY
  else if (st === "today") {
    cls += " status-today";
    txt = "Today";
  }

  // 4️⃣ DUE SOON
  else if (st === "soon") {
    cls += " status-soon";
    txt = "Due Soon";
  }

  // 5️⃣ PREVENTIVE
  else if (isPreventive(task)) {
    cls += " status-preventive";
    txt = "Preventive";
  }

  // 6️⃣ PLANNED MANUAL
  else if (isPlannedManual(task)) {
    cls += " status-planned";
    txt = "Planned";
  }

  // FALLBACK (safety)
  else {
    cls += " status-unknown";
    txt = task.status || "—";
  }

  return `<span class="${cls}">${txt}</span>`;
}

/* ===========================
GET ASSET SECTIONS (FOR FILTERING)
=============================*/

function getSectionsForAsset(assetId) {
  if (!assetId || !Array.isArray(state.tasksData)) return [];

  const id = Number(assetId);
  const set = new Set();

  state.tasksData.forEach(t => {
    if (
      Number(t.asset_id) === id &&
      t.section &&
      String(t.section).trim() !== ""
    ) {
      set.add(String(t.section).trim());
    }
  });

  return Array.from(set).sort();
}
/* ===========================
GET ASSET UNITS FOR SECTION (FOR FILTERING)
=============================*/

function getUnitsForAssetSection(assetId, section) {
  if (!assetId || !section || !Array.isArray(state.tasksData)) return [];

  const id = Number(assetId);
  const sec = String(section).trim();
  const set = new Set();

  state.tasksData.forEach(t => {
    if (
      Number(t.asset_id) === id &&
      String(t.section || "").trim() === sec &&
      t.unit &&
      String(t.unit).trim() !== ""
    ) {
      set.add(String(t.unit).trim());
    }
  });

  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, "el", { sensitivity: "base" })
  );
}

/* =====================
   FILTERS
===================== */
function buildAssetDropdown() {
  const menu = getEl("assetDropdownMenu");
  const btn = getEl("assetDropdownBtn");

  if (!menu || !btn) return;

  menu.innerHTML = "";

  const map = new Map();

  state.tasksData.forEach(t => {
    if (!t.machine_name || !t.serial_number) return;

    const key = `${t.machine_name}||${t.serial_number}`;
    if (map.has(key)) return;

    map.set(key, {
      value: key,
      line: t.line_code || t.line || "",
      machine: t.machine_name,
      serial: t.serial_number
    });
  });

  const assets = Array.from(map.values()).sort((a, b) => {
    const la = `${a.line} ${a.machine} ${a.serial}`;
    const lb = `${b.line} ${b.machine} ${b.serial}`;
    return la.localeCompare(lb, "el", { sensitivity: "base" });
  });

  // All Machines option
  const all = document.createElement("div");
  all.className = "asset-option active";
  all.textContent = "All Machines";
  all.dataset.value = "all";
  menu.appendChild(all);

  btn.textContent = "All Machines";
  state.activeAssetFilter = "all";

  assets.forEach(a => {
    const div = document.createElement("div");
    div.className = "asset-option";
    div.dataset.value = a.value;

    // 🔥 RICH LABEL
    div.innerHTML = `
      <div><strong>${a.line} | ${a.machine}</strong></div>
      <small>SN: ${a.serial}</small>
    `;

    menu.appendChild(div);
  });
}

/* =====================
   ASSET DROPDOWN (INIT)
===================== */
function initAssetDropdown() {
  const btn = document.getElementById("assetDropdownBtn");
  const menu = document.getElementById("assetDropdownMenu");

  if (!btn || !menu) return;

  // 🔒 reset state κάθε φορά
  menu.classList.remove("open");

  // ❗ καθάρισε παλιούς handlers
  btn.onclick = null;
  menu.onclick = null;
  document.onclick = null;

  // Toggle dropdown
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle("open");
  };

  // Options (event delegation)
  menu.onclick = (e) => {
    const opt = e.target.closest(".asset-option");
    if (!opt) return;

    menu.querySelectorAll(".asset-option")
      .forEach(o => o.classList.remove("active"));

    opt.classList.add("active");

    state.activeAssetFilter = opt.dataset.value;

    // αν το label έχει HTML (line | machine | small SN)
    btn.innerHTML = opt.innerHTML;

    menu.classList.remove("open");
    renderTable();
  };

  // Close on outside click (ΜΟΝΟ ΕΝΑΣ)
  document.onclick = () => {
    menu.classList.remove("open");
  };

  console.log("INIT DROPDOWN ✅", {
    options: menu.querySelectorAll(".asset-option").length
  });
}