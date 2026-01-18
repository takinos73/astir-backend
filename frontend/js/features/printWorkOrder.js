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