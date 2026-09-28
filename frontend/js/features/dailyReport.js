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

/* =====================================================
   MAINTENANCE EXECUTION MIX - DONUT CHART

   - Execution count and percentage inside donut segments
   - Legend displays colors and category names only
   - Total completed executions remain in the center
   - No changes to data calculation or classification
===================================================== */

function renderDailyReportExecutionMixChart(mix) {

  const total =
    Number(mix.total) || 0;


  /* =====================================================
     EMPTY STATE
  ===================================================== */

  if (total === 0) {

    return `
      <div class="daily-report-empty-chart">

        No completed maintenance executions
        during the reporting period.

      </div>
    `;

  }


  /* =====================================================
     EXECUTION CATEGORIES

     Preserve existing category colors and order.
  ===================================================== */

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
      label: "Corrective",
      value: mix.restoration,
      color: "#ff4848"
    }

  ];


  /* =====================================================
     DONUT DIMENSIONS

     Slightly wider ring to accommodate
     execution count and percentage labels.
  ===================================================== */

  const centerX = 80;
  const centerY = 80;

  const radius = 52;

  const strokeWidth = 34;

  const circumference =
    2 * Math.PI * radius;


  let cumulative = 0;


  /* =====================================================
     BUILD DONUT SEGMENTS AND VALUE LABELS

     Each category has:
       - Colored arc
       - Execution count
       - Percentage

     Labels are positioned at the midpoint
     of the corresponding colored arc.
  ===================================================== */

  const segments = items

    .filter(item =>
      Number(item.value) > 0
    )

    .map(item => {

      const value =
        Number(item.value) || 0;


      const percent =
        value / total;


      const pct =
        Math.round(
          percent * 100
        );


      /* ===============================================
         ARC GEOMETRY
      =============================================== */

      const dash =
        circumference * percent;


      const offset =
        -circumference * cumulative;


      /* ===============================================
         LABEL POSITION

         Calculate the midpoint of each segment.

         The donut starts at 12 o'clock.
      =============================================== */

      const midAngle =

        (
          cumulative +
          percent / 2
        ) * 2 * Math.PI;


      const labelX =

        centerX +
        radius * Math.sin(midAngle);


      const labelY =

        centerY -
        radius * Math.cos(midAngle);


      /* ===============================================
         LABEL COLORS

         Dark text for yellow segment.
         White text for blue and red segments.
      =============================================== */

      const textColor =

        item.label === "Planned"

          ? "#172033"

          : "#ffffff";


      cumulative += percent;


      /* ===============================================
         ARC + VALUE LABELS
      =============================================== */

      return {

        circle: `

          <circle

            cx="${centerX}"
            cy="${centerY}"

            r="${radius}"

            fill="none"

            stroke="${item.color}"

            stroke-width="${strokeWidth}"

            stroke-dasharray="
              ${dash} ${circumference - dash}
            "

            stroke-dashoffset="${offset}"

            transform="
              rotate(-90 ${centerX} ${centerY})
            "

          />

        `,


        label: `

          <g

            text-anchor="middle"

            fill="${textColor}"

            style="
              pointer-events:none;
            "

          >

            <!-- EXECUTION COUNT -->

            <text

              x="${labelX}"
              y="${labelY - 2}"

              font-size="10"

              font-weight="700"

            >

              ${value}

            </text>


            <!-- PERCENTAGE -->

            <text

              x="${labelX}"
              y="${labelY + 9}"

              font-size="8"

              font-weight="600"

            >

              ${pct}%

            </text>

          </g>

        `

      };

    });


  /* =====================================================
     SVG CIRCLES

     Colored donut segments.
  ===================================================== */

  const circles =

    segments

      .map(segment =>
        segment.circle
      )

      .join("");


  /* =====================================================
     SVG LABELS

     Execution count and percentage are drawn
     after the circles, so they remain visible.
  ===================================================== */

  const valueLabels =

    segments

      .map(segment =>
        segment.label
      )

      .join("");


  /* =====================================================
     LEGEND

     ONLY:
       Color indicator
       Category name

     Execution count and percentage are no longer
     displayed in the legend.
  ===================================================== */

  const legend = items

    .map(item => {

      return `

        <div class="daily-report-legend-row">


          <span

            class="daily-report-legend-dot"

            style="
              background:${item.color};
            "

          ></span>


          <span class="daily-report-legend-label">

            ${item.label}

          </span>


        </div>

      `;

    })

    .join("");


  /* =====================================================
     FINAL DONUT CHART
  ===================================================== */

  return `

    <div class="daily-report-donut-layout">


      <div class="daily-report-donut-chart">


        <svg

          viewBox="0 0 160 160"

          role="img"

          aria-label="Maintenance Execution Mix"

        >


          <!-- BACKGROUND RING -->

          <circle

            cx="${centerX}"
            cy="${centerY}"

            r="${radius}"

            fill="none"

            stroke="#edf1f5"

            stroke-width="${strokeWidth}"

          />


          <!-- COLORED SEGMENTS -->

          ${circles}


          <!-- EXECUTION VALUES INSIDE SEGMENTS -->

          ${valueLabels}


          <!-- CENTER TOTAL -->

          <text

            x="${centerX}"
            y="76"

            text-anchor="middle"

            class="daily-report-donut-center-value"

          >

            ${total}

          </text>


          <!-- CENTER LABEL -->

          <text

            x="${centerX}"
            y="94"

            text-anchor="middle"

            class="daily-report-donut-center-label"

          >

            COMPLETED

          </text>


        </svg>


      </div>


      <!-- LEGEND: COLORS AND DESCRIPTIONS ONLY -->

      <div class="daily-report-donut-legend">

        ${legend}

      </div>


    </div>

  `;

}

