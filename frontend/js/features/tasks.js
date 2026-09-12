// =====================
// TASKS FEATURE
// =====================

console.log("TASKS.JS LOADED");

// =====================
// TASKS PAGINATION
// =====================

const TASKS_DEFAULT_PAGE_SIZE = 20;
const TASKS_MIN_PAGE_SIZE = 10;
const TASKS_MAX_PAGE_SIZE = 25;

let tasksCurrentPage = 1;

function getTasksPageSize() {
  const table = document.getElementById("tasksTable");
  const pagination = document.getElementById("tasksPagination");

  if (!table || table.offsetParent === null) {
    return TASKS_DEFAULT_PAGE_SIZE;
  }

  const tableTop = table.getBoundingClientRect().top;

  const paginationHeight =
    pagination?.getBoundingClientRect().height || 52;

  const tableHeadHeight =
    table.querySelector("thead")?.getBoundingClientRect().height || 40;

  const sampleRow =
    table.querySelector("tbody tr");

  const rowHeight =
    sampleRow?.getBoundingClientRect().height || 62;

  const bottomMargin = 48;

  const availableHeight =
    window.innerHeight
    - tableTop
    - tableHeadHeight
    - paginationHeight
    - bottomMargin;

  const calculated =
    Math.floor(availableHeight / rowHeight);

  return Math.min(
    TASKS_MAX_PAGE_SIZE,
    Math.max(TASKS_MIN_PAGE_SIZE, calculated)
  );
}

/* =====================
   LOAD TASKS
===================== */

