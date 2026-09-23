/* =====================================================
   DAILY MAINTENANCE REPORT
   Standalone report logic
===================================================== */


/* =====================================================
   DAILY MAINTENANCE REPORT PERIOD

   Default:
     Monday: rolling last 72 hours
     All other days: rolling last 24 hours

   Optional:
     Last 7 Days checkbox: rolling last 168 hours

   Report period always ends at the time of generation.
===================================================== */

function getDailyReportPeriod() {

  const to = new Date();

  const last7Days =
    document.getElementById("dailyReport7Days")?.checked === true;

  const hours = last7Days
    ? 168
    : (to.getDay() === 1 ? 72 : 24);

  const from = new Date(
    to.getTime() - hours * 60 * 60 * 1000
  );

  return { from, to };
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

function formatDailyReportMinutes(value) {

  const totalMinutes =
    Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    );


  const hours =
    Math.floor(
      totalMinutes / 60
    );


  const minutes =
    totalMinutes % 60;


  if (hours > 0) {

    return (
      `${hours}h ` +
      `${minutes}m`
    );
  }


  return `${minutes}m`;
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


    // Planned
    else {

      mix.planned++;

    }

  });


  mix.total =
    mix.preventive +
    mix.planned +
    mix.restoration;

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
      color: "#ffc156"
    },

    {
      label: "Correction",
      value: mix.restoration,
      color: "#ff4848"
    },

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

function renderDailyReportBreakdownOutcomeChart(outcome) {

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

  const byLine = new Map();

  executions.forEach(e => {

    const line = String(
      e.line ||
      e.line_code ||
      e.line_name ||
      "Unassigned"
    ).trim();

    if (!byLine.has(line)) {

      byLine.set(line, {
        line,

        preventive: 0,
        planned: 0,
        restoration: 0,
        legacyUnplanned: 0,
        total: 0,

        minutes: {
          preventive: 0,
          planned: 0,
          restoration: 0
        },

        withDuration: {
          preventive: 0,
          planned: 0,
          restoration: 0
        }
      });
    }

    const item = byLine.get(line);

    const executionType = String(
      e.type || ""
    ).trim().toLowerCase();

    let category;

    /* =====================
       CORRECTIVE

       Internally: restoration

       Breakdown-linked executions
       and explicitly classified
       legacy corrective executions.
    ====================== */

    if (
      e.breakdown_id != null ||
      [
        "restoration",
        "corrective",
        "unplanned",
        "breakdown"
      ].includes(executionType)
    ) {

      category = "restoration";

    }

    /* =====================
       PREVENTIVE
    ====================== */

    else if (
      e.frequency_hours != null &&
      Number(e.frequency_hours) > 0
    ) {

      category = "preventive";

    }

    /* =====================
       PLANNED
    ====================== */

    else {

      category = "planned";

    }

    item[category]++;
    item.total++;

    /* =====================
       RECORDED SERVICE TIME

       duration_min is measured
       in minutes.

       Missing duration is NOT
       treated as a recorded 0m.
    ====================== */

    if (
      e.duration_min != null &&
      e.duration_min !== ""
    ) {

      const duration = Number(e.duration_min);

      if (
        Number.isFinite(duration) &&
        duration >= 0
      ) {

        item.minutes[category] += duration;
        item.withDuration[category]++;

      }
    }

  });

  return Array.from(byLine.values())
    .sort(
      (a, b) =>
        String(a.line).localeCompare(
          String(b.line),
          "el",
          { numeric: true }
        )
    );
}

