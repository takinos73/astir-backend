/* =====================================================
   DAILY MAINTENANCE REPORT
   Standalone report logic
===================================================== */


/* =====================================================
   REPORT PERIOD
   Rolling last 24 hours
===================================================== */

function getDailyReportPeriod() {

  const to =
    new Date();

  const from =
    new Date(
      to.getTime() -
      24 * 60 * 60 * 1000
    );

  return {
    from,
    to
  };
}


/* =====================================================
   DATE / TIME FORMAT
===================================================== */

function formatDailyReportDateTime(value) {

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "el-GR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


/* =====================================================
   FORMAT DOWNTIME
   Input = seconds
===================================================== */

function formatDailyReportSeconds(value) {

  const totalSeconds =
    Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {

    return (
      `${hours}h ` +
      `${minutes}m`
    );
  }

  if (minutes > 0) {

    return (
      `${minutes}m ` +
      `${seconds}s`
    );
  }

  return `${seconds}s`;
}


/* =====================================================
   LOAD HTML TEMPLATE
===================================================== */

async function loadDailyReportTemplate() {

  const response =
    await fetch(
      "./reports/daily-maintenance-brief.html"
    );

  if (!response.ok) {

    throw new Error(
      "Failed to load Daily Maintenance Brief template"
    );
  }

  return response.text();
}


/* =====================================================
   LOAD BREAKDOWNS
   New Breakdown model
===================================================== */

async function loadDailyReportBreakdowns() {

  const response =
    await fetch(
      `${API}/breakdowns`
    );

  if (!response.ok) {

    throw new Error(
      "Failed to load Breakdown data"
    );
  }

  const data =
    await response.json();

  return Array.isArray(data)
    ? data
    : [];
}

function buildDailyReportExecutionMix(executions) {

  const mix = {
    preventive: 0,
    planned: 0,
    restoration: 0,
    legacyUnplanned: 0
  };


  executions.forEach(e => {

    // Restoration has priority
    if (
      e.breakdown_id !== null &&
      e.breakdown_id !== undefined
    ) {

      mix.restoration++;

    }

    // Preventive
    else if (
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ) {

      mix.preventive++;

    }

    // Legacy Unplanned
    else if (
      e.is_planned === false
    ) {

      mix.legacyUnplanned++;

    }

    // Planned
    else {

      mix.planned++;

    }

  });


  mix.total =
    mix.preventive +
    mix.planned +
    mix.restoration +
    mix.legacyUnplanned;


  return mix;
}

function renderDailyReportExecutionMixChart(mix) {

    const total =
    Number(mix.total) || 0;


  if (total === 0) {

    return `
      <div class="daily-report-empty-chart">
        No completed maintenance executions
        during the reporting period.
      </div>
    `;
  }


  const items = [

    {
      label: "Preventive",
      value: mix.preventive,
      color: "#2f80ed"
    },

    {
      label: "Planned",
      value: mix.planned,
      color: "#7b8da6"
    },

    {
      label: "Restoration",
      value: mix.restoration,
      color: "#e67e22"
    },

    {
      label: "Legacy Unplanned",
      value: mix.legacyUnplanned,
      color: "#c0392b"
    }

  ];


  const radius = 52;

  const circumference =
    2 * Math.PI * radius;


  let cumulative = 0;


  const circles =
    items
      .filter(item =>
        item.value > 0
      )
      .map(item => {

        const percent =
          item.value / total;

        const dash =
          circumference *
          percent;

        const offset =
          -circumference *
          cumulative;

        cumulative += percent;


        return `
          <circle
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="${item.color}"
            stroke-width="22"
            stroke-dasharray="${dash} ${circumference - dash}"
            stroke-dashoffset="${offset}"
            transform="rotate(-90 80 80)"
          />
        `;

      })
      .join("");


  const legend =
    items
      .map(item => {

        const pct =
          total > 0
            ? Math.round(
                item.value *
                100 /
                total
              )
            : 0;


        return `
          <div class="daily-report-legend-row">

            <span
              class="daily-report-legend-dot"
              style="background:${item.color};"
            ></span>

            <span class="daily-report-legend-label">
              ${item.label}
            </span>

            <span class="daily-report-legend-value">
              ${item.value}
              ·
              ${pct}%
            </span>

          </div>
        `;

      })
      .join("");


  return `

    <div class="daily-report-donut-layout">


      <div class="daily-report-donut-chart">

        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label="Maintenance Execution Mix"
        >

          <circle
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="#edf1f5"
            stroke-width="22"
          />

          ${circles}


          <text
            x="80"
            y="76"
            text-anchor="middle"
            class="daily-report-donut-center-value"
          >
            ${total}
          </text>


          <text
            x="80"
            y="94"
            text-anchor="middle"
            class="daily-report-donut-center-label"
          >
            COMPLETED
          </text>

        </svg>

      </div>


      <div class="daily-report-donut-legend">

        ${legend}

      </div>


    </div>
  `;
}

function buildDailyReportBreakdownOutcome(breakdowns) {

  const outcome = {
    closed: 0,
    active: 0,
    total: 0
  };


  breakdowns.forEach(b => {

    const status =
      String(
        b.status || ""
      )
        .trim()
        .toUpperCase();


    if (status === "CLOSED") {

      outcome.closed++;

    } else {

      outcome.active++;

    }

  });


  outcome.total =
    outcome.closed +
    outcome.active;


  return outcome;
}

function renderDailyReportBreakdownOutcomeChart(
  outcome
) {

  const total =
    Number(outcome.total) || 0;


  if (total === 0) {

    return `
      <div class="daily-report-empty-chart">
        No Breakdown incidents opened
        during the reporting period.
      </div>
    `;
  }


  const items = [

    {
      label: "Closed",
      value: outcome.closed,
      color: "#27ae60"
    },

    {
      label: "Still Active",
      value: outcome.active,
      color: "#d64545"
    }

  ];


  const radius = 52;

  const circumference =
    2 * Math.PI * radius;


  let cumulative = 0;


  const circles =
    items
      .filter(item =>
        item.value > 0
      )
      .map(item => {

        const percent =
          item.value / total;

        const dash =
          circumference *
          percent;

        const offset =
          -circumference *
          cumulative;

        cumulative += percent;


        return `
          <circle
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="${item.color}"
            stroke-width="22"
            stroke-dasharray="${dash} ${circumference - dash}"
            stroke-dashoffset="${offset}"
            transform="rotate(-90 80 80)"
          />
        `;

      })
      .join("");


  const legend =
    items
      .map(item => {

        const pct =
          total > 0
            ? Math.round(
                item.value *
                100 /
                total
              )
            : 0;


        return `
          <div class="daily-report-legend-row">

            <span
              class="daily-report-legend-dot"
              style="background:${item.color};"
            ></span>

            <span class="daily-report-legend-label">
              ${item.label}
            </span>

            <span class="daily-report-legend-value">
              ${item.value} · ${pct}%
            </span>

          </div>
        `;

      })
      .join("");


  return `
    <div class="daily-report-donut-layout">

      <div class="daily-report-donut-chart">

        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label="Breakdown Outcome"
        >

          <circle
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="#edf1f5"
            stroke-width="22"
          />

          ${circles}

          <text
            x="80"
            y="76"
            text-anchor="middle"
            class="daily-report-donut-center-value"
          >
            ${total}
          </text>

          <text
            x="80"
            y="94"
            text-anchor="middle"
            class="daily-report-donut-center-label"
          >
            INCIDENTS
          </text>

        </svg>

      </div>

      <div class="daily-report-donut-legend">
        ${legend}
      </div>

    </div>
  `;
}

function buildDailyReportReliabilityImpact(breakdowns) {

  const byAsset =
    new Map();


  breakdowns.forEach(b => {

    const assetId =
      b.asset_id ?? "unknown";


    if (!byAsset.has(assetId)) {

      byAsset.set(
        assetId,
        {
          assetId,

          line:
            b.line_name ||
            b.line_code ||
            "—",

          asset:
            b.asset_model ||
            b.machine_name ||
            b.asset_name ||
            b.asset_serial ||
            `Asset ${assetId}`,

          incidents: 0,

          effectiveDownSeconds: 0
        }
      );
    }


    const item =
      byAsset.get(assetId);


    item.incidents++;


    item.effectiveDownSeconds +=
      Number(
        b.effective_down_seconds || 0
      );

  });


  return Array.from(
    byAsset.values()
  )
    .sort(
      (a, b) => {

        if (
          b.effectiveDownSeconds !==
          a.effectiveDownSeconds
        ) {

          return (
            b.effectiveDownSeconds -
            a.effectiveDownSeconds
          );
        }

        return (
          b.incidents -
          a.incidents
        );
      }
    )
    .slice(0, 5);
}

function renderDailyReportReliabilityImpactChart(items) {

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {

    return `
      <div class="daily-report-empty-chart">
        No Breakdown reliability impact
        during the reporting period.
      </div>
    `;
  }


  const maxDown =
    Math.max(
      ...items.map(
        item =>
          Number(
            item.effectiveDownSeconds || 0
          )
      ),
      0
    );


  const rows =
    items
      .map(item => {

        const downSeconds =
          Number(
            item.effectiveDownSeconds || 0
          );


        const widthPct =
          maxDown > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  downSeconds *
                  100 /
                  maxDown
                )
              )
            : 0;


        const label =
          `${item.line} · ${item.asset}`;


        const incidentLabel =
          item.incidents === 1
            ? "1 BD"
            : `${item.incidents} BD`;


        return `
          <div class="daily-report-bar-row">

            <div
              class="daily-report-bar-label"
              title="${label}"
            >
              ${label}
            </div>


            <div class="daily-report-bar-track">

              <div
                class="daily-report-bar-fill"
                style="width:${widthPct}%;"
              ></div>

            </div>


            <div class="daily-report-bar-value">

              ${formatDailyReportSeconds(
                downSeconds
              )}

              ·

              ${incidentLabel}

            </div>

          </div>
        `;

      })
      .join("");


  return `
    <div class="daily-report-bars">
      ${rows}
    </div>
  `;
}

