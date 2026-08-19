  // =====================
  // COMPACT MODE TOGGLE
  // =====================
  document
  .getElementById("compactDashboardToggle")
  ?.addEventListener("change", e => {
    const container = document.getElementById("assetDashboard");
    if (!container) return;

    container.classList.toggle("compact", e.target.checked);
  });
  // Risk buttons
document.querySelectorAll(".dashboard-filters .filter-btn")
  .forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".dashboard-filters .filter-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      dashboardFilters.risk = btn.dataset.risk;

      renderAssetDashboard();
    });
  });

// Overdue only
document
  .getElementById("filterOverdueOnly")
  ?.addEventListener("change", e => {
    dashboardFilters.overdueOnly = e.target.checked;
    renderAssetDashboard();
  });

// Broken < 7d
document
  .getElementById("filterBrokenRecent")
  ?.addEventListener("change", e => {
    dashboardFilters.brokenRecent = e.target.checked;
    renderAssetDashboard();
  });

// =====================
// ASSET KEY NORMALIZER
// =====================
function getAssetKey(row) {
  const line =
    row.line_code || row.line || "";

  const machine =
    row.machine_name || row.machine || "";

  const sn =
    row.serial_number || row.sn || "";

  return `${line}||${machine}||${sn}`;
}
// =====================
// TREND ARROW UTILITY
// =====================

function trendArrow(current, previous) {
  if (previous == null || current == null) return "";
  if (current > previous) return "↗︎";
  if (current < previous) return "↘︎";
  return "→";
}
// =====================
// Filters Dashboard State
// =====================
const dashboardFilters = {
  risk: "all",          // all | critical | risk | watch
  overdueOnly: false,
  brokenRecent: false
};

/* =====================================================
   ASSET DASHBOARD DATA ENGINE
   -----------------------------------------------------
   Builds the maintenance priority dataset used by the
   Asset Dashboard and Daily Maintenance Brief.

   Flow:
   1. Aggregate active maintenance tasks
   2. Aggregate breakdown history
   3. Calculate reliability metrics
   4. Calculate maintenance priority score
   5. Assign risk level
===================================================== */


/* =====================
   DASHBOARD CONSTANTS
===================== */

const DASHBOARD_DUE_SOON_DAYS = 7;
const DASHBOARD_MTTR_THRESHOLD = 60; // minutes


/* =====================
   CREATE ASSET RECORD
===================== */

function createAssetDashboardRecord(task) {

  return {
    machine: task.machine_name,
    serial: task.serial_number,
    line: task.line_code || task.line || "—",

    // Maintenance status
    overdue: 0,
    overdueDaysTotal: 0,
    maxOverdueDays: 0,
    dueSoon: 0,

    // Safety / Quality impact
    safetyOverdue: 0,
    safetyDueSoon: 0,
    qualityOverdue: 0,
    qualityDueSoon: 0,

    // Reliability
    breakdowns: 0,
    totalRepairMin: 0,
    lastBreakdownDate: null,

    // Planned manual workload
    manualPlanned30d: 0
  };
}


/* =====================================================
   AGGREGATE ACTIVE TASKS
===================================================== */

function aggregateDashboardTasks(today) {

  const assetsMap = {};

  state.tasksData.forEach(t => {

    if (!t.machine_name || !t.serial_number) {
      return;
    }

    const assetKey =
      getAssetKey(t);


    // =====================
    // CREATE ASSET RECORD
    // =====================

    if (!assetsMap[assetKey]) {
      assetsMap[assetKey] =
        createAssetDashboardRecord(t);
    }


    // Ignore completed / invalid due date
    if (!t.due_date || t.status === "Done") {
      return;
    }


    const due =
      new Date(t.due_date);

    due.setHours(0, 0, 0, 0);


    const diffDays =
      Math.ceil(
        (due - today) / 86400000
      );


    // =====================
    // IMPACT CLASSIFICATION
    // Shared helpers → utils.js
    // =====================

    const hasSafety =
      hasSafetyImpact(t);

    const hasQuality =
      hasQualityImpact(t);


    // =====================
    // OVERDUE
    // =====================

    if (due < today) {

      const overdueDays =
        Math.floor(
          (today - due) / 86400000
        );


      assetsMap[assetKey].overdue++;

      assetsMap[assetKey].overdueDaysTotal +=
        overdueDays;

      assetsMap[assetKey].maxOverdueDays =
        Math.max(
          assetsMap[assetKey].maxOverdueDays,
          overdueDays
        );


      // Safety / Quality overdue

      if (hasSafety) {
        assetsMap[assetKey].safetyOverdue++;
      }

      if (hasQuality) {
        assetsMap[assetKey].qualityOverdue++;
      }
    }


    // =====================
    // DUE SOON
    // =====================

    else if (
      diffDays <= DASHBOARD_DUE_SOON_DAYS
    ) {

      assetsMap[assetKey].dueSoon++;


      // Safety / Quality due soon

      if (hasSafety) {
        assetsMap[assetKey].safetyDueSoon++;
      }

      if (hasQuality) {
        assetsMap[assetKey].qualityDueSoon++;
      }
    }


    // =====================
    // PLANNED MANUAL LOAD
    // ±30 day window
    // =====================

    if (
      typeof isPlannedManual === "function" &&
      isPlannedManual(t)
    ) {

      const diffFromToday =
        Math.floor(
          (today - due) / 86400000
        );

      if (
        diffFromToday >= -30 &&
        diffFromToday <= 30
      ) {
        assetsMap[assetKey].manualPlanned30d++;
      }
    }

  });


  return assetsMap;
}


