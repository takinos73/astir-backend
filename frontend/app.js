// ASTIR CMMS UI v2 - Supervisor Dashboard");

const API = "https://astir-backend.onrender.com";


flatpickr("#historyDateRange", {
  mode: "range",
  dateFormat: "d-m-Y",
  allowInput: true,
  onClose: function(selectedDates) {

    if (selectedDates.length === 2) {
      state.historyDateFrom = selectedDates[0];
      state.historyDateTo = selectedDates[1];

      state.historyDateFrom.setHours(0,0,0,0);
      state.historyDateTo.setHours(23,59,59,999);

      renderHistoryTable(state.executionsData);
    }
  }
});

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("el-GR");
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

//----------------------
// TASK TYPE HELPER
//----------------------

function getStatusFilterLabel() {
  if (state.activeTaskTypeFilter === "planned") return "Planned (Manual)";
  if (state.activeTaskTypeFilter === "preventive") return "Preventive";
  return "ALL";
}

// =====================
// TASK TYPE FILTER UI
// - 2 active → ALL
// - 1 active → that type
// - 0 active → FORCED back to ALL
// =====================
document.addEventListener("click", e => {
  const btn = e.target.closest(".task-type-btn");
  if (!btn) return;

  const type = btn.dataset.type;
  if (!type) return;

  // toggle clicked button
  btn.classList.toggle("active");

  const buttons = Array.from(
    document.querySelectorAll(".task-type-btn")
  );

  const active = buttons.filter(b =>
    b.classList.contains("active")
  );

  // ❌ 0 active → force ALL (activate both)
  if (active.length === 0) {
    buttons.forEach(b => b.classList.add("active"));
    state.activeTaskTypeFilter = "all";
  }

  // ✅ 2 active → ALL
  else if (active.length === 2) {
    state.activeTaskTypeFilter = "all";
  }

  // 🎯 1 active → that type
  else {
    state.activeTaskTypeFilter = active[0].dataset.type;
  }

  renderTable();
});

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
    HANDLE REUSE TASK SELECTION
===================== */

document.getElementById("nt-reuse-task")?.addEventListener("change", e => {
  const opt = e.target.selectedOptions?.[0];
  if (!opt || !opt.value) return;

  const taskEl = document.getElementById("nt-task");
  const typeEl = document.getElementById("nt-type");
  const notesEl = document.getElementById("nt-notes");
  const durationEl = document.getElementById("nt-duration");

  if (taskEl) taskEl.value = opt.dataset.task || "";
  if (typeEl) typeEl.value = opt.dataset.type || "";
  if (notesEl && opt.dataset.notes) notesEl.value = opt.dataset.notes;

  if (durationEl && opt.dataset.duration) {
    durationEl.value = opt.dataset.duration;
  }

  state.taskTypeTouchedManually = true;
});

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