function buildDailyReportLineActivity(executions) {

  const byLine =
    new Map();


  executions.forEach(e => {

    const line =
      String(
        e.line ||
        e.line_code ||
        e.line_name ||
        "Unassigned"
      ).trim();


    if (!byLine.has(line)) {

      byLine.set(
        line,
        {
          line,
          preventive: 0,
          planned: 0,
          restoration: 0,
          legacyUnplanned: 0,
          total: 0
        }
      );
    }


    const item =
      byLine.get(line);


    /* =====================
       RESTORATION
       Highest priority
    ====================== */

    if (
      e.breakdown_id !== null &&
      e.breakdown_id !== undefined
    ) {

      item.restoration++;

    }


    /* =====================
       PREVENTIVE
    ====================== */

    else if (
      e.frequency_hours != null &&
      Number(
        e.frequency_hours
      ) > 0
    ) {

      item.preventive++;

    }


    /* =====================
       LEGACY UNPLANNED
    ====================== */

    else if (
      e.is_planned === false
    ) {

      item.legacyUnplanned++;

    }


    /* =====================
       PLANNED
    ====================== */

    else {

      item.planned++;

    }


    item.total++;

  });


  return Array.from(
    byLine.values()
  )
    .sort(
      (a, b) =>
        String(a.line).localeCompare(
          String(b.line),
          "el",
          {
            numeric: true
          }
        )
    );
}