function renderDailyReportLineActivityChart(items) {

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

  /* =====================
     LOCAL DISPLAY HELPERS
  ====================== */

  const escapeSvg = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );

  const formatMinutes = value => {

    const minutes = Math.round(
      Math.max(0, Number(value) || 0)
    );

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    if (hours > 0) {
      return remaining > 0
        ? `${hours}h${remaining}m`
        : `${hours}h`;
    }

    return `${minutes}m`;
  };

  /* =====================
     DISPLAY CATEGORIES

     restoration remains the
     internal data property.
  ====================== */

  const categories = [
    {
      key: "planned",
      label: "Planned",
      color: "#ffad42"
    },
    {
      key: "preventive",
      label: "Preventive",
      color: "#2f80ed"
    },
    {
      key: "restoration",
      label: "Corrective",
      color: "#ff4848"
    }
  ];

  /* =====================
     CHART DIMENSIONS
  ====================== */

  const width = Math.max(
    850,
    80 + items.length * 138
  );

  const height = 250;

  const plotLeft = 52;
  const plotRight = width - 12;

  const plotTop = 45;
  const plotBottom = 182;

  const plotHeight = plotBottom - plotTop;

  const slotWidth =
    (plotRight - plotLeft) / items.length;

  const barWidth = 24;
  const barGap = 14;

  const groupWidth =
    3 * barWidth + 2 * barGap;

  /* =====================
     TIME AXIS

     All bar heights represent
     recorded service minutes.
  ====================== */

  const maxMinutes = Math.max(
    0,
    ...items.flatMap(item =>
      categories.map(category =>
        Number(
          item.minutes?.[category.key] || 0
        )
      )
    )
  );

  const axisMax = Math.max(
    60,
    Math.ceil(maxMinutes / 60) * 60
  );

  const grid = Array.from(
    { length: 5 },
    (_, index) => {

      const ratio = index / 4;

      const y =
        plotBottom - ratio * plotHeight;

      const hours =
        axisMax * ratio / 60;

      return `
        <line
          x1="${plotLeft}"
          y1="${y}"
          x2="${plotRight}"
          y2="${y}"
          stroke="#dce5f0"
          stroke-dasharray="${index === 0 ? "none" : "4 4"}"
        />

        <text
          x="${plotLeft - 8}"
          y="${y + 3}"
          text-anchor="end"
          font-size="10"
          fill="#64748b"
        >${hours.toFixed(1)}h</text>
      `;
    }
  ).join("");

  /* =====================
     VERTICAL BAR GROUPS
  ====================== */

  const groups = items.map((item, index) => {

    const centerX =
      plotLeft +
      slotWidth * (index + 0.5);

    const groupStart =
      centerX - groupWidth / 2;

    const bars = categories.map(
      (category, categoryIndex) => {

        const count = Number(
          item[category.key] || 0
        );

        if (count === 0) {
          return "";
        }

        const minutes = Number(
          item.minutes?.[category.key] || 0
        );

        const withDuration = Number(
          item.withDuration?.[category.key] || 0
        );

        const x =
          groupStart +
          categoryIndex * (barWidth + barGap);

        const barCenter =
          x + barWidth / 2;

        const barHeight = Math.max(
          10,
          minutes / axisMax * plotHeight
        );

        const y =
          plotBottom - barHeight;

        const timeLabel =
          withDuration > 0
            ? formatMinutes(minutes)
            : "—";

        const detail =
          `${category.label}: ` +
          `${count} executions, ` +
          `${timeLabel} recorded`;

        /* =====================
           LABEL POSITIONS
           - time at top inside bar
           - count at bottom inside bar
        ====================== */

        const timeY =
          y + 11;

        const countY =
          plotBottom - 5;

        return `
          <g>

            <title>
              ${escapeSvg(item.line)} ·
              ${escapeSvg(detail)}
            </title>

            <rect
              x="${x}"
              y="${y}"
              width="${barWidth}"
              height="${barHeight}"
              rx="3"
              fill="${category.color}"
            />

            <text
              x="${barCenter}"
              y="${timeY}"
              text-anchor="middle"
              font-size="8"
              font-weight="700"
              fill="#ffffff"
            >${escapeSvg(timeLabel)}</text>

            <text
              x="${barCenter}"
              y="${countY}"
              text-anchor="middle"
              font-size="10"
              font-weight="700"
              fill="#ffffff"
            >${count}</text>

          </g>
        `;
      }
    ).join("");

    return `
      <g>

        ${bars}

        <text
          x="${centerX}"
          y="199"
          text-anchor="middle"
          font-size="11"
          font-weight="700"
          fill="#172033"
        >${escapeSvg(item.line)}</text>

      </g>
    `;
  }).join("");

  /* =====================
     FINAL CHART
  ====================== */

  return `

    <svg
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Maintenance Activity by Line: recorded time and completed executions"
    >

      ${grid}

      ${groups}

    </svg>

    <div class="daily-report-chart-legend">

      <div class="daily-report-chart-legend-item">
        <span
          class="daily-report-chart-legend-swatch"
          style="background:#ffad42;"
        ></span>
        Planned
      </div>

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
          style="background:#ff4848;"
        ></span>
        Corrective
      </div>

    </div>
  `;
}

