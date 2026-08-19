const getEl = id => document.getElementById(id);

/* =====================
   Helpers
===================== */

function norm(v) {
  return (v ?? "").toString().trim().toUpperCase();
}

function taskLine(t) {
  return (t.line_code || "").toString().trim().toUpperCase();
}

function isPreventive(task) {
  return task.frequency_hours && Number(task.frequency_hours) > 0;
}

function isUnplanned(task) {
  return task.is_planned === false;
}

function isPlannedManual(task) {
  return (
    !isPreventive(task) &&
    !isUnplanned(task) &&
    !!task.due_date &&
    task.status !== "Done"
  );
}
/* =====================
   ASSET TASK STATS
===================== */

function getAssetTaskStats(assetId) {
  if (!Array.isArray(state.tasksData)) {
    return {
      active: 0,
      overdue: 0,
      preventiveCount: 0,
      workloadHours30d: "0.0",
      preventiveOverdue: 0
    };
  }

  let active = 0;
  let overdue = 0;

  let preventiveCount = 0;
  let preventiveOverdue = 0;

  let workloadMinutes30d = 0;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 30);

  state.tasksData.forEach(t => {
    if (t.asset_id !== assetId) return;
    if (t.status === "Done") return;

    active++;

    const dueState = getDueState(t);
    if (dueState === "overdue") {
      overdue++;
    }

    const dueDate = t.due_date ? new Date(t.due_date) : null;
    const durMin = Number(t.duration_min);

    /* =====================
       🔁 PREVENTIVE
    ===================== */
    if (isPreventive(t)) {
      preventiveCount++;

      if (dueState === "overdue") {
        preventiveOverdue++;
      }

      const freqHours = Number(t.frequency_hours);
      if (!freqHours || !durMin || !dueDate) return;

      let next = new Date(dueDate);

      while (next <= horizon) {
        if (next >= now) {
          workloadMinutes30d += durMin;
        }
        next = new Date(next.getTime() + freqHours * 60 * 60 * 1000);
      }

      return;
    }

    /* =====================
       🟨 PLANNED MANUAL
    ===================== */
    if (isPlannedManual(t)) {
      if (
        dueDate &&
        dueDate >= now &&
        dueDate <= horizon &&
        durMin > 0
      ) {
        workloadMinutes30d += durMin;
      }
    }
  });

  return {
    active,
    overdue,
    preventiveCount,
    workloadHours30d: (workloadMinutes30d / 60).toFixed(1),
    preventiveOverdue
  };
}

/* =====================
   RISK LEVEL FUNCTION
   SINGLE SOURCE OF TRUTH
===================== */

function getAssetRiskLevel(a) {

  const HIGH_LOAD = 8;   // workload threshold
  const MED_LOAD = 1;

  // Safe numeric values
  const overdue = Number(a.overdue || 0);
  const dueSoon = Number(a.dueSoon || 0);
  const manualLoad = Number(a.manualPlanned30d || 0);

  const safetyOverdue = Number(a.safetyOverdue || 0);
  const safetyDueSoon = Number(a.safetyDueSoon || 0);

  const qualityOverdue = Number(a.qualityOverdue || 0);
  const qualityDueSoon = Number(a.qualityDueSoon || 0);


  /* =====================
     🔴 CRITICAL
     Safety overdue always escalates
  ===================== */

  if (
    safetyOverdue > 0 ||

    overdue >= 6 ||

    (
      a.lastBreakdownDays != null &&
      Number(a.lastBreakdownDays) <= 2
    ) ||

    (
      overdue >= 3 &&
      a.lastBreakdownDays != null &&
      Number(a.lastBreakdownDays) <= 3
    )
  ) {
    return {
      level: "critical",
      label: "CRITICAL",
      icon: "🔴"
    };
  }


  /* =====================
     🟠 AT RISK
     Safety due soon
     Quality overdue
  ===================== */

  if (
    safetyDueSoon > 0 ||

    qualityOverdue > 0 ||

    (overdue >= 2 && overdue <= 5) ||

    manualLoad >= HIGH_LOAD ||

    dueSoon >= 4
  ) {
    return {
      level: "risk",
      label: "AT RISK",
      icon: "🟠"
    };
  }


  /* =====================
     🟡 WATCH
     Quality due soon
  ===================== */

  if (
    qualityDueSoon > 0 ||

    overdue === 1 ||

    (dueSoon >= 1 && dueSoon <= 3) ||

    (
      manualLoad >= MED_LOAD &&
      manualLoad < HIGH_LOAD
    )
  ) {
    return {
      level: "watch",
      label: "WATCH",
      icon: "🟡"
    };
  }


  /* =====================
     🟢 STABLE
  ===================== */

  return {
    level: "stable",
    label: "STABLE",
    icon: "🟢"
  };
}
/* =====================
   RISK PRIORITY
===================== */

const RISK_PRIORITY = {
  critical: 1,
  risk: 2,
  watch: 3,
  stable: 4
};


