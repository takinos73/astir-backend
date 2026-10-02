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

  enableManagementWidgetDragDrop();

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


  /* =====================
     INIT
  ===================== */

  updateScopeLabel();
  renderManagementWidgets();

  /* =====================
     TEMPORARY GLOBAL ACCESS
     Useful during development
  ===================== */

  window.managementDashboardState =
    managementState;

})();