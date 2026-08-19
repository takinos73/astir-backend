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