// =====================
// POPULATE HISTORY TECHNICIAN FILTER
// =====================
function populateHistoryTechnicianFilter() {

  const select = document.getElementById("historyTechnicianSearch");
  if (!select) return;

  select.innerHTML = `<option value="">👤 All technicians</option>`;

  if (!Array.isArray(state.techniciansData)) return;

  state.techniciansData
    .sort((a, b) => a.name.localeCompare(b.name, "el"))
    .forEach(t => {

      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;

      select.appendChild(opt);

    });
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

/* =====================
   LOAD TASK HISTORY
===================== */
async function loadHistory() {
  try {
    const res = await fetch(`${API}/executions`);
    state.executionsData = await res.json();   // ✅ source of truth

    console.log("HISTORY DATA:", state.executionsData);

    renderHistoryTable(state.executionsData);
    updateCentralHistoryLegendCounts(state.executionsData); // ✅ καλύτερα μέσα στο try
  } catch (err) {
    console.error("LOAD HISTORY ERROR:", err);
    updateCentralHistoryLegendCounts([]); // ✅ fail-safe (προαιρετικό αλλά safe)
  }
}
/* =====================
    GET EXECUTION TYPE
===================== */

function getExecutionType(h) {

  // 🔴 Restoration Task related to new Breakdown system
  if (
    h.breakdown_id !== null &&
    h.breakdown_id !== undefined
  ) {
    return "restoration";
  }


  // 🔴 Legacy Unplanned / Breakdown
  if (h.is_planned === false) {
    return "unplanned";
  }


  // 🟢 Preventive (frequency based)
  if (
    h.frequency_hours &&
    Number(h.frequency_hours) > 0
  ) {
    return "preventive";
  }


  // 🟡 Manual Planned (no frequency)
  return "planned";

}

/* =====================
    PRINT History TASK
===================== */
function printExecution(executionId) {
  window.open(`${API}/api/executions/${executionId}/print`, "_blank");
}

/* =====================
   Render HISTORY table
===================== */

function wasEditedAfterExecution(h) {
  if (!h.updated_at || !h.executed_at) return false;
  return new Date(h.updated_at) > new Date(h.executed_at);
}

  /* ==================================
      RENDER HISTORY TABLE WITH FILTERS
      - rolling range OR custom from/to (custom overrides rolling)
      - machine search
      - type filter (planned/unplanned/preventive)
      - technician search
  =================================== */

function renderHistoryTable(data) {
  const tbody = document.querySelector("#historyTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const rangeFromDate =
    state.historyDateRange === "all"
      ? null
      : new Date(
          now.getTime() -
            Number(state.historyDateRange) * 24 * 60 * 60 * 1000
        );

  const customFrom =
    typeof state.historyDateFrom !== "undefined" && state.historyDateFrom
      ? new Date(state.historyDateFrom)
      : null;

  const customTo =
    typeof state.historyDateTo !== "undefined" && state.historyDateTo
      ? new Date(state.historyDateTo)
      : null;

  if (customFrom) customFrom.setHours(0, 0, 0, 0);
  if (customTo) customTo.setHours(23, 59, 59, 999);

  /* =====================
     🔥 FILTER FIRST
  ===================== */

  const filtered = data
    .filter(h => {

      const exec = new Date(h.executed_at);

      if (state.historyDateFrom || state.historyDateTo) {
        if (state.historyDateFrom && exec < state.historyDateFrom) return false;
        if (state.historyDateTo && exec > state.historyDateTo) return false;
        return true;
      }

      if (state.historyDateRange && state.historyDateRange !== "all") {
        if (!rangeFromDate) return true;
        return exec >= rangeFromDate;
      }

      return true;
    })

    .filter(h => {
      if (!state.historyMachineQuery) return true;

      const searchText = `
        ${h.machine || ""}
        ${h.serial_number || ""}
        ${h.line || ""}
        ${h.task || ""}
        ${h.section || ""}
        ${h.unit || ""}
        ${h.executed_by || ""}
        ${h.notes || ""}
      `
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      return searchText.includes(
        String(state.historyMachineQuery)
          .toLowerCase()
          .trim()
      );
    })

    .filter(h => {
      if (state.historyTypeFilter === "all") return true;
      const execType = getExecutionType(h);
      return execType === state.historyTypeFilter;
    })

    .filter(h => {
      if (!state.historyTechnicianQuery) return true;
      return (h.executed_by || "")
        .toLowerCase()
        .includes(state.historyTechnicianQuery);
    });

  /* =====================
     🔥 UPDATE LEGENDS
  ===================== */

  updateCentralHistoryLegendCounts(filtered,data);
    
  /* =====================
      🔥 THEN SORT (newest first)
      - by done date DESC
      - then by asset (machine + serial)
      - then by section
    ===================== */

  const sortedHistory = [...filtered].sort((a, b) => {

  // 1️⃣ Done date DESC — newest first
  const dateCompare =
    new Date(b.executed_at || "1900-01-01") -
    new Date(a.executed_at || "1900-01-01");

  if (dateCompare !== 0) {
    return dateCompare;
  }

  // 2️⃣ Same done date → group by asset
  const assetA = `${a.machine || ""} ${a.serial_number || ""}`.toLowerCase();
  const assetB = `${b.machine || ""} ${b.serial_number || ""}`.toLowerCase();

  const assetCompare = assetA.localeCompare(assetB);
  if (assetCompare !== 0) {
    return assetCompare;
  }

  // 3️⃣ Same asset → group by section
  const sectionA = (a.section || "").toLowerCase();
  const sectionB = (b.section || "").toLowerCase();

  return sectionA.localeCompare(sectionB);
});

  /* =====================
     RENDER ROWS
  ===================== */

  sortedHistory.forEach(h => {
    const tr = document.createElement("tr");

    const execType = getExecutionType(h);
    tr.classList.add(`history-${execType}`);

    let actionHtml = `<span class="muted">—</span>`;

    if ( execType === "planned" || execType === "preventive" || execType === "restoration") { {
      actionHtml = `
        <div class="history-action-group">
          <button
            class="btn-icon btn-view"
            title="View details"
            onclick="viewHistoryEntry(${h.id})">
            👁
          </button>
          
          <button
            class="btn-icon btn-restore"
            title="Restore task"
            onclick="undoExecution(${h.id})">
            ↩
          </button>

          <button
            class="btn-icon btn-print"
            title="Print job report"
            onclick="printExecution(${h.id})">
            🖨
          </button>
        </div>
      `;
    }

    else if (execType === "unplanned") {
      actionHtml = `
        <div class="history-action-group">
          <button
            class="btn-icon btn-view"
            title="View breakdown details"
            onclick="viewHistoryEntry(${h.id})">
            👁
          </button>
          
          <button
            class="btn-icon btn-edit"
            title="Edit breakdown details"
            onclick="editBreakdown(${h.id})">
            ✏️
          </button>

          <button
            class="btn-icon btn-print"
            title="Print job report"
            onclick="printExecution(${h.id})">
            🖨
          </button>
        </div>
      `;
    }

    const editedBadge = wasEditedAfterExecution(h)
      ? `<span class="badge-edited" title="Edited after execution">✏️ Edited</span>`
      : "";

    tr.innerHTML = `
      <td title="${formatDateTime(h.executed_at)}">
        ${formatDateOnly(h.executed_at)}
      </td>

      <td>
        <strong>${highlightHistoryText(h.machine)}</strong><br>
        <small>SN: ${highlightHistoryText(h.serial_number)} | ${highlightHistoryText(h.line)}</small>
      </td>

      <td>
          <div class="task-title">
            ${
            execType === "restoration" && h.breakdown_id
              ? `
                <div class="history-breakdown-reference">
                  RESTORATION · BD-${String(
                    h.breakdown_id
                  ).padStart(5, "0")}
                </div>
              `
              : ""
            }
            
            <strong>${h.task}</strong>

            ${
              h.notes
                ? `<span
                    class="task-note-indicator"
                    title="${h.notes}"
                  >📝</span>`
                : ""
            }
          </div>

          <small>
            ${h.section || ""}
            ${h.section && h.unit ? " / " : ""}
            ${h.unit || ""}
            ${editedBadge}
          </small>

          ${
            h.impact && h.impact !== "normal"
              ? `
                <div class="task-impact-wrap">
                  <span class="task-impact-badge task-impact-${h.impact}">
                    ${
                      h.impact === "safety"
                        ? "SAFETY"
                        : h.impact === "quality"
                        ? "QUALITY"
                        : "S + Q"
                    }
                  </span>
                </div>
              `
              : ""
          }
        </td>

      <td>${highlightHistoryText(h.executed_by || "-")}</td>

      <td>${actionHtml}</td>
    `;

    tbody.appendChild(tr);
  });

  applyRoleVisibility();
}
/* =====================
   HISTORY SEARCH HIGHLIGHT
===================== */
function highlightHistoryText(value) {

  const text = String(value ?? "");
  const query = String(state.historyMachineQuery || "").trim();

  if (!query) {
    return text;
  }

  // Escape special RegExp characters
  const escapedQuery = query.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const regex = new RegExp(`(${escapedQuery})`, "gi");

  return text.replace(
    regex,
    `<mark class="history-search-highlight">$1</mark>`
  );
}

// ====================================================
// VIEW HISTORY ENTRY – ASSET HEADER FIRST– WITH TYPE COLOR
// ======================================================

function viewHistoryEntry(executionId) {
  const h = state.executionsData.find(e => e.id === executionId);
  if (!h) return;

  const el = document.getElementById("historyViewContent");

  // 🎨 TYPE CLASS
  let typeClass = "history-type-planned";
  if (h.is_planned === false) {
    typeClass = "history-type-breakdown";
  } else if (h.frequency_hours) {
    typeClass = "history-type-preventive";
  }

  const durationLabel =
    Number.isFinite(Number(h.duration_min))
      ? `${h.duration_min} min`
      : "—";

  el.innerHTML = `
    <!-- =====================
         ASSET HEADER
    ====================== -->
    <div class="history-asset-header ${typeClass}">
      <div class="history-asset-main">
        ${h.machine}
      </div>
      <div class="history-asset-sub">
        SN: ${h.serial_number} • Line ${h.line}
      </div>
    </div>

    <!-- =====================
         EXECUTION DETAILS
    ====================== -->
    <div class="history-view-grid">

      <div class="history-view-section">
        <strong>Date</strong>
        <div>${formatDateOnly(h.executed_at)}</div>
      </div>

      <div class="history-view-section">
        <strong>Service Time</strong>
        <div class="history-emphasis">${durationLabel}</div>
      </div>

      <div class="history-view-section">
        <strong>Executed By</strong>
        <div>${h.executed_by || "-"}</div>
      </div>

      <div class="history-view-section">
        <strong>Task</strong>

        <div>${h.task}</div>

        ${
          h.impact && h.impact !== "normal"
            ? `
              <div class="task-impact-wrap">
                <span class="task-impact-badge task-impact-${h.impact}">
                  ${
                    h.impact === "safety"
                      ? "SAFETY"
                      : h.impact === "quality"
                      ? "QUALITY"
                      : "S + Q"
                  }
                </span>
              </div>
            `
            : ""
        }
      </div>

      <div class="history-view-section full-width">
        <strong>Section / Unit</strong>
        <div>
          ${h.section || "-"}${h.unit ? " / " + h.unit : ""}
        </div>
      </div>

      <div class="history-view-section full-width">
        <strong>Notes</strong>
        <div>${h.notes || "—"}</div>
      </div>

    </div>
  `;

  document.getElementById("historyViewOverlay").style.display = "flex";
}

// Close history view
function closeHistoryView() {
  document.getElementById("historyViewOverlay").style.display = "none";
}


/* =====================
   HISTORY FILTER HANDLERS (FIXED)
   - supports BOTH rolling period AND custom from/to
   - custom dates override rolling when at least one is set
   - historyDateFrom / historyDateTo are ALWAYS Date|null
===================== */

function readCustomDatesFromInputs() {
  const fromVal = document.getElementById("historyDateFrom")?.value || "";
  const toVal = document.getElementById("historyDateTo")?.value || "";

  state.historyDateFrom = fromVal ? new Date(fromVal) : null;
  state.historyDateTo = toVal ? new Date(toVal) : null;

  if (state.historyDateFrom) state.historyDateFrom.setHours(0, 0, 0, 0);
  if (state.historyDateTo) state.historyDateTo.setHours(23, 59, 59, 999);
}

function clearCustomDatesInputsAndState() {

  state.historyDateFrom = null;
  state.historyDateTo = null;

  const fromEl =
    document.getElementById("historyDateFrom");

  const toEl =
    document.getElementById("historyDateTo");

  if (fromEl) {
    fromEl.value = "";
  }

  if (toEl) {
    toEl.value = "";
  }

  // Clear Flatpickr range picker UI
  const rangeEl =
    document.getElementById("historyDateRange");

  if (
    rangeEl &&
    rangeEl._flatpickr
  ) {
    rangeEl._flatpickr.clear();
  }
}

function applyHistoryFiltersAndRender() {
  // sync custom dates from inputs (Date|null always)
  readCustomDatesFromInputs();
  renderHistoryTable(state.executionsData);
}

/* ---------------------
   Rolling period dropdown
--------------------- */
document.getElementById("historyDateFilter")?.addEventListener("change", e => {
  state.historyDateRange = e.target.value; // "7" | "30" | "90" | "all"

  // όταν αλλάζει rolling -> καθαρίζει custom (για να μην καπελώνει)
  clearCustomDatesInputsAndState();

  renderHistoryTable(state.executionsData);
});

/* ---------------------
   Machine / SN search
--------------------- */
document.getElementById("historyMachineSearch")?.addEventListener("input", e => {
  state.historyMachineQuery = (e.target.value || "").toLowerCase().trim();
  renderHistoryTable(state.executionsData);
});

/* ---------------------
   Type filter
--------------------- */
document.getElementById("historyTypeFilter")?.addEventListener("change", e => {
  state.historyTypeFilter = e.target.value;
  renderHistoryTable(state.executionsData);
});

/* ---------------------
   Technician search
--------------------- */
document.getElementById("historyTechnicianSearch")?.addEventListener("input", e => {
  state.historyTechnicianQuery = (e.target.value || "").toLowerCase().trim();
  renderHistoryTable(state.executionsData);
});

/* ---------------------
   Custom date inputs (AUTO APPLY)
   - typing/choosing dates overrides rolling (set to "all")
--------------------- */
document.getElementById("historyDateFrom")?.addEventListener("change", () => {
  const rolling = document.getElementById("historyDateFilter");
  if (rolling) rolling.value = "all";
  state.historyDateRange = "all";
  applyHistoryFiltersAndRender();
});

document.getElementById("historyDateTo")?.addEventListener("change", () => {
  const rolling = document.getElementById("historyDateFilter");
  if (rolling) rolling.value = "all";
  state.historyDateRange = "all";
  applyHistoryFiltersAndRender();
});

/* ---------------------
   Optional buttons (αν υπάρχουν ακόμα στο DOM)
--------------------- */
document.getElementById("historyApplyDate")?.addEventListener("click", () => {
  const rolling = document.getElementById("historyDateFilter");
  if (rolling) rolling.value = "all";
  state.historyDateRange = "all";
  applyHistoryFiltersAndRender();
});

document.getElementById("historyResetDate")?.addEventListener("click", () => {
  clearCustomDatesInputsAndState();
  renderHistoryTable(state.executionsData);
});

// =====================
// CENTRAL HISTORY – LEGEND COUNTERS (FILTERED / TOTAL)
// =====================
function updateCentralHistoryLegendCounts(filtered, all = state.executionsData) {

  if (!Array.isArray(filtered) || !Array.isArray(all)) return;

  let fb = 0, fp = 0, fm = 0;
  let tb = 0, tp = 0, tm = 0;

  // 🔹 TOTAL COUNTS
  all.forEach(e => {

    if (e.is_planned === false) {
      tb++;
      return;
    }

    if (
      e.is_planned === true &&
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ) {
      tp++;
      return;
    }

    if (e.is_planned === true) {
      tm++;
    }
  });

  // 🔹 FILTERED COUNTS
  filtered.forEach(e => {

    if (e.is_planned === false) {
      fb++;
      return;
    }

    if (
      e.is_planned === true &&
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ) {
      fp++;
      return;
    }

    if (e.is_planned === true) {
      fm++;
    }
  });

  const b = document.getElementById("centralHistoryBreakdownCount");
  const p = document.getElementById("centralHistoryPreventiveCount");
  const m = document.getElementById("centralHistoryPlannedCount");

  if (b) b.textContent = `${fb} / ${tb}`;
  if (p) p.textContent = `${fp} / ${tp}`;
  if (m) m.textContent = `${fm} / ${tm}`;
}


/* =====================
TASK VIEW DONE BUTTON HANDLER
=====================*/
document
  .getElementById("taskViewDoneBtn")
  ?.addEventListener("click", () => {

    if (!state.currentViewedTask) return;

    // Κλείσε Task View (UX καθαρό)
    document.getElementById("taskViewOverlay").style.display = "none";

    // Χρησιμοποίησε ΥΠΑΡΧΟΝ flow
    askTechnician(state.currentViewedTask.id);
  });



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
/* =====================
   POPULATE SECTIONS BY ASSET (ADD TASK)
===================== */
document.getElementById("nt-asset")?.addEventListener("change", e => {
  const assetId = e.target.value;

  const sectionSelect = document.getElementById("nt-section");
  const sectionInput  = document.getElementById("nt-section-input");

  const unitSelect = document.getElementById("nt-unit");
  const unitInput  = document.getElementById("nt-unit-input");

  const reuseBlock = document.getElementById("reuseTaskBlock");
  const reuseSelect = document.getElementById("nt-reuse-task");

  if (!assetId || !sectionSelect || !sectionInput) return;

  // 🔁 RESET REUSE TASK
  if (reuseBlock) reuseBlock.style.display = "none";
  if (reuseSelect) {
    reuseSelect.innerHTML = `<option value="">Select previous task...</option>`;
  }

  // 🔁 RESET UNIT
  if (unitSelect) {
    unitSelect.innerHTML = `<option value="">Select Unit</option>`;
    unitSelect.style.display = "none";
  }

  if (unitInput) {
    unitInput.value = "";
    unitInput.style.display = "block";
  }

  const sections = getSectionsForAsset(assetId);

  sectionSelect.innerHTML = "";

  if (sections.length > 0) {
    sectionSelect.innerHTML =
      `<option value="">Select section</option>` +
      sections.map(s =>
        `<option value="${s}">${s}</option>`
      ).join("");

    sectionSelect.style.display = "block";
    sectionInput.style.display = "none";
    sectionInput.value = "";
  } else {
    sectionSelect.style.display = "none";
    sectionInput.style.display = "block";
    sectionInput.value = "";
  }

  /* =====================
     AUTO-LOCK SECTION (FOLLOW-UP)
  ===================== */
  if (state.lockSectionOnce && state.followUpSectionValue) {

    if (sectionSelect.style.display !== "none") {
      const match = [...sectionSelect.options]
        .find(o => o.value === state.followUpSectionValue);

      if (match) {
        sectionSelect.value = match.value;
        sectionSelect.disabled = true;
        sectionSelect.classList.add("locked");

        // φορτώνει units για locked section
        if (typeof populateUnitsForSection === "function") {
          populateUnitsForSection(assetId, match.value);
        }
      }
    } else {
      sectionInput.value = state.followUpSectionValue;
      sectionInput.disabled = true;
      sectionInput.classList.add("locked");

      // φορτώνει units για custom/locked section
      if (typeof populateUnitsForSection === "function") {
        populateUnitsForSection(assetId, sectionInput.value);
      }
    }

    state.lockSectionOnce = false;
    state.followUpSectionValue = null;
  }

  // 🔁 REFRESH REUSE βάση νέου asset/section
  if (typeof refreshReuseTaskDropdown === "function") {
    refreshReuseTaskDropdown();
  }
});
/* =====================
   REUSE TASK – REFRESH TRIGGERS
===================== */

document.getElementById("nt-section")?.addEventListener("change", () => {
  refreshReuseTaskDropdown();
});

document.getElementById("nt-section-input")?.addEventListener("input", () => {
  refreshReuseTaskDropdown();
});

document.getElementById("nt-unit")?.addEventListener("change", () => {
  refreshReuseTaskDropdown();
});

document.getElementById("nt-unit-input")?.addEventListener("input", () => {
  refreshReuseTaskDropdown();
});

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
  document.getElementById("nt-section")?.addEventListener("change", e => {
  const assetId = document.getElementById("nt-asset")?.value;
  const section = e.target.value;

  populateUnitsForSection(assetId, section);
});

document.getElementById("nt-section-input")?.addEventListener("input", e => {
  const assetId = document.getElementById("nt-asset")?.value;
  const section = e.target.value;

  populateUnitsForSection(assetId, section);
});
document.getElementById("nt-unit")?.addEventListener("change", e => {
  const unitInput = document.getElementById("nt-unit-input");

  if (!unitInput) return;

  if (e.target.value === "__new__") {
    unitInput.style.display = "block";
    unitInput.value = "";
    unitInput.focus();
  } else {
    unitInput.style.display = "none";
    unitInput.value = "";
  }
});

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

// Close modal
function closeTaskView() {
  document.getElementById("taskViewOverlay").style.display = "none";
}
/* =====================
   HISTORY MODAL (GLOBAL)
===================== */

function openHistory() {
  loadHistory(); // always refresh

  const overlay = getEl("historyOverlay");
  if (!overlay) return;

  overlay.style.display = "flex";
  overlay.style.pointerEvents = "auto";
}

function closeHistory() {
  const overlay = getEl("historyOverlay");
  if (!overlay) return;

  overlay.style.display = "none";
  overlay.style.pointerEvents = "none";
}

getEl("openHistoryBtn")
  ?.addEventListener("click", openHistory);

getEl("closeHistoryBtn")
  ?.addEventListener("click", closeHistory);

// =====================
// OPEN EDIT BREAKDOWN
// =====================
function editBreakdown(executionId) {

  if (!hasRole("admin", "planner")) {
    alert("You are not allowed to edit executions");
    return;
  }

  if (!executionId) {
    console.error("editBreakdown called without executionId");
    return;
  }

  const execution = state.executionsData.find(
    e => Number(e.id) === Number(executionId)
  );

  if (!execution) {
    alert("Execution not found");
    return;
  }

  // =====================
  // STORE EDITING ID
  // =====================
  state.editingBreakdownId = execution.id;

  /*PREFILL TASK*/
  const taskInput = document.getElementById("eb-task");
  if (taskInput) {
    taskInput.value = execution.task || "";
  }

  /*PREFILL NOTES*/
  
  const notesInput = document.getElementById("eb-notes");
  if (notesInput) {
    notesInput.value = execution.notes || "";
  }
  console.log("Execution technician_id:", execution.technician_id);
  console.log("Technicians loaded:", state.techniciansData);
  /*🔥 POPULATE + PRESELECT TECHNICIAN*/
  
  populateEditTechnicianDropdown(execution.technician_id);

  /*SHOW MODAL*/

  document.getElementById("editBreakdownOverlay").style.display = "flex";
}
// =====================
// SAVE BREAKDOWN EDIT (FINAL)
// =====================
async function saveBreakdownEdit() {
  if (!state.editingBreakdownId) return;

  const taskDesc = document.getElementById("eb-task")?.value?.trim();

  const technicianSelect = document.getElementById("eb-technician");
  const technicianId = Number(technicianSelect?.value) || null;

  const notesEl = document.getElementById("eb-notes");
  const notes = notesEl ? notesEl.value.trim() : null;

  if (!taskDesc) {
    alert("Task description is required");
    return;
  }

  if (!technicianId) {
    alert("Technician is required");
    return;
  }

  const payload = {
    task: taskDesc,
    technician_id: technicianId,
    notes
  };

  try {
    const res = await fetch(`${API}/executions/${state.editingBreakdownId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    closeEditBreakdown();
    await loadHistory(); // refresh history

  } catch (err) {
    console.error("EDIT BREAKDOWN ERROR:", err);
    alert(err.message);
  }
}

function closeEditBreakdown() {
  state.editingBreakdownId = null;
  document.getElementById("editBreakdownOverlay").style.display = "none";
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

  filtered.forEach(t => tbody.appendChild(buildRow(t)));
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


document
  .getElementById("printAssetHistoryBtn")
  ?.addEventListener("click", printAssetHistory);


/* =====================
   SAVE TASK (PLANNED / UNPLANNED)
===================== */
document.getElementById("saveTaskBtn")?.addEventListener("click", async () => {

  const isPlanned =
    document.getElementById("taskPlannedType")?.value === "planned";

  // Due date required for Planned tasks
  if (isPlanned) {
    const due = document.getElementById("nt-due")?.value;
    if (!due) {
      alert("Please select a due date for a planned task.");
      return;
    }
  }

  const assetId = document.getElementById("nt-asset")?.value;

  if (!assetId) {
    alert("Asset is required");
    return;
  }

  const taskDesc = document.getElementById("nt-task")?.value?.trim();
  if (!taskDesc) {
    alert("Task description is required");
    return;
  }

  /* =====================
     TECHNICIAN (UNPLANNED ONLY)
  ===================== */

  const technicianSelect = document.getElementById("nt-technician");

  const technicianId = !isPlanned
    ? Number(technicianSelect?.value) || null
    : null;

  const technicianName =
    !isPlanned && technicianSelect?.selectedIndex >= 0
      ? technicianSelect.options[technicianSelect.selectedIndex]?.textContent || null
      : null;

  if (!isPlanned && !technicianId) {
    alert("Technician is required for unplanned tasks");
    return;
  }

  /* =====================
     DURATION HANDLING
  ===================== */

  let durationMin = null;

  if (isPlanned) {
    const d = document.getElementById("nt-duration")?.value;
    const n = Number(d);
    if (Number.isFinite(n) && n > 0) {
      durationMin = n;
    }
  } else {
    const input = document.getElementById("nt-breakdown-duration");

    if (!input) {
      alert("Internal error: breakdown duration field not found");
      return;
    }

    const n = Number(input.value);

    if (!Number.isFinite(n) || n <= 0) {
      alert("Service time (minutes) is required for breakdown tasks.");
      input.focus();
      return;
    }

    durationMin = n;
  }

  const payload = {
    asset_id: assetId,

    section:
      document.getElementById("nt-section")?.style.display !== "none"
        ? document.getElementById("nt-section").value || null
        : document.getElementById("nt-section-input")?.value || null,

    unit: (() => {
        const unitSelect = document.getElementById("nt-unit");
        const unitInput = document.getElementById("nt-unit-input");

        if (unitSelect && unitSelect.style.display !== "none") {
          if (unitSelect.value && unitSelect.value !== "__new__") {
            return unitSelect.value;
          }
        }

        return unitInput?.value?.trim() || null;
    })(),
    task: taskDesc,
    type: document.getElementById("nt-type")?.value || null,
    impact: document.getElementById("nt-impact")?.value || "normal",
    notes: document.getElementById("nt-notes")?.value || null,

    is_planned: isPlanned,
    status: isPlanned ? "Planned" : "Done",

    // Planned → due date | Breakdown → execution date
    due_date: isPlanned
      ? document.getElementById("nt-due")?.value
      : null,

    /* =====================
       DURATION & EXECUTION
    ===================== */

    duration_min: isPlanned ? durationMin : null,

    execution_duration_min: !isPlanned ? durationMin : null,

    execution_date: !isPlanned
      ? document.getElementById("nt-breakdown-date")?.value || null
      : null,

    // 🔥 NEW SAFE ADDITIONS
    technician_id: technicianId,
    executed_by: technicianName
  };
  console.log("BREAKDOWN PAYLOAD:", payload);

  try {
    const res = await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save task");
    }

    const addOverlay = document.getElementById("addTaskOverlay");
    if (addOverlay) {
      resetSectionLockState();
      addOverlay.style.display = "none";
      addOverlay.style.zIndex = "";
    }

    document.querySelectorAll(
      "#addTaskModal input, #addTaskModal textarea, #addTaskModal select"
    ).forEach(el => el.value = "");

    await loadTasks();

    if (!isPlanned) {
      await loadHistory();
    }

    const assetObj = (state.assetsData || []).find(a =>
      String(a.id) === String(assetId)
    );

    if (assetObj) {

      const serial = assetObj.serial_number;

      await openAssetViewBySerial(serial);
      await refreshAssetView();

      if (isPlanned) {
        activateAssetTab("active");
      }

      if (!isPlanned) {
        activateAssetTab("history");
      }

      requestAnimationFrame(() => {
        const selector = isPlanned
          ? "#assetTasksTable tbody tr"
          : "#assetHistoryTable tbody tr";

        const row = document.querySelector(selector);

        if (row) {
          row.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
          row.classList.add("row-highlight");
        }
      });
    }

  } catch (err) {
    console.error("SAVE TASK ERROR:", err);
    alert(err.message);
  }
});

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

/* =====================
   OPEN ADD TASK MODAL
===================== */

document.getElementById("addTaskBtn")?.addEventListener("click", async e => {
  resetAddTaskAssetContext();
  e.preventDefault();

  // 🔑 Ensure assets are loaded
  if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
    await loadAssets();
  }

  const overlay = document.getElementById("addTaskOverlay");
  if (!overlay) return;

  // 🔹 Reset task type → Planned (DEFAULT)
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    applyAddTaskTypeUI(true); // ✅ FORCE correct UI state
  }
  
  const impactSelect =
    document.getElementById("nt-impact");

  if (impactSelect) {
    impactSelect.value = "normal";
  }

  // 🔹 Populate Line dropdown
  populateAddTaskLines();

  // 🔹 Reset asset dropdown
  const assetSel = document.getElementById("nt-asset");
  if (assetSel) {
    assetSel.innerHTML = `<option value="">Select Asset</option>`;
    assetSel.disabled = false; // allow asset selection in free Add Task
  }
  console.log("ASSETS DATA:", state.assetsData);

  overlay.style.display = "flex";
});

// =====================
// OPEN ADD TASK WITH ASSET CONTEXT (FROM DASHBOARD)
// =====================
async function openAddTaskForAsset(machine, serial, line) {
  console.group("ADD TASK FROM DASHBOARD");
  
  if (!machine || !serial) {
    alert("Missing asset context");
    console.groupEnd();
    return;
  }

  // 🔑 Ensure assets are loaded
  if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
    await loadAssets();
  }

  const overlay = document.getElementById("addTaskOverlay");
  if (!overlay) {
    console.groupEnd();
    return;
  }

  // =====================
  // 🔥 HARD RESET TYPE STATE (FIX BUG)
  // =====================
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const impactSelect =
    document.getElementById("nt-impact");

  if (impactSelect) {
    impactSelect.value = "normal";
  }

  // 🔹 Context labels
  const ctxAsset = document.getElementById("ctx-asset");
  const ctxLocation = document.getElementById("ctx-location");

  if (ctxAsset) ctxAsset.textContent = `🏭 ${machine} • SN ${serial}`;
  if (ctxLocation) ctxLocation.textContent = `Line ${line || "—"}`;

  // 🔹 Populate lines
  populateAddTaskLines();

  // 🔹 Preselect + LOCK line
  const lineSelect = document.getElementById("nt-line");
  if (lineSelect && line) {
    lineSelect.value = line;
    lineSelect.dispatchEvent(new Event("change"));
    lineSelect.disabled = true;
    lineSelect.classList.add("locked");
  }

  // 🔁 Wait until asset dropdown is populated, then select + LOCK by SERIAL
  const waitForAssetDropdown = () => {
    const assetSel = document.getElementById("nt-asset");
    if (!assetSel) return;

    // enable temporarily (in case it's disabled by default)
    assetSel.disabled = false;

    const option = [...assetSel.options].find(opt =>
      opt.textContent.includes(serial)
    );

    if (option) {
      assetSel.value = option.value;
      triggerChange(assetSel);   // 🔑 keep this
      assetSel.disabled = true;
      assetSel.classList.add("locked");
      return;
    }

    // ⏳ retry until options exist
    setTimeout(waitForAssetDropdown, 30);
  };

  waitForAssetDropdown();

  overlay.style.display = "flex";
  console.log("Context:", { machine, serial, line });
  console.groupEnd();

  // ✨ UX polish
  document.getElementById("nt-task")?.focus();
}

// =====================
// FOLLOW-UP TASK (PREFILL FROM VIEW) — FINAL
// =====================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#createFollowupTaskBtn");
  if (!btn) return;

  if (!state.currentViewedTask) return;
  const t = state.currentViewedTask;

  // 🔒 Ensure assets loaded (CRITICAL)
  if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
    await loadAssets();
  }

  // 🔥 CRITICAL: ensure Line dropdown OPTIONS exist
  // (this was the missing piece on fresh reload)
  populateAddTaskLines();

  // 🔹 Reset Add Task form (SAFE)
  document.querySelectorAll(
    "#addTaskModal input, #addTaskModal textarea, #addTaskModal select"
  ).forEach(el => el.value = "");

  // 🔹 Default task type = Planned (SYNC UI)
  const typeSelect = document.getElementById("taskPlannedType");
  if (typeSelect) {
    typeSelect.value = "planned";
    applyAddTaskTypeUI(true); // 🔥 CRITICAL
  }  
  // 🔹 Inherit Impact from original task
  const impactSelect = document.getElementById("nt-impact");

  if (impactSelect) {
    impactSelect.value =
      t.impact || "normal";
  }
  // 🔹 Modal title
  const title = document.getElementById("addTaskTitle");
  if (title) title.textContent = "New Follow-up Task";

  // 🔹 Prefill Section (FOLLOW-UP)
state.followUpSectionValue = t.section || null;
state.lockSectionOnce = !!state.followUpSectionValue;

  const unitEl = document.getElementById("nt-unit");
  if (unitEl) unitEl.value = t.unit || "";

  // 🔹 Prefill Line (AFTER options exist)
  const line = (t.line_code || t.line || "");
  const lineEl = document.getElementById("nt-line");

  if (lineEl && line) {
    // ⏳ Final set (defensive against any late resets)
    requestAnimationFrame(() => {
      lineEl.value = line;
      triggerChange(lineEl);   // 🔑 ΑΥΤΟ ΛΕΙΠΕ
    });
  }

  // 🔹 Populate Asset dropdown for selected line
  populateAssetSelectForLine(line);

  // 🔹 Robust asset match (case / trim safe)
  const normStr = (v) =>
    (v ?? "").toString().trim().toUpperCase();

  const match =
    (state.assetsData || []).find(a =>
      normStr(a.line) === normStr(line) &&
      normStr(a.model) === normStr(t.machine_name) &&
      normStr(a.serial_number) === normStr(t.serial_number)
    )
    // fallback: serial usually unique
    || (state.assetsData || []).find(a =>
      normStr(a.serial_number) === normStr(t.serial_number)
    );

  const assetEl = document.getElementById("nt-asset");
  if (assetEl && match) {
      // ⏳ Final asset select (defensive)
      requestAnimationFrame(() => {
      assetEl.value = match.id;
      triggerChange(assetEl);   // 🔑 ΤΟ ΚΡΙΣΙΜΟ
    });
  }

  // 🔹 Open Add Task modal
  document.getElementById("addTaskOverlay").style.display = "flex";

  // 🔹 Close Task View to save one click (UX win)
  const tv = document.getElementById("taskViewOverlay");
  if (tv) tv.style.display = "none";
});

document.getElementById("nt-type")?.addEventListener("input", () => {
  state.taskTypeTouchedManually = true;
});
/* =====================
   TASK DESCRIPTION → TYPE SUGGESTION
===================== */

document.getElementById("nt-task")?.addEventListener("input", e => {
  const typeEl = document.getElementById("nt-type");
  if (!typeEl) return;

  if (state.taskTypeTouchedManually) return;

  const suggestion = suggestTaskTypeFromText(e.target.value);

  if (suggestion) {
    typeEl.value = suggestion;
  }
});

// =====================
// POPULATE LINES IN ADD TASK MODAL
// =====================

function populateAssetSelectForLine(line) {
  const assetSel = document.getElementById("nt-asset");
  if (!assetSel) return;

  assetSel.innerHTML = `<option value="">Select Asset</option>`;
  assetSel.disabled = true;

  if (!line) return;

  const filtered = (state.assetsData || []).filter(a => (a.line || "") === line);

  filtered.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.model} (${a.serial_number})`;
    assetSel.appendChild(opt);
  });

  assetSel.disabled = false;
}


document.getElementById("nt-line")?.addEventListener("change", e => {
  const line = e.target.value;
  const assetSel = document.getElementById("nt-asset");

  const sectionSelect = document.getElementById("nt-section");
  const sectionInput  = document.getElementById("nt-section-input");

  // RESET section όταν αλλάζει line
  if (sectionSelect && sectionInput) {
    sectionSelect.innerHTML = "";
    sectionSelect.style.display = "none";
    sectionInput.style.display = "block";
    sectionInput.value = "";
  }

  assetSel.innerHTML = `<option value="">Select Asset</option>`;
  assetSel.disabled = true;

  if (!line) return;

  const filtered = state.assetsData.filter(a => a.line === line);

  filtered.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id; // ✅ asset_id
    opt.textContent = `${a.model} (${a.serial_number})`;
    assetSel.appendChild(opt);
  });

  assetSel.disabled = false;
});
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

  /* =====================
    CANCEL ADD TASK
  ===================== */ 
    
  document.getElementById("cancelAddTask")?.addEventListener("click", () => {
  resetAddTaskForm();
  document.getElementById("addTaskOverlay").style.display = "none";
});
  /* =================================
  TECHNITIANS DROPDOWN (ADD + EDIT TASK)
  =================================== */

  function populateTechnicianDropdown() {
    const sel = document.getElementById("technicianSelect");
    if (!sel || !Array.isArray(state.techniciansData)) return;

    sel.innerHTML = `<option value="">Επιλέξτε τεχνικό</option>`;

    state.techniciansData
      .filter(t => t.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, "el"))
      .forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;          // 👈 IMPORTANT (ID)
        opt.textContent = t.name;  // 👈 Visible name
        sel.appendChild(opt);
      });
  }
  /* ==================================
    TECHNICIANS DROPDOWN (REPORT FILTER)
  =================================== */

  function populateReportTechnicians() {
    const sel = document.getElementById("reportTechnician");
    if (!sel || !Array.isArray(state.techniciansData)) return;

    sel.innerHTML = `<option value="all">All Technicians</option>`;

    state.techniciansData
      .filter(t => t.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, "el"))
      .forEach(t => {
        const opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = t.name;
        sel.appendChild(opt);
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
  /* =============================================
    TECHNICIANS DROPDOWN (EDIT TASK + PRESELECTION)
  ================================================*/

  function populateEditTechnicianDropdown(selectedId = null) {

  const select = document.getElementById("eb-technician");
  if (!select) return;

  select.innerHTML = `<option value="">Select Technician</option>`;

  if (!Array.isArray(state.techniciansData) || state.techniciansData.length === 0) {
    console.warn("Technicians not loaded yet");
    return;
  }

  state.techniciansData
    .filter(t => t.active === true)
    .forEach(t => {
      const opt = document.createElement("option");
      opt.value = String(t.id);   // 🔥 force string
      opt.textContent = t.name;
      select.appendChild(opt);
    });

  // 🔥 FORCE SELECT AFTER OPTIONS EXIST
  if (selectedId) {
    select.value = String(selectedId);
  }
}
    /*==============
    LOAD TECHNICIANS
    ===============*/

    async function loadTechnicians() {
    const res = await fetch(`${API}/technicians`);
    state.techniciansData = await res.json();
  }

/* =====================
   OPEN CONFIRM DONE MODAL
   SINGLE TASK
===================== */

function askTechnician(id) {

  // 🔑 Force SINGLE mode
  state.bulkDoneMode = false;

  // 🔑 Store selected task
  state.pendingTaskId = id;


  /* =====================
     FIND TASK

     Normal task:
     → state.tasksData

     Restoration task:
     → currentBreakdownTasks
  ===================== */

  const task =
    state.tasksData.find(
      t => Number(t.id) === Number(id)
    )
    ||
    currentBreakdownTasks.find(
      t => Number(t.id) === Number(id)
    );


  if (!task) {
    alert("Task not found");
    return;
  }


  /* =====================
     TECHNICIAN DROPDOWN
  ===================== */

  populateTechnicianDropdown();


  /* =====================
     DEFAULT COMPLETION DATE
  ===================== */

  const today =
    new Date()
      .toISOString()
      .split("T")[0];


  const dateInput =
    getEl("completedDateInput");


  if (dateInput) {
    dateInput.value = today;
  }


  /* =====================
     NOTES
  ===================== */

  const notesInput =
    getEl("doneNotesInput");


  if (notesInput) {
    notesInput.value =
      task.notes || "";
  }


  /* =====================
     OPEN MODAL
  ===================== */

  const overlay =
    getEl("modalOverlay");


  if (overlay) {
    overlay.style.display = "flex";
  }

}

/* =====================
   CANCEL TASK COMPLETION
   - Closes modal
   - Resets pending task
===================== */
getEl("cancelDone")?.addEventListener("click", () => {
  getEl("modalOverlay").style.display = "none";
  state.pendingTaskId = null;
});

/* =====================================================
   TASK COMPLETION
   SINGLE + BULK
   -----------------------------------------------------
   Shared completion flow.

   Bulk-specific execution is isolated from the
   single-task execution, while the final modal cleanup
   and refresh remain common.
===================================================== */



/* =====================
   COMPLETE SINGLE TASK
===================== */

async function completeSingleTask({
  technicianId,
  technicianName,
  completedAt,
  notes
}) {

  const res = await fetch(
    `${API}/tasks/${state.pendingTaskId}`,
    {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        technician_id:
          Number(technicianId),

        // Keep legacy field
        completed_by:
          technicianName,

        completed_at:
          completedAt,

        notes
      })
    }
  );


  if (!res.ok) {

    const err =
      await res.json();

    throw new Error(
      err.error ||
      "Failed to complete task"
    );
  }


  state.pendingTaskId = null;

  alert("✔ Μια εργασία εκτελέστηκε");

  return true;
}