async function loadTasks() {
  // 🔒 force-close asset dropdown before rebuild
  const menu = document.getElementById("assetDropdownMenu");
  if (menu) menu.classList.remove("open");

  const res = await fetch(`${API}/tasks`);
  state.tasksData = await res.json(); // ✅ ΜΟΝΟ ΑΥΤΟ

  console.log("SAMPLE TASK:", state.tasksData[0]);

  updateKpis();
  loadCompletedKpi();

  buildAssetDropdown();
  initAssetDropdown();

  renderTable();

  if (typeof renderAssetDashboard === "function") {
    renderAssetDashboard();
  }

  const assetsTab = document.getElementById("tab-assets");
  if (assetsTab?.classList.contains("active")) {
    renderAssetsCards();
  }
}

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
// SAVE TASK EDIT (PUT – METADATA ONLY)
// =====================
async function saveTaskEdit() {
  if (!state.currentViewedTask) return;

  // 🔒 Safety check
  if (!canEditTask(state.currentViewedTask)) {
    alert("This task cannot be edited");
    return;
  }

  const payload = {
    task: document.getElementById("edit-task-desc")?.value?.trim(),
    type: document.getElementById("edit-task-type")?.value || null,

    // 🔹 Impact classification
    impact:
      document.getElementById("edit-task-impact")?.value || "normal",

    section: document.getElementById("edit-task-section")?.value || null,
    unit: document.getElementById("edit-task-unit")?.value || null,
    due_date: document.getElementById("edit-task-due")?.value || null,
    notes: document.getElementById("edit-task-notes")?.value || null
  };

  // 🔒 Validation
  if (!payload.task) {
    alert("Task description is required");
    return;
  }

  try {
    const res = await fetch(
      `${API}/tasks/${state.currentViewedTask.id}`,
      {
        method: "PUT", // 👈 KEEP — existing backend flow
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    // success
    state.currentViewedTask = null;

    // Close modal
    closeTaskView();

    // Refresh tasks list
    await loadTasks();

  } catch (err) {
    console.error("SAVE TASK EDIT ERROR:", err);
    alert(err.message);
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

/* =====================
   VIEW TASK MODAL
===================== */

function viewTask(taskId) {
  const task = state.tasksData.find(t => t.id === taskId);
  if (!task) return;

  const el = document.getElementById("taskViewContent");

  // =====================
  // PRINT BUTTON
  // =====================
  const printBtn = document.getElementById("printTaskBtn");
  if (printBtn) {
    printBtn.style.display = "inline-flex";
    printBtn.onclick = () => printTask(task.id);
  }

  el.innerHTML = `

<!-- =====================
     TECHNICAL TASK VIEW
===================== -->

  <!-- ASSET CONTEXT -->
  <div class="task-view-asset tech">
    <div class="asset-main">
      🏭 ${task.machine_name}
    </div>
    <div class="asset-sub">
      ${task.serial_number ? `SN: ${task.serial_number}` : ""}
      • Line ${task.line_code}
    </div>
  </div>

  <!-- WORK ORDER TITLE -->
  <div class="task-view-title tech">
    ${task.task}
  </div>

  <!-- STATUS / TYPE / IMPACT -->
  <div class="task-view-meta tech">

    <span class="badge badge-type">
      ${task.type || "Maintenance Task"}
    </span>

    <span class="badge badge-status">
      ${task.status}
    </span>

    ${renderImpactBadge(task.impact)}

    ${
      task.due_date
        ? `
          <span class="badge badge-date">
            Due: ${formatDate(task.due_date)}
          </span>
        `
        : ""
    }

  </div>

<!-- TECHNICAL DETAILS -->
<div class="task-view-details tech">

  <div>
    <label>Section</label>
    <div>${task.section || "-"}</div>
  </div>

  <div>
    <label>Unit</label>
    <div>${task.unit || "-"}</div>
  </div>

  <div>
    <label>Maintenance Type</label>
    <div>
      ${getMaintenanceTypeLabel(task)}
    </div>
  </div>

  <div>
    <label>Frequency</label>
    <div>
      ${task.frequency_hours ? task.frequency_hours + " h" : "-"}
    </div>
  </div>

  <div>
    <label>Estimated Duration</label>
    <div>
      ${task.duration_min ? task.duration_min + " min" : "-"}
    </div>
  </div>

</div>
    <!-- NOTES -->
  ${
    task.notes
      ? `
  <div class="task-view-notes tech">
    <label>Notes</label>
    <div>${task.notes}</div>
  </div>
  `
      : ""
  }
  <!-- COMPLETION INFO -->
  ${
    task.status === "Done"
      ? `
  <div class="task-view-completed tech">
    ✔ Completed<br>
    <span>
      Executed by <strong>${task.completed_by || "-"}</strong>
    </span>
    <span>
      • ${task.completed_at ? formatDate(task.completed_at) : ""}
    </span>
  </div>
  `
      : ""
  }

`;
  document.getElementById("taskViewOverlay").style.display = "flex";

  // =====================
  // EDIT / DONE/ DELETE VISIBILITY
  // =====================
  state.currentViewedTask = task;

  const doneBtn = document.getElementById("taskViewDoneBtn");

    if (
      doneBtn &&
      task.status !== "Done"
    ) {
      doneBtn.style.display = "inline-flex";
    } else if (doneBtn) {
      doneBtn.style.display = "none";}


  const editBtn = document.getElementById("editTaskBtn");
  const deleteBtn = document.getElementById("deleteTaskBtn");
  const editArea = document.getElementById("taskEditArea");

  if (canEditTask(task)) {
    editBtn.style.display = "inline-flex";
    deleteBtn.style.display = "inline-flex";
    editArea.style.display = "none";
  } else {
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
    editArea.style.display = "none";
  }

  // =====================
  // FOLLOW-UP BUTTON IN ACTION BAR (ALIGN WITH OTHER ACTIONS)
  // =====================
  const followupBtn = document.getElementById("createFollowupTaskBtn");

  if (
    followupBtn &&
    hasRole("planner", "admin") &&
    task.status !== "Done" &&
    (isPreventive(task) || isPlannedManual(task))
  ) {
    followupBtn.style.display = "inline-flex";
  } else if (followupBtn) {
    followupBtn.style.display = "none";
  }
}

/* ==========================
   BUILD TASK ROW (FOR TABLE)
============================ */

function buildRow(task) {

  const isIdle =
    !!task.asset_idle_since;

  const tr =
    document.createElement("tr");


  // 🔍 Search query
  const q =
    document.getElementById("taskSearch")?.value || "";


  /* =====================================
     RESTORATION TASK

     A Restoration Task belongs to a
     parent Breakdown incident.
  ===================================== */

  const isRestoration =
    Number(task.breakdown_id) > 0;


  const breakdownCode =
    isRestoration
      ? `BD-${String(task.breakdown_id).padStart(5, "0")}`
      : null;


  /* =====================================
     TASK TYPE CLASSIFICATION
  ===================================== */

  let rowClass = "";


  // 🟪 Restoration Task
  if (isRestoration) {

    rowClass =
      "task-restoration";

  }

  // 🟦 Preventive (Excel master plan)
  else if (
    task.frequency_hours &&
    Number(task.frequency_hours) > 0
  ) {

    rowClass =
      "task-preventive";

  }

  // 🟥 Unplanned / completed manual
  else if (
    task.is_planned === false ||
    task.status === "Done"
  ) {

    rowClass =
      "task-unplanned";

  }

  // 🟨 Planned manual
  else {

    rowClass =
      "task-planned-manual";

  }


  tr.classList.add(
    rowClass
  );


  /* =====================================
     TYPE DISPLAY
  ===================================== */

  const typeHtml =
    isRestoration
      ? `
          <div class="task-restoration-type">
            Restoration
          </div>

          <div class="task-breakdown-parent">
            ${breakdownCode}
          </div>
        `
      : (
          task.type
            ? highlight(task.type, q)
            : "-"
        );


  /* =====================================
     ROW HTML
  ===================================== */

  tr.innerHTML = `

    <!-- MACHINE / ASSET -->

    <td class="machine-cell">

      <div
        class="machine-name clickable"
        onclick="openAssetViewBySerial('${task.serial_number}')"
        title="Open asset view"
      >

        ${highlight(
          task.machine_name || "",
          q
        )}

        ${
          isIdle
            ? `
              <span class="task-idle-badge">
                Idle
              </span>
            `
            : ""
        }

      </div>


      ${
        task.serial_number
          ? `
            <div
              class="machine-sn clickable"
              onclick="openAssetViewBySerial('${task.serial_number}')"
              title="Open asset view"
            >

              <small>
                ${highlight(
                  task.serial_number,
                  q
                )}
              </small>

            </div>
          `
          : ""
      }

    </td>


    <!-- SECTION -->

    <td>
      ${
        task.section
          ? highlight(task.section, q)
          : "-"
      }
    </td>


    <!-- UNIT -->

    <td>
      ${
        task.unit
          ? highlight(task.unit, q)
          : "-"
      }
    </td>


    <!-- TASK -->

    <td>

      <div>
        ${highlight(
          task.task || "",
          q
        )}
      </div>

      ${renderImpactBadge(
        task.impact
      )}

    </td>


    <!-- TYPE -->

    <td>
      ${typeHtml}
    </td>


    <!-- DATE -->

    <td>
      ${
        task.status === "Done"
          ? "Completed: " +
            formatDate(task.completed_at)
          : formatDate(task.due_date)
      }
    </td>


    <!-- STATUS -->

    <td>
      ${statusPill(task)}
    </td>


    <!-- ACTIONS -->

    <td>

      <div class="history-action-group">

        <!-- 👁 View task -->

        <button
          class="btn-icon btn-view"
          title="View task details"
          onclick="viewTask(${task.id})"
        >
          👁
        </button>


        <!-- ✔ Mark as Done -->

        ${
          task.status !== "Done"
            ? `
              <button
                class="btn-icon btn-done"
                title="Mark task as completed"
                onclick="askTechnician(${task.id})"
              >
                ✔
              </button>
            `
            : ""
        }

      </div>

    </td>

  `;


  return tr;

}

// =====================
// RENDER TASKS TABLE (WITH FILTERS)
// =====================

function renderTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const q = document.getElementById("taskSearch")?.value || "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const source = filterByTaskType(state.tasksData);
console.log("renderTable(): tasksData =", state.tasksData.length, "source(after type) =", source.length, "type =", state.activeTaskTypeFilter);

const filtered = source


  // 🔍 SEARCH
  .filter(t => matchesSearch(t, q))

  // 🟨🔵 TASK TYPE FILTER (MASTER)
.filter(t => {

  const plannedOn =
    document.querySelector('[data-type="planned"]')?.classList.contains("active");

  const preventiveOn =
    document.querySelector('[data-type="preventive"]')?.classList.contains("active");

  // 🔵 και τα 2 ON → όλα
  if (plannedOn && preventiveOn) {
    return true;
  }

  // 🟢 μόνο preventive
  if (preventiveOn) {
    return isPreventive(t);
  }

  // 🟡 μόνο planned
  if (plannedOn) {
    return isPlannedManual(t);
  }

  // ⚠ safety (αν κατά λάθος είναι και τα 2 OFF → δείξε όλα)
  return true;
})


    // MACHINE FILTER
    .filter(t => {
      if (state.activeAssetFilter === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === state.activeAssetFilter;
    })

    // =====================
    // DATE FILTER (UNIFIED – FIXED)
    // =====================
    .filter(t => {
      const hasDue = !!t.due_date;

      // 🔴 Custom date range (priority)
      if (state.taskDateFrom || state.taskDateTo) {
        if (!hasDue) return false;

        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);

        if (state.taskDateFrom && due < state.taskDateFrom) return false;
        if (state.taskDateTo && due > state.taskDateTo) return false;
        return true;
      }

      // 🟢 Quick date filters
      if (state.activeDateFilter === "today") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due.getTime() === today.getTime();
      }

      if (state.activeDateFilter === "week") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due >= today && due <= weekEnd;
      }

      if (state.activeDateFilter === "overdue") {
        if (!hasDue) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        return due < today;
      }

      // ⚪ ALL → ΔΕΝ φιλτράρουμε τίποτα
      return true;
    })

    // =====================
    // SORT (STABLE & CORRECT)
    // =====================
    .sort((a, b) => {
      const order = {
        overdue: 0,
        today: 1,
        soon: 2,
        ok: 3,
        unknown: 4,
        done: 5
      };

      const da = order[getDueState(a)] ?? 99;
      const db = order[getDueState(b)] ?? 99;

      if (da !== db) return da - db;

      // secondary sort by due_date
      if (!a.due_date && b.due_date) return 1;
      if (!b.due_date && a.due_date) return -1;
      if (!a.due_date && !b.due_date) return 0;

      return new Date(a.due_date) - new Date(b.due_date);
    });

  // =====================
  // UPDATE TASKS COUNT + DURATION
  // =====================
  const countEl = document.getElementById("tasksCountLabel");
  if (countEl) {
    const n = filtered.length;

    const totalMinutes = filtered.reduce((sum, t) => {
      return t.duration_min != null ? sum + Number(t.duration_min) : sum;
    }, 0);

    let label = `${n} task${n === 1 ? "" : "s"}`;

    if (totalMinutes > 0) {
      label += ` • ${formatDuration(totalMinutes)}`;
    }

    countEl.textContent = label;
    countEl.classList.toggle("zero", n === 0);
  }

  // =====================
  // PAGINATION
  // =====================

  const totalTasks = filtered.length;
  const pageSize = getTasksPageSize();

  const totalPages = Math.max(
    1,
    Math.ceil(totalTasks / pageSize)
  );

    // Safety: if filters reduce the number of pages
    if (tasksCurrentPage > totalPages) {
      tasksCurrentPage = totalPages;
    }

    if (tasksCurrentPage < 1) {
      tasksCurrentPage = 1;
    }

  const startIndex =
    (tasksCurrentPage - 1) * pageSize;

  const endIndex =
    Math.min(
      startIndex + pageSize,
      totalTasks
  );

  const pageTasks =
    filtered.slice(startIndex, endIndex);

  // Render only current page
  pageTasks.forEach(t =>
    tbody.appendChild(buildRow(t))
  );

  // =====================
  // PAGINATION UI
  // =====================

  const infoEl =
    document.getElementById("tasksPaginationInfo");

  const pageLabel =
    document.getElementById("tasksPageLabel");

  const prevBtn =
    document.getElementById("tasksPrevPage");

  const nextBtn =
    document.getElementById("tasksNextPage");

  if (infoEl) {
    infoEl.textContent =
      totalTasks === 0
        ? "Showing 0–0 of 0"
        : `Showing ${startIndex + 1}–${endIndex} of ${totalTasks}`;
  }

  if (pageLabel) {
    pageLabel.textContent =
      `${tasksCurrentPage} / ${totalPages}`;
  }

  if (prevBtn) {
    prevBtn.disabled =
      tasksCurrentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled =
      tasksCurrentPage >= totalPages;
  }
}

// =====================
// PRINT TASK (FRONTEND)
// =====================
function printTask(taskId) {
  if (!taskId) return;
  window.open(`${API}/api/tasks/${taskId}/print`, "_blank");
}

function printTasks() {
  const tasks = getFilteredTasksForPrint();
  console.log("PRINT DEBUG:", {
  activeAssetFilter: state.activeAssetFilter,
  tasksLength: state.tasksData.length,
  filtered: getFilteredTasksForPrint()
});

  if (!Array.isArray(tasks) || tasks.length === 0) {
    alert("No tasks to print");
    return;
  }

  const totalMinutes = tasks.reduce(
    (sum, t) => t.duration_min != null ? sum + Number(t.duration_min) : sum,
    0
  );

  window.printTaskSchedule({
    tasks,
    meta: {
      date: new Date().toLocaleDateString("el-GR"),
      period: getCurrentPeriodLabel(),
      asset: getAssetFilterLabel(),
      status: getStatusFilterLabel(),
      totalDuration: totalMinutes > 0 ? formatDuration(totalMinutes) : ""
    },
    helpers: {
      formatDate,
      formatDuration,
      getDueState
    }
  });
}

/* ===================================
   TECHNICIANS DROPDOWN (BREAKDOWN TASK)
 ===================================== */
  function populateBreakdownTechnicians() {
  const sel = document.getElementById("nt-technician");
  if (!sel || !Array.isArray(state.techniciansData)) return;

  sel.innerHTML = `<option value="">Select Technician</option>`;

  state.techniciansData
    .filter(t => t.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "el"))
    .forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;         // 👈 FK
      opt.textContent = t.name; // 👈 visible
      sel.appendChild(opt);
    });
}

