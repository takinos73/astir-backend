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

/* =====================
   REUSE PREVIOUS TASK – HELPERS
===================== */

function getSelectedAddTaskAssetModel() {
  const assetId = document.getElementById("nt-asset")?.value;
  if (!assetId || !Array.isArray(state.assetsData)) return null;

  const asset = state.assetsData.find(a =>
    String(a.id) === String(assetId)
  );

  return asset?.model || null;
}

function getCurrentAddTaskSection() {
  const sectionSelect = document.getElementById("nt-section");
  const sectionInput = document.getElementById("nt-section-input");

  if (sectionSelect && sectionSelect.style.display !== "none") {
    return sectionSelect.value?.trim() || "";
  }

  return sectionInput?.value?.trim() || "";
}

function getCurrentAddTaskUnit() {
  const unitSelect = document.getElementById("nt-unit");
  const unitInput = document.getElementById("nt-unit-input");

  if (unitSelect && unitSelect.style.display !== "none") {
    if (unitSelect.value && unitSelect.value !== "__new__") {
      return unitSelect.value.trim();
    }
  }

  return unitInput?.value?.trim() || "";
}

function getReusableTasksForContext() {
  const machineModel = getSelectedAddTaskAssetModel();
  const section = getCurrentAddTaskSection();
  const unit = getCurrentAddTaskUnit();

  if (!machineModel || !section || !unit) return [];
  if (!Array.isArray(state.executionsData)) return [];

  const map = new Map();

  state.executionsData.forEach(e => {
    const sameMachine =
      String(e.machine || "").trim() === String(machineModel).trim();

    const sameSection =
      String(e.section || "").trim() === String(section).trim();

    const sameUnit =
      String(e.unit || "").trim() === String(unit).trim();

    if (!sameMachine || !sameSection || !sameUnit) return;
    if (!e.task || !String(e.task).trim()) return;

    const key = [
      e.task,
      e.type || "",
      e.section || "",
      e.unit || ""
    ].join("||");

    if (!map.has(key)) {
      map.set(key, {
        task: e.task,
        type: e.type || "",
        notes: e.notes || "",
        duration_min: e.duration_min || "",
        last_used: e.executed_at || null
      });
      return;
    }

    const existing = map.get(key);

    if (
      e.executed_at &&
      (!existing.last_used || new Date(e.executed_at) > new Date(existing.last_used))
    ) {
      existing.last_used = e.executed_at;
      existing.notes = e.notes || existing.notes;
      existing.duration_min = e.duration_min || existing.duration_min;
    }
  });

  return Array.from(map.values())
    .sort((a, b) => new Date(b.last_used || 0) - new Date(a.last_used || 0));
}

/* =====================
    REFRESH REUSE TASK DROPDOWN BASED ON CURRENT CONTEXT
===================== */

function refreshReuseTaskDropdown() {
  const block = document.getElementById("reuseTaskBlock");
  const select = document.getElementById("nt-reuse-task");

  if (!block || !select) return;

  const reusable = getReusableTasksForContext();

  select.innerHTML = `<option value="">Select previous task...</option>`;

  if (reusable.length === 0) {
    block.style.display = "none";
    return;
  }

  reusable.forEach((r, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = r.type
      ? `${r.task} — ${r.type}`
      : r.task;

    opt.dataset.task = r.task || "";
    opt.dataset.type = r.type || "";
    opt.dataset.notes = r.notes || "";
    opt.dataset.duration = r.duration_min || "";

    select.appendChild(opt);
  });

  block.style.display = "block";
}

/* =====================
   KPIs
===================== */

function updateKpis() {
  let overdue = 0, soon = 0, done = 0;

  state.tasksData.forEach(t => {
    if (t.status === "Done") return done++;
    const st = getDueState(t);
    if (st === "overdue") overdue++;
    if (st === "soon") soon++;
  });

  getEl("kpiTotal").textContent = state.tasksData.length;
  getEl("kpiOverdue").textContent = overdue;
  getEl("kpiSoon").textContent = soon;
  getEl("kpiDone").textContent = done;
}

/* =====================
   POPULATE ADD TASK LINES
===================== */
function populateAddTaskLines() {
  const sel = document.getElementById("nt-line");
  if (!sel) return;

  sel.innerHTML = `<option value="">Select Line</option>`;

  if (!Array.isArray(state.assetsData)) return;

  const lines = [...new Set(
    state.assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    sel.appendChild(opt);
  });
}

function populateUnitsForSection(assetId, section) {

const unitSelect = document.getElementById("nt-unit");
const unitInput = document.getElementById("nt-unit-input");

if (!unitSelect || !unitInput) return;

unitSelect.innerHTML = "";

const units = getUnitsForAssetSection(assetId, section);

if (units.length > 0) {
    unitSelect.innerHTML =
    `<option value="">Select unit</option>` +
    units.map(u => `<option value="${u}">${u}</option>`).join("") +
    `<option value="__new__">➕ New unit</option>`;
    unitSelect.style.display = "block";
    unitInput.style.display = "none";
    unitInput.value = "";
    } else {
    unitSelect.style.display = "none";
    unitInput.style.display = "block";
    unitInput.value = "";
    }
}