function renderDailyReportLineActivityChart(
  items
) {

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {

    return `
      <div class="daily-report-empty-chart">
        No maintenance executions
        during the reporting period.
      </div>
    `;
  }


  const maxTotal =
    Math.max(
      ...items.map(
        item =>
          Number(
            item.total || 0
          )
      ),
      1
    );


  const rows =
    items
      .map(item => {

        const preventiveWidth =
          item.preventive *
          100 /
          maxTotal;


        const plannedWidth =
          item.planned *
          100 /
          maxTotal;


        const restorationWidth =
          item.restoration *
          100 /
          maxTotal;


        const legacyWidth =
          item.legacyUnplanned *
          100 /
          maxTotal;


        return `
          <div class="daily-report-stacked-row">

            <div class="daily-report-stacked-label">
              ${item.line}
            </div>


            <div
              class="daily-report-stacked-track"
              title="${item.total} completed executions"
            >

              ${
                item.preventive > 0
                  ? `
                    <div
                      class="daily-report-stacked-segment"
                      style="
                        width:${preventiveWidth}%;
                        background:#2f80ed;
                      "
                      title="Preventive: ${item.preventive}"
                    ></div>
                  `
                  : ""
              }


              ${
                item.planned > 0
                  ? `
                    <div
                      class="daily-report-stacked-segment"
                      style="
                        width:${plannedWidth}%;
                        background:#7b8da6;
                      "
                      title="Planned: ${item.planned}"
                    ></div>
                  `
                  : ""
              }


              ${
                item.restoration > 0
                  ? `
                    <div
                      class="daily-report-stacked-segment"
                      style="
                        width:${restorationWidth}%;
                        background:#e67e22;
                      "
                      title="Restoration: ${item.restoration}"
                    ></div>
                  `
                  : ""
              }


              ${
                item.legacyUnplanned > 0
                  ? `
                    <div
                      class="daily-report-stacked-segment"
                      style="
                        width:${legacyWidth}%;
                        background:#c0392b;
                      "
                      title="Legacy Unplanned: ${item.legacyUnplanned}"
                    ></div>
                  `
                  : ""
              }

            </div>


            <div class="daily-report-stacked-total">
              ${item.total}
            </div>

          </div>
        `;

      })
      .join("");


  return `

    <div class="daily-report-stacked-bars">

      ${rows}

    </div>


    <div class="daily-report-chart-legend">

      <div class="daily-report-chart-legend-item">
        <span
          class="daily-report-chart-legend-swatch"
          style="background:#2f80ed;"
        ></span>
        Preventive
      </div>


      <div class="daily-report-chart-legend-item">
        <span
          class="daily-report-chart-legend-swatch"
          style="background:#7b8da6;"
        ></span>
        Planned
      </div>


      <div class="daily-report-chart-legend-item">
        <span
          class="daily-report-chart-legend-swatch"
          style="background:#e67e22;"
        ></span>
        Restoration
      </div>


      <div class="daily-report-chart-legend-item">
        <span
          class="daily-report-chart-legend-swatch"
          style="background:#c0392b;"
        ></span>
        Legacy Unplanned
      </div>

    </div>
  `;
}

