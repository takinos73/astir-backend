
async function openAssetViewBySerial(serial) {
  try {
    console.group("ASSET VIEW DEBUG");

    // reset state
    state.assetAllTasks = [];
    state.assetActiveTasks = [];
    state.assetHistoryTasks = [];
    state.currentAssetSerial = serial;
    state.assetHistoryTypeFilter = "all";   // 🔥 IMPORTANT

    if (!serial) {
      alert("Missing serial number");
      console.groupEnd();
      return;
    }

    serial = String(serial).trim();

    const overlay = document.getElementById("assetViewOverlay");
    if (!overlay) {
      alert("Asset modal not found");
      console.groupEnd();
      return;
    }

    if (!Array.isArray(state.tasksData)) {
      alert("tasksData not ready");
      console.groupEnd();
      return;
    }

    // =====================
    // BUILD DATASETS FROM STATE
    // =====================
    state.assetAllTasks = state.tasksData.filter(
      t => String(t.serial_number || "").trim() === serial
    );

    state.assetActiveTasks = state.assetAllTasks.filter(
      t => t.status === "Planned" || t.status === "Overdue"
    );

    state.assetHistoryTasks = (Array.isArray(state.executionsData)
      ? state.executionsData
      : []
    ).filter(
      e => String(e.serial_number || "").trim() === serial
    );

    // 🔢 History legend counts
    updateAssetHistoryLegendCounts(state.assetHistoryTasks);

    if (
      state.assetAllTasks.length === 0 &&
      state.assetHistoryTasks.length === 0
    ) {
      alert("No records found for this asset");
      console.groupEnd();
      return;
    }

    // =====================
    // HEADER + KPIs
    // =====================
    const ref =
      state.assetAllTasks[0] || state.assetHistoryTasks[0];

    renderAssetViewHeader({
      machine_name: ref.machine_name || ref.machine || "-",
      serial_number: serial,
      line_code: ref.line_code || ref.line || "-"
    });

    renderAssetKpis(
      state.assetAllTasks,
      state.assetHistoryTasks
    );

    renderAssetMttrKpis(state.currentAssetSerial);

    // 🖨 PRINT PREVENTIVE PLAN BUTTON
    const printBtn = document.getElementById("printAssetPreventiveBtn");
    if (printBtn) {
      const hasPreventive = state.assetAllTasks.some(
        t =>
          t.is_planned === true &&
          Number(t.frequency_hours) > 0 &&
          t.deleted_at == null
      );

      printBtn.style.display = hasPreventive ? "inline-flex" : "none";
    }

    bindAssetTabs();

    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";

    activateAssetTab("active");

    renderAssetMtbf(state.currentAssetSerial);

    console.log("✅ Asset view opened");
    console.groupEnd();

  } catch (err) {
    console.error("💥 openAssetViewBySerial crashed:", err);
    alert("Asset view error (see console).");
  }
}
// =====================
// ASSET ACTIVE TASKS TABLE – BULLETPROOF + MULTISELECT
// =====================
function renderAssetTasksTable(tasks) {
  const tasksWrap = document.querySelector(".asset-tasks-table");
  const historyWrap = document.querySelector(".asset-history-table");
  const tbody = document.querySelector("#assetTasksTable tbody");

  if (!tasksWrap || !tbody) return;

  // ✅ Toggle tables
  tasksWrap.style.display = "block";
  if (historyWrap) historyWrap.style.display = "none";

  tbody.innerHTML = "";
  state.assetSelectedTaskIds.clear(); // reset on render
  updateAssetBulkActionsBar();  // hide bar on refresh

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">No active tasks</td>
      </tr>
    `;
    tasksWrap.offsetHeight;
    tbody.offsetHeight;
    return;
  }
    const groupedTasks = [...tasks].sort((a, b) => {

    const dueCompare =
      new Date(a.due_date || "9999-12-31") -
      new Date(b.due_date || "9999-12-31");

    if (dueCompare !== 0) {
      return dueCompare;
    }

    return (a.section || "")
      .localeCompare(b.section || "");
  });

  groupedTasks.forEach(t => {
    const tr = document.createElement("tr");
    tr.classList.add("clickable");

    const dur =
      t.duration_min != null ? formatDuration(t.duration_min) : "—";

    // =====================
    // STATUS (TYPE + DUE STATE)
    // =====================
    let typeLabel = "Planned";
    let typeClass = "planned";

    if (isPreventive(t)) {
      typeLabel = "Preventive";
      typeClass = "preventive";
    }

    const dueState = getDueState(t); // overdue | today | soon | ok
    let dueLabel = "";

    if (dueState === "overdue") dueLabel = "Overdue";
    else if (dueState === "today") dueLabel = "Today";
    else if (dueState === "soon") dueLabel = "Due soon";

    // =====================
    // CHECKBOX CELL
    // =====================
    const checkboxTd = document.createElement("td");
    checkboxTd.className = "select-cell";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "asset-task-checkbox";

    checkbox.addEventListener("click", e => {
      e.stopPropagation();

      if (checkbox.checked) {
        state.assetSelectedTaskIds.add(t.id);
      } else {
        state.assetSelectedTaskIds.delete(t.id);
      }

      updateAssetBulkActionsBar();
    });

    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);

    // =====================
    // ROW CONTENT
    // =====================
    tr.insertAdjacentHTML(
      "beforeend",
      `
      <td class="asset-status ${typeClass}">
        <span class="status-type">${typeLabel}</span>
        ${dueLabel ? `<span class="status-due ${dueState}">• ${dueLabel}</span>` : ""}
      </td>
      <td>
        <div class="asset-task-unit">
          ${t.unit || "-"}
        </div>

        ${
          t.section
            ? `<div class="asset-task-section">${t.section}</div>`
            : ""
        }
      </td>
      <td>
        <div>
          ${t.task}

          ${
            t.notes
              ? `<span
                  class="task-note-indicator"
                  title="${t.notes}"
                >
                  📝
                </span>`
              : ""
          }
        </div>

        ${renderImpactBadge(t.impact)}

      </td>
      <td>${t.type || "-"}</td>
      <td>${formatDate(t.due_date)}</td>
      <td>${dur}</td>
      `
    );

    tr.addEventListener("click", () => {
    // 🛑 Αν είμαστε σε bulk select mode, ΜΗΝ ανοίγεις task view
    if (state.assetSelectedTaskIds.size > 0) {
      return;
    }

    viewTask(t.id);
  });

    tbody.appendChild(tr);
  });

  // 🔥 force reflow (display:none → block safety)
  tasksWrap.offsetHeight;
  tbody.offsetHeight;
}
// =====================
// ASSET HISTORY TABLE (EXECUTIONS)
// =====================
function renderAssetHistoryTable(history) {
  renderAssetHistoryActiveFilter();
  const tasksWrap = document.querySelector(".asset-tasks-table");
  const historyWrap = document.querySelector(".asset-history-table");
  const tbody = document.querySelector("#assetHistoryTable tbody");

  if (!historyWrap || !tbody) return;

  // toggle views
  if (tasksWrap) tasksWrap.style.display = "none";
  historyWrap.style.display = "block";

  tbody.innerHTML = "";

  const list = Array.isArray(history) ? history : [];

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">No history records</td>
      </tr>
    `;
    return;
  }

  /* =====================
     APPLY FILTERS
  ===================== */
  const filtered = getFilteredAssetHistory(list);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">No matching history records</td>
      </tr>
    `;
    return;
  }
  const sortedHistory = [...filtered].sort((a, b) => {

  const dateCompare =
    new Date(b.executed_at || "1900-01-01") -
    new Date(a.executed_at || "1900-01-01");

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return (a.section || "")
    .localeCompare(b.section || "");
});

  /* =====================
     RENDER ROWS
  ===================== */
  sortedHistory.forEach(e => {

    const tr = document.createElement("tr");
    tr.classList.add("clickable");

    const execType = getExecutionType(e);

    if (execType === "unplanned") tr.classList.add("history-unplanned");
    else if (execType === "preventive") tr.classList.add("history-preventive");
    else tr.classList.add("history-planned");

    tr.innerHTML = `
      <td>${formatDate(e.executed_at)}</td>

      <td class="task-filter">
        <div>
          ${e.task}
        </div>

        ${
          (e.section || e.unit)
            ? `
              <small>
                ${e.section || ""}
                ${e.section && e.unit ? " / " : ""}
                ${e.unit || ""}
              </small>
            `
            : ""
        }

        ${renderImpactBadge(e.impact)}
      </td>

      <td>${e.type || "-"}</td>
      <td>${e.executed_by || "-"}</td>
      <td>${e.notes || "-"}</td>

      <td>
        <button class="btn-secondary btn-sm">View</button>
      </td>
    `;

    /* =====================
       TASK CLICK → FILTER
    ===================== */
    const taskCell = tr.querySelector(".task-filter");

    taskCell.onclick = ev => {
      ev.stopPropagation();

      // toggle task filter
      if (state.assetHistoryTaskFilter === e.task) {
        state.assetHistoryTaskFilter = null;
      } else {
        state.assetHistoryTaskFilter = `${e.task}||${e.section || ""}||${e.unit || ""}`;
      }

      // 🔹 clear legend filter
      state.assetHistoryTypeFilter = "all";
      highlightActiveHistoryLegend();

      renderAssetHistoryTable(state.assetHistoryTasks);
    };

    /* =====================
       VIEW BUTTON
    ===================== */
    tr.querySelector("button").onclick = ev => {
      ev.stopPropagation();
      viewHistoryEntry(e.id);
    };

    tbody.appendChild(tr);
  });
}

// =====================
// ASSET HISTORY ACTIVE FILTER (TASK CLICK & LEGEND SYNC)
// =====================

function renderAssetHistoryActiveFilter() {

  const box = document.getElementById("assetHistoryActiveFilter");
  if (!box) return;

  // task filter
  if (state.assetHistoryTaskFilter) {
    box.innerHTML = `
      <span>
        Filter: ${state.assetHistoryTaskFilter}
        <button id="clearHistoryFilter">✕</button>
      </span>
    `;
  }

  // type filter
  else if (state.assetHistoryTypeFilter !== "all") {
    box.innerHTML = `
      <span>
        Filter: ${state.assetHistoryTypeFilter}
        <button id="clearHistoryFilter">✕</button>
      </span>
    `;
  }

  else {
    box.innerHTML = "";
    return;
  }

  document.getElementById("clearHistoryFilter").onclick = () => {

    state.assetHistoryTaskFilter = null;
    state.assetHistoryTypeFilter = "all";

    highlightActiveHistoryLegend();

    renderAssetHistoryTable(state.assetHistoryTasks);
  };
}

/* =====================
   ASSET HISTORY LEGEND ACTIVE STATE (SCOPED)
===================== */

function highlightActiveHistoryLegend() {
  document
    .querySelectorAll(".asset-history-legend .legend-item")
    .forEach(el => {
      el.classList.toggle(
        "active",
        el.dataset.type === state.assetHistoryTypeFilter // ✅ FIX
      );
    });
}
// =====================
// CLOSE
// =====================
function closeAssetView() {
  const overlay = document.getElementById("assetViewOverlay");
  if (overlay) overlay.style.display = "none";

  // ✅ reset state (asset view scope)
  state.assetAllTasks = [];
  state.assetActiveTasks = [];
  state.assetHistoryTasks = [];
  state.currentAssetSerial = null;

  // ✅ reset selection / filter (safe)
  state.assetSelectedTaskIds?.clear?.();
  state.assetHistoryTypeFilter = "all";

  const tbody = document.querySelector("#assetTasksTable tbody");
  if (tbody) tbody.innerHTML = "";
}
// =====================
// ASSET BULK ACTION BAR – UI ONLY (STEP 2)
// =====================
function updateAssetBulkActionsBar() {
  const bar = document.getElementById("assetBulkActionsBar");
  const countEl = document.getElementById("assetBulkSelectedCount");

  if (!bar || !countEl) return;

  const count = state.assetSelectedTaskIds.size;

  if (count > 0) {
    countEl.textContent = count;
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

function clearAssetBulkSelection() {
  state.assetSelectedTaskIds.clear();

  document
    .querySelectorAll("#assetTasksTable tbody input[type='checkbox']")
    .forEach(cb => (cb.checked = false));

  updateAssetBulkActionsBar();
}

// =====================
// ASSET BULK ACTIONS – EVENT HANDLERS (STEP 2)
// =====================
document.addEventListener("click", e => {
  if (e.target.id === "assetBulkClearBtn") {
    clearAssetBulkSelection();
  }

  if (e.target.id === "assetBulkDoneBtn") {
    if (state.assetSelectedTaskIds.size === 0) return;
    state.bulkDoneMode = true;
    openBulkDoneModal();
  }
});
  /* =====================
    OPEN CONFIRM DONE MODAL (BULK)
  ===================== */
  function openBulkDoneModal() {
    state.pendingTaskId = null;

    // 🔥 ENSURE DROPDOWN IS FILLED
    populateTechnicianDropdown();

    const today = new Date().toISOString().split("T")[0];
    const dateInput = getEl("completedDateInput");
    if (dateInput) {
      dateInput.value = today;
    }

    const notesInput = getEl("doneNotesInput");

      if (notesInput) {

        // If only ONE task selected → preload existing task notes
        if (state.assetSelectedTaskIds.size === 1) {

          const selectedId = [...state.assetSelectedTaskIds][0];

          const task = state.tasksData.find(
            t => String(t.id) === String(selectedId)
          );

          notesInput.value =
            task?.notes ||
            task?.note ||
            "";

        }

        // Multiple tasks → keep blank note
        else {
          notesInput.value = "";
        }
      }

    getEl("modalOverlay").style.display = "flex";
  }
  /* =====================
   COMPLETE BULK TASKS
===================== */

async function completeBulkTasks({
  technicianId,
  technicianName,
  completedAt,
  notes
}) {

  /* =====================
     COMMON NOTE WARNING
  ===================== */

  if (
    state.assetSelectedTaskIds.size > 1 &&
    notes
  ) {

    const ok = confirm(
      `You entered a common note while completing ${state.assetSelectedTaskIds.size} tasks.\n\n` +
      `This note will be applied to ALL selected tasks.\n\n` +
      `If any selected task already has notes, they will be replaced.\n\n` +
      `Continue?`
    );

    // User cancelled → keep modal open
    if (!ok) {
      return false;
    }
  }


  /* =====================
     API REQUEST
  ===================== */

  const res = await fetch(
    `${API}/tasks/bulk-done`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        taskIds: [
          ...state.assetSelectedTaskIds
        ],

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
      "Bulk complete failed"
    );
  }


  const completedCount =
    state.assetSelectedTaskIds.size;


  /* =====================
     RESET BULK STATE + UI
  ===================== */

  state.bulkDoneMode = false;

  state.assetSelectedTaskIds.clear();


  document
    .querySelectorAll(
      ".asset-task-checkbox"
    )
    .forEach(cb => {
      cb.checked = false;
    });


  const bar =
    getEl("assetBulkActionsBar");

  if (bar) {
    bar.style.display = "none";
  }


  /* =====================
     REFRESH GLOBAL DATA
     Preserved from existing flow
  ===================== */

  await loadTasks();
  await loadHistory();


  if (
    typeof renderAssetsCards === "function"
  ) {
    renderAssetsCards();
  }


  if (state.currentAssetSerial) {

    await openAssetViewBySerial(
      state.currentAssetSerial
    );

    activateAssetTab("active");
  }


  alert(
    `✔ ${completedCount} εργασίες ολοκληρώθηκαν`
  );


  return true;
}
// =====================
// ACTIVATE ASSET TAB (STABLE VERSION)
// =====================

function activateAssetTab(tabName) {
  if (!tabName) return;

  // --- UI state ---
  document.querySelectorAll(".asset-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  document.querySelectorAll(".asset-tab-panel").forEach(panel => {
    panel.style.display =
      panel.dataset.panel === tabName ? "block" : "none";
  });

  // =====================
  // ACTION BUTTON VISIBILITY
  // =====================
  const printBtn = document.getElementById("printAssetPreventiveBtn");

  if (printBtn) {
    printBtn.style.display = tabName === "active" ? "inline-flex" : "none";
  }

  // --- DATA render (SAFE) ---
  if (tabName === "active") {
    renderAssetTasksTable(
      Array.isArray(state.assetActiveTasks) ? state.assetActiveTasks : []
    );
  }

if (tabName === "history") {

  // reset filters when entering history tab
  state.assetHistoryTaskFilter = null;
  state.assetHistoryTypeFilter = "all";
  state.historyDateFrom = null;
  state.historyDateTo = null;

  bindHistoryRangeFilters();

  renderAssetHistoryTable(
    Array.isArray(state.assetHistoryTasks)
      ? state.assetHistoryTasks
      : []
  );

  highlightActiveHistoryLegend();

}
}

// =====================
// TAB CLICK HANDLER (SCOPED)
// =====================
// =====================
// TAB CLICK HANDLER
// Bind only once
// =====================
function bindAssetTabs() {

  const container =
    document.getElementById("assetViewOverlay");

  if (!container) return;

  // Prevent duplicate event listeners
  if (container.dataset.tabsBound === "true") {
    return;
  }

  container.addEventListener("click", e => {

    const tab =
      e.target.closest(".asset-tab");

    if (!tab) return;

    const tabName =
      tab.dataset.tab;

    if (!tabName) return;

    activateAssetTab(tabName);
  });

  container.dataset.tabsBound = "true";
}
// =====================
// HEADER
// =====================
function renderAssetViewHeader(src) {
  document.getElementById("assetViewTitle").innerHTML = `
    ${src.machine_name}
    <small class="asset-sn">SN: ${src.serial_number}</small>
  `;

  document.getElementById("assetViewLine").textContent =
    src.line_code || "-";

  document.getElementById("assetViewStatus").textContent = "Active";
}

// =====================
// KPI COUNTS
// =====================

function renderAssetKpis(tasks, history) {
  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(history)) history = [];

  // μόνο ενεργά (όχι Done)
  const activeTasks = tasks.filter(t => t.status !== "Done");

  const preventiveCount = activeTasks.filter(t => isPreventive(t)).length;

  const plannedManualCount = activeTasks.filter(t =>
    isPlannedManual(t)
  ).length;

  const overdueCount = activeTasks.filter(
    t => getDueState(t) === "overdue"
  ).length;

  const historyCount = history.length;

  // 🟨 Planned KPI → colored breakdown
  const plannedLabel = `
  <div class="asset-kpi-line">
    <span class="asset-status preventive">${preventiveCount} prev</span>
    <span class="sep">,</span>
    <span class="asset-status planned">${plannedManualCount} planned (manual)</span>
  </div>
