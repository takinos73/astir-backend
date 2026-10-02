/* =========================================================
   MANAGEMENT DASHBOARD
========================================================= */

(() => {

  /* =====================
     STATE
  ===================== */

  const managementState = {
    period: "month",
    area: "all",
    from: null,
    to: null
  };


  /* =====================
     ELEMENTS
  ===================== */

  const periodButtons =
    document.querySelectorAll("[data-management-period]");

  const areaButtons =
    document.querySelectorAll("[data-management-area]");

  const customPeriod =
    document.getElementById("managementCustomPeriod");

  const fromInput =
    document.getElementById("managementFromDate");

  const toInput =
    document.getElementById("managementToDate");

  const applyPeriodBtn =
    document.getElementById("managementApplyPeriodBtn");

  const scopeLabel =
    document.getElementById("managementScopeLabel");


  /* =====================
     HELPERS
  ===================== */

  function formatDateForLabel(date) {

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

  }


  function getThisWeekRange() {

    const now = new Date();

    const day = now.getDay();

    const diffToMonday =
      day === 0
        ? -6
        : 1 - day;

    const from =
      new Date(now);

    from.setDate(
      now.getDate() + diffToMonday
    );

    from.setHours(
      0,
      0,
      0,
      0
    );

    const to =
      new Date();

    return {
      from,
      to
    };

  }


  function getThisMonthRange() {

    const now = new Date();

    const from =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

    const to =
      new Date();

    return {
      from,
      to
    };

  }


  function getCurrentRange() {

    if (managementState.period === "week") {
      return getThisWeekRange();
    }

    if (managementState.period === "month") {
      return getThisMonthRange();
    }

    if (
      managementState.period === "custom" &&
      managementState.from &&
      managementState.to
    ) {

      return {
        from: new Date(managementState.from),
        to: new Date(managementState.to)
      };

    }

    return null;

  }


  function getAreaLabel() {

    switch (managementState.area) {

      case "litho":
        return "Litho";

      case "crown":
        return "Crown";

      default:
        return "All Plant";

    }

  }


  function updateScopeLabel() {

    if (!scopeLabel) {
      return;
    }

    const range =
      getCurrentRange();

    const area =
      getAreaLabel();

    if (!range) {

      scopeLabel.textContent =
        `Custom Period · ${area}`;

      return;

    }

    scopeLabel.textContent =
      `${formatDateForLabel(range.from)} – ${formatDateForLabel(range.to)} · ${area}`;

  }


  /* =====================
     PERIOD FILTER
  ===================== */

  periodButtons.forEach(btn => {

    btn.addEventListener("click", () => {

      periodButtons.forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      managementState.period =
        btn.dataset.managementPeriod;

      if (managementState.period === "custom") {

        if (customPeriod) {
          customPeriod.style.display = "flex";
        }

      } else {

        if (customPeriod) {
          customPeriod.style.display = "none";
        }

        managementState.from = null;
        managementState.to = null;

      }

        updateScopeLabel();

        if (managementState.period !== "custom") {
        loadManagementDashboardData();
        }

    });

  });


  /* =====================
     AREA FILTER
  ===================== */

  areaButtons.forEach(btn => {

    btn.addEventListener("click", () => {

      areaButtons.forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      managementState.area =
        btn.dataset.managementArea;

        updateScopeLabel();
        loadManagementDashboardData();

    });

  });


  /* =====================
     CUSTOM PERIOD
  ===================== */

  if (applyPeriodBtn) {

    applyPeriodBtn.addEventListener("click", () => {

      if (
        !fromInput?.value ||
        !toInput?.value
      ) {

        alert(
          "Please select both From and To dates."
        );

        return;

      }

      const from =
        new Date(`${fromInput.value}T00:00:00`);

      const to =
        new Date(`${toInput.value}T23:59:59`);

      if (from > to) {

        alert(
          "From date cannot be after To date."
        );

        return;

      }

      managementState.from =
        from.toISOString();

      managementState.to =
        to.toISOString();

      updateScopeLabel();
      loadManagementDashboardData();

    });

  }

  /* =========================================================
   WIDGET REGISTRY
========================================================= */

const managementWidgetRegistry = {

  maintenance_mix: {
    key: "maintenance_mix",
    title: "Maintenance Mix",
    subtitle: "Completed maintenance executions",
    sizeClass: "management-widget-medium"
  },

  schedule_delivery: {
    key: "schedule_delivery",
    title: "Schedule Delivery",
    subtitle: "Scheduled maintenance performance",
    sizeClass: "management-widget-large"
  },

  reliability: {
    key: "reliability",
    title: "Reliability",
    subtitle: "Breakdowns and downtime",
    sizeClass: "management-widget-large"
  },

  downtime_by_line: {
    key: "downtime_by_line",
    title: "Downtime by Line",
    subtitle: "Downtime distribution across production lines",
    sizeClass: "management-widget-large"
  },

  top_assets_downtime: {
    key: "top_assets_downtime",
    title: "Top Assets by Downtime",
    subtitle: "Assets with the highest downtime",
    sizeClass: "management-widget-large"
  }

};


/* =========================================================
   DEFAULT DASHBOARD
========================================================= */

const MANAGEMENT_WIDGET_STORAGE_KEY =
  "astir_management_dashboard_widgets";

const managementDefaultWidgets = [
  "maintenance_mix",
  "schedule_delivery",
  "reliability"
];


/* =========================================================
   WIDGET STORAGE
========================================================= */

function getSavedManagementWidgets() {

  try {

    const saved =
      localStorage.getItem(
        MANAGEMENT_WIDGET_STORAGE_KEY
      );

    if (!saved) {
      return [...managementDefaultWidgets];
    }

    const parsed =
      JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [...managementDefaultWidgets];
    }

    return parsed.filter(
      key => managementWidgetRegistry[key]
    );

  } catch (err) {

    console.warn(
      "Could not read management dashboard widgets:",
      err
    );

    return [...managementDefaultWidgets];

  }

}


function saveManagementWidgets(widgetKeys) {

  localStorage.setItem(
    MANAGEMENT_WIDGET_STORAGE_KEY,
    JSON.stringify(widgetKeys)
  );

}


/* =========================================================
   CURRENT WIDGETS
========================================================= */

let managementVisibleWidgets =
  getSavedManagementWidgets();


/* =========================================================
   CREATE WIDGET CARD
========================================================= */

function createManagementWidgetCard(widgetKey) {

  const config =
    managementWidgetRegistry[widgetKey];

  if (!config) {
    return null;
  }

  const card =
    document.createElement("section");

  card.className =
    `management-widget ${config.sizeClass}`;

  card.dataset.widgetKey =
    config.key;
    card.draggable = true;


  const header =
    document.createElement("div");

  header.className =
    "management-widget-header";


  const titleWrap =
    document.createElement("div");


  const title =
    document.createElement("div");

  title.className =
    "management-widget-title";

  title.textContent =
    config.title;


  const subtitle =
    document.createElement("div");

  subtitle.className =
    "management-widget-subtitle";

  subtitle.textContent =
    config.subtitle;


  titleWrap.append(
    title,
    subtitle
  );


  const removeBtn =
    document.createElement("button");

  removeBtn.type =
    "button";

  removeBtn.className =
    "management-widget-remove-btn";

  removeBtn.title =
    "Remove widget";

  removeBtn.textContent =
    "×";

  removeBtn.addEventListener(
    "click",
    () => {
      removeManagementWidget(
        widgetKey
      );
    }
  );


  header.append(
    titleWrap,
    removeBtn
  );


  const body =
    document.createElement("div");

  body.className =
    "management-widget-body management-widget-placeholder";

  body.id =
    `management-widget-${widgetKey}`;

  body.textContent =
    "Widget data will appear here";


  card.append(
    header,
    body
  );

  return card;

}


/* =========================================================
   RENDER WIDGETS
========================================================= */

function renderManagementWidgets() {

  const grid =
    document.getElementById(
      "managementWidgetGrid"
    );

  if (!grid) {
    return;
  }


  /* =====================
     REBUILD GRID
  ===================== */

  grid.innerHTML = "";


  managementVisibleWidgets.forEach(
    widgetKey => {

      const card =
        createManagementWidgetCard(
          widgetKey
        );

      if (card) {
        grid.appendChild(card);
      }

    }
  );


  /* =====================
     DRAG & DROP
  ===================== */

  enableManagementWidgetDragDrop();


  /* =====================
     RE-RENDER REAL DATA

     Important:
     renderManagementWidgets()
     recreates the DOM cards.

     Therefore every widget that
     has already loaded data must
     be rendered again.
  ===================== */

  renderManagementMaintenanceMix();
  renderManagementScheduleDelivery();
  renderManagementReliability();

}

/* =========================================================
   WIDGET DRAG & DROP
========================================================= */

let draggedManagementWidgetKey = null;


function enableManagementWidgetDragDrop() {

  const grid =
    document.getElementById(
      "managementWidgetGrid"
    );

  if (!grid) {
    return;
  }

  const cards =
    grid.querySelectorAll(
      ".management-widget"
    );


  cards.forEach(card => {

    card.addEventListener(
      "dragstart",
      e => {

        draggedManagementWidgetKey =
          card.dataset.widgetKey;

        card.classList.add(
          "management-widget-dragging"
        );

        e.dataTransfer.effectAllowed =
          "move";

      }
    );


    card.addEventListener(
      "dragend",
      () => {

        draggedManagementWidgetKey =
          null;

        card.classList.remove(
          "management-widget-dragging"
        );

        document
          .querySelectorAll(
            ".management-widget-drag-over"
          )
          .forEach(el => {
            el.classList.remove(
              "management-widget-drag-over"
            );
          });

      }
    );


    card.addEventListener(
      "dragover",
      e => {

        e.preventDefault();

        if (
          !draggedManagementWidgetKey ||
          draggedManagementWidgetKey ===
            card.dataset.widgetKey
        ) {
          return;
        }

        card.classList.add(
          "management-widget-drag-over"
        );

      }
    );


    card.addEventListener(
      "dragleave",
      () => {

        card.classList.remove(
          "management-widget-drag-over"
        );

      }
    );


    card.addEventListener(
      "drop",
      e => {

        e.preventDefault();

        card.classList.remove(
          "management-widget-drag-over"
        );


        const targetKey =
          card.dataset.widgetKey;

        if (
          !draggedManagementWidgetKey ||
          draggedManagementWidgetKey ===
            targetKey
        ) {
          return;
        }


        const fromIndex =
          managementVisibleWidgets.indexOf(
            draggedManagementWidgetKey
          );

        const toIndex =
          managementVisibleWidgets.indexOf(
            targetKey
          );


        if (
          fromIndex === -1 ||
          toIndex === -1
        ) {
          return;
        }


        const reordered =
          [...managementVisibleWidgets];

        const [moved] =
          reordered.splice(
            fromIndex,
            1
          );

        reordered.splice(
          toIndex,
          0,
          moved
        );


        managementVisibleWidgets =
          reordered;


        saveManagementWidgets(
          managementVisibleWidgets
        );


        renderManagementWidgets();

      }
    );

  });

}

/* =========================================================
   ADD / REMOVE WIDGET
========================================================= */

function addManagementWidget(widgetKey) {

  if (
    !managementWidgetRegistry[widgetKey]
  ) {
    return;
  }

  if (
    managementVisibleWidgets.includes(
      widgetKey
    )
  ) {
    return;
  }

  managementVisibleWidgets.push(
    widgetKey
  );

  saveManagementWidgets(
    managementVisibleWidgets
  );

  renderManagementWidgets();

}


function removeManagementWidget(widgetKey) {

  managementVisibleWidgets =
    managementVisibleWidgets.filter(
      key => key !== widgetKey
    );

  saveManagementWidgets(
    managementVisibleWidgets
  );

  renderManagementWidgets();

}


/* =========================================================
   ADD WIDGET DIALOG
========================================================= */

function openManagementWidgetPicker() {

  const available =
    Object.values(
      managementWidgetRegistry
    ).filter(
      widget =>
        !managementVisibleWidgets.includes(
          widget.key
        )
    );

  if (available.length === 0) {

    alert(
      "All available widgets are already visible."
    );

    return;

  }


  const overlay =
    document.createElement("div");

  overlay.className =
    "management-widget-picker-overlay";


  const dialog =
    document.createElement("div");

  dialog.className =
    "management-widget-picker";


  const header =
    document.createElement("div");

  header.className =
    "management-widget-picker-header";


  const title =
    document.createElement("div");

  title.className =
    "management-widget-picker-title";

  title.textContent =
    "Add Widget";


  const closeBtn =
    document.createElement("button");

  closeBtn.type =
    "button";

  closeBtn.className =
    "management-widget-picker-close";

  closeBtn.textContent =
    "×";

  closeBtn.addEventListener(
    "click",
    () => {
      overlay.remove();
    }
  );


  header.append(
    title,
    closeBtn
  );


  const list =
    document.createElement("div");

  list.className =
    "management-widget-picker-list";


  available.forEach(widget => {

    const item =
      document.createElement("button");

    item.type =
      "button";

    item.className =
      "management-widget-picker-item";


    const textWrap =
      document.createElement("div");


    const itemTitle =
      document.createElement("div");

    itemTitle.className =
      "management-widget-picker-item-title";

    itemTitle.textContent =
      widget.title;


    const itemSubtitle =
      document.createElement("div");

    itemSubtitle.className =
      "management-widget-picker-item-subtitle";

    itemSubtitle.textContent =
      widget.subtitle;


    textWrap.append(
      itemTitle,
      itemSubtitle
    );


    const addMark =
      document.createElement("div");

    addMark.className =
      "management-widget-picker-add";

    addMark.textContent =
      "+";


    item.append(
      textWrap,
      addMark
    );


    item.addEventListener(
      "click",
      () => {

        addManagementWidget(
          widget.key
        );

        overlay.remove();

      }
    );


    list.appendChild(item);

  });


  dialog.append(
    header,
    list
  );

  overlay.appendChild(dialog);

  document.body.appendChild(
    overlay
  );


  overlay.addEventListener(
    "click",
    e => {

      if (e.target === overlay) {
        overlay.remove();
      }

    }
  );

}


/* =========================================================
   ADD WIDGET BUTTON
========================================================= */

const addWidgetBtn =
  document.getElementById(
    "managementAddWidgetBtn"
  );

if (addWidgetBtn) {

  addWidgetBtn.addEventListener(
    "click",
    openManagementWidgetPicker
  );

}

/* =========================================================
   MANAGEMENT DASHBOARD DATA
========================================================= */

    const managementDashboardData = {
    maintenance_mix: null,
    schedule_delivery: null,
    reliability: null
    };

/* =========================================================
   LOAD MANAGEMENT DASHBOARD DATA
========================================================= */

async function loadManagementDashboardData() {

  const range =
    getCurrentRange();

  /*
    Custom selected but dates not applied yet.
  */
  if (!range) {
    return;
  }


  const maintenanceMixBody =
    document.getElementById(
      "management-widget-maintenance_mix"
    );

  if (maintenanceMixBody) {

    maintenanceMixBody.className =
      "management-widget-body";

    maintenanceMixBody.innerHTML = `
      <div class="management-widget-loading">
        Loading...
      </div>
    `;

  }


  try {

    const params =
      new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        area: managementState.area
      });


    const response =
      await fetch(
        `/management-dashboard?${params.toString()}`
      );


    if (!response.ok) {

      throw new Error(
        `Management Dashboard request failed (${response.status})`
      );

    }


    const data =
      await response.json();


    managementDashboardData.maintenance_mix =
        data?.maintenance_mix || null;

    managementDashboardData.schedule_delivery =
        data?.schedule_delivery || null;

    managementDashboardData.reliability =
        data?.reliability || null;

    renderManagementMaintenanceMix();
    renderManagementScheduleDelivery();
    renderManagementReliability();

  } catch (err) {

    console.error(
      "MANAGEMENT DASHBOARD LOAD ERROR:",
      err
    );


    if (maintenanceMixBody) {

      maintenanceMixBody.innerHTML = `
        <div class="management-widget-error">
          Unable to load maintenance data.
        </div>
      `;

    }

  }

}