/* =====================================================
   BUILD DAILY REPORT DATA
===================================================== */

async function buildDailyReportData() {

  const {
    from,
    to
  } =
    getDailyReportPeriod();


  /* =====================
     EXECUTIONS
  ====================== */

  const executions =
    Array.isArray(
      state.executionsData
    )
      ? state.executionsData
      : [];


  const executions24h =
    executions.filter(e => {

      if (!e.executed_at) {
        return false;
      }

      const executedAt =
        new Date(
          e.executed_at
        );

      if (
        Number.isNaN(
          executedAt.getTime()
        )
      ) {
        return false;
      }

      return (
        executedAt >= from &&
        executedAt <= to
      );
    });


  const executionMix =
    buildDailyReportExecutionMix(
      executions24h
    );

    const lineActivity =
    buildDailyReportLineActivity(
        executions24h
    );


  /* =====================
     BREAKDOWNS
  ====================== */

  const breakdowns =
    await loadDailyReportBreakdowns();


  const newBreakdowns24h =
    breakdowns.filter(b => {

      if (!b.started_at) {
        return false;
      }

      const startedAt =
        new Date(
          b.started_at
        );

      if (
        Number.isNaN(
          startedAt.getTime()
        )
      ) {
        return false;
      }

      return (
        startedAt >= from &&
        startedAt <= to
      );
    });


    const breakdownOutcome =
        buildDailyReportBreakdownOutcome(
        newBreakdowns24h
        );

    const reliabilityImpact =
    buildDailyReportReliabilityImpact(
        newBreakdowns24h
    );


  /* =====================
     ACTIVE BREAKDOWNS
     Current plant status
  ====================== */

  const activeBreakdowns =
    breakdowns.filter(b => {

      return (
        String(
          b.status || ""
        )
          .trim()
          .toUpperCase() !==
        "CLOSED"
      );
    });


  /* =====================
     EFFECTIVE DOWN

     Only Breakdown incidents
     STARTED during this 24h period.
  ====================== */

  const effectiveDownSeconds =
    newBreakdowns24h.reduce(
      (sum, b) =>
        sum +
        Number(
          b.effective_down_seconds || 0
        ),
      0
    );


  return {

    period: {
      from,
      to
    },

    executions24h,

    executionMix,

    lineActivity,

    breakdowns,

    newBreakdowns24h,

    breakdownOutcome,

    reliabilityImpact,

    activeBreakdowns,

    kpis: {

      completed:
        executions24h.length,

      newBreakdowns:
        newBreakdowns24h.length,

      effectiveDownSeconds,

      activeBreakdowns:
        activeBreakdowns.length
    }

  };
}