/* =====================
    DUE STATE
===================== */

function diffDays(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function getDueState(t) {
  if (t.status === "Done") return "done";
  if (!t.due_date) return "unknown";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);

  const d = diffDays(today, due);

  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";

  return "ok";
}

/* =====================
   ROLE HELPERS
===================== */
function hasRole(...roles) {
  return roles.includes(window.currentUserRole);
}

/* =====================
    SEARCH HIGHLIGHT
===================== */

function highlight(text, q) {
  if (!q) return text || "";
  if (!text) return "";

  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
  const regex = new RegExp(`(${safeQ})`, "gi");

  return text.toString().replace(
    regex,
    `<span class="search-highlight">$1</span>`
  );
}
// =====================
// MTBF CALCULATION (FRONTEND ONLY)
// =====================

function calculateMtbfMinutes(breakdownExecutions) {
  if (!Array.isArray(breakdownExecutions) || breakdownExecutions.length < 2) {
    return null; // MTBF not applicable
  }

  // sort by execution date ASC
  const sorted = [...breakdownExecutions].sort(
    (a, b) => new Date(a.executed_at) - new Date(b.executed_at)
  );

  let totalDiffMin = 0;
  let intervals = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].executed_at);
    const curr = new Date(sorted[i].executed_at);

    const diffMin = (curr - prev) / 60000;
    if (diffMin > 0) {
      totalDiffMin += diffMin;
      intervals++;
    }
  }

  if (intervals === 0) return null;

  return Math.round(totalDiffMin / intervals);
}

// =====================
// LAST BREAKDOWN DATE
// =====================
function getLastBreakdownDate(breakdowns) {
  if (!Array.isArray(breakdowns) || breakdowns.length === 0) {
    return null;
  }

  const last = breakdowns.reduce((latest, e) => {
    return new Date(e.executed_at) > new Date(latest.executed_at)
      ? e
      : latest;
  });

  return last.executed_at;
}
// =====================
// SAFE EXECUTION DURATION (minutes)
// =====================
function getExecutionDurationMin(exec) {
  if (!exec) return null;

  const n = Number(exec.duration_min);
  return Number.isFinite(n) && n > 0 ? n : null;
}


// =====================
// SEARCH MATCHING
// =====================

function matchesSearch(task, q) {
  if (!q) return true;
  const s = q.toLowerCase();

  return (
    (task.task || "").toLowerCase().includes(s) ||
    (task.machine_name || "").toLowerCase().includes(s) ||
    (task.serial_number || "").toLowerCase().includes(s) ||
    (task.section || "").toLowerCase().includes(s) ||
    (task.unit || "").toLowerCase().includes(s)
  );
}
/* =====================
   GLOBAL ERROR HANDLING
===================== */

window.addEventListener("error", e => {
  console.error(
    "GLOBAL ERROR:",
    e.message,
    "at",
    `${e.filename}:${e.lineno}:${e.colno}`
  );
});

window.addEventListener("unhandledrejection", e => {
  console.error("UNHANDLED PROMISE REJECTION:", e.reason);
});

/* =====================
    ACTIVITY BADGE
===================== */

function getLastActivityBadge(executions, serial) {
  if (!Array.isArray(executions)) {
    return { label: "—", className: "activity-none" };
  }

  const last = executions
    .filter(e => e.serial_number === serial)
    .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at))[0];

  if (!last) {
    return { label: "—", className: "activity-none" };
  }

  const date = new Date(last.executed_at).toLocaleDateString("el-GR");

  // 🔑 classification
  if (last.is_planned === false) {
    return {
      label: `Breakdown • ${date}`,
      className: "activity-breakdown"
    };
  }

  if (last.is_planned === true && last.frequency_hours) {
    return {
      label: `Preventive • ${date}`,
      className: "activity-preventive"
    };
  }

  return {
    label: `Planned • ${date}`,
    className: "activity-planned"
  };
}
// =====================
// GLOBAL LINES CACHE
// =====================
let linesData = null;

async function loadLinesOnce() {
  if (Array.isArray(linesData) && linesData.length > 0) {
    return linesData;
  }

  const res = await fetch(`${API}/lines`);
  if (!res.ok) throw new Error("Failed to load lines");

  linesData = await res.json();
  return linesData;
}


function getVal(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setPreventiveError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  field.classList.add("field-error");

  let msg = field.parentElement.querySelector(".field-error-msg");
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "field-error-msg";
    field.parentElement.appendChild(msg);
  }

  msg.textContent = message;
}

function clearPreventiveErrors() {
  document
    .querySelectorAll(".field-error")
    .forEach(el => el.classList.remove("field-error"));

  document
    .querySelectorAll(".field-error-msg")
    .forEach(el => el.remove());
}
async function refreshSystemState() {
  await Promise.all([
    loadAssets(),
    loadTasks()
  ]);

  renderAssetsCards();

  // Αν υπάρχει active asset view, κάνε proper refresh
  if (state.currentAssetSerial) {
    await refreshAssetView();
  }

  if (typeof renderHistoryTable === "function") {
    renderHistoryTable();
  }
}