/* =========================================================
   MAINTENANCE MIX
========================================================= */

function renderManagementMaintenanceMix() {

  const container =
    document.getElementById(
      "management-widget-maintenance_mix"
    );

  if (!container) {
    return;
  }


  const mix =
    managementDashboardData.maintenance_mix;


  if (!mix) {

    container.className =
      "management-widget-body management-widget-placeholder";

    container.textContent =
      "Widget data will appear here";

    return;

  }


  const total =
    Number(mix.total) || 0;

  const preventive =
    Number(mix.preventive) || 0;

  const planned =
    Number(mix.planned) || 0;

  const corrective =
    Number(mix.corrective) || 0;


  /* =====================
     EMPTY STATE
  ===================== */

  if (total <= 0) {

    container.className =
      "management-widget-body";

    container.innerHTML = `
      <div class="management-widget-empty">
        No completed maintenance executions
        during the selected period.
      </div>
    `;

    return;

  }


  /* =====================
     DONUT CONFIG
  ===================== */

  const items = [

    {
      label: "Preventive",
      value: preventive,
      color: "#2f80ed",
      textColor: "#ffffff"
    },

    {
      label: "Planned",
      value: planned,
      color: "#ffc156",
      textColor: "#172033"
    },

    {
      label: "Corrective",
      value: corrective,
      color: "#ff4848",
      textColor: "#ffffff"
    }

  ];


  const centerX = 90;
  const centerY = 90;

  const radius = 59;

  const strokeWidth = 36;

  const circumference =
    2 * Math.PI * radius;


  let cumulative = 0;


  /* =====================
     BUILD SEGMENTS
  ===================== */

  const segments =
    items

      .filter(item =>
        item.value > 0
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


        const dash =
          circumference * percent;


        const offset =
          -circumference * cumulative;


        /* =====================
           LABEL POSITION
        ===================== */

        const midAngle =
          (
            cumulative +
            percent / 2
          ) *
          2 *
          Math.PI;


        const labelX =
          centerX +
          radius *
          Math.sin(midAngle);


        const labelY =
          centerY -
          radius *
          Math.cos(midAngle);


        cumulative += percent;


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
                ${dash}
                ${circumference - dash}
              "

              stroke-dashoffset="${offset}"

              transform="
                rotate(
                  -90
                  ${centerX}
                  ${centerY}
                )
              "
            />

          `,


          label: `

            <g
              text-anchor="middle"

              fill="${item.textColor}"

              style="
                pointer-events:none;
              "
            >

              <text
                x="${labelX}"
                y="${labelY - 2}"

                font-size="12"

                font-weight="800"
              >
                ${value}
              </text>


              <text
                x="${labelX}"
                y="${labelY + 10}"

                font-size="9"

                font-weight="700"
              >
                ${pct}%
              </text>

            </g>

          `

        };

      });


  const circles =
    segments
      .map(segment =>
        segment.circle
      )
      .join("");


  const labels =
    segments
      .map(segment =>
        segment.label
      )
      .join("");


  /* =====================
     LEGEND
  ===================== */

  const legend =
    items
      .map(item => {

        const cssClass =
          item.label
            .toLowerCase();

        return `

          <div class="management-mix-legend-row">

            <span
              class="
                management-mix-dot
                ${cssClass}
              "
            ></span>

            <span>
              ${item.label}
            </span>

          </div>

        `;

      })
      .join("");


  /* =====================
     FINAL CONTENT
  ===================== */

  container.className =
    "management-widget-body";


  container.innerHTML = `

    <div class="management-mix-layout">

      <!-- DONUT -->

      <div class="management-mix-chart-wrap">

        <svg
          class="management-mix-svg"

          viewBox="0 0 180 180"

          role="img"

          aria-label="Maintenance Mix"
        >

          <!-- BACKGROUND -->

          <circle
            cx="${centerX}"
            cy="${centerY}"
            r="${radius}"

            fill="none"

            stroke="#21262d"
            stroke-width="${strokeWidth}"
          />


          <!-- SEGMENTS -->

          ${circles}


          <!-- VALUES -->

          ${labels}


          <!-- CENTER TOTAL -->

          <text
            x="${centerX}"
            y="86"

            text-anchor="middle"

            class="management-mix-center-value"
          >
            ${total}
          </text>


          <text
            x="${centerX}"
            y="103"

            text-anchor="middle"

            class="management-mix-center-label"
          >
            COMPLETED
          </text>

        </svg>

      </div>


      <!-- LEGEND -->

      <div class="management-mix-legend">

        ${legend}

      </div>

    </div>

  `;

}

/* =========================================================
   SCHEDULE DELIVERY
========================================================= */

function renderManagementScheduleDelivery() {

  const container =
    document.getElementById(
      "management-widget-schedule_delivery"
    );

  if (!container) {
    return;
  }


  const delivery =
    managementDashboardData.schedule_delivery;


  if (!delivery) {

    container.className =
      "management-widget-body management-widget-placeholder";

    container.textContent =
      "Widget data will appear here";

    return;

  }


  const total =
    delivery.total || {};

  const preventive =
    delivery.preventive || {};

  const planned =
    delivery.planned || {};


  const safeNumber = value => {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;

  };


  const scheduledDue =
    safeNumber(
      total.scheduledDue
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

  const fulfillmentRate =
    Math.max(
      0,
      Math.min(
        100,
        safeNumber(
          total.fulfillmentRate
        )
      )
    );

  const totalDelivered =
    safeNumber(
      total.totalDelivered
    );


  const preventiveDelivered =
    safeNumber(
      preventive.totalDelivered
    );

  const plannedDelivered =
    safeNumber(
      planned.totalDelivered
    );


  const preventivePct =
    totalDelivered > 0

      ? Math.round(
          preventiveDelivered *
          100 /
          totalDelivered
        )

      : 0;


  const plannedPct =
    totalDelivered > 0

      ? Math.round(
          plannedDelivered *
          100 /
          totalDelivered
        )

      : 0;


  /*
    Gauge geometry
  */

  const radius = 54;

  const circumference =
    Math.PI * radius;

  const progress =
    circumference *
    fulfillmentRate /
    100;


  container.className =
    "management-widget-body";


  container.innerHTML = `

    <div class="management-schedule-layout">

      <!-- =====================
           LEFT / GAUGE
      ===================== -->

      <div class="management-schedule-gauge-panel">

        <svg
          class="management-schedule-gauge"
          viewBox="0 0 140 92"
          role="img"
          aria-label="Schedule fulfillment ${fulfillmentRate}%"
        >

          <!-- BACKGROUND ARC -->

          <path
            d="
              M 16 78
              A 54 54
              0 0 1
              124 78
            "
            fill="none"
            stroke="#263241"
            stroke-width="15"
            stroke-linecap="round"
          />


          <!-- VALUE ARC -->

          <path
            d="
              M 16 78
              A 54 54
              0 0 1
              124 78
            "
            fill="none"
            stroke="#22c55e"
            stroke-width="15"
            stroke-linecap="round"

            pathLength="100"

            stroke-dasharray="
              ${fulfillmentRate}
              ${100 - fulfillmentRate}
            "
          />


          <!-- VALUE -->

          <text
            x="70"
            y="57"
            text-anchor="middle"
            class="management-schedule-gauge-value"
          >
            ${fulfillmentRate}%
          </text>


          <text
            x="70"
            y="73"
            text-anchor="middle"
            class="management-schedule-gauge-label"
          >
            FULFILLMENT
          </text>

        </svg>


        <div class="management-schedule-gauge-footer">

          <div>

            <strong>
              ${fulfilled}
            </strong>

            <span>
              FULFILLED
            </span>

          </div>


          <div>

            <strong>
              ${scheduledDue}
            </strong>

            <span>
              SCHEDULED
            </span>

          </div>

        </div>

      </div>


      <!-- =====================
           RIGHT / KPIs
      ===================== -->

      <div class="management-schedule-right">


        <!-- TOP METRICS -->

        <div class="management-schedule-kpi-grid">


          <div class="management-schedule-kpi">

            <div class="management-schedule-kpi-icon blue">
              ▣
            </div>

            <div>

              <strong>
                ${scheduledDue}
              </strong>

              <span>
                Scheduled Due
              </span>

            </div>

          </div>


          <div class="management-schedule-kpi">

            <div class="management-schedule-kpi-icon green">
              ✓
            </div>

            <div>

              <strong>
                ${fulfilled}
              </strong>

              <span>
                Fulfilled
              </span>

            </div>

          </div>


          <div class="management-schedule-kpi">

            <div class="management-schedule-kpi-icon amber">
              ⌛
            </div>

            <div>

              <strong>
                ${outstanding}
              </strong>

              <span>
                Outstanding
              </span>

            </div>

          </div>

        </div>


        <!-- LOWER ROW -->

        <div class="management-schedule-lower">


          <!-- BACKLOG -->

          <div class="management-schedule-backlog">

            <div class="management-schedule-kpi-icon cyan">
              ↗
            </div>

            <div>

              <strong>
                ${backlogRecovered}
              </strong>

              <span>
                Backlog Recovered
              </span>

            </div>

          </div>


          <!-- DELIVERED BY TYPE -->

          <div class="management-schedule-type-panel">

            <div class="management-schedule-type-title">
              Delivered by Type
            </div>


            <div class="management-schedule-type-row">

              <div class="management-schedule-type-label">

                <span class="management-mix-dot preventive"></span>

                Preventive

              </div>

              <strong>
                ${preventiveDelivered}
              </strong>

              <span>
                ${preventivePct}%
              </span>

            </div>


            <div class="management-schedule-type-row">

              <div class="management-schedule-type-label">

                <span class="management-mix-dot planned"></span>

                Planned

              </div>

              <strong>
                ${plannedDelivered}
              </strong>

              <span>
                ${plannedPct}%
              </span>

            </div>


            <div class="management-schedule-type-total">

              Total Delivered

              <strong>
                ${totalDelivered}
              </strong>

            </div>

          </div>

        </div>

      </div>

    </div>

  `;

}

/* =========================================================
   RELIABILITY
========================================================= */

function renderManagementReliability() {

  const container =
    document.getElementById(
      "management-widget-reliability"
    );

  if (!container) {
    return;
  }


  const reliability =
    managementDashboardData.reliability;


  if (!reliability) {

    container.className =
      "management-widget-body management-widget-placeholder";

    container.textContent =
      "Widget data will appear here";

    return;
  }


  const totalIncidents =
    Number(
      reliability.total_incidents
    ) || 0;


  const activeIncidents =
    Number(
      reliability.active_incidents
    ) || 0;


  const effectiveDownSeconds =
    Number(
      reliability.effective_down_seconds
    ) || 0;


  const lines =
    Array.isArray(
      reliability.downtime_by_line
    )
      ? reliability.downtime_by_line
      : [];


  /* =====================
     FORMAT DOWNTIME
  ===================== */

  function formatDownTime(seconds) {

    const total =
      Math.max(
        0,
        Math.round(
          Number(seconds) || 0
        )
      );

    const hours =
      Math.floor(
        total / 3600
      );

    const minutes =
      Math.floor(
        (total % 3600) / 60
      );


    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${minutes}m`;
  }


  /* =====================
     MAX LINE DOWNTIME
  ===================== */

  const maxDown =
    lines.length > 0

      ? Math.max(
          ...lines.map(
            row =>
              Number(
                row.effective_down_seconds
              ) || 0
          )
        )

      : 0;


  /* =====================
     LINE BARS
  ===================== */

  const linesHtml =
    lines.length > 0

      ? lines.map(row => {

          const seconds =
            Number(
              row.effective_down_seconds
            ) || 0;

          const incidents =
            Number(
              row.incidents
            ) || 0;


          const width =
            maxDown > 0

              ? Math.max(
                  3,
                  seconds *
                  100 /
                  maxDown
                )

              : 0;


          return `

            <div class="management-reliability-line-row">

              <div class="management-reliability-line-name">
                ${row.line || "—"}
              </div>


              <div class="management-reliability-line-track">

                <div
                  class="management-reliability-line-fill"
                  style="width:${width}%"
                ></div>

              </div>


              <div class="management-reliability-line-value">

                <strong>
                  ${formatDownTime(seconds)}
                </strong>

                <span>
                  ${incidents}
                  ${incidents === 1 ? "BD" : "BDs"}
                </span>

              </div>

            </div>

          `;

        }).join("")

      : `

          <div class="management-widget-empty">
            No Breakdown incidents
            during the selected period.
          </div>

        `;


  /* =====================
     FINAL CONTENT
  ===================== */

  container.className =
    "management-widget-body";


  container.innerHTML = `

    <div class="management-reliability-layout">


      <!-- =====================
           TOP KPIs
      ===================== -->

      <div class="management-reliability-kpis">


        <div class="management-reliability-kpi">

          <div class="management-reliability-icon red">
            ⚙
          </div>

          <div>

            <span>
              Breakdowns
            </span>

            <strong>
              ${totalIncidents}
            </strong>

          </div>

        </div>


        <div class="management-reliability-kpi">

          <div class="management-reliability-icon blue">
            ◷
          </div>

          <div>

            <span>
              Effective DOWN
            </span>

            <strong>
              ${formatDownTime(
                effectiveDownSeconds
              )}
            </strong>

          </div>

        </div>


        <div class="management-reliability-kpi">

          <div class="management-reliability-icon amber">
            !
          </div>

          <div>

            <span>
              Active Incidents
            </span>

            <strong>
              ${activeIncidents}
            </strong>

            <small>
              Active now
            </small>

          </div>

        </div>

      </div>


      <!-- =====================
           DOWNTIME BY LINE
      ===================== -->

      <div class="management-reliability-lines">

        <div class="management-reliability-lines-title">

          <span>
            ▮▮
          </span>

          Downtime by Line

        </div>


        <div class="management-reliability-lines-body">

          ${linesHtml}

        </div>

      </div>

    </div>

  `;

}

  /* =====================
     INIT
  ===================== */

    updateScopeLabel();
    renderManagementWidgets();
    loadManagementDashboardData();

  /* =====================
     TEMPORARY GLOBAL ACCESS
     Useful during development
  ===================== */

  window.managementDashboardState =
    managementState;

})();