`;

  document.getElementById("assetPlannedCount").innerHTML = plannedLabel;
  document.getElementById("assetOverdueCount").textContent = overdueCount;
  document.getElementById("assetHistoryCount").textContent = historyCount;
}

// =====================
// MTTR PER ASSET (minutes)
// =====================
function getAssetMttrBySerial(serial) {
  if (!serial || !Array.isArray(state.executionsData)) {
    return null;
  }

  const serialKey = String(serial).trim();

  // 🔥 ΜΟΝΟ breakdown executions
  const breakdowns = state.executionsData.filter(e =>
    String(e.serial_number || "").trim() === serialKey &&
    e.is_planned === false &&
    Number.isFinite(Number(e.duration_min)) &&
    Number(e.duration_min) > 0
  );

  if (breakdowns.length === 0) {
    return null;
  }

  let totalMin = 0;

  breakdowns.forEach(e => {
    totalMin += Number(e.duration_min);
  });

  return {
    mttrMinutes: Math.round(totalMin / breakdowns.length),
    breakdownCount: breakdowns.length
  };
}
// =====================
// RENDER ASSET MTBF + LAST BREAKDOWN
// =====================
function renderAssetMtbf(serial) {
  const mtbfEl = document.getElementById("assetMtbfValue");
  const lastEl = document.getElementById("assetLastBreakdown");

  if (!mtbfEl || !lastEl) return;

  const breakdowns = Array.isArray(state.assetHistoryTasks)
    ? state.assetHistoryTasks.filter(e => e.is_planned === false)
    : [];

  const mtbfMin = calculateMtbfMinutes(breakdowns);

  mtbfEl.textContent =
    mtbfMin == null ? "—" : formatDuration(mtbfMin);

  const lastDate = getLastBreakdownDate(breakdowns);

  lastEl.textContent =
    !lastDate
      ? "No breakdowns recorded"
      : `Last breakdown: ${formatDate(lastDate)}`;
}

/* =====================
   GET LAST BREAKDOWN INFO BY SERIAL
===================== */

function getLastBreakdownInfo(serial) {
  const list = (Array.isArray(state.executionsData) ? state.executionsData : [])
    .filter(e =>
      String(e.serial_number || "").trim() === String(serial).trim() &&
      e.is_planned === false
    )
    .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));

  if (!list.length) return null;

  return {
    executed_at: list[0].executed_at
  };
}

// =====================
// RENDER ASSET MTTR KPI
// =====================

function renderAssetMttrKpis(serial) {
  const mttrEl = document.getElementById("assetMttrValue");
  if (!mttrEl) return;

  const mttr = getAssetMttrBySerial(serial);
  const last = getLastBreakdownInfo(serial);

  let mttrLabel = "—";
  let breakdownLabel = "";
  let lastLabel = "";

  // MTTR value
  if (
    mttr &&
    Number.isFinite(Number(mttr.mttrMinutes)) &&
    mttr.mttrMinutes > 0
  ) {
    mttrLabel = `${Math.round(mttr.mttrMinutes)}m`;

    if (Number.isFinite(Number(mttr.breakdownCount)) && mttr.breakdownCount > 0) {
      breakdownLabel = ` • ${mttr.breakdownCount} breakdowns`;
    }
  }

  // Last breakdown info
  if (last && last.executed_at && typeof formatRelativeDate === "function") {
    lastLabel = `
      <div class="kpi-sub">
        Last breakdown: ${formatRelativeDate(last.executed_at)}
      </div>
    `;
  }

  mttrEl.innerHTML = `
    ${mttrLabel}
    ${breakdownLabel}
    ${lastLabel}
  `;
}
/* =====================
    ASSET HISTORY LEGEND COUNTERS (SAFE)
===================== */

function updateAssetHistoryLegendCounts(history) {
  const allEl = document.getElementById("histAllCount");
  const bEl = document.getElementById("assetHistoryCountBreakdown");
  const pEl = document.getElementById("assetHistoryCountPreventive");
  const mEl = document.getElementById("assetHistoryCountPlanned");

  if (!allEl || !bEl || !pEl || !mEl) return;

  const list = Array.isArray(history) ? history : [];

  let unplanned = 0;
  let preventive = 0;
  let planned = 0;

  list.forEach(e => {
    const t = getExecutionType(e);
    if (t === "unplanned") unplanned++;
    else if (t === "preventive") preventive++;
    else if (t === "planned") planned++;
  });

  allEl.textContent = list.length;
  bEl.textContent = unplanned;     // 🔴 Breakdowns = unplanned
  pEl.textContent = preventive;    // 🟢 Preventive
  mEl.textContent = planned;       // 🟡 Planned (manual)
}


// =====================
// REFRESH ASSET VIEW DATA (FROM STATE)
// =====================
async function refreshAssetView() {
  if (!state.currentAssetSerial) return;

  // 🔄 1️⃣ reload GLOBAL data (θα γεμίσουν state.tasksData / state.executionsData)
  await loadTasks();
  await loadHistory();

  const serial = String(state.currentAssetSerial).trim();

  // 🔄 2️⃣ rebuild asset view data
  state.assetAllTasks = state.tasksData.filter(
    t => String(t.serial_number || "").trim() === serial
  );

  state.assetActiveTasks = state.assetAllTasks.filter(
    t => t.status === "Planned" || t.status === "Overdue"
  );

  state.assetHistoryTasks = state.executionsData.filter(
    e => String(e.serial_number || "").trim() === serial
  );

  // reset history legend filter to "all" on refresh
  state.assetHistoryTypeFilter = "all"; // ⚠ αν υπάρχει στο state, αλλιώς πρόσθεσέ το
  updateAssetHistoryLegendCounts(state.assetHistoryTasks);
  bindAssetHistoryLegendClicks();
  highlightActiveHistoryLegend();

  // 🔄 3️⃣ re-render active tab
  const activeTab =
    document.querySelector(".asset-tab.active")?.dataset.tab || "active";

  activateAssetTab(activeTab);
}
// =====================
// ASSET HISTORY LEGEND – CLICK HANDLER (DELEGATED)
// =====================
document.addEventListener("click", e => {
  const item = e.target.closest(".asset-history-legend .legend-item");
  if (!item) return;

  const type = item.dataset.type || "all";

  console.log("🟡 HISTORY LEGEND CLICK:", type);

  state.assetHistoryTypeFilter = type;

  highlightActiveHistoryLegend();

  renderAssetHistoryTable(state.assetHistoryTasks);
});

