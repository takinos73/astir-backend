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


  /* =====================
     ACTIVE BREAKDOWNS
     Current plant status
  ====================== */

  const activeBreakdowns =
    breakdowns.filter(b => {

      return (
        String(
          b.status || ""
        ).toUpperCase() !==
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

    breakdowns,

    newBreakdowns24h,

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
        `
          <div class="daily-report-chart-placeholder">
            Reliability Impact chart
          </div>
        `
      )

      .replace(
        "{{LINE_ACTIVITY_CHART}}",
        `
          <div class="daily-report-chart-placeholder">
            Maintenance Activity by Line chart
          </div>
        `
      )

      .replace(
        "{{PAGE1_SUMMARY}}",
        `
          ${data.kpis.completed}
          maintenance tasks completed ·
          ${data.kpis.newBreakdowns}
          new Breakdown incidents ·
          ${formatDailyReportSeconds(
            data.kpis.effectiveDownSeconds
          )}
          Effective DOWN.
        `
      )

      .replace(
        "{{REPORT_INSIGHTS}}",
        `
          Daily reliability insights
          will be added after chart implementation.
        `
      );


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





