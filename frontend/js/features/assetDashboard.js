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

  const assets = getTopWorstAssetsDashboard();

  if (!assets || assets.length === 0) {
    container.innerHTML = `<div>No assets require attention 🎉</div>`;
    return;
  }

  container.innerHTML = assets.map(a => `
    <div class="asset-card">
      <div class="asset-line">LINE ${a.line}</div>

      <div class="asset-title">
        ${a.machine} <span class="sn">SN ${a.serial}</span>
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
          ${a.lastBreakdownDays != null ? `${a.lastBreakdownDays} days ago` : "—"}
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
  `).join("");
};