function buildDailyReportWorkload(executions) {

  const totalExecutions =
    Array.isArray(executions)
      ? executions.length
      : 0;


  const totalMinutes =
    Array.isArray(executions)

      ? executions.reduce(
          (sum, e) =>
            sum +
            Number(
              e.duration_min || 0
            ),
          0
        )

      : 0;


  const avgMinutes =
    totalExecutions > 0

      ? Math.round(
          totalMinutes /
          totalExecutions
        )

      : 0;


  return {
    totalExecutions,
    totalMinutes,
    avgMinutes
  };
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
  
  const workload =
  buildDailyReportWorkload(
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

    workload,

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
            ? "#d64545"
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
              No Correction executions were completed
              during the reporting period.
            `
        }

      </div>

    </div>
  `);


  return rows.join("");
}

function buildDailyReportWorkloadHtml(
  workload
) {

  return `
    <div class="daily-report-workload">

      <div class="daily-report-workload-item">

        <div class="daily-report-workload-label">
          Recorded Work Time
        </div>

        <div class="daily-report-workload-value">
          ${formatDailyReportMinutes(
            workload.totalMinutes
          )}
        </div>

      </div>


      <div class="daily-report-workload-item">

        <div class="daily-report-workload-label">
          Completed Executions
        </div>

        <div class="daily-report-workload-value">
          ${workload.totalExecutions}
        </div>

      </div>


      <div class="daily-report-workload-item">

        <div class="daily-report-workload-label">
          Avg / Execution
        </div>

        <div class="daily-report-workload-value">
          ${formatDailyReportMinutes(
            workload.avgMinutes
          )}
        </div>

      </div>

    </div>
  `;
}

/* =====================================================
   NEXT 24H OTHER WORK

   Read-only summary from existing task data:
   - Other Planned Tasks due in next 24H
   - All open BD-linked Restoration Tasks
   - Total open Overdue Backlog

   Overdue Backlog is informational and may overlap
   with the categories shown elsewhere on Page 3.
   It must not be added to the next-24H workload.
===================================================== */

