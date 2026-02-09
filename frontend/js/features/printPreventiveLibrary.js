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

  let container = document.getElementById("libraryPrintContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "libraryPrintContainer";
    container.className = "print-only";
    document.body.appendChild(container);
  }

  const { asset, rules, metrics } = report;

  container.innerHTML = `
    <h2>Preventive Maintenance Plan</h2>

    <div class="print-meta">
      <div><strong>Asset:</strong> ${asset.name || asset.machine_name}</div>
      <div><strong>Model:</strong> ${asset.model}</div>
      <div><strong>Serial:</strong> ${asset.serial || "-"}</div>
      <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
    </div>

    <div class="print-summary">
      <div><strong>${metrics.totalRules}</strong> Preventive Rules</div>
      <div><strong>${metrics.executionsPerYear}</strong> Executions / Year</div>
      <div><strong>${metrics.workloadHoursPerYear}</strong> Workload (hrs / year)</div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Section</th>
          <th>Unit</th>
          <th>Frequency (hrs)</th>
          <th>Duration (min)</th>
          <th>Workload / Year (hrs)</th>
        </tr>
      </thead>
      <tbody>
        ${rules.map(r => `
          <tr>
            <td>${r.task}</td>
            <td>${r.section || "-"}</td>
            <td>${r.unit || "-"}</td>
            <td>${r.frequency_hours}</td>
            <td>${r.duration_min || "-"}</td>
            <td>${r.workloadHours}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
// =====================
// PRINT ASSET PREVENTIVE PLAN
// =====================
function printAssetPreventivePlan(assetId) {
  const report = buildAssetPreventivePlanReport(assetId);
  if (!report) {
    alert("No preventive plan available for this asset");
    return;
  }

  renderAssetPreventivePrint(report);

  setTimeout(() => {
    window.print();
  }, 100);
}
