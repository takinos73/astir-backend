// =====================
// BUILD ASSET PREVENTIVE PLAN REPORT
// =====================
function buildAssetPreventivePlanReport(assetId) {
  const asset = assetsData.find(a => a.id === Number(assetId));
  if (!asset) return null;

  const rules = tasksData.filter(t =>
    t.asset_id === asset.id &&
    t.is_planned === true &&
    Number(t.frequency_hours) > 0 &&
    t.deleted_at == null
  );

  let totalExecutions = 0;
  let totalWorkloadHours = 0;

  const enrichedRules = rules.map(r => {
    const executionsPerYear = 8760 / Number(r.frequency_hours);
    const workloadHours =
      executionsPerYear * ((Number(r.duration_min) || 0) / 60);

    totalExecutions += executionsPerYear;
    totalWorkloadHours += workloadHours;

    return {
      id: r.id,
      task: r.task,
      section: r.section,
      unit: r.unit,
      frequency_hours: r.frequency_hours,
      duration_min: r.duration_min,
      executionsPerYear: Math.round(executionsPerYear),
      workloadHours: Number(workloadHours.toFixed(1))
    };
  });

  return {
    asset,
    rules: enrichedRules,
    metrics: {
      totalRules: enrichedRules.length,
      executionsPerYear: Math.round(totalExecutions),
      workloadHoursPerYear: Number(totalWorkloadHours.toFixed(1))
    }
  };
}
// =====================
// RENDER ASSET PREVENTIVE PRINT
// =====================
function renderAssetPreventivePrint(report) {
  if (!report) return;

  // 🔥 REMOVE old instance
  document.getElementById("libraryPrintContainer")?.remove();

  const container = document.createElement("div");
  container.id = "libraryPrintContainer";
  container.className = "print-only";

  document.body.appendChild(container);

  const { asset, rules, metrics } = report;

const grouped = {};

rules.forEach(r => {
  const f = r.frequency_hours;
  if (!grouped[f]) grouped[f] = [];
  grouped[f].push(r);
});

container.innerHTML += `
    <!-- =====================
        PREVENTIVE PLAN HEADER
    ===================== -->
    <div class="print-header">
      <div class="print-header-left">
        <h1>Preventive Maintenance Plan</h1>
        <div class="asset-id">
          <strong>${asset.model}</strong>
          ${asset.serial_number ? ` • SN: ${asset.serial_number}` : ""}
          ${asset.line_code ? ` • Line: ${asset.line_code}` : ""}
        </div>
      </div>

    </div>

    <!-- INLINE METRICS -->
    <div class="print-metrics-inline">
      <span>
        <strong>Preventive Tasks:</strong> ${metrics.totalRules}
      </span>
      <span class="dot">•</span>
      <span>
        <strong>Executions / Year:</strong> ${metrics.executionsPerYear}
      </span>
      <span class="dot">•</span>
      <span>
        <strong>Workload:</strong> ${metrics.workloadHoursPerYear} hrs / year
      </span>
    </div>

    <div class="print-meta">
      Generated: ${new Date().toLocaleDateString()} •
      Source: ASTIR CMMS •
      Scope: Asset-level preventive plan
    </div>

    <!-- =====================
        PREVENTIVE TABLE
    ===================== -->
    <table class="print-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Section / Unit</th>
          <th>Frequency (hrs)</th>
          <th>Duration (min)</th>
        </tr>
      </thead>
      <tbody>
        ${Object.keys(grouped)
          .sort((a, b) => Number(a) - Number(b))
          .map(freq => `
            <tr class="freq-group">
              <td colspan="4">
                Every <strong>${freq}</strong> hours
              </td>
            </tr>

            ${grouped[freq]
              .map(r => `
                <tr>
                  <td>${r.task}</td>
                  <td>
                    ${r.section || "-"}
                    ${r.unit ? `<br><small>${r.unit}</small>` : ""}
                  </td>
                  <td>${r.frequency_hours}</td>
                  <td>${r.duration_min || "-"}</td>
                </tr>
              `)
              .join("")}
          `)
          .join("")}
      </tbody>
    </table>
    `;
  }


// =====================
// PRINT ASSET PREVENTIVE PLAN (BY SERIAL)
// =====================
function printAssetPreventivePlan(serial) {
  if (!serial) {
    alert("Missing asset serial");
    return;
  }

  const asset = assetsData.find(
    a => String(a.serial_number || "").trim() === String(serial).trim()
  );

  if (!asset) {
    alert("Asset not found");
    return;
  }

  const report = buildAssetPreventivePlanReport(asset.id);

  if (!report || !Array.isArray(report.rules) || report.rules.length === 0) {
    alert("No preventive plan available for this asset");
    return;
  }

  // 1️⃣ Render print HTML into hidden container
  renderAssetPreventivePrint(report);

  // 2️⃣ Extract HTML safely
  const container = document.getElementById("libraryPrintContainer");
  if (!container) {
    alert("Print container not found");
    return;
  }

  const html = container.innerHTML;

  // 3️⃣ Print via isolated iframe (NO dark UI, NO overlays)
  printHtmlInIsolatedFrame(html);
}

function getAssetPreventiveTasks(serial) {
  if (!Array.isArray(tasksData)) return [];

  const s = String(serial).trim();

  return tasksData.filter(t =>
    String(t.serial_number || "").trim() === s &&
    t.is_planned === true &&
    Number(t.frequency_hours) > 0 &&
    t.deleted_at == null
  );
}
function calculatePreventivePlanMetrics(rules) {
  let executionsPerYear = 0;
  let workloadHoursPerYear = 0;

  rules.forEach(r => {
    if (!r.frequency_hours || !r.duration_min) return;

    const perYear = Math.round(8760 / r.frequency_hours);
    executionsPerYear += perYear;
    workloadHoursPerYear += (perYear * r.duration_min) / 60;
  });

  return {
    totalRules: rules.length,
    executionsPerYear,
    workloadHoursPerYear: Math.round(workloadHoursPerYear)
  };
}
// =====================
// IFRAME PRINT (BULLETPROOF)
// =====================
function printHtmlInIsolatedFrame(html) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Preventive Maintenance Plan</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #ffffff;
            color: #000000;
            margin: 0;
            padding: 24px;
          }

          h2 {
            margin-bottom: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #ccc;
            padding: 6px 8px;
            text-align: left;
          }

          th {
            background: #f2f2f2;
          }

          .freq-group td {
            background: #e9e9e9;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}



