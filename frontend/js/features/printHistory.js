function copyHistoryPrintContent(source, target) {
  const allowed = new Set(["DIV", "SPAN", "SMALL", "STRONG", "BR", "MARK"]);
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.textContent)); continue; }
    if (node.nodeType !== Node.ELEMENT_NODE || ["INPUT", "SELECT", "TEXTAREA", "SCRIPT", "STYLE"].includes(node.tagName)) continue;
    const element = document.createElement(allowed.has(node.tagName) ? node.tagName.toLowerCase() : "span");
    if (node.classList.contains("history-breakdown-reference")) element.className = "history-print-badge history-print-bd";
    if (node.classList.contains("history-sm-reference")) element.className = "history-print-badge history-print-sm";
    if (node.classList.contains("preventive-pack-badge")) element.className = "history-print-badge history-print-pp";
    copyHistoryPrintContent(node, element);
    target.appendChild(element);
  }
}

function buildFilteredHistoryPrint() {
  const sourceRows = [...document.querySelectorAll("#historyTable tbody > tr")]
    .filter(row => row.cells.length === 5 && row.dataset.historyPrintExecutions && !row.hidden &&
      getComputedStyle(row).display !== "none");
  if (!sourceRows.length) return null;
  const page = document.createElement("div");
  page.id = "executedHistoryPrint";
  const style = document.createElement("style");
  style.textContent = `
    @page { size: A4 landscape; margin: 12mm; }
    body { padding: 0; font-family: Arial, sans-serif; color: #111; background: white; }
    #executedHistoryPrint { font: 10px/1.4 Arial, sans-serif; }
    #executedHistoryPrint h2 { font-size: 20px; margin: 0 0 8px; }
    #executedHistoryPrint .history-print-meta { font-size: 10px; margin: 0 0 12px; }
    #executedHistoryPrint .history-print-meta div { margin: 1px 0; }
    #executedHistoryPrint table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    #executedHistoryPrint thead { display: table-header-group; }
    #executedHistoryPrint th { background: #eee; font-weight: bold; }
    #executedHistoryPrint th, #executedHistoryPrint td { padding: 6px 7px; border: 1px solid #aaa; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    #executedHistoryPrint tbody tr { break-inside: avoid; page-break-inside: avoid; }
    #executedHistoryPrint td:last-child, #executedHistoryPrint th:last-child { text-align: right; }
    #executedHistoryPrint small { display: inline-block; color: #444; font-size: 9px; margin-top: 3px; }
    #executedHistoryPrint mark { background: transparent; color: inherit; font-weight: bold; }
    #executedHistoryPrint .history-print-badge { display: inline-block; padding: 1px 4px; margin-right: 5px; border: 1px solid #777; border-radius: 3px; font-weight: bold; }
    #executedHistoryPrint .history-print-bd { color: #9b2534; border-color: #b9747b; }
    #executedHistoryPrint .history-print-sm { color: #705000; border-color: #b49b54; }
    #executedHistoryPrint .history-print-pp { color: #28527d; border-color: #7097bc; }
    #executedHistoryPrint .history-print-note { display: block; white-space: pre-line; }
    #executedHistoryPrint .history-print-summary { margin-top: 10px; font-weight: bold; }
  `;
  const heading = document.createElement("h2");
  heading.textContent = "Executed Tasks History";
  const meta = document.createElement("div");
  meta.className = "history-print-meta";
  const selectedLabel = id => {
    const select = document.getElementById(id);
    return select?.selectedOptions[0]?.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim() || "All";
  };
  const date = value => new Date(value).toLocaleDateString("en-GB");
  let period = selectedLabel("historyDateFilter");
  if (state.historyDateFrom || state.historyDateTo) {
    period = (state.historyDateFrom ? date(state.historyDateFrom) : "Beginning") + " – " +
      (state.historyDateTo ? date(state.historyDateTo) : "Present");
  }
  const printed = new Date().toLocaleString("en-GB", { timeZone: "Europe/Athens", hour12: false });
  for (const [label, value] of [
    ["Printed on", printed], ["Period", period], ["Type", selectedLabel("historyTypeFilter")],
    ["Technician", selectedLabel("historyTechnicianSearch")],
    ["Search", document.getElementById("historyMachineSearch")?.value.trim() || "—"]
  ]) {
    const line = document.createElement("div");
    line.textContent = label + ": " + value;
    meta.appendChild(line);
  }
  const table = document.createElement("table");
  const colgroup = document.createElement("colgroup");
  for (const width of ["9%", "21%", "43%", "17%", "10%"]) {
    const col = document.createElement("col"); col.style.width = width; colgroup.appendChild(col);
  }
  table.appendChild(colgroup);
  const header = table.createTHead().insertRow();
  for (const label of ["Date", "Asset / Serial No. / Line", "Task / Incident", "Technician", "Duration (min)"]) {
    const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; header.appendChild(cell);
  }
  const body = table.createTBody();
  let totalMinutes = 0;
  for (const source of sourceRows) {
    const row = body.insertRow();
    for (let index = 0; index < 4; index++) copyHistoryPrintContent(source.cells[index], row.insertCell());
    if (source.dataset.historyPrintTasks !== undefined) {
      const detail = row.cells[2].querySelector("small");
      if (detail) detail.textContent = source.dataset.historyPrintTasks + " tasks · " +
        Number(source.dataset.historyPrintDuration || 0).toLocaleString("en-GB") + " min total";
    }
    if (source.dataset.historyPrintNotes) {
      const note = document.createElement("small"); note.className = "history-print-note";
      note.textContent = "Notes: " + source.dataset.historyPrintNotes; row.cells[2].appendChild(note);
    }
    const duration = Number(source.dataset.historyPrintDuration);
    const hasDuration = source.dataset.historyPrintDuration !== undefined && Number.isFinite(duration);
    row.insertCell().textContent = hasDuration ? duration.toLocaleString("en-GB") : "—";
    if (hasDuration) totalMinutes += duration;
  }
  const rounded = Math.round(totalMinutes);
  const summary = document.createElement("p");
  summary.className = "history-print-summary";
  summary.textContent = "Displayed rows: " + sourceRows.length + " • Total recorded time: " +
    Math.floor(rounded / 60) + "h " + (rounded % 60) + "m (" +
    totalMinutes.toLocaleString("en-GB") + " min)";
  const brand = document.createElement("p");
  brand.textContent = "ASTIR CMMS";
  page.append(style, heading, brand, meta, table, summary);
  return page.outerHTML;
}

function printFilteredHistory() {
  const html = buildFilteredHistoryPrint();
  if (!html) { alert("No history rows match the selected filters."); return; }
  printHistoryHtml(html);
}

function printHistoryHtml(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;";
  frame.addEventListener("load", () => {
    const win = frame.contentWindow;
    const cleanup = () => { clearTimeout(fallback); frame.remove(); };
    const fallback = setTimeout(cleanup, 60000);
    win.addEventListener("afterprint", cleanup, { once: true });
    try {
      win.focus();
      win.print();
    } catch (error) {
      cleanup();
      alert("Could not open the print dialog.");
    }
  }, { once: true });
  frame.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><title>Executed Tasks History</title></head><body>" + html + "</body></html>";
  document.body.appendChild(frame);
}

document.getElementById("printHistoryTableBtn")?.addEventListener("click", printFilteredHistory);