function buildDailyReportOtherWorkHtml(now, end) {

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tasks = Array.isArray(state.tasksData)
    ? state.tasksData
    : [];

  const isOpen = t =>
    String(t.status || "").trim().toLowerCase() !== "done";

  // due_date represents a calendar date,
  // not a confirmed maintenance execution time.

  const getDue = t => {

    if (!t.due_date) return null;

    const datePart =
      String(t.due_date).slice(0, 10);

    const due =
      new Date(`${datePart}T00:00:00`);

    return Number.isNaN(due.getTime())
      ? null
      : due;
  };

  const getEstimate = t => {

    const minutes =
      Number(t.duration_min);

    return (
      t.duration_min != null &&
      t.duration_min !== "" &&
      Number.isFinite(minutes) &&
      minutes > 0
    )
      ? minutes
      : null;
  };

  const summarize = selectedTasks => ({

    count: selectedTasks.length,

    minutes: selectedTasks.reduce(
      (sum, t) =>
        sum + (getEstimate(t) ?? 0),
      0
    ),

    withoutEstimate: selectedTasks.filter(
      t => getEstimate(t) === null
    ).length

  });


  // Open manual Planned Tasks due today or tomorrow.
  // Exclude Preventive and BD-linked Restoration Tasks.

  const planned = tasks.filter(t => {

    const due = getDue(t);

    return (
      isOpen(t) &&
      t.breakdown_id == null &&
      Number(t.frequency_hours) <= 0 &&
      isPlannedManual(t) &&
      due !== null &&
      due >= today &&
      due <= end
    );

  });


  // All open tasks linked to a Breakdown.

  const restoration = tasks.filter(t =>
    isOpen(t) &&
    t.breakdown_id != null
  );


  // Overall overdue backlog.
  // Informational only: may include Preventive,
  // Planned or Restoration tasks shown elsewhere.

  const overdueBacklog = tasks.filter(t => {

    const due = getDue(t);

    return (
      isOpen(t) &&
      due !== null &&
      due < today
    );

  });


  const items = [

    {
      label: "OTHER PLANNED",
      data: summarize(planned),
      note: "Due in next 24H"
    },

    {
      label: "OPEN CORRECTION",
      data: summarize(restoration),
      note: "All open BD-linked tasks"
    },

    {
      label: "OVERDUE BACKLOG",
      data: summarize(overdueBacklog),
      note: "Total overdue · informational"
    }

  ];


  const cards = items.map(item => `

    <div class="daily-report-workload-item">

      <div class="daily-report-workload-label">
        ${item.label}
      </div>

      <div class="daily-report-workload-value">
        ${item.data.count} tasks
      </div>

      <p>
        Estimated workload:
        <strong>
          ${formatDailyReportMinutes(item.data.minutes)}
        </strong>
      </p>

      <p>
        ${item.note}
      </p>

      ${
        item.data.withoutEstimate > 0
          ? `
            <p>
              ${item.data.withoutEstimate}
              task(s) without estimated duration
            </p>
          `
          : ""
      }

    </div>

  `).join("");


  return `

    <div class="daily-report-chart-card daily-report-chart-card-wide">

      <div class="daily-report-chart-header">

        <div>

          <h2 class="daily-report-chart-title">
            Other Work
          </h2>

          <div class="daily-report-chart-subtitle">
            Planned work, open Correction and overall
            Overdue Backlog
          </div>

        </div>

      </div>

      <div class="daily-report-workload">
        ${cards}
      </div>

    </div>

  `;

}

/* =====================================================
   NEXT 24H PREVENTIVE ASSET WORKLOAD

   Read-only:
   - Uses existing Asset Dashboard risk ranking
   - Shows up to 3 candidate assets
   - Includes open Preventive Tasks due by next 24H
   - Displays estimated workload separately per asset

   No task assignment or status changes.
===================================================== */

