  
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


/* =====================
   TOP WORST ASSETS DASHBOARD
===================== */
function getTopWorstAssetsDashboard(limit = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const DUE_SOON_DAYS = 7;
  const MTTR_THRESHOLD = 60; // minutes (tunable)

  const assetsMap = {};

  /* =====================
     1️⃣ AGGREGATE TASKS
  ===================== */
  tasksData.forEach(t => {
    if (!t.machine_name || !t.serial_number) return;

    const assetKey = getAssetKey(t);
    const line = t.line_code || t.line || "—";

    if (!assetsMap[assetKey]) {
      assetsMap[assetKey] = {
        machine: t.machine_name,
        serial: t.serial_number,
        line,
        overdue: 0,
        dueSoon: 0,
        breakdowns: 0,
        totalRepairMin: 0,
        lastBreakdownDate: null,

        // 🆕 Manual planned workload (last 30 days)
        manualPlanned30d: 0
      };
    }

    if (!t.due_date || t.status === "Done") return;

    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((due - today) / 86400000);

    if (due < today) {
      assetsMap[assetKey].overdue++;
    } else if (diffDays <= DUE_SOON_DAYS) {
      assetsMap[assetKey].dueSoon++;
    }

    // 🧩 Planned Manual load (±30 days window)
    if (
      typeof isPlannedManual === "function" &&
      isPlannedManual(t)
    ) {
      const diffFromToday = Math.floor((today - due) / 86400000);
      if (diffFromToday >= -30 && diffFromToday <= 30) {
        assetsMap[assetKey].manualPlanned30d++;
      }
    }
  });


  /* =====================
     2️⃣ AGGREGATE EXECUTIONS (BREAKDOWNS)
  ===================== */
  executionsData.forEach(e => {
    if (!e.serial_number) return;
    if (e.is_planned !== false) return; // breakdowns only

    const assetKey = getAssetKey(e);
    if (!assetsMap[assetKey]) return;

    assetsMap[assetKey].breakdowns++;

    const dur = Number(e.duration_min);
    if (!Number.isNaN(dur)) {
      assetsMap[assetKey].totalRepairMin += dur;
    }

    if (e.executed_at) {
      const execDate = new Date(e.executed_at);
      if (
        !assetsMap[assetKey].lastBreakdownDate ||
        execDate > assetsMap[assetKey].lastBreakdownDate
      ) {
        assetsMap[assetKey].lastBreakdownDate = execDate;
      }
    }
  });
  /* =====================
     RISK LEVEL FUNCTION
  ===================== */
  
  function getAssetRiskLevel(a) {
  // thresholds (tweakable)
  const HIGH_LOAD = 6; // hours in next 30d

  if (
    a.overdue >= 3 ||
    (a.lastBreakdownDays != null && a.lastBreakdownDays <= 3) ||
    (a.overdue >= 1 && a.lastBreakdownDays != null && a.lastBreakdownDays <= 7)
  ) {
    return { level: "critical", label: "CRITICAL", icon: "🔴" };
  }

  if (
    a.overdue === 1 ||
    a.dueSoon >= 3 ||
    a.manualPlanned30d >= HIGH_LOAD
  ) {
    return { level: "risk", label: "AT RISK", icon: "🟠" };
  }

  if (
    a.dueSoon > 0 ||
    a.manualPlanned30d > 0
  ) {
    return { level: "watch", label: "WATCH", icon: "🟡" };
  }

  return { level: "stable", label: "STABLE", icon: "🟢" };
}



  /* =====================
     3️⃣ COMPUTE METRICS + SCORE
  ===================== */
  const scoredAssets = Object.values(assetsMap).map(a => {
    const avgMTTR =
      a.breakdowns > 0
        ? Math.round(a.totalRepairMin / a.breakdowns)
        : null;

    const daysSinceLastBreakdown = a.lastBreakdownDate
      ? Math.floor((today - a.lastBreakdownDate) / 86400000)
      : null;

    // 🎯 RISK SCORE
    let score = 0;
    score += a.overdue * 10;
    score += a.dueSoon * 5;
    if (avgMTTR && avgMTTR > MTTR_THRESHOLD) score += 10;
    if (daysSinceLastBreakdown !== null && daysSinceLastBreakdown <= 7) score += 5;

    // 🧩 Manual planned workload signal (LOW weight)
    if (a.manualPlanned30d >= 5) score += 4;
    if (a.manualPlanned30d >= 10) score += 8;

    return {
      machine: a.machine,
      serial: a.serial,
      line: a.line,
      overdue: a.overdue,
      dueSoon: a.dueSoon,
      avgMTTR,
      lastBreakdownDays: daysSinceLastBreakdown,

      // 🆕 expose manual workload
      manualPlanned30d: a.manualPlanned30d,

      score
    };
  });

  /* =====================
     4️⃣ SORT & PICK TOP N
  ===================== */
  return scoredAssets
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
  // SORT BY RISK
  // =====================
  assets.sort(
    (a, b) =>
      (RISK_PRIORITY[a._risk.level] ?? 99) -
      (RISK_PRIORITY[b._risk.level] ?? 99)
  );

  // Limit only when NO filters
  if (!hasActiveFilter) {
    assets = assets.slice(0, 6);
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

          <div class="asset-risk-badge ${risk.level}">
            ${risk.icon} ${risk.label}
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





