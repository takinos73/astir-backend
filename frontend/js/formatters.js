/* =====================
   DURATION FORMATTER
   min -> "xh ym" | "xh" | "ym" | "-"
===================== */
function formatDuration(min) {
  if (min == null || isNaN(min)) return "-";// single source of truth for estimated duration formatting

  const total = Number(min);
  if (total <= 0) return "-";

  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`; 
}
/* =====================
   DATE TIME FORMATTER
===================== */
function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("el-GR");
}
/* =====================
   DATE ONLY FORMATTER
===================== */
function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("el-GR");
}