/* =====================
   TASK TYPE SUGGESTION
===================== */

function suggestTaskTypeFromText(text) {
  const q = String(text || "").toLowerCase();

  if (!q.trim()) return "";

  if (q.includes("ελεγχ") || q.includes("έλεγχ") || q.includes("check") || q.includes("inspection")) {
    return "ΕΛΕΓΧΟΣ";
  }

  if (q.includes("επισκευ") || q.includes("repair") || q.includes("fix")) {
    return "ΕΠΙΣΚΕΥΗ";
  }

  if (q.includes("λιπαν") || q.includes("γρασαρ") || q.includes("lubric")) {
    return "ΛΙΠΑΝΣΗ";
  }

  if (q.includes("καθαρισ") || q.includes("clean")) {
    return "ΚΑΘΑΡΙΣΜΟΣ";
  }

  if (q.includes("ρυθμισ") || q.includes("adjust")) {
    return "ΡΥΘΜΙΣΗ";
  }

  if (q.includes("αντικαταστ") || q.includes("replace") || q.includes("replacement")) {
    return "ΑΝΤΙΚΑΤΑΣΤΑΣΗ";
  }

  return "";
}
/* =====================================================
   IMPACT CLASSIFICATION HELPERS
   -----------------------------------------------------
   Shared helpers for maintenance task impact logic.

   Supported values:
   - normal
   - safety
   - quality
   - safety_quality

   These helpers are intentionally UI-agnostic so they
   can be reused by:
   - Tasks
   - History
   - Preventive Library
   - Dashboard
   - Daily Brief
===================================================== */


/* =====================
   NORMALIZE IMPACT
===================== */

function normalizeImpact(value) {
  const impact =
    String(value || "normal")
      .trim()
      .toLowerCase();

  const validImpacts = [
    "normal",
    "safety",
    "quality",
    "safety_quality"
  ];

  return validImpacts.includes(impact)
    ? impact
    : "normal";
}


/* =====================
   SAFETY IMPACT CHECK
===================== */

function hasSafetyImpact(item) {
  const impact =
    normalizeImpact(item?.impact);

  return (
    impact === "safety" ||
    impact === "safety_quality"
  );
}


/* =====================
   QUALITY IMPACT CHECK
===================== */

function hasQualityImpact(item) {
  const impact =
    normalizeImpact(item?.impact);

  return (
    impact === "quality" ||
    impact === "safety_quality"
  );
}


/* =====================
   IMPACT LABEL
===================== */

function getImpactLabel(value) {
  const impact =
    normalizeImpact(value);

  if (impact === "safety") {
    return "SAFETY";
  }

  if (impact === "quality") {
    return "QUALITY";
  }

  if (impact === "safety_quality") {
    return "S + Q";
  }

  return "";
}


/* =====================
   IMPACT BADGE CLASS
===================== */

function getImpactBadgeClass(value) {
  const impact =
    normalizeImpact(value);

  if (impact === "safety") {
    return "task-impact-safety";
  }

  if (impact === "quality") {
    return "task-impact-quality";
  }

  if (impact === "safety_quality") {
    return "task-impact-safety_quality";
  }

  return "";
}


/* =====================
   HAS SPECIAL IMPACT
   Normal = false
===================== */

function hasSpecialImpact(item) {
  return normalizeImpact(item?.impact) !== "normal";
}
/* =====================================================
   DURATION FORMATTER
   -----------------------------------------------------
   Converts minutes into a compact human-readable label.

   Examples:
   45  → "45m"
   60  → "1h"
   90  → "1h 30m"
   0   → "—"
===================================================== */

function formatDurationMinutes(minutes) {

  const total =
    Math.round(Number(minutes) || 0);

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
}
/* =====================================================
   MAINTENANCE TYPE LABEL
   -----------------------------------------------------
   Returns a consistent human-readable classification
   for task / work order type across the CMMS.
===================================================== */

function getMaintenanceTypeLabel(task) {

  if (isPreventive(task)) {
    return "Preventive (Scheduled)";
  }

  if (isPlannedManual(task)) {
    return "Planned (Manual)";
  }

  return "Unplanned / Breakdown";
}


/* =====================================================
   IMPACT BADGE RENDERER
   -----------------------------------------------------
   Returns reusable HTML for Safety / Quality impact.

   Normal impact intentionally returns no badge.

   Uses:
   - normalizeImpact()
   - getImpactLabel()
   - getImpactBadgeClass()
===================================================== */

function renderImpactBadge(impact) {

  const normalized =
    normalizeImpact(impact);

  if (normalized === "normal") {
    return "";
  }

  return `
    <div class="task-impact-wrap">
      <span
        class="task-impact-badge ${getImpactBadgeClass(normalized)}"
      >
        ${getImpactLabel(normalized)}
      </span>
    </div>
  `;
}