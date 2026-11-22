async function printPreventivePackageVisit(visitId) {
  try {
    const [visitResponse, attachmentResponse] = await Promise.all([
      fetch("/preventive-package-visits/" + encodeURIComponent(visitId), { cache: "no-store" }),
      fetch("/attachments/PREVENTIVE_VISIT/" + encodeURIComponent(visitId), { cache: "no-store" })
    ]);
    if (!visitResponse.ok || !attachmentResponse.ok) throw new Error("Could not load all visit report data.");
    const [{ visit }, { attachments }] = await Promise.all([visitResponse.json(), attachmentResponse.json()]);
    if (!visit || !Array.isArray(visit.tasks) || !Array.isArray(attachments)) throw new Error("Invalid visit report data.");
    openPreventiveVisitPrintFrame(buildPreventiveVisitReport(visit, attachments));
  } catch (error) {
    alert(error.message || "Unable to print the preventive package visit.");
  }
}

function buildPreventiveVisitReport(visit, attachments) {

  const report = document.createElement("main");
  report.className = "report";

  const add = (parent, tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const date = value => {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString("en-GB", { timeZone: "Europe/Athens", hour12: false })
      : "—";
  };

  const minutes = value => {
    const hours = Math.floor(value / 60), remainder = value % 60;
    return (hours ? hours + " h " : "") + remainder.toLocaleString("en-GB") + " min";
  };

  const size = value => Number(value || 0) < 1048576
    ? (Number(value || 0) / 1024).toFixed(1) + " KB"
    : (Number(value) / 1048576).toFixed(1) + " MB";
    
  const code = "PP" + String(visit.package_id).padStart(4, "0");
  const header = add(report, "header", "report-header");
  const brand = add(header, "div");
  const brandName = add(brand, "div", "brand", "ASTIR ");
  add(brandName, "span", "", "CMMS");
  add(brand, "div", "brand-sub", "MAINTENANCE MANAGEMENT SYSTEM");
  const metadata = add(header, "div", "report-meta");
  add(metadata, "strong", "", "PREVENTIVE PACKAGE VISIT REPORT");
  add(metadata, "div", "", "Maintenance Detail");
  add(metadata, "div", "", "Printed: " + date(new Date()));
  const heading = add(report, "div", "visit-heading");
  add(heading, "span", "visit-code", code);
  add(heading, "span", "status" + (visit.closed_at ? " closed" : ""), visit.closed_at ? "CLOSED" : "ACTIVE");
  add(report, "div", "asset-line", [
    visit.asset_model || "—", "S/N " + (visit.serial_number || "—"), visit.asset_line
  ].filter(Boolean).join(" • "));
  const titleCard = add(report, "div", "card title-card");
  add(titleCard, "div", "label", "Maintenance title");
  add(titleCard, "div", "value value-large", visit.title);
  add(titleCard, "div", "label visit-reference-label", "Visit reference");
  add(titleCard, "div", "value", "Visit #" + visit.id + " • Cycle " + (visit.cycle_due_date || "—"));
  const card = (parent, label, value) => {
    const item = add(parent, "div", "card");
    add(item, "div", "label", label); add(item, "div", "value", value);
  };
  const schedule = add(report, "div", "grid");
  card(schedule, "Cycle date", (visit.cycle_due_date || "").split("-").reverse().join("/") || "—");
  card(schedule, "Interval", "Every " + visit.interval_months + (visit.interval_months === 1 ? " month" : " months"));
  card(schedule, "Scheduled start", date(visit.scheduled_start_at));
  card(schedule, "Scheduled end", date(visit.scheduled_end_at));
  const completed = visit.tasks.filter(task => task.status === "Done");
  const completionDates = completed.filter(task => task.executed_at).map(task => new Date(task.executed_at)).filter(value => Number.isFinite(value.getTime()));
  const closure = add(report, "div", "grid grid-two");
  card(closure, "Last recorded task completion", completionDates.length ? date(new Date(Math.max(...completionDates))) : "—");
  card(closure, "Visit closed at", date(visit.closed_at));
  const recorded = completed.filter(task => task.actual_duration_min != null && Number.isFinite(Number(task.actual_duration_min)));
  const total = recorded.reduce((sum, task) => sum + Number(task.actual_duration_min), 0);
  const summary = add(report, "div", "summary");
  card(summary, "Linked tasks", String(visit.tasks.length));
  card(summary, "Completed tasks", String(completed.length));
  card(summary, "Total recorded actual work", completed.length && !recorded.length ? "—" : minutes(total));
  if (recorded.length < completed.length) {
    add(report, "p", "report-note", "Actual duration recorded for " + recorded.length + " of " + completed.length + " completed tasks.");
  }
  add(report, "h2", "section-title", "Maintenance tasks");
  const table = add(report, "table");
  const headerRow = table.createTHead().insertRow();
  for (const label of ["ID", "Task / Location", "Status", "Planned schedule", "Completed", "Technician", "Actual work"]) add(headerRow, "th", "", label);
  const body = table.createTBody();
  for (const task of visit.tasks) {
    const row = body.insertRow();
    add(row, "td", "task-id", "#" + task.id);
    const taskCell = add(row, "td", "task-description", task.task);
    const location = [task.section, task.unit].filter(Boolean).join(" / ");
    if (location) add(taskCell, "small", "", location);
    if (task.notes) add(taskCell, "small", "task-notes", "Notes: " + task.notes);
    if (["safety", "quality", "safety_quality"].includes(task.impact)) add(taskCell, "small", "", task.impact === "safety_quality" ? "SAFETY + QUALITY" : task.impact.toUpperCase());
    add(row, "td", "", String(task.status || "—").toUpperCase());
    const planned = add(row, "td", "", date(task.planned_start_at));
    add(planned, "small", "", "to " + date(task.due_date));
    add(row, "td", "", task.status === "Done" ? date(task.executed_at) : "—");
    add(row, "td", "", task.status === "Done" ? task.executed_by || "—" : "—");
    const actual = task.status === "Done" && task.actual_duration_min != null
      ? minutes(Number(task.actual_duration_min)) : "—";
    const duration = add(row, "td", "", actual);
    if (task.duration_min != null) add(duration, "small", "", "Est. " + minutes(Number(task.duration_min)));
  }
  add(report, "h2", "section-title", "Maintenance attachments");
  if (!attachments.length) add(report, "p", "report-note", "No maintenance attachments.");
  else {
    const fileTable = add(report, "table");
    const fileHead = fileTable.createTHead().insertRow();
    for (const label of ["File", "Size", "Uploaded by", "Uploaded on"]) add(fileHead, "th", "", label);
    const fileBody = fileTable.createTBody();
    for (const file of attachments) {
      const row = fileBody.insertRow();
      for (const text of [file.file_name, size(file.file_size), file.uploaded_by || "—", date(file.uploaded_at)]) add(row, "td", "", text);
    }
  }
  const footer = add(report, "footer", "footer");
  add(footer, "span", "", "ASTIR S.A. | CMMS");
  add(footer, "span", "", code + " • Visit #" + visit.id);
  const style = document.createElement("style");
  style.textContent = PREVENTIVE_VISIT_REPORT_CSS;
  return style.outerHTML + report.outerHTML;
}

function openPreventiveVisitPrintFrame(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;";
  frame.addEventListener("load", () => {
    const win = frame.contentWindow;
    const cleanup = () => { clearTimeout(fallback); frame.remove(); };
    const fallback = setTimeout(cleanup, 60000);
    win.addEventListener("afterprint", cleanup, { once: true });
    try { win.focus(); win.print(); } catch (error) { cleanup(); alert("Unable to open the print dialog."); }
  }, { once: true });
  frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><title>Preventive Package Visit Report</title></head><body>" + html + "</body></html>";
  document.body.appendChild(frame);
}

const PREVENTIVE_VISIT_REPORT_CSS = `
@page { size:A4 portrait; margin:8mm 10mm; }
* { box-sizing:border-box; }
body { margin:0; font:10px Arial,Helvetica,sans-serif; color:#172033; background:#fff; }
.report { width:100%; }
.report-header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:8px; margin-bottom:10px; border-bottom:2px solid #d6dde8; }
.brand { font-size:21px; font-weight:800; color:#17233c; }
.brand span { color:#2588e8; }
.brand-sub { margin-top:2px; font-size:7px; font-weight:700; letter-spacing:.7px; color:#65738a; }
.report-meta { text-align:right; font-size:8px; line-height:1.4; color:#59677d; }
.report-meta strong { display:block; margin-bottom:1px; font-size:11px; color:#21304c; }
.visit-heading { display:flex; align-items:center; gap:9px; margin-bottom:2px; }
.visit-code { font-size:19px; font-weight:800; }
.status { display:inline-flex; padding:3px 12px; border-radius:20px; font-size:8px; font-weight:700; color:#fff; background:#2588e8; }
.status.closed { background:#169c55; }
.asset-line { margin-bottom:9px; font-size:12px; font-weight:600; color:#28354c; }
.grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-bottom:7px; }
.grid-two { grid-template-columns:repeat(2,minmax(0,1fr)); }
.card { padding:7px 8px; border:1px solid #d5dde8; border-radius:5px; background:#fbfcfe; break-inside:avoid; }
.title-card { margin-bottom:7px; }
.label { margin-bottom:3px; font-size:7px; font-weight:700; text-transform:uppercase; color:#63728b; }
.visit-reference-label { margin-top:8px; }
.value { font-size:10px; font-weight:600; line-height:1.3; overflow-wrap:anywhere; }
.value-large { font-size:11px; font-weight:700; }
.summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-bottom:8px; }
.section-title { margin:9px 0 5px; padding-bottom:4px; border-bottom:1px solid #d8e0ea; font-size:10px; font-weight:800; text-transform:uppercase; color:#263651; }
table { width:100%; border-collapse:collapse; font-size:8px; break-inside:auto; }
thead { display:table-header-group; }
tr { break-inside:avoid; page-break-inside:avoid; }
th { padding:5px 6px; text-align:left; background:#eef2f7; border:1px solid #d6dee9; color:#34425a; }
td { padding:5px 6px; border:1px solid #dfe5ed; vertical-align:top; overflow-wrap:anywhere; }
small { display:block; margin-top:3px; font-size:7px; color:#63728b; }
.task-description { width:29%; }
.task-id { white-space:nowrap; }
.task-notes { white-space:pre-line; }
.report-note { font-size:8px; color:#63728b; }
.footer { display:flex; justify-content:space-between; margin-top:10px; padding-top:5px; border-top:1px solid #cbd4df; font-size:7px; color:#67758a; }
@media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } .report-header,.visit-heading,.card,.section-title { break-inside:avoid; page-break-inside:avoid; } }
`;