function buildDailyReportNext24HAssetsHtml(reportTime) {

  const now = new Date(reportTime);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const end = new Date(
    now.getTime() + 24 * 60 * 60 * 1000
  );

  const tasks = Array.isArray(state.tasksData)
    ? state.tasksData
    : [];

  // Same risk ranking as the existing Asset Dashboard.
  // Do not limit the search to the 12 displayed cards.

  const rankedAssets =
    getTopWorstAssetsDashboard(Number.MAX_SAFE_INTEGER);

  const escapeHtml = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );

  const candidates = rankedAssets
    .map(asset => {

      const assetTasks = tasks.filter(t => {

        // Match the asset by serial number and line.

        if (
          String(t.serial_number || "").trim() !==
          String(asset.serial || "").trim() ||
          String(t.line_code || "").trim() !==
          String(asset.line || "").trim()
        ) {
          return false;
        }

        // Only open Preventive Tasks.

        if (
          t.status === "Done" ||
          t.breakdown_id != null ||
          Number(t.frequency_hours) <= 0 ||
          !t.due_date
        ) {
          return false;
        }

        // Due dates are calendar dates, not confirmed
        // maintenance execution times.

        const datePart =
          String(t.due_date).slice(0, 10);

        const due =
          new Date(`${datePart}T00:00:00`);

        return (
          !Number.isNaN(due.getTime()) &&
          due <= end
        );

      });

      const overdue = assetTasks.filter(t => {

        const datePart =
          String(t.due_date).slice(0, 10);

        const due =
          new Date(`${datePart}T00:00:00`);

        return due < today;

      }).length;

      const estimatedMinutes = assetTasks.reduce(
        (sum, t) => {

          const minutes = Number(t.duration_min);

          return sum + (
            Number.isFinite(minutes) && minutes > 0
              ? minutes
              : 0
          );

        },
        0
      );

      const withoutEstimate = assetTasks.filter(t => {

        const minutes = Number(t.duration_min);

        return (
          t.duration_min == null ||
          t.duration_min === "" ||
          !Number.isFinite(minutes) ||
          minutes <= 0
        );

      }).length;

      return {
        ...asset,
        overdueTasks: overdue,
        dueTasks: assetTasks.length - overdue,
        totalTasks: assetTasks.length,
        estimatedMinutes,
        withoutEstimate
      };

    })
    .filter(asset => asset.totalTasks > 0)
    .slice(0, 3);


  if (candidates.length === 0) {

    return `
      <div class="daily-report-empty-chart">
        No open Preventive Tasks found for the next 24H
        candidate assets.
      </div>
    `;

  }


  const cards = candidates.map((asset, index) => {

    const workload =
      asset.estimatedMinutes > 0
        ? formatDailyReportMinutes(
            asset.estimatedMinutes
          )
        : "—";

    return `
      <div class="daily-report-workload-item">

        <div class="daily-report-workload-label">
          CANDIDATE ${index + 1}
        </div>

        <h3>
          ${escapeHtml(asset.line)}
          ·
          ${escapeHtml(asset.machine)}
        </h3>

        <div>
          SN ${escapeHtml(asset.serial)}
        </div>

        <p>
          <strong>
            ${escapeHtml(asset.riskLabel)}
          </strong>
          ·
          Score ${escapeHtml(asset.score)}
        </p>

        <p>
          Overdue:
          <strong>${asset.overdueTasks}</strong>

          <br>

          Due in next 24H:
          <strong>${asset.dueTasks}</strong>

          <br>

          Total Preventive Tasks:
          <strong>${asset.totalTasks}</strong>
        </p>

        <div class="daily-report-workload-label">
          ESTIMATED WORKLOAD
        </div>

        <div class="daily-report-workload-value">
          ${workload}
        </div>

        ${
          asset.withoutEstimate > 0
            ? `
              <p>
                ${asset.withoutEstimate}
                task(s) without estimated duration
              </p>
            `
            : ""
        }

      </div>
    `;

  }).join("");


  return `

    <div class="daily-report-period">
      ${formatDailyReportDateTime(now)}
      →
      ${formatDailyReportDateTime(end)}
    </div>

    <div class="daily-report-workload">
      ${cards}
    </div>

    <!-- =====================
         NEXT 24H OTHER WORK
         Read-only information from existing tasks.
    ====================== -->

    ${buildDailyReportOtherWorkHtml(now, end)}

  `;

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
      )

      .replace(
        "{{MAINTENANCE_WORKLOAD}}",
        buildDailyReportWorkloadHtml(
          data.workload
        )
      )
;


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


    /* =====================
      NEXT 24H WORKLOAD OUTLOOK

      Populate Page 3 using current task data.
      Historical report period remains unchanged.
    ====================== */

    template = template.replace(
      "Workload data not connected yet.",
      buildDailyReportNext24HAssetsHtml(
        data.period.to
      )
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

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const btn =
      document.getElementById(
        "openDailyReportBtn"
      );

    const checkbox =
      document.getElementById(
        "dailyReport7Days"
      );

    if (!btn) return;

    // Update button title based on selected period
    function updateReportButtonTitle() {

      btn.textContent =
        checkbox?.checked
          ? "7 Days Report"
          : "24H Report";

    }

    if (checkbox) {

      checkbox.addEventListener(
        "change",
        updateReportButtonTitle
      );

    }

    // Set the correct title on page load
    updateReportButtonTitle();

    // Open report
    btn.addEventListener(
      "click",
      () => {
        openDailyReportPreview();
      }
    );

  }
);