/* =====================
   RESET DONE MODAL
===================== */

function resetDoneModal(
  technicianSelect
) {

  const overlay =
    getEl("modalOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }


  if (technicianSelect) {
    technicianSelect.value = "";
  }


  const dateInput =
    getEl("completedDateInput");

  if (dateInput) {
    dateInput.value = "";
  }


  const notesInput =
    getEl("doneNotesInput");

  if (notesInput) {
    notesInput.value = "";
  }
}


/* =====================
   REFRESH AFTER COMPLETION
===================== */

async function refreshAfterTaskCompletion() {

  /* =====================
     MAIN TASKS + HISTORY
  ===================== */

  await loadTasks();

  await loadHistory();


  /* =====================
     BREAKDOWN RESTORATION TASKS

     If a Breakdown Detail is currently open,
     reload its Restoration Tasks as well.

     This prevents stale task status after
     completing a Restoration Task.
  ===================== */

  if (
    currentBreakdownId &&
    typeof loadRestorationTasks === "function"
  ) {

    await loadRestorationTasks(
      currentBreakdownId
    );

  }


  /* =====================
     ASSET CARDS
  ===================== */

  if (
    typeof renderAssetsCards === "function"
  ) {

    renderAssetsCards();

  }


  /* =====================
     ASSET VIEW
  ===================== */

  if (
    typeof refreshAssetView === "function"
  ) {

    refreshAssetView();

  }

}

/* =====================
   CONFIRM TASK DONE
   SINGLE + BULK ORCHESTRATOR
===================== */

getEl("confirmDone")
  ?.addEventListener(
    "click",
    async () => {

      /* =====================
         TECHNICIAN
      ===================== */

      const technicianSelect =
        getEl("technicianSelect");

      const technicianId =
        technicianSelect?.value;


      if (!technicianId) {
        return alert(
          "Επέλεξε τεχνικό"
        );
      }


      // Keep name for backward compatibility
      const technicianName =
        technicianSelect
          .options[
            technicianSelect.selectedIndex
          ]
          ?.textContent ||
        null;


      /* =====================
         NOTES
      ===================== */

      const notes =
        getEl("doneNotesInput")
          ?.value
          .trim() ||
        null;


      /* =====================
         COMPLETION DATE
      ===================== */

      const dateValue =
        getEl("completedDateInput")
          ?.value;


      const completedAt =
        dateValue
          ? new Date(
              dateValue +
              "T12:00:00"
            ).toISOString()
          : new Date()
              .toISOString();


      try {

        /* =====================
           BULK DONE
        ===================== */

        if (
          state.bulkDoneMode === true
        ) {

          const completed =
            await completeBulkTasks({
              technicianId,
              technicianName,
              completedAt,
              notes
            });


          // User cancelled common-note warning
          if (!completed) {
            return;
          }
        }


        /* =====================
           SINGLE DONE
        ===================== */

        else {

          await completeSingleTask({
            technicianId,
            technicianName,
            completedAt,
            notes
          });
        }


        /* =====================
           COMMON CLEANUP
        ===================== */

        resetDoneModal(
          technicianSelect
        );


        /* =====================
           COMMON REFRESH
        ===================== */

        await refreshAfterTaskCompletion();

      }

      catch (err) {

        alert(err.message);

        console.error(
          "CONFIRM DONE ERROR:",
          err
        );
      }
    }
  );

/* ===========================
   LOAD TASK DONE from HISTORY
==============================*/

async function loadCompletedKpi() {
  try {
    const res = await fetch(`${API}/executions/count`);
    const data = await res.json();

    const el = document.getElementById("kpiDone");
    if (!el) {
      console.warn("kpiDone not found (tab not active yet)");
      return;
    }

    el.textContent = data.completed;
  } catch (err) {
    console.error("Failed to load completed KPI", err);
  }
}

/* =====================
   UNDO TASK EXECUTION
===================== */
async function undoExecution(executionId) {
  if (!hasRole("admin", "planner")) {
    alert("You are not allowed to undo executions");
    return;
  }

  if (!confirm("Undo this execution and restore previous schedule?")) return;

  await fetch(`${API}/executions/${executionId}/undo`, {
    method: "POST"
  });

  loadHistory();
  loadTasks();
  loadCompletedKpi();
}

// 👇 ΑΠΑΡΑΙΤΗΤΟ (λόγω type="module")
window.undoExecution = undoExecution;

/* =====================
   SAVE ASSET (WITH OTHER LINE / MACHINE)
===================== */
getEl("saveAssetBtn")?.addEventListener("click", async () => {
  if (!hasRole("planner", "admin")) {
    alert("Not allowed");
    return;
  }

  // --- LINE ---
  const lineSelect = getEl("assetLine").value;
  const newLineVal = getEl("assetNewLine")?.value.trim();

  const line =
    lineSelect === "__other__"
      ? newLineVal
      : lineSelect;

  // --- MACHINE ---
  const machineSelect = getEl("assetMachine").value;
  const newMachineVal = getEl("assetNewMachine")?.value.trim();

  const model =
    machineSelect === "__other__"
      ? newMachineVal
      : machineSelect;

  // --- SERIAL ---
  const serial = getEl("assetSn").value.trim();

  // 🔒 VALIDATION
  if (!line) {
    alert("Line is required");
    return;
  }

  if (!model) {
    alert("Machine is required");
    return;
  }

  if (!serial) {
    alert("Serial Number is required");
    return;
  }

  try {
    await fetch(`${API}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
    "x-cmms-role": window.currentUserRole},
      body: JSON.stringify({
        line,              // είτε existing είτε new
        model,             // είτε existing είτε new
        serial_number: serial
      })
    });

    // ✅ CLOSE MODAL
    getEl("addAssetOverlay").style.display = "none";

    // ✅ RESET FORM (SAFE)
    getEl("assetLine").value = "";
    getEl("assetMachine").value = "";
    getEl("assetSn").value = "";

    if (getEl("assetNewLine")) getEl("assetNewLine").value = "";
    if (getEl("assetNewMachine")) getEl("assetNewMachine").value = "";

    getEl("newLineField").style.display = "none";
    getEl("newMachineField").style.display = "none";

    // 🔄 REFRESH ASSETS
    loadAssets();

  } catch (err) {
    console.error("SAVE ASSET ERROR:", err);
    alert("Failed to save asset");
  }
});

/* =====================
   LOAD REPORTS TAB
===================== */
async function loadReports() {
  // 🔴 αν δεν έχουμε assets, φόρτωσέ τα πρώτα
  if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
    await loadAssets();
  }

  // Γ: populate dynamic lines
  populateReportLines();

  // Β: initial preview render
  updateReportsPreview();

  // Α: initial technician field visibility
  const type = document.getElementById("reportType")?.value;
  const techField = document.getElementById("fieldTechnician");
  if (techField) {
    techField.style.display = type === "technician" ? "flex" : "none";
  }
}

/* =====================
   REPORT LINES - MULTI SELECT
===================== */
function populateReportLines() {

  console.log(
    "REPORT LINES assetsData =",
    state.assetsData
  );

  const container =
    document.getElementById("reportLineOptions");

  const allCheckbox =
    document.getElementById("reportLineAll");

  if (!container || !allCheckbox) return;

  container.innerHTML = "";

  if (!Array.isArray(state.assetsData)) return;

  const lines = [...new Set(
    state.assetsData
      .map(a => a.line)
      .filter(Boolean)
  )]
  .sort((a, b) =>
    String(a).localeCompare(
      String(b),
      "el",
      { numeric: true }
    )
  );

  lines.forEach(line => {

    const label =
      document.createElement("label");

    label.className =
      "multi-select-option";

    label.innerHTML = `
      <input
        type="checkbox"
        class="report-line-option"
        value="${line}"
      />
      ${line}
    `;

    container.appendChild(label);
  });

  allCheckbox.checked = true;

  updateReportLineButton();
}
function getSelectedReportLines() {

  const all =
    document.getElementById("reportLineAll");

  if (all?.checked) {
    return ["all"];
  }

  return Array.from(
    document.querySelectorAll(
      ".report-line-option:checked"
    )
  ).map(cb => cb.value);
}
function updateReportLineButton() {

  const btn =
    document.getElementById("reportLineBtn");

  if (!btn) return;

  const selected =
    getSelectedReportLines();

  if (
    selected.includes("all") ||
    selected.length === 0
  ) {
    btn.textContent = "ALL";
    return;
  }

  btn.textContent =
    selected.length <= 3
      ? selected.join(", ")
      : `${selected.length} Lines`;
}
document
  .getElementById("reportLineBtn")
  ?.addEventListener("click", () => {

    const menu =
      document.getElementById("reportLineMenu");

    if (!menu) return;

    menu.style.display =
      menu.style.display === "block"
        ? "none"
        : "block";
  });

document
  .getElementById("reportLineAll")
  ?.addEventListener("change", e => {

    const checked =
      e.target.checked;

    document
      .querySelectorAll(".report-line-option")
      .forEach(cb => {
        cb.checked = false;
        cb.disabled = checked;
      });

    updateReportLineButton();
  });

document.addEventListener(
  "change",
  e => {

    if (
      !e.target.classList.contains(
        "report-line-option"
      )
    ) {
      return;
    }

    const all =
      document.getElementById(
        "reportLineAll"
      );

    if (all) {
      all.checked = false;
    }

    updateReportLineButton();
  }
);

/* =====================
   REPORTS PREVIEW (B)
===================== */
function updateReportsPreview() {
  const type = document.getElementById("reportType")?.value || "status";
  const from = document.getElementById("dateFrom")?.value;
  const to = document.getElementById("dateTo")?.value;
  const line = document.getElementById("reportLine")?.value || "all";
  const status = document.getElementById("reportStatus")?.value || "all";
  document.getElementById("previewStatus").textContent =
  `Status: ${status.toUpperCase()}`;


  const typeMap = {
    status: "Maintenance Status Report",
    overdue: "Overdue Tasks Report",
    technician: "Completed by Technician",
    nonplanned: "Non-Planned Tasks Report"
  };

  document.getElementById("previewType").textContent =
    `Report: ${typeMap[type] || type}`;

  document.getElementById("previewLines").textContent =
    `Lines: ${line.toUpperCase()}`;

  document.getElementById("previewDates").textContent =
    from || to
      ? `Period: ${from || "—"} → ${to || "—"}`
      : "Period: ALL";
}
[
  "reportType",
  "dateFrom",
  "dateTo",
  "reportLine",
  "reportStatus",
  "reportTechnician"
].forEach(id => {
  document.getElementById(id)?.addEventListener("change", updateReportsPreview);
  document.getElementById(id)?.addEventListener("input", updateReportsPreview);
});

/* =====================
   REPORT TYPE LOGIC (A)
===================== */
document.getElementById("reportType")?.addEventListener("change", e => {
  const type = e.target.value;
  const techField = document.getElementById("fieldTechnician");
  if (!techField) return;

  techField.style.display = type === "technician" ? "flex" : "none";
});
/* =====================
   OPEN REPORTS TAB
===================== */
document.getElementById("reportsTabBtn")?.addEventListener("click", () => {
  // Κλείσε όλα τα tabs
  document.querySelectorAll('[id^="tab-"]').forEach(tab => {
    tab.style.display = "none";
  });

  // Άνοιξε το Reports tab
  const reportsTab = document.getElementById("tab-reports");
  if (reportsTab) {
    reportsTab.style.display = "block";
  }

  // 🔥 ΚΡΙΣΙΜΟ: φόρτωσε Reports logic
  loadReports();
});

/* =====================
   STATUS REPORT – DATA
===================== */
function getFilteredTasksForStatusReport() {

  const from =
    document.getElementById("dateFrom")?.value;

  const to =
    document.getElementById("dateTo")?.value;

  const selectedLines =
    getSelectedReportLines();

  const status =
    document.getElementById("reportStatus")?.value || "all";

  const fromDate =
    from ? new Date(from) : null;

  if (fromDate) {
    fromDate.setHours(0, 0, 0, 0);
  }

  const toDate =
    to ? new Date(to) : null;

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return state.tasksData

    // =====================
    // LINE FILTER - MULTI
    // =====================
    .filter(t => {

      if (selectedLines.includes("all")) {
        return true;
      }

      const taskLine =
        String(t.line_code || t.line || "");

      return selectedLines.includes(taskLine);
    })

    // =====================
    // DATE FILTER
    // =====================
    .filter(t => {

      if (!t.due_date) {
        return false;
      }

      const due =
        new Date(t.due_date);

      if (fromDate && due < fromDate) {
        return false;
      }

      if (toDate && due > toDate) {
        return false;
      }

      return true;
    })

    // =====================
    // STATUS FILTER
    // =====================
    .filter(t => {

      if (status === "all") {
        return true;
      }

      // Preventive
      if (status === "planned") {
        return (
          isPreventive(t) &&
          new Date(t.due_date) >= today
        );
      }

      // Planned Manual
      if (status === "planned_manual") {
        return (
          isPlannedManual(t) &&
          new Date(t.due_date) >= today
        );
      }

      // Overdue
      if (status === "overdue") {
        return (
          t.status !== "Done" &&
          new Date(t.due_date) < today
        );
      }

      return true;
    });
}

/* =====================
   LINE TABS
===================== */

document.querySelectorAll(".line-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".line-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeLine = btn.dataset.line;
    rebuildMachineFilter();
    renderTable();
  });
});

/* =====================
   MAIN TABS
===================== */

document.querySelectorAll(".main-tab").forEach(tab => {
  console.log("MAIN TABS SCRIPT LOADED");

  tab.addEventListener("click", () => {
    // 1️⃣ Active state
    document.querySelectorAll(".main-tab")
      .forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    console.log("TAB CLICKED:", tab.dataset.tab);

    // 2️⃣ Hide all panels
    ["dashboard","tasks","assets","breakdowns","technicians","library","docs","reports"].forEach(t => {
      const el = getEl(`tab-${t}`);
      if (el) el.style.display = "none";
    });

    // 3️⃣ Show selected panel
    const sel = tab.dataset.tab;
    const active = getEl(`tab-${sel}`);
    if (active) active.style.display = "block";

    // 4️⃣ Existing logic (unchanged)
    if (sel === "assets") {
      loadAssets();
    }
    if (sel === "technicians") {
      loadTechnicians();
    }

    if (sel === "reports") {
      loadHistory();
      loadReports();
    }

    if (sel === "dashboard" && typeof renderAssetDashboard === "function") {
      renderAssetDashboard();
    }
    if (sel === "breakdowns") {
      loadBreakdowns();
    }

    // ✅ 🔥 THE FIX – LIBRARY
    if (sel === "library") {
      (async () => {
        if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
          await loadAssets(); // ⬅️ ΤΟ ΕΛΕΙΠΕ
        }
        loadLibrary();
        populateLibraryModels();
        renderLibraryTable();
      })();
    }

  });
});


/* =====================
   EVENT LISTENERS
===================== */

// Open button
document
  .getElementById("openAnalyticsBtn")
  ?.addEventListener("click", openAnalyticsModal);

// Close button
document
  .getElementById("closeAnalyticsBtn")
  ?.addEventListener("click", closeAnalyticsModal);

// Click outside modal box → close
document
  .getElementById("analyticsOverlay")
  ?.addEventListener("click", (e) => {
    if (e.target.id === "analyticsOverlay") {
      closeAnalyticsModal();
    }
  });

// ESC key → close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAnalyticsModal();
  }
});

/* =====================
   INIT
===================== */
(async function initApp() {
  console.log("INIT START");

  await loadTechnicians();  // 🔥 ΠΡΩΤΑ reference data

  populateTechnicianDropdown();        // modal
  populateHistoryTechnicianFilter();   // history filter
  populateReportTechnicians();  // ✅ report filter

  await loadTasks();
  await loadHistory();

  console.log("INIT DONE");
})();

/* =====================
   APPLY ROLE VISIBILITY
===================== */
function applyRoleVisibility() {

  const isAdmin = hasRole("admin");   // 🔥 ΜΟΝΟ ADMIN

  // Admin-only elements (generic)
  document.querySelectorAll(".admin-only")
    .forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });

  // Asset admin actions
  document.querySelectorAll(".asset-admin-only")
    .forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });

  // Optional: specific buttons by id
  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) addTaskBtn.style.display = isAdmin ? "" : "none";

  const importBtn = document.getElementById("importExcelBtn");
  if (importBtn) importBtn.style.display = isAdmin ? "" : "none";
}

applyRoleVisibility();

getEl("printTasksBtn")?.addEventListener("click", printTasks);

// =====================
// DATE FILTER BUTTONS
// =====================

(function initDateFilters() {
  const btns = document.querySelectorAll(".date-filter-btn");
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDateFilter = btn.dataset.filter;

      // 🔴 RESET custom date range (MASTER FIX)
      state.taskDateFrom = null;
      state.taskDateTo = null;

      const fromEl = document.getElementById("taskDateFrom");
      const toEl = document.getElementById("taskDateTo");
      if (fromEl) fromEl.value = "";
      if (toEl) toEl.value = "";

      // UI state
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

  renderTable();
});
  });
})();
// =====================
// TASKS – DATE RANGE HANDLER (MASTER FILTER)
// =====================
function onTaskDateRangeChange() {
  const fromVal = document.getElementById("taskDateFrom")?.value;
  const toVal = document.getElementById("taskDateTo")?.value;

  state.taskDateFrom = fromVal ? new Date(fromVal) : null;
  state.taskDateTo = toVal ? new Date(toVal) : null;

  if (state.taskDateFrom) state.taskDateFrom.setHours(0, 0, 0, 0);
  if (state.taskDateTo) state.taskDateTo.setHours(23, 59, 59, 999);

  // 🔁 RESET QUICK DATE FILTERS (ALL / TODAY / WEEK / OVERDUE)
  state.activeDateFilter = "all";

  document
    .querySelectorAll(".date-filter-btn")
    .forEach(btn => btn.classList.remove("active"));

  renderTable(); 
  
}
// =====================
// SNAPSHOT EXPORT (DELEGATED - SAFE)
// =====================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#exportSnapshot");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  console.log("EXPORT SNAPSHOT CLICKED");

  try {
    const res = await fetch(`${API}/snapshot/export`);
    if (!res.ok) {
      alert("Snapshot export failed");
      return;
    }

    const data = await res.json();

    const name = `CMMS_snapshot_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error("Snapshot export error:", err);
    alert("Snapshot export error");
  }
});

// =====================
// SNAPSHOT FILE LOAD LABEL
// =====================
document.getElementById("snapshotFile")?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  const statusEl = document.getElementById("snapshotStatus");

  if (!statusEl) return;

  if (!file) {
    statusEl.textContent = "No snapshot loaded";
    statusEl.classList.remove("loaded");
    return;
  }

  statusEl.textContent = `Loaded: ${file.name}`;
  statusEl.classList.add("loaded");
});