/* =====================================================
   AGGREGATE BREAKDOWN HISTORY
===================================================== */

function aggregateDashboardExecutions(
  assetsMap
) {

  state.executionsData.forEach(e => {

    if (!e.serial_number) {
      return;
    }

    // Breakdown only
    if (e.is_planned !== false) {
      return;
    }


    const assetKey =
      getAssetKey(e);


    // Dashboard contains only assets found
    // in the active task dataset
    if (!assetsMap[assetKey]) {
      return;
    }


    assetsMap[assetKey].breakdowns++;


    // =====================
    // REPAIR DURATION
    // =====================

    const duration =
      Number(e.duration_min);

    if (!Number.isNaN(duration)) {
      assetsMap[assetKey].totalRepairMin +=
        duration;
    }


    // =====================
    // LAST BREAKDOWN
    // =====================

    if (e.executed_at) {

      const executionDate =
        new Date(e.executed_at);

      if (
        !assetsMap[assetKey].lastBreakdownDate ||
        executionDate >
          assetsMap[assetKey].lastBreakdownDate
      ) {
        assetsMap[assetKey].lastBreakdownDate =
          executionDate;
      }
    }

  });
}


/* =====================================================
   CALCULATE ASSET DASHBOARD SCORE
===================================================== */

function calculateAssetDashboardScore(
  asset,
  today
) {

  // =====================
  // MTTR
  // =====================

  const avgMTTR =
    asset.breakdowns > 0
      ? Math.round(
          asset.totalRepairMin /
          asset.breakdowns
        )
      : null;


  // =====================
  // LAST BREAKDOWN
  // =====================

  const daysSinceLastBreakdown =
    asset.lastBreakdownDate
      ? Math.floor(
          (
            today -
            asset.lastBreakdownDate
          ) / 86400000
        )
      : null;


  // Expose for central risk engine
  asset.lastBreakdownDays =
    daysSinceLastBreakdown;


  // =====================
  // PRIORITY SCORE
  // =====================

  let score = 0;


  // =====================
  // SAFETY / QUALITY
  // =====================

  const impactScore =
    (asset.safetyOverdue * 50) +
    (asset.safetyDueSoon * 25) +
    (asset.qualityOverdue * 30) +
    (asset.qualityDueSoon * 15);

  score += impactScore;


  // =====================
  // OVERDUE COUNT
  // =====================

  score +=
    asset.overdue * 6;


  // =====================
  // OVERDUE AGE
  // =====================

  score +=
    Math.floor(
      asset.overdueDaysTotal * 0.35
    );


  // Strong penalty for oldest task

  score +=
    asset.maxOverdueDays * 2;


  // Escalation tiers

  if (asset.maxOverdueDays >= 7) {
    score += 10;
  }

  if (asset.maxOverdueDays >= 14) {
    score += 20;
  }

  if (asset.maxOverdueDays >= 30) {
    score += 40;
  }


  // =====================
  // DUE SOON
  // =====================

  score +=
    asset.dueSoon * 4;


  // =====================
  // MTTR
  // =====================

  if (
    avgMTTR &&
    avgMTTR > DASHBOARD_MTTR_THRESHOLD
  ) {
    score += 10;
  }


  // =====================
  // RECENT BREAKDOWN
  // =====================

  if (
    daysSinceLastBreakdown !== null &&
    daysSinceLastBreakdown <= 7
  ) {
    score += 8;
  }


  // =====================
  // MANUAL LOAD
  // =====================

  if (
    asset.manualPlanned30d >= 5
  ) {
    score += 4;
  }

  if (
    asset.manualPlanned30d >= 10
  ) {
    score += 8;
  }


  // =====================
  // CENTRAL RISK ENGINE
  // utils.js
  // =====================

  const risk =
    getAssetRiskLevel(asset);


  // =====================
  // DASHBOARD OBJECT
  // =====================

  return {

    machine: asset.machine,
    serial: asset.serial,
    line: asset.line,

    overdue:
      asset.overdue,

    overdueDaysTotal:
      asset.overdueDaysTotal,

    maxOverdueDays:
      asset.maxOverdueDays,

    dueSoon:
      asset.dueSoon,


    // Safety / Quality

    safetyOverdue:
      asset.safetyOverdue,

    safetyDueSoon:
      asset.safetyDueSoon,

    qualityOverdue:
      asset.qualityOverdue,

    qualityDueSoon:
      asset.qualityDueSoon,

    impactScore,


    // Reliability

    avgMTTR,

    lastBreakdownDays:
      daysSinceLastBreakdown,


    // Workload

    manualPlanned30d:
      asset.manualPlanned30d,


    // Risk

    riskLevel:
      risk.level,

    riskLabel:
      risk.label,

    riskIcon:
      risk.icon,


    // Final numeric priority

    score
  };
}


