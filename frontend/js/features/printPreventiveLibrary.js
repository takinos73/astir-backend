// =====================
// BUILD ASSET PREVENTIVE PLAN REPORT
// =====================
function buildAssetPreventivePlanReport(assetId) {
  const asset = state.assetsData.find(a => a.id === Number(assetId));
  if (!asset) return null;

  const rules = state.tasksData.filter(t =>
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
      impact: r.impact || "normal",
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
        
        <div class="asset-id" style="margin-bottom:2px;">
          <strong>${asset.model}</strong>
          <!-- ${asset.serial_number ? ` • SN: ${asset.serial_number}` : ""} -->
          ${asset.line_code ? ` • Line: ${asset.line_code}` : ""}
        </div>
      </div>

    </div>

    <!-- INLINE METRICS -->
    <div class="print-metrics-inline">
      <div style="margin-bottom:2px;">
        <span>
          <strong>Preventive Tasks:</strong> ${metrics.totalRules}
        </span>
      </div>

      <div style="margin-bottom:2px;">
        <span>
          <strong>Workload:</strong> ${metrics.workloadHoursPerYear} hrs / year
        </span>
      </div>

    <div class="print-meta" style="margin-bottom:12px;">
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
                  <td>
                    <div>${r.task}</div>

                    ${
                      r.impact && r.impact !== "normal"
                        ? `
                          <div class="print-impact-wrap">
                            <span class="print-impact print-impact-${r.impact}">
                              ${
                                r.impact === "safety"
                                  ? "SAFETY"
                                  : r.impact === "quality"
                                  ? "QUALITY"
                                  : "S + Q"
                              }
                            </span>
                          </div>
                        `
                        : ""
                    }
                  </td>
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
async function printAssetPreventivePlan(serial) {
  const asset = state.assetsData.find(item => String(item.serial_number || "").trim() === String(serial || "").trim());
  if (!asset) { alert("Asset not found"); return; }
  try {
    const report = await buildCompletePreventivePlan(asset.model, asset);
    if (!report.count) { alert("Δεν υπάρχουν εργασίες στο πλάνο αυτού του Asset."); return; }
    printHtmlInIsolatedFrame(renderCompletePreventivePlan(report));
  } catch (error) { alert(error.message || "Δεν δημιουργήθηκε το πλάνο."); }
}

function getAssetPreventiveTasks(serial) {
  if (!Array.isArray(state.tasksData)) return [];

  const s = String(serial).trim();

  return state.tasksData.filter(t =>
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
            .print-impact-wrap {
            margin-top: 4px;
          }

          .print-impact {
            display: inline-block;
            padding: 2px 5px;

            border-radius: 4px;

            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.04em;

            border: 1px solid #aaa;
            background: #f6f6f6;
            color: #333;
          }

          .print-impact-safety {
            border-color: #c62828;
            color: #a61b1b;
            background: #fff3f3;
          }

          .print-impact-quality {
            border-color: #1976d2;
            color: #155fa0;
            background: #f1f7fd;
          }

          .print-impact-safety_quality {
            border-color: #7b1fa2;
            color: #6a1b8a;
            background: #faf3fc;
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




async function buildCompletePreventivePlan(model, asset = null) {
  const query = new URLSearchParams({ model });
  const [packageResponse, assignmentResponse] = await Promise.all([
    fetch("/preventive-packages?" + query, { cache: "no-store" }),
    fetch("/preventive-package-assignments?" + query, { cache: "no-store" })
  ]);
  if (!packageResponse.ok || !assignmentResponse.ok) throw new Error("Δεν φορτώθηκαν όλα τα πακέτα. Η εκτύπωση ακυρώθηκε.");
  const [{ packages }, { assignments }] = await Promise.all([packageResponse.json(), assignmentResponse.json()]);
  if (!Array.isArray(packages) || !Array.isArray(assignments)) throw new Error("Μη έγκυρα στοιχεία πλάνου.");
  const assetAssignments = asset ? assignments.filter(item => Number(item.asset_id) === Number(asset.id)) : [];
  const packageIds = new Set(assetAssignments.map(item => String(item.package_id)));
  const includedPackages = packages.filter(pack => !pack.archived_at && (!asset || packageIds.has(String(pack.id))));
  const assetReport = asset ? buildAssetPreventivePlanReport(asset.id) : null;
  if (asset && !assetReport) throw new Error("Το Asset δεν είναι πλέον διαθέσιμο. Ανανεώστε την οθόνη.");
  const rules = asset ? assetReport.rules : (libraryData.find(entry => entry.model === model)?.plans || [])
    .filter(rule => Number(rule.frequency_hours) > 0);
  let workload = rules.reduce((sum, rule) => sum + 8760 / Number(rule.frequency_hours) * Number(rule.duration_min || 0) / 60, 0);
  let count = rules.length;
  for (const pack of includedPackages) {
    if (!Array.isArray(pack.tasks) || !Number.isInteger(pack.interval_months) || pack.interval_months <= 0) {
      throw new Error("Το πακέτο " + pack.title + " έχει μη έγκυρα στοιχεία.");
    }
    count += pack.tasks.length;
    workload += pack.tasks.reduce((sum, task) => sum + Number(task.duration_min || 0), 0) *
      (12 / pack.interval_months) / 60;
  }
  return { model, asset, rules, packages: includedPackages, count, workload };
}

function renderCompletePreventivePlan(report) {
  const container = document.createElement("div");
  container.className = "print-only";
  const heading = document.createElement("h1");
  heading.textContent = "Preventive Maintenance Plan";
  const context = document.createElement("p");
  context.textContent = report.model + (report.asset
    ? " · SN " + report.asset.serial_number + " · Πλάνο συγκεκριμένου Asset"
    : " · Πλάνο μοντέλου");
  const metrics = document.createElement("p");
  metrics.textContent = report.count + " εργασίες · " + report.packages.length + " πακέτα · " +
    report.workload.toLocaleString("el-GR", { maximumFractionDigits: 1 }) + " ώρες / έτος";
  const generated = document.createElement("p");
  generated.textContent = "ASTIR CMMS · " + new Date().toLocaleDateString("el-GR");
  const table = document.createElement("table");
  table.className = "print-table";
  const header = table.createTHead().insertRow();
  for (const label of ["Εργασία", "Section / Unit", "Συχνότητα", "Διάρκεια (min)"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  }
  const body = table.createTBody();
  function group(label) {
    const row = body.insertRow();
    row.className = "freq-group";
    const cell = row.insertCell(); cell.colSpan = 4; cell.textContent = label;
  }
  function taskRow(task, frequency) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.textContent = task.task;
    if (task.notes) {
      const note = document.createElement("small");
      note.textContent = task.notes;
      cell.append(document.createElement("br"), note);
    }
    if (["safety", "quality", "safety_quality"].includes(task.impact)) {
      const impact = document.createElement("span");
      impact.className = "print-impact print-impact-" + task.impact;
      impact.textContent = task.impact === "safety_quality" ? "S + Q" : task.impact.toUpperCase();
      const wrap = document.createElement("div"); wrap.className = "print-impact-wrap"; wrap.appendChild(impact); cell.appendChild(wrap);
    }
    row.insertCell().textContent = [task.section, task.unit].filter(Boolean).join(" / ") || "—";
    row.insertCell().textContent = frequency;
    row.insertCell().textContent = task.duration_min ?? "—";
  }
  const groupedRules = new Map();
  for (const rule of [...report.rules].sort((a, b) => Number(a.frequency_hours) - Number(b.frequency_hours))) {
    const frequency = Number(rule.frequency_hours);
    if (!groupedRules.has(frequency)) groupedRules.set(frequency, []);
    groupedRules.get(frequency).push(rule);
  }
  for (const [hours, rules] of groupedRules) {
    group("Μεμονωμένες προληπτικές εργασίες · Κάθε " + hours + " ώρες");
    for (const rule of rules) taskRow(rule, hours + " ώρες");
  }
  for (const pack of report.packages) {
    group("PP" + String(pack.id).padStart(4, "0") + " · " + pack.title +
      " · Κάθε " + pack.interval_months + " μήνες · " + pack.tasks.length + " εργασίες");
    for (const task of pack.tasks) taskRow(task, pack.interval_months + " μήνες");
  }
  container.append(heading, context, metrics, generated, table);
  return container.innerHTML;
}

async function printModelPreventivePlan(model) {
  try {
    const report = await buildCompletePreventivePlan(model);
    if (!report.count) { alert("Δεν υπάρχουν εργασίες στο πλάνο αυτού του μοντέλου."); return; }
    printHtmlInIsolatedFrame(renderCompletePreventivePlan(report));
  } catch (error) { alert(error.message || "Δεν δημιουργήθηκε το πλάνο."); }
}