/* =====================
   SNAPSHOT RESTORE + VERIFY
===================== */
document.getElementById("restoreSnapshot")?.addEventListener("click", async () => {

  const file = document.getElementById("snapshotFile")?.files[0];
  if (!file) return alert("Select snapshot file");

  const text = await file.text();
  const json = JSON.parse(text);

  if (!confirm("⚠️ This will fully restore the system. Continue?")) return;

  try {

    // 🔹 STORE snapshot name
    localStorage.setItem("lastRestoredSnapshot", file.name);

    // =====================
    // 1️⃣ RESTORE
    // =====================
    const restoreRes = await fetch(`${API}/snapshot/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json)
    });

    const restoreData = await restoreRes.json();

    if (!restoreRes.ok) {
      return alert(restoreData.error || "Restore failed");
    }

    // =====================
    // 2️⃣ VERIFY
    // =====================
    const verifyRes = await fetch(`${API}/snapshot/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json)
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      return alert("Restore completed but verification failed");
    }

    if (verifyData.identical) {
      alert("✅ Snapshot restored and verified successfully (100% match)");
    } else {
      alert("⚠ Snapshot restored but differences detected.\nCheck server logs.");
    }

    location.reload();

  } catch (err) {
    console.error("SNAPSHOT RESTORE ERROR:", err);
    alert("Unexpected restore error");
  }

});