function buildDailyReportPage1Summary(data) {

  const completed =
    Number(
      data.kpis?.completed || 0
    );

  const newBreakdowns =
    Number(
      data.kpis?.newBreakdowns || 0
    );

  const closed =
    Number(
      data.breakdownOutcome?.closed || 0
    );

  const stillActive =
    Number(
      data.breakdownOutcome?.active || 0
    );

  const effectiveDown =
    formatDailyReportSeconds(
      data.kpis?.effectiveDownSeconds || 0
    );


  return `
    <strong>${completed}</strong>
    maintenance executions completed
    &nbsp;·&nbsp;

    <strong>${newBreakdowns}</strong>
    new Breakdown incidents
    &nbsp;·&nbsp;

    <strong>${closed}</strong>
    closed
    &nbsp;·&nbsp;

    <strong>${stillActive}</strong>
    still active from this period
    &nbsp;·&nbsp;

    <strong>${effectiveDown}</strong>
    Effective DOWN
  `;
}

function buildDailyReportInsights(data) {

  const rows = [];


  /* =====================
     TOP RELIABILITY IMPACT
  ====================== */

  const topAsset =
    Array.isArray(
      data.reliabilityImpact
    )
      ? data.reliabilityImpact[0]
      : null;


  if (
    topAsset &&
    Number(
      topAsset.effectiveDownSeconds
    ) > 0
  ) {

    rows.push(`
      <div class="daily-report-insight-row">

        <span
          class="daily-report-insight-mark"
          style="background:#d64545;"
        ></span>

        <div>
          <strong>
            Highest reliability impact:
          </strong>

          ${topAsset.line} · ${topAsset.asset}
          with

          <strong>
            ${formatDailyReportSeconds(
              topAsset.effectiveDownSeconds
            )}
          </strong>

          Effective DOWN across

          <strong>
            ${topAsset.incidents}
          </strong>

          Breakdown
          ${topAsset.incidents === 1 ? "incident" : "incidents"}.
        </div>

      </div>
    `);

  } else {

    rows.push(`
      <div class="daily-report-insight-row">

        <span
          class="daily-report-insight-mark"
          style="background:#27ae60;"
        ></span>

        <div>
          No Breakdown Effective DOWN was recorded
          from incidents opened during this reporting period.
        </div>

      </div>
    `);
  }


  /* =====================
     BUSIEST LINE
  ====================== */

  const busiestLine =
    Array.isArray(
      data.lineActivity
    ) &&
    data.lineActivity.length > 0

      ? [...data.lineActivity]
          .sort(
            (a, b) =>
              Number(b.total || 0) -
              Number(a.total || 0)
          )[0]

      : null;


  if (
    busiestLine &&
    Number(
      busiestLine.total
    ) > 0
  ) {

    rows.push(`
      <div class="daily-report-insight-row">

        <span
          class="daily-report-insight-mark"
          style="background:#2f80ed;"
        ></span>

        <div>
          <strong>
            Highest maintenance activity:
          </strong>

          ${busiestLine.line}

          with

          <strong>
            ${busiestLine.total}
          </strong>

          completed
          ${busiestLine.total === 1 ? "execution" : "executions"}.
        </div>

      </div>
    `);
  }


  /* =====================
     CURRENT ACTIVE BD
  ====================== */

  const activeNow =
    Number(
      data.kpis?.activeBreakdowns || 0
    );


  rows.push(`
    <div class="daily-report-insight-row">

      <span
        class="daily-report-insight-mark"
        style="background:${
          activeNow > 0
            ? "#e67e22"
            : "#27ae60"
        };"
      ></span>

      <div>

        ${
          activeNow > 0
            ? `
              <strong>
                ${activeNow}
              </strong>

              Breakdown
              ${activeNow === 1 ? "incident is" : "incidents are"}
              currently still open.
            `
            : `
              No Breakdown incidents are currently open.
            `
        }

      </div>

    </div>
  `);


  /* =====================
     RESTORATION ACTIVITY
  ====================== */

  const restorations =
    Number(
      data.executionMix?.restoration || 0
    );


  rows.push(`
    <div class="daily-report-insight-row">

      <span
        class="daily-report-insight-mark"
        style="background:${
          restorations > 0
            ? "#e67e22"
            : "#7b8da6"
        };"
      ></span>

      <div>

        ${
          restorations > 0
            ? `
              <strong>
                ${restorations}
              </strong>

              Restoration
              ${restorations === 1 ? "execution was" : "executions were"}
              completed during the last 24 hours.
            `
            : `
              No Restoration executions were completed
              during the reporting period.
            `
        }

      </div>

    </div>
  `);


  return rows.join("");
}



