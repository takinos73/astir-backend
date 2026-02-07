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
  if (!Array.isArray(tasksData)) {
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

  tasksData.forEach(t => {
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
  ===================== */
  
 function getAssetRiskLevel(a) {
  const HIGH_LOAD = 8;   // hours / next 30d
  const MED_LOAD = 1;

  // 🔴 CRITICAL — true alarm only
  if (
    a.overdue >= 5 ||
    (a.lastBreakdownDays != null && a.lastBreakdownDays <= 2) ||
    (a.overdue >= 3 && a.lastBreakdownDays != null && a.lastBreakdownDays <= 5)
  ) {
    return { level: "critical", label: "CRITICAL", icon: "🔴" };
  }

  // 🟠 AT RISK — pressure building
  if (
    (a.overdue >= 2 && a.overdue <= 4) ||
    a.manualPlanned30d >= HIGH_LOAD ||
    a.dueSoon >= 4
  ) {
    return { level: "risk", label: "AT RISK", icon: "🟠" };
  }

  // 🟡 WATCH — light signal
  if (
    a.overdue === 1 ||
    (a.dueSoon >= 1 && a.dueSoon <= 3) ||
    (a.manualPlanned30d >= MED_LOAD && a.manualPlanned30d < HIGH_LOAD)
  ) {
    return { level: "watch", label: "WATCH", icon: "🟡" };
  }

  // 🟢 STABLE
  return { level: "stable", label: "STABLE", icon: "🟢" };
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
  return roles.includes(CURRENT_USER.role);
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