function resetAddTaskAssetContext() {
  const lineSel = document.getElementById("nt-line");
  const assetSel = document.getElementById("nt-asset");

  if (!lineSel || !assetSel) return;

  // Enable dropdowns
  lineSel.disabled = false;
  assetSel.disabled = false;

  // Remove visual lock (if used)
  lineSel.classList.remove("locked");
  assetSel.classList.remove("locked");
}

/* =====================
   RESET ADD TASK FORM TO DEFAULT STATE
===================== */

function resetAddTaskForm() {
  resetSectionLockState();

  state.taskTypeTouchedManually = false;

  document
    .querySelectorAll("#addTaskModal input, #addTaskModal textarea, #addTaskModal select")
    .forEach(el => {
      el.value = "";
      el.disabled = false;
      el.classList.remove("locked");
    });

  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    applyAddTaskTypeUI(true);
  }

  const assetSel = document.getElementById("nt-asset");
  if (assetSel) {
    assetSel.innerHTML = `<option value="">Select Asset</option>`;
    assetSel.disabled = true;
  }

  const sectionSelect = document.getElementById("nt-section");
  const sectionInput = document.getElementById("nt-section-input");

  if (sectionSelect) {
    sectionSelect.innerHTML = "";
    sectionSelect.style.display = "none";
  }

  if (sectionInput) {
    sectionInput.value = "";
    sectionInput.style.display = "block";
  }

  const unitSelect = document.getElementById("nt-unit");
  const unitInput = document.getElementById("nt-unit-input");

  if (unitSelect) {
    unitSelect.innerHTML = `<option value="">Select Unit</option>`;
    unitSelect.style.display = "none";
  }

  if (unitInput) {
    unitInput.value = "";
    unitInput.style.display = "block";
  }

  const addOverlay = document.getElementById("addTaskOverlay");
  if (addOverlay) {
    addOverlay.style.zIndex = "";
  }
}

function resetSectionLockState() {
  const sectionSelect = document.getElementById("nt-section");
  const sectionInput  = document.getElementById("nt-section-input");

  if (sectionSelect) {
    sectionSelect.disabled = false;
    sectionSelect.classList.remove("locked");
  }

  if (sectionInput) {
    sectionInput.disabled = false;
    sectionInput.classList.remove("locked");
  }

  // reset follow-up flags
  state.lockSectionOnce = false;
  state.followUpSectionValue = null;
}

// Close modal
function closeTaskView() {
  document.getElementById("taskViewOverlay").style.display = "none";
}

// =====================
// TASK EDITING (COLLAPSE / EXPAND) — SAFE
// =====================

function enableTaskEdit() {
  if (!state.currentViewedTask) return;

  const t = state.currentViewedTask;

  // Fill edit fields (guarded)
  const descEl = document.getElementById("edit-task-desc");
  if (descEl) descEl.value = t.task || "";

  const typeEl = document.getElementById("edit-task-type");
  if (typeEl) typeEl.value = t.type || "";

  const impactEl = document.getElementById("edit-task-impact");
  if (impactEl) {
    impactEl.value = t.impact || "normal";
  }

  const secEl = document.getElementById("edit-task-section");
  if (secEl) secEl.value = t.section || "";

  const unitEl = document.getElementById("edit-task-unit");
  if (unitEl) unitEl.value = t.unit || "";

  const dueEl = document.getElementById("edit-task-due");
  if (dueEl) dueEl.value = t.due_date ? String(t.due_date).split("T")[0] : "";

  const notesEl = document.getElementById("edit-task-notes");
  if (notesEl) notesEl.value = t.notes || "";

  // Show edit area
  const editArea = document.getElementById("taskEditArea");
  if (editArea) editArea.style.display = "block";

  // (Optional) scroll into view (safe)
  if (editArea && editArea.scrollIntoView) {
    editArea.scrollIntoView({ block: "start" });
  }

  // Hide edit button while editing
  const editBtn = document.getElementById("editTaskBtn");
  if (editBtn) editBtn.style.display = "none";
}

function cancelTaskEdit() {
  const editArea = document.getElementById("taskEditArea");
  if (editArea) editArea.style.display = "none";

  // Show Edit button again (only if allowed)
  const editBtn = document.getElementById("editTaskBtn");
  if (editBtn && state.currentViewedTask && canEditTask(state.currentViewedTask)) {
    editBtn.style.display = "inline-flex";
  }
}

// =====================
// CONFIRM + SOFT DELETE TASK
// =====================

async function confirmDeleteTask() {
  if (!state.currentViewedTask) return;

  const ok = confirm(
    "Are you sure you want to cancel this planned task?\nThis action cannot be undone."
  );

  if (!ok) return;

  try {
    const res = await fetch(
      `${API}/tasks/${state.currentViewedTask.id}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Delete failed");
    }

    state.currentViewedTask = null;

    closeTaskView();

    if (
      state.currentAssetSerial &&
      typeof refreshAssetView === "function"
    ) {
      // Asset View open → refreshAssetView handles task/history reload
      await refreshAssetView();
    } else {
      // Normal Tasks view → only tasks need refresh
      await loadTasks();
    }

  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    alert(err.message);
  }
}