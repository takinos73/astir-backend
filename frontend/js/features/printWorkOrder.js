// =====================
// PRINT WORK ORDER (CURRENT VIEWED TASK)
// =====================

function printCurrentTask() {
  if (!currentViewedTask) return;

  const t = currentViewedTask;

  const safe = (v) => (v == null || v === "" ? "-" : String(v));
  const fmtDate = (d) => (d ? formatDate(d) : "-");

  const maintenanceType =
    isPreventive(t) ? "Preventive (Scheduled)" :
    isPlannedManual(t) ? "Planned (Manual)" :
    "Unplanned / Breakdown";

  // NOTE: Αν θες να τυπώνεται Ο,ΤΙ βλέπει ο χρήστης, μπορείς να πάρεις και innerHTML από taskViewContent,
  // αλλά αυτό είναι πιο "clean" / professional template (stable).

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Work Order #${safe(t.id)}</title>
  <style>
    /* --- PRINT THEME (professional, printable) --- */
    @page { size: A4; margin: 14mm; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .sheet { max-width: 780px; margin: 0 auto; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #111;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .brand {
      font-size: 11px;
      letter-spacing: .12em;
      text-transform: uppercase;
      opacity: .8;
    }
    .title {
      font-size: 18px;
      font-weight: 750;
      margin-top: 2px;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      line-height: 1.5;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #111;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 650;
      margin-top: 6px;
    }

    .grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 6px 14px;
      font-size: 12px;
      margin: 12px 0 14px;
    }
    .k { color: #333; font-weight: 650; }
    .v { color: #111; }

    .section {
      margin-top: 12px;
      border: 1px solid #111;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .section h3 {
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .text {
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .sign {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }
    .box {
      border: 1px dashed #333;
      border-radius: 10px;
      padding: 10px 12px;
      min-height: 70px;
      font-size: 12px;
    }
    .box strong { display:block; margin-bottom: 6px; }

    .footer {
      margin-top: 12px;
      font-size: 11px;
      opacity: .8;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    /* hide buttons/links if any */
    button, a { display: none !important; }
  </style>
</head>
<body>
  <div class="sheet">

    <div class="top">
      <div>
        <div class="brand">ASTIR CMMS • WORK ORDER</div>
        <div class="title">${safe(t.task)}</div>
        <div class="pill">${maintenanceType}</div>
      </div>
      <div class="meta">
        <div><strong>WO ID:</strong> ${safe(t.id)}</div>
        <div><strong>Status:</strong> ${safe(t.status)}</div>
        <div><strong>Due:</strong> ${fmtDate(t.due_date)}</div>
        <div><strong>Printed:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>

    <div class="grid">
      <div class="k">Asset</div><div class="v">${safe(t.machine_name)}</div>
      <div class="k">Serial No</div><div class="v">${safe(t.serial_number)}</div>
      <div class="k">Line</div><div class="v">${safe(t.line_code || t.line)}</div>
      <div class="k">Section</div><div class="v">${safe(t.section)}</div>
      <div class="k">Unit</div><div class="v">${safe(t.unit)}</div>
      <div class="k">Task Type</div><div class="v">${safe(t.type || "Maintenance Task")}</div>
      <div class="k">Frequency</div><div class="v">${t.frequency_hours ? safe(t.frequency_hours) + " h" : "-"}</div>
      <div class="k">Duration</div><div class="v">${t.duration_min ? safe(t.duration_min) + " min" : "-"}</div>
      <div class="k">Technician</div><div class="v">${safe(t.technician || t.completed_by)}</div>
    </div>

    <div class="section">
      <h3>Description</h3>
      <div class="text">${safe(t.task)}</div>
    </div>

    <div class="section">
      <h3>Notes</h3>
      <div class="text">${safe(t.notes)}</div>
    </div>

    <div class="sign">
      <div class="box">
        <strong>Execution / Findings</strong>
        ________________________________________________<br><br>
        ________________________________________________<br><br>
        ________________________________________________
      </div>
      <div class="box">
        <strong>Sign-Off</strong>
        <div><strong>Executed By:</strong> __________________________</div>
        <div><strong>Date:</strong> _________________________________</div>
        <div><strong>Supervisor:</strong> ___________________________</div>
      </div>
    </div>

    <div class="footer">
      <div>Asset: ${safe(t.machine_name)} • SN: ${safe(t.serial_number)}</div>
      <div>WO #${safe(t.id)}</div>
    </div>

  </div>

  <script>
    window.addEventListener('load', () => {
      window.focus();
      window.print();
      setTimeout(() => window.close(), 250);
    });
  </script>
</body>
</html>
`;

  const w = window.open(`/api/tasks/${currentViewedTask.id}/print`, "_blank");

  if (!w) {
    alert("Popup blocked. Please allow popups to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
// =====================
// PRINT TASK SCHEDULE (GROUPED BY LINE)
// =====================

window.printTaskSchedule = function ({ tasks, meta, helpers }) {

  if (!Array.isArray(tasks) || tasks.length === 0) {
    alert("No tasks to print");
    return;
  }

  const {
    formatDate,
    formatDuration,
    getDueState
  } = helpers;

    // 🔽 SORT BY LINE → MACHINE → DUE DATE
    const sortedTasks = [...tasks].sort((a, b) => {

      const la = (a.line_code || a.line || "").toString();
      const lb = (b.line_code || b.line || "").toString();
      if (la !== lb) return la.localeCompare(lb, "el", { numeric: true });

      const ma = (a.machine_name || "").toString();
      const mb = (b.machine_name || "").toString();
      if (ma !== mb) return ma.localeCompare(mb, "el");

      const sa = (a.serial_number || "").toString();
      const sb = (b.serial_number || "").toString();
      if (sa !== sb) return sa.localeCompare(sb, "el");

      return new Date(a.due_date || 0) - new Date(b.due_date || 0);
    });


  // ⏱ GRAND TOTAL
  const totalMinutes = tasks.reduce(
    (sum, t) => t.duration_min != null ? sum + Number(t.duration_min) : sum,
    0
  );

  const totalDurationLabel =
    totalMinutes > 0 ? formatDuration(totalMinutes) : "";

  let html = `
    <html>
    <head>
      <title>Maintenance Tasks</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; }
        h2 { margin-bottom: 5px; }
        h3 { margin: 0 0 6px; }
        .meta { margin-bottom: 15px; font-size: 12px; color: #555; }

        table { width: 100%; border-collapse: collapse; }
        th, td {
          border: 1px solid #999;
          padding: 6px 8px;
          font-size: 12px;
        }
        th { background: #eee; }
        thead { display: table-header-group; }

        .line-break { page-break-before: always; }

        .line-footer {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 2px solid #333;
          font-size: 12px;
          font-weight: bold;
          text-align: right;
        }

        .final-signature {
          margin-top: 40px;
          padding-top: 12px;
          border-top: 2px solid #333;
          font-size: 12px;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .signature-row {
          display: flex;
          justify-content: space-between;
          margin-top: 30px;
        }

        .sig-box { width: 45%; }
        .sig-line {
          border-bottom: 1px solid #000;
          height: 22px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <h2>Maintenance Tasks Schedule</h2>
      <div class="meta">
        Ημερομηνία: ${meta.date}<br>
        Περίοδος: ${meta.period}<br>
        Asset: ${meta.asset}<br>
        Status: <strong>${meta.status}</strong><br>
        <strong>Σύνολο εργασιών: ${tasks.length}</strong>
        ${totalDurationLabel ? ` • Estimated duration: ${totalDurationLabel}` : ""}
      </div>
  `;

  let currentLine = null;
  let isFirstLine = true;
  let currentMachine = null;
  let lineMinutes = 0;
  // =====================
  // MTBF PRE-CALCULATION (BY ASSET)
  // =====================

  const mtbfMap = {}; // serial -> mtbf minutes

  sortedTasks.forEach(t => {
    const serial = t.serial_number;
    if (!serial || mtbfMap[serial] !== undefined) return;

    const breakdowns = (executionsData || []).filter(e =>
      e.serial_number === serial &&
      e.is_planned === false
    );

    const mtbfMin = calculateMtbfMinutes(breakdowns);
    mtbfMap[serial] = mtbfMin;
  });

  sortedTasks.forEach(t => {
  const line = t.line_code || t.line || "—";
  const machineKey = `${t.machine_name}||${t.serial_number || ""}`;

  // 🟦 NEW LINE
  if (line !== currentLine) {

    if (currentLine !== null) {
      html += `
            </tbody>
          </table>
          <div class="line-footer">
            Σύνολο LINE: ${formatDuration(lineMinutes)}
          </div>
        </div>
      `;
    }

    html += `
      <div class="${isFirstLine ? "" : "line-break"}">
        <h3>LINE: ${line}</h3>
    `;

    currentLine = line;
    currentMachine = null;
    isFirstLine = false;
    lineMinutes = 0;
  }

  // 🟨 NEW MACHINE
  if (machineKey !== currentMachine) {

    if (currentMachine !== null) {
      html += `
            </tbody>
          </table>
      `;
    }

    const mtbfMin = mtbfMap[t.serial_number];
    const mtbfLabel = mtbfMin
      ? ` • MTBF: ${formatDuration(mtbfMin)}`
      : "";

    html += `
      <div style="margin:10px 0 4px; font-weight:bold;">
        🏭 ${t.machine_name}
        <span style="margin-bottom:20px; font-weight:normal; font-size:11px;">
          (SN: ${t.serial_number || "-"})${mtbfLabel}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Section</th>
            <th>Unit</th>
            <th>Task</th>
            <th>Type</th>
            <th>Status</th>
            <th>Due Date</th>
            <th>Est. Duration</th>
            <th>✔</th>
          </tr>
        </thead>
        <tbody>
    `;

    currentMachine = machineKey;
  }

  if (t.duration_min != null) {
    lineMinutes += Number(t.duration_min);
  }

  html += `
    <tr>
      <td>${t.section || "-"}</td>
      <td>${t.unit || "-"}</td>
      <td>${t.task}</td>
      <td>${t.type || "-"}</td>
      <td>${
        getDueState(t) === "overdue" ? "Overdue" :
        getDueState(t) === "today"   ? "Today" :
        getDueState(t) === "soon"    ? "Due Soon" :
        "Planned"
      }</td>
      <td>${formatDate(t.due_date)}</td>
      <td>${formatDuration(t.duration_min)}</td>
      <td></td>
    </tr>
  `;
});


  html += `
            </tbody>
          </table>
          <div class="line-footer">
            Σύνολο LINE: ${formatDuration(lineMinutes)}
          </div>
        </div>

        <div class="final-signature">
          <div class="signature-row">
            <div class="sig-box">
              Τεχνικός
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              Υπογραφή
              <div class="sig-line"></div>
            </div>
          </div>
        </div>
        
    </body>
    </html>
  `;

  // 🔹 HIDDEN IFRAME PRINT
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
};