/* =====================
   FILTER EVENTS
===================== */

getEl("machineFilter")?.addEventListener("change", () => {
  renderTable();
});
document
  .getElementById("taskSearch")
  ?.addEventListener("input", (e) => {
    console.log("SEARCH INPUT:", e.target.value);
    renderTable();
  });

/* =====================
   ADD TASK TYPE LOGIC
   Planned vs Unplanned (SAFE TOGGLE)
===================== */

function applyAddTaskTypeUI(isPlanned) {

  // 🔹 Title
  const title = document.getElementById("addTaskTitle");
  if (title) {
    title.textContent = isPlanned
      ? "New Planned Task"
      : "New Unplanned Task (Breakdown)";
  }

  // 🔹 HARD RESET (hide everything first)
  document.querySelectorAll(".planned-only, .unplanned-only")
    .forEach(el => el.style.display = "none");

  // 🔹 Show correct mode
  if (isPlanned) {
    document.querySelectorAll(".planned-only")
      .forEach(el => el.style.display = "block");
  } else {
    document.querySelectorAll(".unplanned-only")
      .forEach(el => el.style.display = "block");
      // 🔥 NEW — Populate technicians when breakdown mode
      populateBreakdownTechnicians();
  }

  // 🔹 Visual cue on modal
  const modal = document.getElementById("addTaskModal");
  if (modal) {
    modal.classList.toggle("unplanned-mode", !isPlanned);
  }
}

// 🔁 Change handler
document.getElementById("taskPlannedType")
  ?.addEventListener("change", e => {
    applyAddTaskTypeUI(e.target.value === "planned");
  });

// =====================
// TASKS PAGINATION EVENTS
// =====================

document
  .getElementById("tasksPrevPage")
  ?.addEventListener("click", () => {
    if (tasksCurrentPage <= 1) return;

    tasksCurrentPage--;
    renderTable();
  });

document
  .getElementById("tasksNextPage")
  ?.addEventListener("click", () => {
    tasksCurrentPage++;
    renderTable();
  });

// =====================
// TASKS AUTO PAGE SIZE
// =====================

let tasksResizeTimer = null;

window.addEventListener("resize", () => {
  clearTimeout(tasksResizeTimer);

  tasksResizeTimer = setTimeout(() => {
    tasksCurrentPage = 1;
    renderTable();
  }, 150);
});