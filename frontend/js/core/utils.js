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