/* =====================================================
   BUILD HTML
   Phase 1:
   KPIs only
===================================================== */

async function buildDailyReportHtml() {

  let template =
    await loadDailyReportTemplate();


  const data =
    await buildDailyReportData();


  const generatedDate =
    formatDailyReportDateTime(
      new Date()
    );


  const reportPeriod =
    `${formatDailyReportDateTime(
      data.period.from
    )} → ${formatDailyReportDateTime(
      data.period.to
    )}`;


  template =
    template

      .replaceAll(
        "{{GENERATED_DATE}}",
        generatedDate
      )

      .replaceAll(
        "{{REPORT_PERIOD}}",
        reportPeriod
      )

      .replaceAll(
        "{{KPI_COMPLETED}}",
        String(
          data.kpis.completed
        )
      )

      .replaceAll(
        "{{KPI_NEW_BREAKDOWNS}}",
        String(
          data.kpis.newBreakdowns
        )
      )

      .replaceAll(
        "{{KPI_EFFECTIVE_DOWN}}",
        formatDailyReportSeconds(
          data.kpis.effectiveDownSeconds
        )
      )

      .replaceAll(
        "{{KPI_ACTIVE_BREAKDOWNS}}",
        String(
          data.kpis.activeBreakdowns
        )
      );


  /* =====================
     TEMPORARY CHART CONTENT

     Replaced in next steps.
  ====================== */

  template =
    template

    .replace(
        "{{EXECUTION_MIX_CHART}}",
        renderDailyReportExecutionMixChart(
            data.executionMix
        )
    )

    .replace(
    "{{BREAKDOWN_OUTCOME_CHART}}",
    renderDailyReportBreakdownOutcomeChart(
        data.breakdownOutcome
    )
    )

    .replace(
    "{{RELIABILITY_IMPACT_CHART}}",
    renderDailyReportReliabilityImpactChart(
        data.reliabilityImpact
    )
    )

    .replace(
    "{{LINE_ACTIVITY_CHART}}",
    renderDailyReportLineActivityChart(
        data.lineActivity
    )
    )

    .replace(
    "{{PAGE1_SUMMARY}}",
    buildDailyReportPage1Summary(
        data
    )
    )

    .replace(
    "{{REPORT_INSIGHTS}}",
    buildDailyReportInsights(
        data
    )
    )


  return template;
}

/* =====================================================
   PREVIEW
   Temporary development preview
===================================================== */

async function openDailyReportPreview() {

  try {

    const html =
      await buildDailyReportHtml();


    const preview =
      window.open(
        "",
        "_blank",
        "width=1400,height=900"
      );


    if (!preview) {

      alert(
        "Please allow pop-ups to preview the Daily Report."
      );

      return;
    }


    preview.document.open();

    preview.document.write(
      html
    );

    preview.document.close();


  } catch (err) {

    console.error(
      "DAILY REPORT ERROR:",
      err
    );

    alert(
      "Could not generate Daily Maintenance Brief."
    );
  }
}





