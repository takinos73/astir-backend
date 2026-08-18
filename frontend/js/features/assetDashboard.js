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

function getTopWorstAssetsDashboard(limit = 9) {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const DUE_SOON_DAYS = 7;
  const MTTR_THRESHOLD = 60; // minutes

  const assetsMap = {};


  /* =====================
     1️⃣ AGGREGATE TASKS
  ===================== */

  state.tasksData.forEach(t => {

    if (!t.machine_name || !t.serial_number) return;

    const assetKey = getAssetKey(t);
    const line = t.line_code || t.line || "—";


    if (!assetsMap[assetKey]) {

      assetsMap[assetKey] = {

        machine: t.machine_name,
        serial: t.serial_number,
        line,

        overdue: 0,

        // Overdue severity
        overdueDaysTotal: 0,
        maxOverdueDays: 0,

        dueSoon: 0,

        // 🛡 IMPACT ATTENTION
        safetyOverdue: 0,
        safetyDueSoon: 0,
        qualityOverdue: 0,
        qualityDueSoon: 0,

        // Reliability
        breakdowns: 0,
        totalRepairMin: 0,
        lastBreakdownDate: null,

        // Manual planned workload
        manualPlanned30d: 0
      };
    }


    // Ignore completed / invalid due date
    if (!t.due_date || t.status === "Done") {
      return;
    }


    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);

    const diffDays =
      Math.ceil(
        (due - today) / 86400000
      );


    /* =====================
       IMPACT CLASSIFICATION
    ===================== */

    const impact =
      String(t.impact || "normal")
        .toLowerCase();

    const hasSafety =
      impact === "safety" ||
      impact === "safety_quality";

    const hasQuality =
      impact === "quality" ||
      impact === "safety_quality";


    /* =====================
       OVERDUE
    ===================== */

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


      // 🛡 Safety / Quality overdue
      if (hasSafety) {
        assetsMap[assetKey].safetyOverdue++;
      }

      if (hasQuality) {
        assetsMap[assetKey].qualityOverdue++;
      }

    }


    /* =====================
       DUE SOON
    ===================== */

    else if (diffDays <= DUE_SOON_DAYS) {

      assetsMap[assetKey].dueSoon++;


      // 🛡 Safety / Quality due soon
      if (hasSafety) {
        assetsMap[assetKey].safetyDueSoon++;
      }

      if (hasQuality) {
        assetsMap[assetKey].qualityDueSoon++;
      }
    }


    /* =====================
       PLANNED MANUAL LOAD
       ±30 day window
    ===================== */

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


  /* =====================
     2️⃣ AGGREGATE EXECUTIONS
     BREAKDOWNS ONLY
  ===================== */

  state.executionsData.forEach(e => {

    if (!e.serial_number) return;

    // Breakdown only
    if (e.is_planned !== false) return;

    const assetKey = getAssetKey(e);

    if (!assetsMap[assetKey]) return;


    assetsMap[assetKey].breakdowns++;


    const dur =
      Number(e.duration_min);

    if (!Number.isNaN(dur)) {
      assetsMap[assetKey].totalRepairMin += dur;
    }


    if (e.executed_at) {

      const execDate =
        new Date(e.executed_at);

      if (
        !assetsMap[assetKey].lastBreakdownDate ||
        execDate >
          assetsMap[assetKey].lastBreakdownDate
      ) {
        assetsMap[assetKey].lastBreakdownDate =
          execDate;
      }
    }

  });



  /* =====================
     3️⃣ COMPUTE METRICS
     + SCORE
  ===================== */

  const scoredAssets =
    Object.values(assetsMap).map(a => {


      /* =====================
         MTTR
      ===================== */

      const avgMTTR =
        a.breakdowns > 0
          ? Math.round(
              a.totalRepairMin /
              a.breakdowns
            )
          : null;


      /* =====================
         LAST BREAKDOWN
      ===================== */

      const daysSinceLastBreakdown =
        a.lastBreakdownDate
          ? Math.floor(
              (today -
                a.lastBreakdownDate) /
              86400000
            )
          : null;


      // expose temporarily for risk logic
      a.lastBreakdownDays =
        daysSinceLastBreakdown;


      /* =====================
         RISK SCORE
      ===================== */

      let score = 0;


      /* =====================
         🛡 SAFETY / QUALITY
         IMPACT SCORE
      ===================== */

      const impactScore =
        (a.safetyOverdue * 50) +
        (a.safetyDueSoon * 25) +
        (a.qualityOverdue * 30) +
        (a.qualityDueSoon * 15);

      score += impactScore;


      /* =====================
         OVERDUE COUNT
      ===================== */

      score +=
        a.overdue * 6;


      /* =====================
         OVERDUE DAYS SEVERITY
      ===================== */

      score +=
        Math.floor(
          a.overdueDaysTotal * 0.35
        );


      // Strong penalty for oldest task
      score +=
        a.maxOverdueDays * 2;


      // Escalation tiers
      if (a.maxOverdueDays >= 7) {
        score += 10;
      }

      if (a.maxOverdueDays >= 14) {
        score += 20;
      }

      if (a.maxOverdueDays >= 30) {
        score += 40;
      }


      /* =====================
         DUE SOON
      ===================== */

      score +=
        a.dueSoon * 4;


      /* =====================
         MTTR
      ===================== */

      if (
        avgMTTR &&
        avgMTTR > MTTR_THRESHOLD
      ) {
        score += 10;
      }


      /* =====================
         RECENT BREAKDOWN
      ===================== */

      if (
        daysSinceLastBreakdown !== null &&
        daysSinceLastBreakdown <= 7
      ) {
        score += 8;
      }


      /* =====================
         MANUAL LOAD
      ===================== */

      if (
        a.manualPlanned30d >= 5
      ) {
        score += 4;
      }

      if (
        a.manualPlanned30d >= 10
      ) {
        score += 8;
      }


      /* =====================
         RISK LEVEL
      ===================== */

      const risk =
        getAssetRiskLevel(a);


      /* =====================
         RETURN DASHBOARD OBJECT
      ===================== */

      return {

        machine: a.machine,
        serial: a.serial,
        line: a.line,

        overdue: a.overdue,

        overdueDaysTotal:
          a.overdueDaysTotal,

        maxOverdueDays:
          a.maxOverdueDays,

        dueSoon:
          a.dueSoon,


        // 🛡 Impact metrics
        safetyOverdue:
          a.safetyOverdue,

        safetyDueSoon:
          a.safetyDueSoon,

        qualityOverdue:
          a.qualityOverdue,

        qualityDueSoon:
          a.qualityDueSoon,

        impactScore,


        avgMTTR,

        lastBreakdownDays:
          daysSinceLastBreakdown,


        manualPlanned30d:
          a.manualPlanned30d,


        // Risk
        riskLevel: risk.level,
        riskLabel: risk.label,
        riskIcon: risk.icon,


        // Final numeric priority
        score
      };

    });


  /* =====================
     4️⃣ SORT & PICK TOP N
  ===================== */

  return scoredAssets

    .filter(a =>
      a.score > 0
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

/* =====================================================
   DAILY MAINTENANCE BRIEF
===================================================== */


/* =====================
   OPEN / CLOSE
===================== */

function openDailyBrief() {

  const overlay =
    document.getElementById("dailyBriefOverlay");

  const dateEl =
    document.getElementById("dailyBriefDate");

  if (dateEl) {
    dateEl.textContent =
      new Date().toLocaleDateString(
        "el-GR",
        {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric"
        }
      );
  }

  // =====================
  // BUILD CURRENT BRIEF DATA
  // =====================

  buildDailyBriefSafetyQuality();
  buildDailyBriefCritical();
  buildDailyBriefUpcoming();
  buildDailyBriefReliability();
  buildDailyBriefPulse();
  buildDailyBriefFocus();

  // =====================
  // COLLAPSIBLE SECTIONS
  // =====================

  resetDailyBriefSections();
  initDailyBriefCollapsibleSections();

  // =====================
  // SHOW MODAL
  // =====================

  if (overlay) {
    overlay.style.display = "flex";
  }
}

function closeDailyBrief() {

  const overlay =
    document.getElementById("dailyBriefOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }
}
/* =====================================================
   DAILY BRIEF
   UPCOMING MAINTENANCE
===================================================== */

function buildDailyBriefUpcoming() {

  const content =
    document.getElementById("dailyBriefUpcomingContent");

  const countEl =
    document.getElementById("dailyBriefUpcomingCount");

  if (!content || !countEl) return;

  const tasks =
    Array.isArray(state.tasksData)
      ? state.tasksData
      : [];

  const assets =
    Array.isArray(state.assetsData)
      ? state.assetsData
      : [];

  // =====================
  // DATE RANGE
  // Today → next 7 days
  // =====================

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const until = new Date(today);
  until.setDate(until.getDate() + 7);
  until.setHours(23, 59, 59, 999);


  // =====================
  // IDLE ASSETS
  // =====================

  const idleAssetIds = new Set(
    assets
      .filter(a => a.idle_since)
      .map(a => String(a.id))
  );


  // =====================
  // UPCOMING TASKS
  // =====================

  const upcoming = tasks.filter(t => {

    if (!t.due_date) return false;

    // Completed tasks excluded
    if (t.status === "Done") return false;

    // Idle assets excluded
    if (
      idleAssetIds.has(
        String(t.asset_id)
      )
    ) {
      return false;
    }

    const due = new Date(t.due_date);

    if (Number.isNaN(due.getTime())) {
      return false;
    }

    return due >= today && due <= until;
  });


  // =====================
  // COUNT
  // =====================

  countEl.textContent = upcoming.length;


  // =====================
  // NOTHING UPCOMING
  // =====================

  if (upcoming.length === 0) {

    content.innerHTML = `
      <span class="daily-brief-good">
        ✓ No maintenance tasks due in the next 7 days.
      </span>
    `;

    return;
  }


  // =====================
  // UNIQUE ASSETS
  // =====================

  const affectedAssets =
    new Set(
      upcoming.map(t =>
        String(t.asset_id)
      )
    ).size;


  // =====================
  // TOTAL WORKLOAD
  // =====================

  const totalMinutes =
    upcoming.reduce((sum, t) => {

      const duration =
        Number(t.duration_min) || 0;

      return sum + duration;

    }, 0);


  // =====================
  // WORKLOAD BY LINE
  // =====================

  const workloadByLine = {};

  upcoming.forEach(t => {

    const line =
      t.line_code ||
      t.line ||
      "—";

    if (!workloadByLine[line]) {
      workloadByLine[line] = 0;
    }

    workloadByLine[line] +=
      Number(t.duration_min) || 0;
  });


  // =====================
  // HIGHEST WORKLOAD LINE
  // =====================

  const lineEntries =
    Object.entries(workloadByLine);

  let highestLine = null;
  let highestMinutes = 0;

  lineEntries.forEach(([line, minutes]) => {

    if (minutes > highestMinutes) {
      highestLine = line;
      highestMinutes = minutes;
    }

  });


  // =====================
  // FORMAT DURATION
  // =====================

  const formatBriefDuration = minutes => {

    const total =
      Math.round(Number(minutes) || 0);

    if (total <= 0) return "—";

    const hours =
      Math.floor(total / 60);

    const mins =
      total % 60;

    if (hours && mins) {
      return `${hours}h ${mins}m`;
    }

    if (hours) {
      return `${hours}h`;
    }

    return `${mins}m`;
  };


  // =====================
  // BUILD CONTENT
  // =====================

  let html = `
    <div class="daily-brief-main-message">

      <strong>${upcoming.length}</strong>
      maintenance task${upcoming.length !== 1 ? "s" : ""}
      due in the next 7 days

      across

      <strong>${affectedAssets}</strong>
      asset${affectedAssets !== 1 ? "s" : ""}.

    </div>

    <div class="daily-brief-metrics">

      <span>
        ⏱ Estimated workload:
        <strong>${formatBriefDuration(totalMinutes)}</strong>
      </span>
  `;


  if (highestLine && highestMinutes > 0) {

    html += `
      <span>
        Highest workload:
        <strong>
          ${highestLine}
          ·
          ${formatBriefDuration(highestMinutes)}
        </strong>
      </span>
    `;
  }


  html += `
    </div>
  `;

  content.innerHTML = html;
}
/* =====================================================
   DAILY BRIEF
   CRITICAL ATTENTION
===================================================== */

function buildDailyBriefCritical() {

  const content =
    document.getElementById("dailyBriefCriticalContent");

  const countEl =
    document.getElementById("dailyBriefCriticalCount");

  if (!content || !countEl) return;

  const tasks =
    Array.isArray(state.tasksData)
      ? state.tasksData
      : [];

  const assets =
    Array.isArray(state.assetsData)
      ? state.assetsData
      : [];


  // =====================
  // TODAY
  // =====================

  const today = new Date();
  today.setHours(0, 0, 0, 0);


  // =====================
  // IDLE ASSETS
  // =====================

  const idleAssetIds = new Set(
    assets
      .filter(a => a.idle_since)
      .map(a => String(a.id))
  );


  // =====================
  // CRITICAL RULE
  // Overdue >= 7 days
  // =====================

  const criticalTasks = tasks
    .map(t => {

      if (!t.due_date) return null;

      if (t.status === "Done") return null;

      // Ignore idle assets
      if (
        idleAssetIds.has(
          String(t.asset_id)
        )
      ) {
        return null;
      }

      const due = new Date(t.due_date);

      if (Number.isNaN(due.getTime())) {
        return null;
      }

      due.setHours(0, 0, 0, 0);

      // Not overdue
      if (due >= today) {
        return null;
      }

      const overdueDays =
        Math.floor(
          (today - due) /
          (24 * 60 * 60 * 1000)
        );

      // Critical threshold
      if (overdueDays < 7) {
        return null;
      }

      return {
        ...t,
        overdueDays
      };

    })
    .filter(Boolean);


  // =====================
  // COUNT
  // =====================

  countEl.textContent =
    criticalTasks.length;


  // =====================
  // NO CRITICAL ITEMS
  // =====================

  if (criticalTasks.length === 0) {

    content.innerHTML = `
      <span class="daily-brief-good">
        ✓ No critical overdue maintenance items.
      </span>
    `;

    return;
  }


  // =====================
  // SORT
  // Worst overdue first
  // =====================

  criticalTasks.sort(
    (a, b) =>
      b.overdueDays - a.overdueDays
  );


  // =====================
  // AFFECTED ASSETS
  // =====================

  const affectedAssets =
    new Set(
      criticalTasks.map(t =>
        String(t.asset_id)
      )
    ).size;


  // =====================
  // AFFECTED LINES
  // =====================

  const affectedLines =
    new Set(
      criticalTasks
        .map(t =>
          t.line_code ||
          t.line ||
          null
        )
        .filter(Boolean)
    ).size;


  // =====================
  // OLDEST OVERDUE
  // =====================

  const worstTask =
    criticalTasks[0];


  // =====================
  // TOP ITEMS
  // Maximum 3
  // =====================

  const topItems =
    criticalTasks.slice(0, 3);


  let itemsHtml = "";

  topItems.forEach(t => {

    const line =
      t.line_code ||
      t.line ||
      "—";

    const machine =
      t.machine_name ||
      t.machine ||
      "Asset";

    itemsHtml += `
      <div class="daily-brief-critical-item">

        <span class="daily-brief-critical-days">
          ${t.overdueDays}d
        </span>

        <div>
          <strong>
            ${line} · ${machine}
          </strong>

          <div class="daily-brief-item-text">
            ${t.task || "Maintenance task"}
          </div>
        </div>

      </div>
    `;
  });


  // =====================
  // BUILD CONTENT
  // =====================

  content.innerHTML = `

    <div class="daily-brief-main-message">

      <strong>${criticalTasks.length}</strong>
      critical overdue
      maintenance task${criticalTasks.length !== 1 ? "s" : ""}

      across

      <strong>${affectedAssets}</strong>
      asset${affectedAssets !== 1 ? "s" : ""}

      ${
        affectedLines
          ? `on <strong>${affectedLines}</strong> line${affectedLines !== 1 ? "s" : ""}.`
          : "."
      }

    </div>


    <div class="daily-brief-critical-list">
      ${itemsHtml}
    </div>


    ${
      criticalTasks.length > 3
        ? `
          <div class="daily-brief-more">
            + ${criticalTasks.length - 3}
            more critical item${criticalTasks.length - 3 !== 1 ? "s" : ""}
          </div>
        `
        : ""
    }


    <div class="daily-brief-critical-summary">
      Oldest overdue:
      <strong>
        ${worstTask.overdueDays} days
      </strong>
    </div>

  `;
}
/* =====================================================
   DAILY BRIEF
   RELIABILITY WATCH
===================================================== */

function buildDailyBriefReliability() {

  const content =
    document.getElementById("dailyBriefReliabilityContent");

  const countEl =
    document.getElementById("dailyBriefReliabilityCount");

  if (!content || !countEl) return;

  const executions =
    Array.isArray(state.executionsData)
      ? state.executionsData
      : [];


  // =====================
  // LAST 30 DAYS
  // =====================

  const now = new Date();

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 30);
  fromDate.setHours(0, 0, 0, 0);


  // =====================
  // BREAKDOWNS ONLY
  // =====================

  const breakdowns = executions.filter(e => {

    if (!e.executed_at) return false;

    // Non-planned only
    if (e.is_planned !== false) {
      return false;
    }

    const executedAt =
      new Date(e.executed_at);

    if (Number.isNaN(executedAt.getTime())) {
      return false;
    }

    return executedAt >= fromDate &&
           executedAt <= now;
  });


  // =====================
  // GROUP BY ASSET
  // =====================

  const assetStats = {};

  breakdowns.forEach(e => {

    const machine =
      e.machine ||
      e.machine_name ||
      "Asset";

    const serial =
      e.serial_number ||
      "";

    const line =
      e.line ||
      e.line_code ||
      "—";

    /*
      Serial is normally unique.
      Machine is included as fallback.
    */
    const key =
      `${machine}||${serial}`;

    if (!assetStats[key]) {

      assetStats[key] = {
        machine,
        serial,
        line,
        breakdowns: 0,
        totalMinutes: 0,
        lastBreakdown: null
      };

    }


    const stat =
      assetStats[key];

    stat.breakdowns++;

    stat.totalMinutes +=
      Number(e.duration_min) || 0;


    const executedAt =
      new Date(e.executed_at);

    if (
      !stat.lastBreakdown ||
      executedAt > stat.lastBreakdown
    ) {
      stat.lastBreakdown =
        executedAt;
    }

  });


  // =====================
  // RELIABILITY WATCH
  // >= 2 breakdowns / 30d
  // =====================

  const watchAssets =
    Object.values(assetStats)
      .filter(stat =>
        stat.breakdowns >= 2
      )
      .sort((a, b) => {

        // More breakdowns first
        if (
          b.breakdowns !==
          a.breakdowns
        ) {
          return (
            b.breakdowns -
            a.breakdowns
          );
        }

        // Then highest service time
        return (
          b.totalMinutes -
          a.totalMinutes
        );
      });


  // Count = affected assets
  countEl.textContent =
    watchAssets.length;


  // =====================
  // NO RELIABILITY ALERT
  // =====================

  if (watchAssets.length === 0) {

    content.innerHTML = `
      <span class="daily-brief-good">
        ✓ No repeated breakdown pattern detected
        in the last 30 days.
      </span>
    `;

    return;
  }


  // =====================
  // TOTAL BREAKDOWNS
  // for watched assets
  // =====================

  const watchedBreakdowns =
    watchAssets.reduce(
      (sum, stat) =>
        sum + stat.breakdowns,
      0
    );


  // =====================
  // FORMAT DURATION
  // =====================

  const formatReliabilityDuration =
    minutes => {

      const total =
        Math.round(
          Number(minutes) || 0
        );

      if (total <= 0) {
        return "—";
      }

      const hours =
        Math.floor(total / 60);

      const mins =
        total % 60;

      if (hours && mins) {
        return `${hours}h ${mins}m`;
      }

      if (hours) {
        return `${hours}h`;
      }

      return `${mins}m`;
    };


  // =====================
  // TOP 3 ASSETS
  // =====================

  const topAssets =
    watchAssets.slice(0, 3);

  let itemsHtml = "";


  topAssets.forEach(stat => {

    itemsHtml += `
      <div class="daily-brief-reliability-item">

        <span class="daily-brief-breakdown-count">
          ${stat.breakdowns}×
        </span>

        <div class="daily-brief-reliability-info">

          <strong>
            ${stat.line} · ${stat.machine}
          </strong>

          ${
            stat.serial
              ? `
                <span class="daily-brief-reliability-sn">
                  SN: ${stat.serial}
                </span>
              `
              : ""
          }

          <div class="daily-brief-item-text">

            ${
              stat.totalMinutes > 0
                ? `
                  Service time:
                  ${formatReliabilityDuration(
                    stat.totalMinutes
                  )}
                `
                : "Repeated breakdown activity"
            }

          </div>

        </div>

      </div>
    `;
  });


  // =====================
  // BUILD CONTENT
  // =====================

  content.innerHTML = `

    <div class="daily-brief-main-message">

      <strong>${watchAssets.length}</strong>
      asset${watchAssets.length !== 1 ? "s" : ""}
      showing repeated breakdown activity

      in the last 30 days

      (<strong>${watchedBreakdowns}</strong>
      breakdown${watchedBreakdowns !== 1 ? "s" : ""}).

    </div>


    <div class="daily-brief-reliability-list">
      ${itemsHtml}
    </div>


    ${
      watchAssets.length > 3
        ? `
          <div class="daily-brief-more">
            + ${watchAssets.length - 3}
            more asset${watchAssets.length - 3 !== 1 ? "s" : ""}
            requiring attention
          </div>
        `
        : ""
    }

  `;
}
/* =====================================================
   DAILY BRIEF
   MAINTENANCE PULSE
===================================================== */

function buildDailyBriefPulse() {

  const content =
    document.getElementById("dailyBriefPulseContent");

  if (!content) return;

  const tasks =
    Array.isArray(state.tasksData)
      ? state.tasksData
      : [];

  const executions =
    Array.isArray(state.executionsData)
      ? state.executionsData
      : [];

  const assets =
    Array.isArray(state.assetsData)
      ? state.assetsData
      : [];


  // =====================
  // DATE REFERENCES
  // =====================

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const next7 = new Date(today);
  next7.setDate(next7.getDate() + 7);
  next7.setHours(23, 59, 59, 999);

  const last30 = new Date(today);
  last30.setDate(last30.getDate() - 30);


  // =====================
  // IDLE ASSETS
  // =====================

  const idleAssetIds = new Set(
    assets
      .filter(a => a.idle_since)
      .map(a => String(a.id))
  );


  // =====================
  // OPEN OVERDUE
  // Exclude idle assets
  // =====================

  const overdueCount = tasks.filter(t => {

    if (!t.due_date) return false;
    if (t.status === "Done") return false;

    if (
      idleAssetIds.has(
        String(t.asset_id)
      )
    ) {
      return false;
    }

    const due =
      new Date(t.due_date);

    if (Number.isNaN(due.getTime())) {
      return false;
    }

    due.setHours(0, 0, 0, 0);

    return due < today;

  }).length;


  // =====================
  // UPCOMING 7D WORKLOAD
  // Exclude idle assets
  // =====================

  const upcoming7 = tasks.filter(t => {

    if (!t.due_date) return false;
    if (t.status === "Done") return false;

    if (
      idleAssetIds.has(
        String(t.asset_id)
      )
    ) {
      return false;
    }

    const due =
      new Date(t.due_date);

    if (Number.isNaN(due.getTime())) {
      return false;
    }

    return due >= today && due <= next7;

  });


  const workloadMinutes =
    upcoming7.reduce(
      (sum, t) =>
        sum + (Number(t.duration_min) || 0),
      0
    );


  // =====================
  // EXECUTIONS LAST 30D
  // =====================

  const executions30 = executions.filter(e => {

    if (!e.executed_at) return false;

    const executedAt =
      new Date(e.executed_at);

    if (Number.isNaN(executedAt.getTime())) {
      return false;
    }

    return executedAt >= last30;
  });


  // =====================
  // BREAKDOWNS LAST 30D
  // =====================

  const breakdowns30 =
    executions30.filter(
      e => e.is_planned === false
    ).length;


  // =====================
  // PREVENTIVE SHARE
  // =====================

  const preventive30 =
    executions30.filter(e =>
      e.is_planned !== false &&
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ).length;


  const preventiveShare =
    executions30.length > 0
      ? Math.round(
          preventive30 /
          executions30.length *
          100
        )
      : 0;


  // =====================
  // FORMAT WORKLOAD
  // =====================

  const formatPulseDuration =
    minutes => {

      const total =
        Math.round(
          Number(minutes) || 0
        );

      if (total <= 0) return "—";

      const hours =
        Math.floor(total / 60);

      const mins =
        total % 60;

      if (hours && mins) {
        return `${hours}h ${mins}m`;
      }

      if (hours) {
        return `${hours}h`;
      }

      return `${mins}m`;
    };


  // =====================
  // BUILD CONTENT
  // =====================

  content.innerHTML = `

    <div class="daily-brief-pulse-grid">

      <div class="daily-brief-pulse-item">
        <span class="daily-brief-pulse-label">
          Open overdue
        </span>
        <strong>${overdueCount}</strong>
      </div>

      <div class="daily-brief-pulse-item">
        <span class="daily-brief-pulse-label">
          Workload next 7d
        </span>
        <strong>
          ${formatPulseDuration(workloadMinutes)}
        </strong>
      </div>

      <div class="daily-brief-pulse-item">
        <span class="daily-brief-pulse-label">
          Breakdowns 30d
        </span>
        <strong>${breakdowns30}</strong>
      </div>

      <div class="daily-brief-pulse-item">
        <span class="daily-brief-pulse-label">
          Preventive share 30d
        </span>
        <strong>${preventiveShare}%</strong>
      </div>

    </div>

  `;
}

/* =====================================================
   DAILY BRIEF
   SAFETY & QUALITY ALERT
   - Overdue Safety / Quality tasks
   - Due within next 7 days
   - IDLE assets are NOT excluded
===================================================== */

function buildDailyBriefSafetyQuality() {

  const content =
    document.getElementById("dailyBriefSafetyContent");

  const countEl =
    document.getElementById("dailyBriefSafetyCount");

  if (!content || !countEl) return;


  const tasks =
    Array.isArray(state.tasksData)
      ? state.tasksData
      : [];


  // =====================
  // DATE RANGE
  // Today → next 7 days
  // =====================

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueSoonLimit = new Date(today);
  dueSoonLimit.setDate(
    dueSoonLimit.getDate() + 7
  );
  dueSoonLimit.setHours(23, 59, 59, 999);


  // =====================
  // SAFETY / QUALITY
  // ACTIONABLE TASKS ONLY
  // =====================

  const alertTasks = tasks
    .filter(t => {

      const impact =
        String(t.impact || "normal")
          .toLowerCase();

      // Safety / Quality classification only
      if (
        ![
          "safety",
          "quality",
          "safety_quality"
        ].includes(impact)
      ) {
        return false;
      }


      // Must have due date
      if (!t.due_date) {
        return false;
      }


      const due =
        new Date(t.due_date);

      if (Number.isNaN(due.getTime())) {
        return false;
      }

      due.setHours(0, 0, 0, 0);


      // Only:
      // 1. overdue
      // 2. due today
      // 3. due within next 7 days

      return (
        due < today ||
        (
          due >= today &&
          due <= dueSoonLimit
        )
      );

    })


    // =====================
    // ADD TIMING INFO
    // =====================

    .map(t => {

      const due =
        new Date(t.due_date);

      due.setHours(0, 0, 0, 0);


      const diffDays =
        Math.round(
          (due - today) /
          (24 * 60 * 60 * 1000)
        );


      return {
        ...t,

        dueState:
          diffDays < 0
            ? "overdue"
            : "due_soon",

        dueDays:
          Math.abs(diffDays),

        dueDiff:
          diffDays
      };

    })


    // =====================
    // SORT
    // Oldest overdue first
    // then nearest upcoming
    // =====================

    .sort((a, b) =>
      new Date(a.due_date) -
      new Date(b.due_date)
    );


  // =====================
  // COUNT
  // =====================

  countEl.textContent =
    alertTasks.length;


  // =====================
  // NO ALERTS
  // =====================

  if (alertTasks.length === 0) {

    content.innerHTML = `
      <span class="daily-brief-good">
        ✓ No Safety or Quality maintenance alerts
        requiring attention.
      </span>
    `;

    return;
  }


  // =====================
  // COUNTS
  // =====================

  const overdueCount =
    alertTasks.filter(t =>
      t.dueState === "overdue"
    ).length;


  const dueSoonCount =
    alertTasks.filter(t =>
      t.dueState === "due_soon"
    ).length;


  const safetyCount =
    alertTasks.filter(t => {

      const impact =
        String(t.impact || "")
          .toLowerCase();

      return (
        impact === "safety" ||
        impact === "safety_quality"
      );

    }).length;


  const qualityCount =
    alertTasks.filter(t => {

      const impact =
        String(t.impact || "")
          .toLowerCase();

      return (
        impact === "quality" ||
        impact === "safety_quality"
      );

    }).length;


  // =====================
  // TOP 3 ITEMS
  // =====================

  const topItems =
    alertTasks.slice(0, 3);

  let itemsHtml = "";


  topItems.forEach(t => {

    const impact =
      String(t.impact || "normal")
        .toLowerCase();


    // =====================
    // IMPACT BADGE
    // =====================

    let badgeClass =
      "daily-brief-impact-quality";

    let badgeLabel =
      "QUALITY";


    if (impact === "safety") {

      badgeClass =
        "daily-brief-impact-safety";

      badgeLabel =
        "SAFETY";
    }


    if (impact === "safety_quality") {

      badgeClass =
        "daily-brief-impact-both";

      badgeLabel =
        "S + Q";
    }


    // =====================
    // TIMING BADGE
    // =====================

    let timingLabel = "";
    let timingClass = "";


    if (t.dueState === "overdue") {

      timingLabel =
        `OVERDUE ${t.dueDays}d`;

      timingClass =
        "daily-brief-impact-overdue";

    } else {

      if (t.dueDiff === 0) {

        timingLabel =
          "DUE TODAY";

      } else {

        timingLabel =
          `DUE ${t.dueDays}d`;
      }

      timingClass =
        "daily-brief-impact-due";
    }


    // =====================
    // ASSET INFO
    // =====================

    const line =
      t.line_code ||
      t.line ||
      "—";

    const machine =
      t.machine_name ||
      t.machine ||
      "Asset";


    // =====================
    // ITEM HTML
    // =====================

    itemsHtml += `

      <div class="daily-brief-safety-item">

        <span class="${badgeClass}">
          ${badgeLabel}
        </span>

        <span class="${timingClass}">
          ${timingLabel}
        </span>

        <div>

          <strong>
            ${line} · ${machine}
          </strong>

          <div class="daily-brief-item-text">
            ${t.task || "Maintenance task"}
          </div>

        </div>

      </div>

    `;
  });


  // =====================
  // BUILD CONTENT
  // =====================

  content.innerHTML = `

    <div class="daily-brief-main-message">

      <strong>${alertTasks.length}</strong>
      Safety / Quality maintenance
      item${alertTasks.length !== 1 ? "s" : ""}
      requiring attention.

    </div>


    <div class="daily-brief-metrics">

      <span>
        Overdue:
        <strong>${overdueCount}</strong>
      </span>

      <span>
        Due next 7d:
        <strong>${dueSoonCount}</strong>
      </span>

      <span>
        Safety:
        <strong>${safetyCount}</strong>
      </span>

      <span>
        Quality:
        <strong>${qualityCount}</strong>
      </span>

    </div>


    <div class="daily-brief-safety-list">
      ${itemsHtml}
    </div>


    ${
      alertTasks.length > 3
        ? `
          <div class="daily-brief-more">
            + ${alertTasks.length - 3}
            more Safety / Quality
            item${alertTasks.length - 3 !== 1 ? "s" : ""}
            requiring attention
          </div>
        `
        : ""
    }

  `;
}
/* =====================================================
   DAILY BRIEF – COLLAPSIBLE SECTIONS
===================================================== */

function initDailyBriefCollapsibleSections() {

  const sections = document.querySelectorAll(
    "#dailyBriefContent .daily-brief-section"
  );

  sections.forEach(section => {

    const header = section.querySelector(
      ".daily-brief-section-header"
    );

    const body = section.querySelector(
      ".daily-brief-section-body"
    );

    const icon = section.querySelector(
      ".daily-brief-collapse-icon"
    );

    if (!header || !body) return;

    // Prevent duplicate event listeners
    if (header.dataset.collapseReady === "true") {
      return;
    }

    header.dataset.collapseReady = "true";

    header.addEventListener("click", () => {

      const isCollapsed =
        section.classList.toggle("collapsed");

      if (icon) {
        icon.textContent = isCollapsed ? "›" : "⌄";
      }

    });
  });
}


/* =====================================================
   DAILY BRIEF – RESET SECTIONS
   All sections open when Daily Brief opens
===================================================== */

function resetDailyBriefSections() {

  document.querySelectorAll(
    "#dailyBriefContent .daily-brief-section"
  ).forEach(section => {

    section.classList.remove("collapsed");

    const icon = section.querySelector(
      ".daily-brief-collapse-icon"
    );

    if (icon) {
      icon.textContent = "⌄";
    }

  });
}
/* =====================================================
   DAILY BRIEF
   TODAY'S FOCUS
===================================================== */

function buildDailyBriefFocus() {

  const content =
    document.getElementById("dailyBriefFocusContent");

  const countEl =
    document.getElementById("dailyBriefFocusCount");

  if (!content || !countEl) return;


  // =====================
  // GET DASHBOARD PRIORITIES
  // =====================

  const assets =
    typeof getTopWorstAssetsDashboard === "function"
      ? getTopWorstAssetsDashboard(20)
      : [];


  if (!Array.isArray(assets) || assets.length === 0) {

    countEl.textContent = "0";

    content.innerHTML = `
      <span class="daily-brief-good">
        ✓ No priority maintenance items require attention today.
      </span>
    `;

    return;
  }


  // =====================
  // ENRICH WITH RISK
  // =====================

  const enriched = assets.map(a => {

    const risk =
      typeof getAssetRiskLevel === "function"
        ? getAssetRiskLevel(a)
        : {
            level: "watch",
            label: "WATCH",
            icon: "🟡"
          };

    return {
      ...a,
      _risk: risk
    };
  });


  // =====================
  // PRIORITY SORT
  // Risk first → Score second
  // =====================

  const priorityMap = {
    critical: 1,
    risk: 2,
    watch: 3,
    stable: 4
  };


  enriched.sort((a, b) => {

    const riskDiff =
      (priorityMap[a._risk.level] ?? 99) -
      (priorityMap[b._risk.level] ?? 99);

    if (riskDiff !== 0) {
      return riskDiff;
    }

    return (
      Number(b.score || 0) -
      Number(a.score || 0)
    );
  });


  // =====================
  // TOP 3 ONLY
  // =====================

  const focusItems =
    enriched.slice(0, 3);

  countEl.textContent =
    focusItems.length;


  // =====================
  // BUILD FOCUS ITEMS
  // =====================

  let itemsHtml = "";


  focusItems.forEach((a, index) => {

    const reasons = [];


    // =====================
    // SAFETY
    // =====================

    if (Number(a.safetyOverdue) > 0) {

      reasons.push(
        `🛡 ${a.safetyOverdue} Safety overdue`
      );

    } else if (Number(a.safetyDueSoon) > 0) {

      reasons.push(
        `🛡 ${a.safetyDueSoon} Safety due soon`
      );
    }


    // =====================
    // QUALITY
    // =====================

    if (Number(a.qualityOverdue) > 0) {

      reasons.push(
        `◆ ${a.qualityOverdue} Quality overdue`
      );

    } else if (Number(a.qualityDueSoon) > 0) {

      reasons.push(
        `◆ ${a.qualityDueSoon} Quality due soon`
      );
    }


    // =====================
    // GENERAL OVERDUE
    // =====================

    if (Number(a.overdue) > 0) {

      reasons.push(
        `🔴 ${a.overdue} overdue`
      );
    }


    // =====================
    // DUE SOON
    // =====================

    if (
      Number(a.dueSoon) > 0 &&
      reasons.length < 3
    ) {

      reasons.push(
        `🟠 ${a.dueSoon} due soon`
      );
    }


    // =====================
    // RECENT BREAKDOWN
    // =====================

    if (
      a.lastBreakdownDays != null &&
      Number(a.lastBreakdownDays) <= 7 &&
      reasons.length < 3
    ) {

      reasons.push(
        `⚡ Breakdown ${a.lastBreakdownDays}d ago`
      );
    }


    // =====================
    // FALLBACK
    // =====================

    if (reasons.length === 0) {

      reasons.push(
        `Priority score ${a.score || 0}`
      );
    }


    const reasonsHtml =
      reasons
        .slice(0, 3)
        .map(reason =>
          `<span class="daily-brief-focus-reason">${reason}</span>`
        )
        .join("");


    // =====================
    // ITEM
    // =====================

    itemsHtml += `

      <div class="daily-brief-focus-item">

        <div class="daily-brief-focus-rank">
          ${index + 1}
        </div>

        <div class="daily-brief-focus-main">

          <div class="daily-brief-focus-top">

            <strong>
              ${a.line} · ${a.machine}
            </strong>

            <span class="daily-brief-focus-risk ${a._risk.level}">
              ${a._risk.icon} ${a._risk.label}
            </span>

          </div>

          <div class="daily-brief-focus-sub">
            SN ${a.serial || "—"}
            • Score ${a.score || 0}
          </div>

          <div class="daily-brief-focus-reasons">
            ${reasonsHtml}
          </div>

        </div>

      </div>

    `;
  });


  // =====================
  // FINAL CONTENT
  // =====================

  content.innerHTML = `

    <div class="daily-brief-main-message">
      Highest maintenance priorities for today's meeting.
    </div>

    <div class="daily-brief-focus-list">
      ${itemsHtml}
    </div>

  `;
}

/* =====================
   EVENTS
===================== */

document
  .getElementById("openDailyBriefBtn")
  ?.addEventListener("click", openDailyBrief);

document
  .getElementById("dailyBriefOkBtn")
  ?.addEventListener("click", closeDailyBrief);

document
  .getElementById("closeDailyBriefX")
  ?.addEventListener("click", closeDailyBrief);