/* =====================================================
   TOP WORST ASSETS DASHBOARD
   Public dashboard data provider
===================================================== */

function getTopWorstAssetsDashboard(
  limit = 9
) {

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );


  // 1. Aggregate active tasks

  const assetsMap =
    aggregateDashboardTasks(today);


  // 2. Add breakdown history

  aggregateDashboardExecutions(
    assetsMap
  );


  // 3. Calculate metrics + score

  const scoredAssets =
    Object.values(assetsMap)
      .map(asset =>
        calculateAssetDashboardScore(
          asset,
          today
        )
      );


  // 4. Select highest numeric scores

  return scoredAssets
    .filter(asset =>
      asset.score > 0
    )
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      limit
    );
}

// =====================
// PUBLIC API – ASSET DASHBOARD RENDER
// =====================
window.renderAssetDashboard = function () {
  const container = document.getElementById("assetDashboard");
  if (!container) return;

  let assets = getTopWorstAssetsDashboard();

  // =====================
  // FILTER STATE CHECK
  // =====================
  const hasActiveFilter =
    dashboardFilters.risk !== "all" ||
    dashboardFilters.overdueOnly ||
    dashboardFilters.brokenRecent;

  // If any filter active → expand scope
  if (hasActiveFilter && typeof getAllAssetsForDashboard === "function") {
    assets = getAllAssetsForDashboard();
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    container.innerHTML = `<div>No assets require attention 🎉</div>`;
    return;
  }

  // =====================
  // RISK NORMALIZATION
  // =====================
  const normalizeRiskLevel = (r) => {
    if (!r) return "watch";

    const v =
      typeof r === "string"
        ? r.toLowerCase()
        : (r.level || "").toLowerCase();

    if (v.includes("crit")) return "critical";
    if (v.includes("risk")) return "risk";
    if (v.includes("watch") || v.includes("warn")) return "watch";

    return "watch";
  };

  // Enrich with normalized risk
  assets = assets.map(a => {
    const riskRaw =
      typeof getAssetRiskLevel === "function"
        ? getAssetRiskLevel(a)
        : null;

    const level = normalizeRiskLevel(riskRaw);

    return {
      ...a,
      _risk: {
        level,
        label: riskRaw?.label || level.toUpperCase(),
        icon: riskRaw?.icon || (level === "critical" ? "🔴" : level === "risk" ? "🟠" : "🟡")
      }
    };
  });

  // =====================
  // APPLY FILTERS
  // =====================
  assets = assets.filter(a => {
    // Risk filter
    if (
      dashboardFilters.risk !== "all" &&
      a._risk.level !== dashboardFilters.risk
    ) {
      return false;
    }

    // Overdue only
    if (dashboardFilters.overdueOnly && Number(a.overdue) <= 0) {
      return false;
    }

    // Broken < 7 days
    if (
      dashboardFilters.brokenRecent &&
      !(
        a.lastBreakdownDays != null &&
        Number(a.lastBreakdownDays) <= 7
      )
    ) {
      return false;
    }

    return true;
  });

  // =====================
  // SORT BY RISK + SCORE
  // =====================
  assets.sort((a, b) => {

    const riskDiff =
      (RISK_PRIORITY[a._risk.level] ?? 99) -
      (RISK_PRIORITY[b._risk.level] ?? 99);

    // 1️⃣ Risk level first
    if (riskDiff !== 0) {
      return riskDiff;
    }

    // 2️⃣ Within same risk level → highest score first
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  });

  // Limit only when NO filters
  if (!hasActiveFilter) {
    assets = assets.slice(0, 9);
  }

  if (assets.length === 0) {
    container.innerHTML = `<div class="empty">No assets match filters</div>`;
    return;
  }

  // =====================
  // RENDER
  // =====================
  container.innerHTML = assets.map(a => {
    const risk = a._risk;

    return `
      <div class="asset-card dashboard-card ${risk.level}">

        <div class="asset-card-top">
          <div class="asset-line">LINE ${a.line}</div>

          <div class="asset-risk-box">
              <div class="asset-risk-badge ${risk.level}">
                ${risk.icon} ${risk.label}
              </div>

              <div class="asset-score">
                Score ${a.score ?? 0}
              </div>
          </div>
        </div>

        <div class="asset-title">
          ${a.machine}
          <span class="sn">SN ${a.serial}</span>
        </div>

        <div class="asset-metrics">

          <div class="metric overdue">
            🔴 Overdue: ${a.overdue}
            <span class="trend">${a.overdueTrend || ""}</span>
          </div>

          <div class="metric soon">
            🟠 Due soon: ${a.dueSoon}
          </div>
          ${
            (Number(a.safetyOverdue) > 0 ||
            Number(a.safetyDueSoon) > 0)
              ? `
                <div class="metric impact safety">
                  🛡 Safety:
                  ${Number(a.safetyOverdue) > 0
                    ? `<strong>${a.safetyOverdue} overdue</strong>`
                    : ""
                  }
                  ${Number(a.safetyOverdue) > 0 && Number(a.safetyDueSoon) > 0
                    ? ` • `
                    : ""
                  }
                  ${Number(a.safetyDueSoon) > 0
                    ? `<strong>${a.safetyDueSoon} due soon</strong>`
                    : ""
                  }
                </div>
              `
              : ""
          }

          ${
            (Number(a.qualityOverdue) > 0 ||
            Number(a.qualityDueSoon) > 0)
              ? `
                <div class="metric impact quality">
                  ◆ Quality:
                  ${
                    Number(a.qualityOverdue) > 0
                      ? `<strong>${a.qualityOverdue} overdue</strong>`
                      : ""
                  }
                  ${
                    Number(a.qualityOverdue) > 0 &&
                    Number(a.qualityDueSoon) > 0
                      ? ` • `
                      : ""
                  }
                  ${
                    Number(a.qualityDueSoon) > 0
                      ? `${a.qualityDueSoon} due soon`
                      : ""
                  }
                </div>
              `
              : ""
          }

          <div class="metric mttr">
            ⏱ MTTR: ${a.avgMTTR ?? "—"} min
            <span class="trend">${a.mttrTrend || ""}</span>
          </div>

          <div class="metric manual">
            🧩 Manual load (30d): ${a.manualPlanned30d}
          </div>

          <div class="metric last">
            ⚡ Last breakdown:
            ${
              a.lastBreakdownDays != null
                ? `${a.lastBreakdownDays} days ago`
                : "—"
            }
          </div>

        </div>

        <div class="asset-actions">
          <button onclick="openAssetViewBySerial('${a.serial}')">
            View Asset
          </button>

          <button onclick="openAddTaskForAsset(
            '${a.machine}',
            '${a.serial}',
            '${a.line}'
          )">
            Create WO
          </button>
        </div>

      </div>
    `;
  }).join("");

  // =====================
  // COMPACT MODE
  // =====================
  const toggle = document.getElementById("compactDashboardToggle");
  if (toggle && toggle.checked) {
    container.classList.add("compact");
  } else {
    container.classList.remove("compact");
  }
};