/* =====================================================
   SCHEDULED & BACKLOG DELIVERY PANEL

   Executive / audit-friendly visualization
   for Daily Maintenance Brief.

   COLOR CODE
   -----------------------------------------------------
   Preventive       = Blue
   Planned          = Orange
   Backlog Recovery = Green
   Outstanding      = Amber
   Overall KPI      = Navy / Neutral

   DATA
   -----------------------------------------------------
   Receives output from:
   buildDailyReportScheduledDelivery()

   No calculations are changed here.
   This function is presentation only.
===================================================== */

function renderDailyReportScheduledDeliveryPanel(delivery) {

  /* =====================
     SAFE DATA
  ====================== */

  const total =
    delivery?.total || {};

  const preventive =
    delivery?.preventive || {};

  const planned =
    delivery?.planned || {};


  const safeNumber = value => {

    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : 0;

  };


  const clampPercent = value => {

    return Math.max(
      0,
      Math.min(
        100,
        safeNumber(value)
      )
    );

  };


  /* =====================
     TOTAL VALUES
  ====================== */

  const scheduledDue =
    safeNumber(
      total.scheduledDue
    );

  const completedScheduled =
    safeNumber(
      total.completedScheduled
    );

  const completedBeforePeriod =
    safeNumber(
      total.completedBeforePeriod
    );

  const fulfilled =
    safeNumber(
      total.fulfilled
    );

  const outstanding =
    safeNumber(
      total.outstanding
    );

  const backlogRecovered =
    safeNumber(
      total.backlogRecovered
    );

  const earlyCompleted =
  safeNumber(
    total.earlyCompleted
  );  

  const completedLate =
    safeNumber(
      total.completedLate
    );

  const deliveryRate =
    clampPercent(
      total.deliveryRate
    );

  const fulfillmentRate =
    clampPercent(
      total.fulfillmentRate
    );

  const totalDelivered =
    safeNumber(
      total.totalDelivered
    );


  /* =====================
     TYPE VALUES
  ====================== */

  const preventiveDue =
    safeNumber(
      preventive.scheduledDue
    );

  const preventiveFulfilled =
    safeNumber(
      preventive.fulfilled
    );

  const preventiveOutstanding =
    safeNumber(
      preventive.outstanding
    );

  const preventiveCompleted =
    safeNumber(
      preventive.completedScheduled
    );

  const preventiveEarlier =
    safeNumber(
      preventive.completedBeforePeriod
    );

  const preventiveBacklog =
    safeNumber(
      preventive.backlogRecovered
    );

  const preventiveRate =
    clampPercent(
      preventive.fulfillmentRate
    );


  const plannedDue =
    safeNumber(
      planned.scheduledDue
    );

  const plannedFulfilled =
    safeNumber(
      planned.fulfilled
    );

  const plannedOutstanding =
    safeNumber(
      planned.outstanding
    );

  const plannedCompleted =
    safeNumber(
      planned.completedScheduled
    );

  const plannedEarlier =
    safeNumber(
      planned.completedBeforePeriod
    );

  const plannedBacklog =
    safeNumber(
      planned.backlogRecovered
    );

  const plannedRate =
    clampPercent(
      planned.fulfillmentRate
    );


  /* =====================
     DONUT
  ====================== */

  const radius = 46;

  const circumference =
    2 * Math.PI * radius;

  const fulfilledDash =
    circumference *
    fulfillmentRate /
    100;


  /* =====================
     EMPTY STATE

     There may still be backlog recovery
     even when Scheduled Due = 0.
  ====================== */

  if (
    scheduledDue === 0 &&
    backlogRecovered === 0 &&
    totalDelivered === 0
  ) {

    return `
      <div class="daily-report-empty-chart">
        No scheduled maintenance delivery activity
        during the reporting period.
      </div>
    `;

  }


  /* =====================
     FINAL PANEL
  ====================== */

  return `

    <div
      style="
        width:100%;
        box-sizing:border-box;
      "
    >

      <!-- ==========================================
           EXECUTIVE SUMMARY
      =========================================== -->

      <div
        style="
          display:grid;
          grid-template-columns:180px 1fr 1.05fr;
          gap:16px;
          align-items:stretch;
        "
      >

        <!-- =====================
             FULFILLMENT DONUT
        ====================== -->

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:175px;
          "
        >

          <svg
            viewBox="0 0 140 140"
            role="img"
            aria-label="Schedule fulfillment ${fulfillmentRate}%"
            style="
              width:155px;
              height:155px;
              overflow:visible;
            "
          >

            <circle
              cx="70"
              cy="70"
              r="${radius}"
              fill="none"
              stroke="#e8edf3"
              stroke-width="16"
            />

            <circle
              cx="70"
              cy="70"
              r="${radius}"
              fill="none"
              stroke="#27ae60"
              stroke-width="16"
              stroke-linecap="round"
              stroke-dasharray="
                ${fulfilledDash}
                ${circumference - fulfilledDash}
              "
              transform="rotate(-90 70 70)"
            />

            <text
              x="70"
              y="64"
              text-anchor="middle"
              font-size="27"
              font-weight="800"
              fill="#172033"
            >
              ${fulfillmentRate}%
            </text>

            <text
              x="70"
              y="82"
              text-anchor="middle"
              font-size="10"
              font-weight="700"
              fill="#172033"
            >
              FULFILLED
            </text>

            <text
              x="70"
              y="98"
              text-anchor="middle"
              font-size="9"
              fill="#7b8da6"
            >
              ${fulfilled} of ${scheduledDue}
            </text>

          </svg>

        </div>


        <!-- =====================
             PRIMARY COUNTERS
        ====================== -->

        <div
          style="
            border-right:1px solid #dbe3ec;
            padding-right:16px;
            display:flex;
            flex-direction:column;
            justify-content:center;
            gap:14px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
            "
          >

            <div>

              <div
                style="
                  font-size:11px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Scheduled Due
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                  margin-top:2px;
                "
              >
                Preventive + Planned
              </div>

            </div>

            <div
              style="
                font-size:25px;
                line-height:1;
                font-weight:800;
                color:#172033;
              "
            >
              ${scheduledDue}
            </div>

          </div>


          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
            "
          >

            <div>

              <div
                style="
                  font-size:11px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Fulfilled
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                  margin-top:2px;
                "
              >
                In period + completed earlier
              </div>

            </div>

            <div
              style="
                font-size:25px;
                line-height:1;
                font-weight:800;
                color:#27ae60;
              "
            >
              ${fulfilled}
            </div>

          </div>


          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
            "
          >

            <div>

              <div
                style="
                  font-size:11px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Outstanding
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                  margin-top:2px;
                "
              >
                Still open · due in period
              </div>

            </div>

            <div
              style="
                font-size:25px;
                line-height:1;
                font-weight:800;
                color:#e67e22;
              "
            >
              ${outstanding}
            </div>

          </div>

        </div>


        <!-- =====================
             EXECUTION DETAILS
        ====================== -->

        <div
          style="
            background:#f7f9fc;
            border:1px solid #e1e7ef;
            border-radius:8px;
            padding:13px 15px;
            display:flex;
            flex-direction:column;
            justify-content:center;
            gap:10px;
          "
        >

          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            "
          >

            <div>

              <div
                style="
                  font-size:10px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Completed in Period
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                "
              >
                Scheduled work executed
              </div>

            </div>

            <strong
              style="
                font-size:19px;
                color:#172033;
              "
            >
              ${completedScheduled}
            </strong>

          </div>


          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            "
          >

            <div>

              <div
                style="
                  font-size:10px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Completed Earlier
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                "
              >
                Before reporting period
              </div>

            </div>

            <strong
              style="
                font-size:19px;
                color:#58708f;
              "
            >
              ${completedBeforePeriod}
            </strong>

          </div>


          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            "
          >

            <div>

              <div
                style="
                  font-size:10px;
                  font-weight:700;
                  color:#172033;
                "
              >
                Backlog Recovered
              </div>

              <div
                style="
                  font-size:8px;
                  color:#7b8da6;
                "
              >
                Overdue completed in period
              </div>

            </div>

            <strong
              style="
                font-size:19px;
                color:#27ae60;
              "
            >
              ${backlogRecovered}
            </strong>

          </div>


          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            "
          >

              <div>

                <div>

                  <div
                    style="
                      font-size:10px;
                      font-weight:700;
                      color:#172033;
                    "
                  >
                    Future Due Completed Early
                  </div>

                  <div
                    style="
                      font-size:8px;
                      color:#7b8da6;
                    "
                  >
                    Executed in period · due after period
                  </div>

                </div>

                <strong
                  style="
                    font-size:19px;
                    color:#2f80ed;
                  "
                >
                  ${earlyCompleted}
                </strong>

            </div>

        </div>

      </div>


      <!-- ==========================================
           TYPE BREAKDOWN
      =========================================== -->

      <div
        style="
          border-top:1px solid #dbe3ec;
          margin-top:14px;
          padding-top:12px;
        "
      >

        <div
          style="
            font-size:10px;
            font-weight:800;
            color:#172033;
            text-transform:uppercase;
            letter-spacing:.5px;
            margin-bottom:10px;
          "
        >
          By Maintenance Type
        </div>


        <!-- =====================
             PREVENTIVE
        ====================== -->

        <div
          style="
            display:grid;
            grid-template-columns:105px 1fr 58px 155px;
            gap:12px;
            align-items:center;
            background:#f4f8fe;
            border:1px solid #dbe9fb;
            border-radius:7px;
            padding:9px 11px;
            margin-bottom:8px;
          "
        >

          <div>

            <div
              style="
                font-size:11px;
                font-weight:800;
                color:#2f80ed;
              "
            >
              Preventive
            </div>

            <div
              style="
                font-size:8px;
                color:#7b8da6;
              "
            >
              Scheduled maintenance
            </div>

          </div>


          <div
            style="
              height:10px;
              background:#dde6f0;
              border-radius:8px;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${preventiveRate}%;
                height:100%;
                background:#2f80ed;
                border-radius:8px;
              "
            ></div>

          </div>


          <div
            style="
              text-align:right;
              font-size:12px;
              font-weight:800;
              color:#172033;
            "
          >
            ${preventiveFulfilled}/${preventiveDue}
          </div>


          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:8px;
            "
          >

            <div
              style="
                font-size:8px;
                line-height:1.45;
                color:#64748b;
              "
            >
              Outstanding ${preventiveOutstanding}<br>
              In period ${preventiveCompleted}<br>
              Earlier ${preventiveEarlier}<br>
              Backlog ${preventiveBacklog}
            </div>

            <div
              style="
                min-width:44px;
                text-align:center;
                padding:6px 7px;
                border-radius:6px;
                background:#e5f0ff;
                color:#2f80ed;
                font-size:15px;
                font-weight:800;
              "
            >
              ${preventiveRate}%
            </div>

          </div>

        </div>


        <!-- =====================
             PLANNED
        ====================== -->

        <div
          style="
            display:grid;
            grid-template-columns:105px 1fr 58px 155px;
            gap:12px;
            align-items:center;
            background:#fff9ef;
            border:1px solid #f6e2bd;
            border-radius:7px;
            padding:9px 11px;
          "
        >

          <div>

            <div
              style="
                font-size:11px;
                font-weight:800;
                color:#e67e22;
              "
            >
              Planned
            </div>

            <div
              style="
                font-size:8px;
                color:#7b8da6;
              "
            >
              Manual planned work
            </div>

          </div>


          <div
            style="
              height:10px;
              background:#ece4d8;
              border-radius:8px;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${plannedRate}%;
                height:100%;
                background:#ffad42;
                border-radius:8px;
              "
            ></div>

          </div>


          <div
            style="
              text-align:right;
              font-size:12px;
              font-weight:800;
              color:#172033;
            "
          >
            ${plannedFulfilled}/${plannedDue}
          </div>


          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:8px;
            "
          >

            <div
              style="
                font-size:8px;
                line-height:1.45;
                color:#64748b;
              "
            >
              Outstanding ${plannedOutstanding}<br>
              In period ${plannedCompleted}<br>
              Earlier ${plannedEarlier}<br>
              Backlog ${plannedBacklog}
            </div>

            <div
              style="
                min-width:44px;
                text-align:center;
                padding:6px 7px;
                border-radius:6px;
                background:#fff0d9;
                color:#e67e22;
                font-size:15px;
                font-weight:800;
              "
            >
              ${plannedRate}%
            </div>

          </div>

        </div>

      </div>


      <!-- ==========================================
           BOTTOM MANAGEMENT METRICS
      =========================================== -->

      <div
        style="
          display:grid;
          grid-template-columns:repeat(4, 1fr);
          gap:8px;
          border-top:1px solid #dbe3ec;
          margin-top:12px;
          padding-top:10px;
        "
      >

        <div
          style="
            padding:8px 10px;
            border:1px solid #e1e7ef;
            border-radius:6px;
            background:#ffffff;
          "
        >

          <div
            style="
              font-size:8px;
              color:#7b8da6;
              text-transform:uppercase;
              font-weight:700;
            "
          >
            Period Delivery
          </div>

          <div
            style="
              font-size:17px;
              font-weight:800;
              color:#172033;
              margin-top:2px;
            "
          >
            ${deliveryRate}%
          </div>

        </div>


        <div
          style="
            padding:8px 10px;
            border:1px solid #dceee3;
            border-radius:6px;
            background:#f6fbf8;
          "
        >

          <div
            style="
              font-size:8px;
              color:#7b8da6;
              text-transform:uppercase;
              font-weight:700;
            "
          >
            Schedule Fulfillment
          </div>

          <div
            style="
              font-size:17px;
              font-weight:800;
              color:#27ae60;
              margin-top:2px;
            "
          >
            ${fulfillmentRate}%
          </div>

        </div>


        <div
          style="
            padding:8px 10px;
            border:1px solid #dceee3;
            border-radius:6px;
            background:#f6fbf8;
          "
        >

          <div
            style="
              font-size:8px;
              color:#7b8da6;
              text-transform:uppercase;
              font-weight:700;
            "
          >
            Backlog Recovered
          </div>

          <div
            style="
              font-size:17px;
              font-weight:800;
              color:#27ae60;
              margin-top:2px;
            "
          >
            ${backlogRecovered}
          </div>

        </div>


        <div
          style="
            padding:8px 10px;
            border:1px solid #f0e0ca;
            border-radius:6px;
            background:#fffaf3;
          "
        >

          <div
            style="
              font-size:8px;
              color:#7b8da6;
              text-transform:uppercase;
              font-weight:700;
            "
          >
            Total Delivered
          </div>

          <div
            style="
              font-size:17px;
              font-weight:800;
              color:#172033;
              margin-top:2px;
            "
          >
            ${totalDelivered}
          </div>

        </div>

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

  /* =====================
     TIME AXIS
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

    /* =====================
       SHOW ONLY ACTIVE BARS
       and CENTER THEM
    ====================== */

    const activeCategories =
      categories.filter(category =>
        Number(item[category.key] || 0) > 0
      );

    const activeCount =
      activeCategories.length;

    const groupWidth =
      activeCount > 0
        ? activeCount * barWidth +
          (activeCount - 1) * barGap
        : 0;

    const groupStart =
      centerX - groupWidth / 2;

    const bars = activeCategories.map(
      (category, visibleIndex) => {

        const count = Number(
          item[category.key] || 0
        );

        const minutes = Number(
          item.minutes?.[category.key] || 0
        );

        const withDuration = Number(
          item.withDuration?.[category.key] || 0
        );

        const x =
          groupStart +
          visibleIndex * (barWidth + barGap);

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

        const timeY = y - 6;
        const countY = y + (barHeight / 2) + 4;

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
              font-size="9"
              font-weight="700"
              fill="#111111"
            >${escapeSvg(timeLabel)}</text>

            <text
              x="${barCenter}"
              y="${countY}"
              text-anchor="middle"
              font-size="12"
              font-weight="700"
              fill="#111111"
            >${count}</text>

          </g>
        `;
      }
    ).join("");

    return `
      <g>

        <!-- subtle center guide -->
        <line
          x1="${centerX}"
          y1="${plotBottom + 2}"
          x2="${centerX}"
          y2="192"
          stroke="#cbd5e1"
          stroke-width="1"
          stroke-dasharray="3 3"
          opacity="0.8"
        />

        ${bars}

        <text
          x="${centerX}"
          y="203"
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
   BUILD DAILY REPORT
   SCHEDULED & BACKLOG DELIVERY
===================================================== */

function buildDailyReportScheduledDelivery(
  executions,
  tasks,
  from,
  to
) {

  /* =====================
     PERIOD
  ====================== */

  const periodFrom =
    from instanceof Date
      ? from
      : new Date(from);

  const periodTo =
    to instanceof Date
      ? to
      : new Date(to);


  /* =====================
     SAFE DATE
  ====================== */

  function parseDate(value) {

    if (!value) {
      return null;
    }

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;

  }


  function inPeriod(date) {

    return (
      date &&
      date >= periodFrom &&
      date <= periodTo
    );

  }


  /* =====================
     UTC DUE-DAY BOUNDARIES

     Due-day logic:
     due timestamp -> end of same UTC calendar day.

     Example:
     Due 28/09 09:00

     28/09 11:00 = Late Same-Day
     28/09 23:30 = Late Same-Day
     29/09 00:00 = After Due-Day
  ====================== */

  function getUtcDayStart(date) {

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      )
    );

  }


  function getUtcNextDayStart(date) {

    const start =
      getUtcDayStart(date);

    return new Date(
      start.getTime() +
      24 * 60 * 60 * 1000
    );

  }


  /* =====================
     MAINTENANCE CATEGORY

     Corrective / Restoration excluded.

     Preventive:
     frequency_hours > 0

     Planned:
     manual planned maintenance

     Legacy unplanned records excluded.
  ====================== */

  function getCategory(row) {

    if (
      row?.breakdown_id !== null &&
      row?.breakdown_id !== undefined
    ) {
      return null;
    }

    if (
      Number(
        row?.frequency_hours
      ) > 0
    ) {
      return "preventive";
    }

    if (
      row?.is_planned === false ||
      String(
        row?.is_planned
      ).toLowerCase() === "false"
    ) {
      return null;
    }

    return "planned";

  }


  /* =====================
     RESULT BUCKET
  ====================== */

  function createBucket() {

    return {

      /* Schedule */
      scheduledDue: 0,
      fulfilled: 0,
      outstanding: 0,
      scheduleGap: 0,

      /* Executions related to current schedule */
      completedScheduled: 0,
      completedBeforePeriod: 0,
      completedLate: 0,
      completedAfterDueDay: 0,

      /* Other delivered work */
      backlogRecovered: 0,
      earlyCompleted: 0,

      /* Rates */
      deliveryRate: 0,
      fulfillmentRate: 0,

      /* All Preventive + Planned executions
         completed inside reporting period */
      totalDelivered: 0

    };

  }


  const result = {

    total:
      createBucket(),

    preventive:
      createBucket(),

    planned:
      createBucket()

  };


  /* =====================
     OCCURRENCE SETS

     task_id + due timestamp
     identifies one scheduled occurrence.
  ====================== */

  function createSets() {

    return {

      scheduledDue:
        new Set(),

      completedScheduled:
        new Set(),

      completedBeforePeriod:
        new Set(),

      outstanding:
        new Set(),

      backlogRecovered:
        new Set(),

      earlyCompleted:
        new Set(),

      completedLate:
        new Set(),

      completedAfterDueDay:
        new Set()

    };

  }


  const sets = {

    total:
      createSets(),

    preventive:
      createSets(),

    planned:
      createSets()

  };


  /* =====================
     OCCURRENCE KEY
  ====================== */

  function getOccurrenceKey(
    row,
    dueDate
  ) {

    const taskId =
      row?.task_id ??
      row?.id ??
      "unknown";

    return (
      String(taskId) +
      "|" +
      dueDate.toISOString()
    );

  }


  /* =====================
     ADD TO CATEGORY
     + TOTAL
  ====================== */

  function addToSet(
    category,
    metric,
    key
  ) {

    sets.total[metric].add(
      key
    );

    sets[category][metric].add(
      key
    );

  }


  /* =====================================================
     COMPLETED EXECUTIONS

     Historical occurrence due date:
     task_executions.prev_due_date
  ====================================================== */

  const executionRows =
    Array.isArray(executions)
      ? executions
      : [];


  executionRows.forEach(row => {

    const category =
      getCategory(row);

    if (!category) {
      return;
    }


    const executedAt =
      parseDate(
        row.executed_at
      );

    const dueAt =
      parseDate(
        row.prev_due_date
      );


    if (
      !executedAt ||
      !dueAt
    ) {
      return;
    }


    const key =
      getOccurrenceKey(
        row,
        dueAt
      );


    const dueInPeriod =
      inPeriod(
        dueAt
      );

    const executionInPeriod =
      inPeriod(
        executedAt
      );


    const dueDayStart =
      getUtcDayStart(
        dueAt
      );

    const nextDueDay =
      getUtcNextDayStart(
        dueAt
      );


    /* =====================
       SCHEDULED DUE

       Historical occurrence belongs
       to this report's schedule.
    ====================== */

    if (dueInPeriod) {

      addToSet(
        category,
        "scheduledDue",
        key
      );

    }


    /* =====================
       COMPLETED BEFORE PERIOD

       Due belongs to report period,
       but task had already been
       completed before period started.

       This counts as fulfilled.
    ====================== */

    if (
      dueInPeriod &&
      executedAt < periodFrom
    ) {

      addToSet(
        category,
        "completedBeforePeriod",
        key
      );

      return;

    }


    /* =====================
       From this point onward
       only executions actually
       completed inside report period.
    ====================== */

    if (!executionInPeriod) {
      return;
    }


    /* =====================
       A) DUE IN PERIOD
       COMPLETED IN PERIOD

       Regardless whether completion
       was same-day or after due-day,
       scheduled work was completed.

       Therefore it counts as:
       - Completed in Period
       - Fulfilled
       - Period Delivery
    ====================== */

    if (dueInPeriod) {

      addToSet(
        category,
        "completedScheduled",
        key
      );


      /* =====================
         LATE SAME-DAY

         After exact due time
         but before next calendar day.
      ====================== */

      if (
        executedAt > dueAt &&
        executedAt < nextDueDay
      ) {

        addToSet(
          category,
          "completedLate",
          key
        );

      }


      /* =====================
         COMPLETED AFTER DUE-DAY

         Example:
         Due 23/09
         Completed 24/09

         Still Completed in Period
         and Fulfilled, but separately
         visible as schedule lateness.
      ====================== */

      if (
        executedAt >= nextDueDay
      ) {

        addToSet(
          category,
          "completedAfterDueDay",
          key
        );

      }

      return;

    }


    /* =====================
       B) OLD BACKLOG RECOVERED

       Due date existed before the
       reporting period.

       Task was completed during
       this reporting period.

       This is true backlog recovery.
    ====================== */

    if (
      dueAt < periodFrom
    ) {

      addToSet(
        category,
        "backlogRecovered",
        key
      );

      return;

    }


    /* =====================
       C) FUTURE DUE
       COMPLETED EARLY

       Execution happened during
       this reporting period but the
       scheduled due date is AFTER
       the report period.

       This must count in
       Total Delivered because work
       was actually completed now.

       It does NOT belong to this
       period's Scheduled Due.
    ====================== */

    if (
      dueAt > periodTo
    ) {

      addToSet(
        category,
        "earlyCompleted",
        key
      );

    }

  });


  /* =====================================================
     CURRENT OPEN TASKS

     /tasks contains only:
     Planned / Overdue open occurrences.

     due_date represents the current
     scheduled occurrence.
  ====================================================== */

  const taskRows =
    Array.isArray(tasks)
      ? tasks
      : [];


  taskRows.forEach(row => {

    const category =
      getCategory(row);

    if (!category) {
      return;
    }


    const dueAt =
      parseDate(
        row.due_date
      );

    if (!dueAt) {
      return;
    }


    if (
      !inPeriod(
        dueAt
      )
    ) {
      return;
    }


    const key =
      getOccurrenceKey(
        {
          ...row,
          task_id:
            row.id
        },
        dueAt
      );


    /* =====================
       This occurrence belongs
       to the selected schedule.
    ====================== */

    addToSet(
      category,
      "scheduledDue",
      key
    );


    /* =====================
       Still open.
    ====================== */

    addToSet(
      category,
      "outstanding",
      key
    );

  });


  /* =====================================================
     FINALIZE COUNTS
  ====================================================== */

  [
    "total",
    "preventive",
    "planned"
  ].forEach(category => {

    const bucket =
      result[category];

    const categorySets =
      sets[category];


    bucket.scheduledDue =
      categorySets
        .scheduledDue
        .size;


    bucket.completedScheduled =
      categorySets
        .completedScheduled
        .size;


    bucket.completedBeforePeriod =
      categorySets
        .completedBeforePeriod
        .size;


    bucket.outstanding =
      categorySets
        .outstanding
        .size;


    bucket.backlogRecovered =
      categorySets
        .backlogRecovered
        .size;


    bucket.earlyCompleted =
      categorySets
        .earlyCompleted
        .size;


    bucket.completedLate =
      categorySets
        .completedLate
        .size;


    bucket.completedAfterDueDay =
      categorySets
        .completedAfterDueDay
        .size;


    /* =====================
       FULFILLED SCHEDULE

       Work due in this reporting
       period that has been covered:

       - Completed during period
       - Completed before period

       Work completed after its due-day
       still counts as fulfilled because
       it is no longer outstanding.
    ====================== */

    bucket.fulfilled =
      bucket.completedScheduled +
      bucket.completedBeforePeriod;


    /* =====================
       SCHEDULE GAP

       Current unfulfilled part
       of this period's schedule.

       Should normally equal
       Outstanding.
    ====================== */

    bucket.scheduleGap =
      Math.max(
        0,
        bucket.scheduledDue -
        bucket.fulfilled
      );


    /* =====================
       PERIOD DELIVERY RATE

       Scheduled work due in this
       period AND completed during
       this reporting period.
    ====================== */

    bucket.deliveryRate =
      bucket.scheduledDue > 0

        ? Math.round(
            bucket.completedScheduled *
            100 /
            bucket.scheduledDue
          )

        : 0;


    /* =====================
       SCHEDULE FULFILLMENT

       Total schedule coverage,
       including work completed
       before the reporting period.
    ====================== */

    bucket.fulfillmentRate =
      bucket.scheduledDue > 0

        ? Math.round(
            bucket.fulfilled *
            100 /
            bucket.scheduledDue
          )

        : 0;


    /* =====================
       TOTAL DELIVERED

       ALL Preventive + Planned work
       actually completed during
       reporting period:

       1. Current schedule completed
       2. Old backlog recovered
       3. Future work completed early

       This should reconcile with:

       Execution Mix:
       Preventive + Planned
    ====================== */

    bucket.totalDelivered =
      bucket.completedScheduled +
      bucket.backlogRecovered +
      bucket.earlyCompleted;

  });


  return result;

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


  /* =====================
     ACTIVE TASKS
  ====================== */

  const tasks =
    Array.isArray(
      state.tasksData
    )
      ? state.tasksData
      : [];


  /* =====================
     SCHEDULED & BACKLOG DELIVERY

     IMPORTANT:
     Uses ALL executions, not only executions
     inside the reporting period.

     This is required in order to identify:
     - Scheduled Completed
     - Completed Before Period
     - Backlog Recovered
     - Outstanding scheduled work
  ====================== */

  const scheduledDelivery =
    buildDailyReportScheduledDelivery(
      executions,
      tasks,
      from,
      to
    );


  /* =====================
     EXECUTIONS IN PERIOD
  ====================== */

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
     STARTED during this reporting period.
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


  /* =====================
     FINAL REPORT DATA
  ====================== */

  return {

    period: {
      from,
      to
    },

    executions24h,

    executionMix,

    scheduledDelivery,

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
              No Corrective executions were completed
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
      label: "OPEN CORRECTIVE",
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
      );


  /* =====================
     REPORT VISUALS
  ====================== */

  template =
    template

      .replace(
        "{{SCHEDULED_DELIVERY_PANEL}}",
        renderDailyReportScheduledDeliveryPanel(
          data.scheduledDelivery
        )
      )

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
      );


  /* =====================
     NEXT 24H WORKLOAD OUTLOOK

     Populate Page 3 using current task data.
     Historical report period remains unchanged.
  ====================== */

  template =
    template.replace(
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