// =====================
// SHOW LAST RESTORED SNAPSHOT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem("lastRestoredSnapshot");
  const statusEl = document.getElementById("snapshotStatus");

  if (!statusEl) return;

  if (last) {
    statusEl.textContent = `Last restored: ${last}`;
    statusEl.classList.add("loaded");
  } else {
    statusEl.textContent = "No snapshot loaded";
    statusEl.classList.remove("loaded");
  }
});

document.addEventListener(
  "click",
  e => {
    const row = e.target.closest(".clickable-asset-row");
    if (!row) return;

    console.log(
      "🔍 KPI CLICK DETECTED",
      {
        target: e.target,
        row,
        serial: row.dataset.serial
      }
    );
  },
  true // capture
);

function triggerChange(el) {
  if (!el) return;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// =====================
// DEFAULT TAB ON LOAD
// =====================

window.addEventListener("DOMContentLoaded", async () => {

  // 🔥 Ensure all global data is ready
  if (typeof loadAssets === "function") await loadAssets();
  if (typeof loadTasks === "function") await loadTasks();
  if (typeof loadHistory === "function") await loadHistory();   

  // τώρα άνοιξε το tab
  const dashTab = document.querySelector('.main-tab[data-tab="assets"]');
  if (dashTab) dashTab.click();

});