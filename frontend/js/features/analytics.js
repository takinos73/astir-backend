/* =====================
   KPI / ANALYTICS MODAL
===================== */

function openAnalyticsModal() {
  const overlay = document.getElementById("analyticsOverlay");
  if (!overlay) return;

  overlay.style.display = "flex";
  overlay.style.pointerEvents = "auto";

  loadKpiEstimatedWorkloadNext7Days();
  loadKpiOverdueWorkload();
  loadKpiPlanningMix();
  loadKpiTopAssetsOverdue();

  // 🔗 Enable drill-down AFTER KPI render
  setTimeout(enableKpiAssetDrilldown, 0);
}

function closeAnalyticsModal() {
  const overlay = document.getElementById("analyticsOverlay");
  if (!overlay) return;

  overlay.style.display = "none";
  overlay.style.pointerEvents = "none";
}
/* =====================
   KPI: Estimated Workload – Next 7 Days
===================== */

async function loadKpiEstimatedWorkloadNext7Days() {
  try {
    const res = await fetch("/kpis/workload/next-7-days");
    if (!res.ok) throw new Error("Failed to fetch KPI");

    const data = await res.json();
    const minutes = data.total_minutes || 0;

    // Find KPI value element (first workload card)
    const kpiValueEl = document.querySelector(
      "#analyticsOverlay .analytics-section:first-of-type .analytics-card .value"
    );

    if (!kpiValueEl) return;

    kpiValueEl.textContent =
      minutes > 0 ? formatDuration(minutes) : "—";

  } catch (err) {
    console.error("KPI workload fetch error:", err);
  }
}
/* =====================
   KPI: Overdue Workload
===================== */

async function loadKpiOverdueWorkload() {
  try {
    const res = await fetch("/kpis/workload/overdue");
    if (!res.ok) throw new Error("Failed to fetch overdue workload KPI");

    const data = await res.json();
    const minutes = data.total_minutes || 0;

    // Second analytics card (Overdue workload)
    const kpiValueEl = document.querySelector(
      "#analyticsOverlay .analytics-section:first-of-type .analytics-card:nth-child(2) .value"
    );

    if (!kpiValueEl) return;

    kpiValueEl.textContent =
      minutes > 0 ? formatDuration(minutes) : "—";

  } catch (err) {
    console.error("Overdue workload KPI error:", err);
  }
}
/* =====================
   KPI: Planning Mix (Planned vs Unplanned)
===================== */

async function loadKpiPlanningMix() {
  try {
    const res = await fetch("/kpis/planning-mix");
    if (!res.ok) throw new Error("Failed to fetch planning mix KPI");

    const data = await res.json();
    const planned = data.planned_minutes || 0;
    const unplanned = data.unplanned_minutes || 0;
    const total = planned + unplanned;

    const kpiValueEl = document.querySelector(
      "#analyticsOverlay .analytics-section:nth-of-type(2) .analytics-card .value"
    );

    if (!kpiValueEl) return;

    if (total === 0) {
      kpiValueEl.textContent = "—";
      return;
    }

    const plannedPct = Math.round((planned / total) * 100);
    const unplannedPct = 100 - plannedPct;

    kpiValueEl.textContent = `${plannedPct}% planned / ${unplannedPct}% unplanned`;

  } catch (err) {
    console.error("Planning mix KPI error:", err);
  }
}
/* =====================
   KPI: Top Assets by Overdue Workload
===================== */

async function loadKpiTopAssetsOverdue() {
  try {
    const res = await fetch("/kpis/overdue/top-assets");
    if (!res.ok) throw new Error("Failed to fetch top assets KPI");

    const data = await res.json();

    const listEl = document.getElementById("kpiTopAssetsOverdueList");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (data.length === 0) {
      listEl.innerHTML = `<div class="analytics-empty">—</div>`;
      return;
    }

    data.forEach(a => {
      const dur =
        a.total_minutes && a.total_minutes > 0
          ? formatDuration(a.total_minutes)
          : "—";

      const tasksLabel = `${a.pending_tasks} task${a.pending_tasks === 1 ? "" : "s"}`;

      const row = document.createElement("div");
      row.className = "analytics-list-row";

      // 🔗 Context for drill-down (next step)
      row.dataset.machine = a.machine_name;
      row.dataset.serial = a.serial_number;

      row.innerHTML = `
        <div class="asset">
          <strong>${a.machine_name}</strong>
          <small>${a.line_code} • ${a.serial_number}</small>
        </div>
        <div class="meta">
          ⏱ ${dur} • 📋 ${tasksLabel}
        </div>
      `;

      // ✅ THIS WAS MISSING
      listEl.appendChild(row);
    });

  } catch (err) {
    console.error("Top assets overdue KPI error:", err);
  }
}
/* =====================
   KPI Drill-down → Tasks (Serial-only, with re-filter)
===================== */

function enableKpiAssetDrilldown() {
  const listEl = document.getElementById("kpiTopAssetsOverdueList");
  if (!listEl) return;

  listEl.addEventListener("click", e => {
    const row = e.target.closest(".analytics-list-row");
    if (!row) return;

    const serial = row.dataset.serial;
    if (!serial) return;

    // 1️⃣ Close Analytics modal
    const analyticsOverlay = document.getElementById("analyticsOverlay");
    if (analyticsOverlay) analyticsOverlay.style.display = "none";

    // 2️⃣ Switch to Tasks tab
    document.querySelectorAll(".main-tab").forEach(t =>
      t.classList.remove("active")
    );
    document
      .querySelector('.main-tab[data-tab="tasks"]')
      ?.classList.add("active");

    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
      tab.style.display = "none";
    });

    const tasksTab = document.getElementById("tab-tasks");
    if (tasksTab) tasksTab.style.display = "block";

    // 3️⃣ Apply Serial filter (SET + TRIGGER EVENT)
    const searchInput = document.getElementById("taskSearch");
    if (searchInput) {
      searchInput.value = serial;

      // 🔥 CRITICAL: trigger filter listeners
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 4️⃣ Force overdue filter button
    document.querySelectorAll(".date-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.filter === "overdue");
    });

    // 5️⃣ Safety net (in case filters are manual)
    if (typeof applyFilters === "function") {
      applyFilters();
    } else if (typeof renderTasks === "function") {
      renderTasks();
    }
  });
}