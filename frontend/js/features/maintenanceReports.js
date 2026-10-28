/* =========================================================
   MAINTENANCE REPORTS
   Production → Maintenance reporting layer
========================================================= */

/* =========================================================
   PRODUCTION REPORTS VIEW STATE

   Stores all active filters and sort options used
   by the Shift Foreman Production Reporting table.
========================================================= */

const productionReportsViewState = {

  /* =====================
     PERIOD
  ===================== */

  dateFrom: "",
  dateTo: "",


  /* =====================
     STATUS
  ===================== */

  status: "ALL",


  /* =====================
     ASSET MULTI-SELECT

     Empty array =
     no Asset restriction.
  ===================== */

  assets: [],


  /* =====================
     UPDATED SORT
  ===================== */

  updatedSort: "DESC"

};
/* =========================================================
   RESOLVE UPDATED DATE
========================================================= */

function getProductionReportUpdatedDate(report) {

  const raw =
    report?.updated_at ||
    report?.reviewed_at ||
    report?.reported_at ||
    null;


  if (!raw) {
    return null;
  }


  const date =
    new Date(raw);


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;

}

/* =========================================================
   APPLY FILTERS + SORT
========================================================= */

function getFilteredProductionReports() {

  let reports =
    Array.isArray(productionReportsData)
      ? [...productionReportsData]
      : [];


  /* =====================
     PERIOD FILTER

     Period is based on when the
     Foreman submitted the Report.
  ===================== */

  if (
    productionReportsViewState.dateFrom
  ) {

    const from =
      new Date(
        `${productionReportsViewState.dateFrom}T00:00:00`
      );


    reports =
      reports.filter(report => {

        const reported =
          report.reported_at
            ? new Date(
                report.reported_at
              )
            : null;


        return (
          reported &&
          !Number.isNaN(
            reported.getTime()
          ) &&
          reported >= from
        );

      });

  }


  if (
    productionReportsViewState.dateTo
  ) {

    const to =
      new Date(
        `${productionReportsViewState.dateTo}T23:59:59.999`
      );


    reports =
      reports.filter(report => {

        const reported =
          report.reported_at
            ? new Date(
                report.reported_at
              )
            : null;


        return (
          reported &&
          !Number.isNaN(
            reported.getTime()
          ) &&
          reported <= to
        );

      });

  }


  /* =====================
     STATUS FILTER
  ===================== */

  if (
    productionReportsViewState.status !==
    "ALL"
  ) {

    reports =
      reports.filter(report =>

        String(
          report.status || ""
        )
          .trim()
          .toUpperCase() ===
        productionReportsViewState.status

      );

  }

  /* =====================
    ASSET MULTI-SELECT FILTER

    Empty selection =
    show all Assets.

    When one or more Assets are selected,
    only Reports belonging to those Assets remain.
  ===================== */

  if (
    Array.isArray(
      productionReportsViewState.assets
    ) &&
    productionReportsViewState
      .assets
      .length > 0
  ) {

    reports =
      reports.filter(
        report =>

          productionReportsViewState
            .assets
            .includes(
              getProductionReportAssetKey(
                report
              )
            )

      );

  }


  /* =====================
     UPDATED SORT
  ===================== */

  reports.sort(
    (a, b) => {

      const dateA =
        getProductionReportUpdatedDate(a);


      const dateB =
        getProductionReportUpdatedDate(b);


      const timeA =
        dateA
          ? dateA.getTime()
          : 0;


      const timeB =
        dateB
          ? dateB.getTime()
          : 0;


      return (
        productionReportsViewState.updatedSort ===
        "ASC"
      )
        ? timeA - timeB
        : timeB - timeA;

    }
  );


  return reports;

}

/* =========================================================
   PRODUCTION REPORT PRINT — FILTER SUMMARY

   Builds a human-readable description of the filters
   currently applied in the Shift Foreman view.

   IMPORTANT:
   - Uses the existing productionReportsViewState.
   - Does not perform any filtering itself.
   - The actual filtered dataset always comes from
     getFilteredProductionReports().
========================================================= */

function getProductionReportsPrintFilterSummary() {

  /* =====================
     DATE RANGE
  ===================== */

  let periodLabel =
    "All Dates";


  if (
    productionReportsViewState.dateFrom &&
    productionReportsViewState.dateTo
  ) {

    periodLabel =
      `${productionReportsViewState.dateFrom} → ${productionReportsViewState.dateTo}`;

  } else if (
    productionReportsViewState.dateFrom
  ) {

    periodLabel =
      `From ${productionReportsViewState.dateFrom}`;

  } else if (
    productionReportsViewState.dateTo
  ) {

    periodLabel =
      `Until ${productionReportsViewState.dateTo}`;

  }


  /* =====================
     STATUS
  ===================== */

  const statusLabel =
    productionReportsViewState.status &&
    productionReportsViewState.status !== "ALL"
      ? productionReportsViewState.status
          .replace(/_/g, " ")
      : "All";


  /* =====================
     SORT
  ===================== */

  const sortLabel =
    productionReportsViewState.updatedSort === "ASC"
      ? "Oldest Update First"
      : "Latest Update First";


  /* =====================
     FINAL SUMMARY
  ===================== */

  return (
    `Period: ${periodLabel}` +
    `  |  Status: ${statusLabel}` +
    `  |  Sort: ${sortLabel}`
  );

}

/* =========================================================
   REFRESH PRODUCTION REPORT VIEW

   Refreshes:
   - Asset dropdown contents.
   - Asset filter label.
   - Filtered report table.
   - Report count.
   - Remaining filter UI.
========================================================= */

function refreshProductionReportsView() {

  /* =====================
    REFRESH PREVENTIVE PRIORITY

    Keeps the compact Top 3 priority strip updated
    whenever the Production Reporting view refreshes.
  ===================== */

  renderProductionPreventivePriority();

  /* =====================
     BUILD ASSET FILTER

     Always uses the complete loaded Report dataset.
  ===================== */

  buildProductionReportsAssetDropdown();

  /* =====================
     GET FILTERED REPORTS
  ===================== */

  const reports =
    getFilteredProductionReports();

  /* =====================
     RENDER TABLE
  ===================== */

  renderProductionReports(
    reports
  );

  /* =====================
     UPDATE REPORT COUNT
  ===================== */

  const count =
    document.getElementById(
      "productionReportsCount"
    );


  if (count) {

    count.textContent =
      `${reports.length} Report${reports.length === 1 ? "" : "s"}`;

  }


  /* =====================
     UPDATE FILTER CONTROLS
  ===================== */

  updateProductionReportsFilterUI();

}

/* =========================================================
   PRODUCTION REPORTS FILTER UI
========================================================= */


/* =========================================================
   LOCAL TODAY — YYYY-MM-DD

   IMPORTANT:
   Uses local browser date.
   Avoids UTC date shift.
========================================================= */

function getProductionReportsLocalToday() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${year}-${month}-${day}`;

}

/* =========================================================
   FORMAT PERIOD DATE
========================================================= */

function formatProductionReportsPeriodDate(
  value
) {

  if (!value) {
    return "";
  }


  const parts =
    String(value)
      .split("-");


  if (parts.length !== 3) {
    return value;
  }


  return `${parts[2]}/${parts[1]}/${parts[0]}`;

}

/* =========================================================
   UPDATE FILTER UI
========================================================= */

function updateProductionReportsFilterUI() {

  const periodText =
    document.getElementById(
      "productionReportsPeriodText"
    );


  const statusFilter =
    document.getElementById(
      "productionReportsStatusFilter"
    );


  const sortArrow =
    document.getElementById(
      "productionReportsUpdatedSortArrow"
    );


  const dateFrom =
    productionReportsViewState.dateFrom;


  const dateTo =
    productionReportsViewState.dateTo;


  /* =====================
     PERIOD LABEL
  ===================== */

  if (periodText) {

    if (
      dateFrom &&
      dateTo
    ) {

      periodText.textContent =
        `${formatProductionReportsPeriodDate(
          dateFrom
        )} – ${formatProductionReportsPeriodDate(
          dateTo
        )}`;

    } else {

      periodText.textContent =
        "All dates";

    }

  }


  /* =====================
     STATUS
  ===================== */

  if (statusFilter) {

    statusFilter.value =
      productionReportsViewState.status;

  }


  /* =====================
     SORT ARROW
  ===================== */

  if (sortArrow) {

    sortArrow.textContent =
      productionReportsViewState.updatedSort ===
        "ASC"
        ? "↑"
        : "↓";

  }

}

/* =========================================================
   OPEN / CLOSE PERIOD PICKER
========================================================= */

function setProductionReportsPeriodPickerOpen(
  isOpen
) {

  const picker =
    document.getElementById(
      "productionReportsPeriodPicker"
    );


  if (!picker) {
    return;
  }


  picker.style.display =
    isOpen
      ? "block"
      : "none";

}

/* =========================================================
   INITIALIZE PRODUCTION REPORT FILTERS
========================================================= */

function initProductionReportsFilters() {

  const periodBtn =
    document.getElementById(
      "productionReportsPeriodBtn"
    );


  const picker =
    document.getElementById(
      "productionReportsPeriodPicker"
    );


  const fromInput =
    document.getElementById(
      "productionReportsDateFrom"
    );


  const toInput =
    document.getElementById(
      "productionReportsDateTo"
    );


  const periodApplyBtn =
    document.getElementById(
      "productionReportsPeriodApplyBtn"
    );


  const periodClearBtn =
    document.getElementById(
      "productionReportsPeriodClearBtn"
    );


  const statusFilter =
    document.getElementById(
      "productionReportsStatusFilter"
    );


  const sortBtn =
    document.getElementById(
      "productionReportsUpdatedSortBtn"
    );


  const clearFiltersBtn =
    document.getElementById(
      "productionReportsClearFiltersBtn"
    );


  const today =
    getProductionReportsLocalToday();


  /* =====================
     DISABLE FUTURE DATES
  ===================== */

  if (fromInput) {

    fromInput.max =
      today;

  }


  if (toInput) {

    toInput.max =
      today;

  }


  /* =====================
     PERIOD BUTTON
  ===================== */

  periodBtn
    ?.addEventListener(
      "click",
      event => {

        event.stopPropagation();


        if (!picker) {
          return;
        }


        const isOpen =
          picker.style.display !==
          "none";


        if (!isOpen) {

          if (fromInput) {

            fromInput.value =
              productionReportsViewState.dateFrom ||
              "";

          }


          if (toInput) {

            toInput.value =
              productionReportsViewState.dateTo ||
              "";

          }

        }


        setProductionReportsPeriodPickerOpen(
          !isOpen
        );

      }
    );


  /* =====================
     PREVENT PICKER CLICK
     FROM CLOSING POPOVER
  ===================== */

  picker
    ?.addEventListener(
      "click",
      event => {

        event.stopPropagation();

      }
    );


  /* =====================
     FROM CHANGE

     Restrict To >= From
  ===================== */

  fromInput
    ?.addEventListener(
      "change",
      () => {

        const fromValue =
          String(
            fromInput.value ||
            ""
          );


        if (
          fromValue &&
          fromValue > today
        ) {

          fromInput.value =
            today;

        }


        if (toInput) {

          toInput.min =
            fromInput.value ||
            "";

        }

      }
    );


  /* =====================
     TO CHANGE

     Restrict From <= To
  ===================== */

  toInput
    ?.addEventListener(
      "change",
      () => {

        const toValue =
          String(
            toInput.value ||
            ""
          );


        if (
          toValue &&
          toValue > today
        ) {

          toInput.value =
            today;

        }


        if (fromInput) {

          fromInput.max =
            toInput.value ||
            today;

        }

      }
    );


  /* =====================
     APPLY PERIOD
  ===================== */

  periodApplyBtn
    ?.addEventListener(
      "click",
      () => {

        const from =
          String(
            fromInput?.value ||
            ""
          ).trim();


        const to =
          String(
            toInput?.value ||
            ""
          ).trim();


        /* =====================
           BOTH REQUIRED
           OR BOTH EMPTY
        ===================== */

        if (
          (from && !to) ||
          (!from && to)
        ) {

          alert(
            "Please select both From and To dates."
          );

          return;

        }


        /* =====================
           FUTURE PROTECTION
        ===================== */

        if (
          from > today ||
          to > today
        ) {

          alert(
            "Future dates are not allowed."
          );

          return;

        }


        /* =====================
           RANGE VALIDATION
        ===================== */

        if (
          from &&
          to &&
          from > to
        ) {

          alert(
            "From date cannot be after To date."
          );

          return;

        }


        productionReportsViewState.dateFrom =
          from || null;


        productionReportsViewState.dateTo =
          to || null;


        setProductionReportsPeriodPickerOpen(
          false
        );


        refreshProductionReportsView();

      }
    );


  /* =====================
     CLEAR PERIOD ONLY
  ===================== */

  periodClearBtn
    ?.addEventListener(
      "click",
      () => {

        productionReportsViewState.dateFrom =
          null;


        productionReportsViewState.dateTo =
          null;


        if (fromInput) {

          fromInput.value =
            "";

          fromInput.max =
            today;

        }


        if (toInput) {

          toInput.value =
            "";

          toInput.min =
            "";

          toInput.max =
            today;

        }


        setProductionReportsPeriodPickerOpen(
          false
        );


        refreshProductionReportsView();

      }
    );


  /* =====================
     STATUS FILTER
  ===================== */

  statusFilter
    ?.addEventListener(
      "change",
      () => {

        const status =
          String(
            statusFilter.value ||
            "ALL"
          )
            .trim()
            .toUpperCase();


        const allowedStatuses = [
          "ALL",
          "NEW",
          "UNDER_REVIEW",
          "CONVERTED",
          "CLOSED"
        ];


        productionReportsViewState.status =
          allowedStatuses.includes(
            status
          )
            ? status
            : "ALL";


        refreshProductionReportsView();

      }
    );


  /* =====================
     UPDATED SORT BUTTON
  ===================== */

  sortBtn
    ?.addEventListener(
      "click",
      () => {

        productionReportsViewState.updatedSort =
          productionReportsViewState.updatedSort ===
            "DESC"
            ? "ASC"
            : "DESC";


        refreshProductionReportsView();

      }
    );


/* =====================
   CLEAR ALL FILTERS
===================== */

clearFiltersBtn
  ?.addEventListener(
    "click",
    () => {

      /* =====================
         CLEAR PERIOD
      ===================== */

      productionReportsViewState.dateFrom =
        null;


      productionReportsViewState.dateTo =
        null;


      /* =====================
         CLEAR STATUS
      ===================== */

      productionReportsViewState.status =
        "ALL";


      /* =====================
         CLEAR ASSET SELECTION

         Empty array means:
         All Machines.
      ===================== */

      productionReportsViewState.assets =
        [];


      /* =====================
         RESTORE DEFAULT SORT

         Newest report first.
      ===================== */

      productionReportsViewState.updatedSort =
        "DESC";


      /* =====================
         RESET FROM INPUT
      ===================== */

      if (fromInput) {

        fromInput.value =
          "";

        fromInput.max =
          today;

      }


      /* =====================
         RESET TO INPUT
      ===================== */

      if (toInput) {

        toInput.value =
          "";

        toInput.min =
          "";

        toInput.max =
          today;

      }


      /* =====================
         RESET STATUS CONTROL
      ===================== */

      if (statusFilter) {

        statusFilter.value =
          "ALL";

      }


      /* =====================
         CLOSE PERIOD PICKER
      ===================== */

      setProductionReportsPeriodPickerOpen(
        false
      );


      /* =====================
         REFRESH VIEW

         Asset dropdown will also return
         to "All Machines".
      ===================== */

      refreshProductionReportsView();

    }
  );


  /* =====================
     CLICK OUTSIDE
     CLOSE PERIOD PICKER
  ===================== */

  document.addEventListener(
    "click",
    event => {

      if (
        picker &&
        periodBtn &&
        !picker.contains(
          event.target
        ) &&
        !periodBtn.contains(
          event.target
        )
      ) {

        setProductionReportsPeriodPickerOpen(
          false
        );

      }

    }
  );


  /* =====================
     ESC CLOSES PICKER
  ===================== */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Escape"
      ) {

        setProductionReportsPeriodPickerOpen(
          false
        );

      }

    }
  );

  /* =====================
    INITIALIZE ASSET DROPDOWN

    Registers the open / close behavior
    of the Production Reporting Asset
    multi-select filter.

    This must run only once during
    Production Reporting initialization.
  ===================== */

  setupProductionReportsAssetDropdown();


  /* =====================
     INITIAL UI STATE
  ===================== */

  updateProductionReportsFilterUI();

}

/* =========================================================
   FILTER INIT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initProductionReportsFilters();

  }
);

/* =====================
   LOAD REPORTING ASSETS
===================== */

async function loadReportingAssets() {

  const select =
    document.getElementById(
      "reportAsset"
    );


  if (!select) {
    return;
  }


  select.innerHTML = `
    <option value="">
      Loading Assets...
    </option>
  `;


  select.disabled = true;


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/assets`
      );


    if (!response.ok) {

      throw new Error(
        `Failed to load Assets: ${response.status}`
      );

    }


    const data =
      await response.json();


    const assets =
      Array.isArray(
        data?.assets
      )
        ? data.assets
        : [];


    select.innerHTML = `
      <option value="">
        Select Asset
      </option>
    `;


    /* =====================
       GROUP BY LINE

       Line is used ONLY for grouping/sorting.
       It is NOT displayed in the dropdown.
    ===================== */

    const groups =
      new Map();


    assets.forEach(asset => {

      const lineLabel =
        String(
          asset.line_code ||
          asset.line_name ||
          "Other"
        ).trim();


      if (!groups.has(lineLabel)) {

        groups.set(
          lineLabel,
          []
        );

      }


      groups
        .get(lineLabel)
        .push(asset);

    });


    /* =====================
       SORT LINE GROUPS
    ===================== */

    const sortedGroups =
      Array.from(
        groups.entries()
      ).sort(
        ([lineA], [lineB]) =>
          lineA.localeCompare(
            lineB,
            "el",
            {
              sensitivity: "base",
              numeric: true
            }
          )
      );


    /* =====================
       BUILD OPTIONS

       No Line labels shown.
       Add visual separator between groups.
    ===================== */

    sortedGroups.forEach(
      (
        [lineLabel, lineAssets],
        groupIndex
      ) => {

        /* =====================
           SEPARATOR BETWEEN LINES
        ===================== */

        if (groupIndex > 0) {

          const separator =
            document.createElement(
              "option"
            );


          separator.disabled =
            true;


          separator.textContent =
            "────────────────────────";


          select.appendChild(
            separator
          );

        }


        /* =====================
           SORT ASSETS IN GROUP
        ===================== */

        lineAssets
          .sort((a, b) => {

            const nameA =
              String(
                a.name ||
                a.model ||
                ""
              );


            const nameB =
              String(
                b.name ||
                b.model ||
                ""
              );


            return nameA.localeCompare(
              nameB,
              "el",
              {
                sensitivity: "base",
                numeric: true
              }
            );

          })
          .forEach(asset => {

            const option =
              document.createElement(
                "option"
              );


            option.value =
              String(
                asset.id
              );


            const assetName =
              String(
                asset.name ||
                asset.model ||
                "Unnamed Asset"
              ).trim();


            const serial =
              String(
                asset.serial_number ||
                ""
              ).trim();


            option.textContent =
              serial
                ? `${assetName} | ${serial}`
                : assetName;


            select.appendChild(
              option
            );

          });

      }
    );


    select.disabled = false;


  } catch (err) {

    console.error(
      "LOAD REPORTING ASSETS ERROR:",
      err
    );


    select.innerHTML = `
      <option value="">
        Unable to load Assets
      </option>
    `;


    select.disabled = true;

  }

}

/* =========================================================
   RENDER PREVENTIVE PRIORITY

   Shows up to the Top 3 Assets using the exact same
   Asset Dashboard priority ranking.

   IMPORTANT:
   - Read-only.
   - No new scoring logic.
   - getTopWorstAssetsDashboard(3) remains the source.
   - Workload includes active Preventive tasks only.
========================================================= */

function renderProductionPreventivePriority() {

  /* =====================
     TARGET CONTAINER
  ===================== */

  const container =
    document.getElementById(
      "productionPreventivePriorityList"
    );


  if (!container) {
    return;
  }


  /* =====================
     GET TOP 3 ASSETS

     Uses existing Asset Dashboard ranking.
  ===================== */

  const assets =
    typeof getTopWorstAssetsDashboard ===
      "function"
      ? getTopWorstAssetsDashboard(3)
      : [];


  /* =====================
     RESET CONTENT
  ===================== */

  container.replaceChildren();


  /* =====================
     EMPTY STATE
  ===================== */

  if (
    !Array.isArray(assets) ||
    assets.length === 0
  ) {

    const empty =
      document.createElement(
        "div"
      );


    empty.className =
      "production-preventive-priority-empty";


    empty.textContent =
      "No preventive priorities at this time.";


    container.appendChild(
      empty
    );


    return;

  }


  /* =====================
     RENDER TOP ASSETS
  ===================== */

  assets.forEach(asset => {

    /* =====================
       CARD
    ===================== */

    const card =
      document.createElement(
        "div"
      );


    card.className =
      "production-preventive-priority-card";


    /* =====================
       MAIN ROW
    ===================== */

    const main =
      document.createElement(
        "div"
      );


    main.className =
      "production-preventive-priority-main";


    /* =====================
       RISK ICON
    ===================== */

    const risk =
      document.createElement(
        "span"
      );


    risk.className =
      "production-preventive-priority-risk";


    risk.textContent =
      asset.riskIcon ||
      "•";


    /* =====================
       ASSET NAME
    ===================== */

    const assetName =
      document.createElement(
        "span"
      );


    assetName.className =
      "production-preventive-priority-asset";


    assetName.textContent =
      asset.machine ||
      "Unnamed Asset";


    /* =====================
       LINE
    ===================== */

    const line =
      document.createElement(
        "span"
      );


    line.className =
      "production-preventive-priority-line";


    line.textContent =
      asset.line ||
      "—";


    /* =====================
       WORKLOAD
    ===================== */

    const workload =
      document.createElement(
        "div"
      );


    workload.className =
      "production-preventive-priority-workload";


    /* =====================
      OVERDUE WORKLOAD

      Uses exactly the same Overdue count shown
      on the Asset Dashboard.

      overdueMinutes represents the estimated
      duration of those same overdue tasks.
    ===================== */

    const overdueCount =
      Number(
        asset.overdue ||
        0
      );


    const overdueMinutes =
      Number(
        asset.overdueMinutes ||
        0
      );


    /* =====================
      DISPLAY WORKLOAD
    ===================== */

    workload.textContent =
      `${overdueCount} overdue · ${overdueMinutes} min`;

    /* =====================
       ASSEMBLE CARD
    ===================== */

    main.append(
      risk,
      assetName,
      line
    );


    card.append(
      main,
      workload
    );


    container.appendChild(
      card
    );

  });

}

/* =====================
   RESET REPORT FORM
===================== */

function resetMaintenanceReportForm() {

  const asset =
    document.getElementById(
      "reportAsset"
    );


  const category =
    document.getElementById(
      "reportCategory"
    );


  const priority =
    document.getElementById(
      "reportPriority"
    );


  const productionStopped =
    document.getElementById(
      "reportProductionStopped"
    );


  const description =
    document.getElementById(
      "reportDescription"
    );


  if (asset) {
    asset.value = "";
  }


  if (category) {
    category.value = "";
  }


  if (priority) {
    priority.value = "NORMAL";
  }


  if (productionStopped) {
    productionStopped.value = "false";
  }


  if (description) {
    description.value = "";
  }

}

/* =====================
   SUBMIT MAINTENANCE REPORT
===================== */

async function submitMaintenanceReport() {

  const asset =
    document.getElementById(
      "reportAsset"
    );


  const category =
    document.getElementById(
      "reportCategory"
    );


  const priority =
    document.getElementById(
      "reportPriority"
    );


  const productionStopped =
    document.getElementById(
      "reportProductionStopped"
    );


  const description =
    document.getElementById(
      "reportDescription"
    );


  const submitBtn =
    document.getElementById(
      "submitMaintenanceReportBtn"
    );


  if (
    !asset ||
    !category ||
    !priority ||
    !productionStopped ||
    !description ||
    !submitBtn
  ) {

    console.error(
      "Maintenance Report form is incomplete"
    );

    return;

  }


  /* =====================
     READ VALUES
  ===================== */

  const assetId =
    Number(
      asset.value
    );


  const reportCategory =
    String(
      category.value ||
      ""
    ).trim();


  const reportPriority =
    String(
      priority.value ||
      "NORMAL"
    )
      .trim()
      .toUpperCase();


  const productionIsStopped =
    productionStopped.value ===
    "true";


  const reportDescription =
    String(
      description.value ||
      ""
    ).trim();


  const reporterName =
    String(
      localStorage.getItem(
        TECHNICIAN_NAME_STORAGE_KEY
      ) || ""
    ).trim();


  const reporterId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  /* =====================
     VALIDATION
  ===================== */

  if (
    !Number.isInteger(assetId) ||
    assetId <= 0
  ) {

    alert(
      "Please select an Asset."
    );

    return;

  }


  if (!reportCategory) {

    alert(
      "Please select a Category."
    );

    return;

  }


  if (!reportDescription) {

    alert(
      "Please enter a Description."
    );

    return;

  }

  if (!reporterName) {

    alert(
      "Logged user information is missing."
    );

    return;

  }

  if (
    !Number.isInteger(reporterId) ||
    reporterId <= 0
  ) {

    alert(
      "Logged user ID is missing."
    );

    return;

  }

  /* =====================
     SUBMIT
  ===================== */

  submitBtn.disabled = true;


  const originalText =
    submitBtn.textContent;


  submitBtn.textContent =
    "Submitting...";


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            asset_id:
              assetId,

            category:
              reportCategory,

            priority:
              reportPriority,

            production_stopped:
              productionIsStopped,

            description:
              reportDescription,

            reported_by:
              reporterName,

            reported_by_id:
              reporterId

          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to submit Maintenance Report"
      );

    }


    const reportCode =
      data?.report?.report_code ||
      "Maintenance Report";


    alert(
      `${reportCode} submitted successfully.`
    );


    resetMaintenanceReportForm();
    await loadProductionReports();
    closeMaintenanceReportModal();

  } catch (err) {

    console.error(
      "SUBMIT MAINTENANCE REPORT ERROR:",
      err
    );


    alert(
      err.message ||
      "Maintenance Report could not be submitted."
    );


  } finally {

    submitBtn.disabled = false;


    submitBtn.textContent =
      originalText;

  }

}

/* =========================================================
   LOAD PRODUCTION REPORTS
   Shared between all Shift Foremen
========================================================= */

async function loadProductionReports() {

  const container =
    document.getElementById(
      "productionReportsList"
    );


  const count =
    document.getElementById(
      "productionReportsCount"
    );


  if (!container) {
    return;
  }


  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  if (
    !Number.isInteger(technicianId) ||
    technicianId <= 0
  ) {

    container.textContent =
      "Unable to identify logged user.";

    return;

  }


  container.textContent =
    "Loading reports...";


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/my?technician_id=${technicianId}`
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to load Production Reports"
      );

    }


    const reports =
      Array.isArray(
        data?.reports
      )
        ? data.reports
        : [];

    productionReportsData =
      reports;

    refreshProductionReportsView();

  } catch (err) {

    console.error(
      "LOAD PRODUCTION REPORTS ERROR:",
      err
    );

    container.textContent =
      "Could not load Production Reports.";

  }

}

/* =========================================================
   RENDER PRODUCTION REPORTS
   Compact shared Shift Foreman table
========================================================= */

function renderProductionReports(reports) {

  const container =
    document.getElementById(
      "productionReportsList"
    );


  if (!container) {
    return;
  }


  const safeReports =
    Array.isArray(reports)
      ? reports
      : [];


  container.replaceChildren();


  /* =====================================================
     SHIFT SUMMARY

     OPEN =
     NEW + UNDER_REVIEW

     Urgent / Stopped counters refer only
     to currently OPEN reports.
  ===================================================== */

  const openReports =
    safeReports.filter(report => {

      const status =
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase();


      return (
        status === "NEW" ||
        status === "UNDER_REVIEW"
      );

    });


  const urgentOpen =
    openReports.filter(report =>
      String(
        report.priority || ""
      )
        .trim()
        .toUpperCase() ===
      "URGENT"
    ).length;


  const stoppedOpen =
    openReports.filter(report =>
      report.production_stopped === true
    ).length;


  const summaryOpen =
    document.getElementById(
      "reportSummaryOpen"
    );


  const summaryUrgent =
    document.getElementById(
      "reportSummaryUrgent"
    );


  const summaryStopped =
    document.getElementById(
      "reportSummaryStopped"
    );


  if (summaryOpen) {
    summaryOpen.textContent =
      String(openReports.length);
  }


  if (summaryUrgent) {
    summaryUrgent.textContent =
      String(urgentOpen);
  }


  if (summaryStopped) {
    summaryStopped.textContent =
      String(stoppedOpen);
  }


  /* =====================================================
     EMPTY STATE
  ===================================================== */

  if (safeReports.length === 0) {

    const empty =
      document.createElement(
        "div"
      );


    empty.className =
      "production-reports-empty";


    empty.textContent =
      "No Production Reports have been submitted yet.";


    container.appendChild(
      empty
    );


    return;
  }


  /* =====================================================
     TABLE WRAPPER
  ===================================================== */

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "production-reports-table-wrap";


  const table =
    document.createElement(
      "table"
    );


  table.className =
    "production-reports-table";


  /* =====================================================
     TABLE HEADER
  ===================================================== */

  const thead =
    document.createElement(
      "thead"
    );


  const headerRow =
    document.createElement(
      "tr"
    );


  [
    "Report No",
    "Asset",
    "Issue",
    "Maintenance Response",
    "Status"
  ].forEach(label => {

    const th =
      document.createElement(
        "th"
      );


    th.textContent =
      label;


    headerRow.appendChild(
      th
    );

  });


  /* =====================
     UPDATED SORT HEADER
  ===================== */

  const updatedHeader =
    document.createElement(
      "th"
    );


  updatedHeader.className =
    "production-report-updated-header";


  updatedHeader.title =
    "Sort by last update";


  updatedHeader.textContent =
    productionReportsViewState.updatedSort ===
    "ASC"
      ? "Updated ↑"
      : "Updated ↓";


  updatedHeader.addEventListener(
    "click",
    () => {

      productionReportsViewState.updatedSort =
        productionReportsViewState.updatedSort ===
          "DESC"
          ? "ASC"
          : "DESC";


      refreshProductionReportsView();

    }
  );


  headerRow.appendChild(
    updatedHeader
  );


  thead.appendChild(
    headerRow
  );


  table.appendChild(
    thead
  );


  /* =====================================================
     TABLE BODY
  ===================================================== */

  const tbody =
    document.createElement(
      "tbody"
    );


  safeReports.forEach(report => {

    const row =
      document.createElement(
        "tr"
      );


    const statusValue =
      String(
        report.status || "NEW"
      )
        .trim()
        .toUpperCase();


    const priority =
      String(
        report.priority || "NORMAL"
      )
        .trim()
        .toUpperCase();


    /* =====================
       ROW STATE
    ===================== */

    if (priority === "URGENT") {

      row.classList.add(
        "report-row-urgent"
      );

    }


    if (
      report.production_stopped ===
      true
    ) {

      row.classList.add(
        "report-row-stopped"
      );

    }


    /* ===================================================
       REPORT NUMBER

       MR-xxxxx is clickable and opens
       the shared Maintenance Report Detail modal.
    =================================================== */

    const reportCell =
      document.createElement(
        "td"
      );


    reportCell.className =
      "report-table-code-cell";


    const code =
      document.createElement(
        "div"
      );


    /* =====================
       CLICKABLE MR CODE
    ===================== */

    code.className =
      "report-table-code clickable-incident-reference";


    code.title =
      "Open Maintenance Report details";


    code.textContent =
      report.report_code ||
      `MR-${String(
        report.id
      ).padStart(5, "0")}`;


    /* =====================
       OPEN MR DETAIL

       Uses the shared read-only
       Maintenance Report Detail view.
    ===================== */

    code.addEventListener(
      "click",
      event => {

        event.stopPropagation();


        openMaintenanceReportDetail(
          Number(report.id)
        );

      }
    );


    const reportedMeta =
      document.createElement(
        "div"
      );


    reportedMeta.className =
      "report-table-subtext";


    const reportedDate =
      report.reported_at
        ? new Date(
            report.reported_at
          )
        : null;


    reportedMeta.textContent =
      reportedDate &&
      !Number.isNaN(
        reportedDate.getTime()
      )
        ? reportedDate.toLocaleString(
            "el-GR"
          )
        : "—";


    const reporter =
      document.createElement(
        "div"
      );


    reporter.className =
      "report-table-subtext";


    reporter.textContent =
      report.reported_by
        ? `By ${report.reported_by}`
        : "";


    reportCell.append(
      code,
      reportedMeta,
      reporter
    );


    /* ===================================================
       ASSET
    =================================================== */

    const assetCell =
      document.createElement(
        "td"
      );


    const assetName =
      document.createElement(
        "div"
      );


    assetName.className =
      "report-table-asset";


    assetName.textContent =
      report.asset_name ||
      report.asset_model ||
      "—";


    const assetMeta =
      document.createElement(
        "div"
      );


    assetMeta.className =
      "report-table-subtext";


    const assetParts = [];


    if (report.line_code) {

      assetParts.push(
        report.line_code
      );

    }


    if (report.asset_serial) {

      assetParts.push(
        `SN ${report.asset_serial}`
      );

    }


    assetMeta.textContent =
      assetParts.join(" · ");


    assetCell.append(
      assetName,
      assetMeta
    );


    /* ===================================================
       ISSUE
    =================================================== */

    const issueCell =
      document.createElement(
        "td"
      );


    issueCell.className =
      "report-table-issue-cell";


    const description =
      document.createElement(
        "div"
      );


    description.className =
      "report-table-description";


    description.textContent =
      report.description ||
      "—";


    const tags =
      document.createElement(
        "div"
      );


    tags.className =
      "report-table-tags";


    if (report.category) {

      const categoryBadge =
        document.createElement(
          "span"
        );


      categoryBadge.className =
        "report-table-tag";


      categoryBadge.textContent =
        String(
          report.category
        ).replace(
          /_/g,
          " "
        );


      tags.appendChild(
        categoryBadge
      );

    }


    if (priority === "URGENT") {

      const urgentBadge =
        document.createElement(
          "span"
        );


      urgentBadge.className =
        "report-table-tag urgent";


      urgentBadge.textContent =
        "URGENT";


      tags.appendChild(
        urgentBadge
      );

    }


    if (
      report.production_stopped ===
      true
    ) {

      const stoppedBadge =
        document.createElement(
          "span"
        );


      stoppedBadge.className =
        "report-table-tag stopped";


      stoppedBadge.textContent =
        "PRODUCTION STOPPED";


      tags.appendChild(
        stoppedBadge
      );

    }


    issueCell.append(
      description,
      tags
    );


    /* ===================================================
       MAINTENANCE RESPONSE
    =================================================== */

    const responseCell =
      document.createElement(
        "td"
      );


    responseCell.className =
      "report-table-response-cell";


    const responseText =
      document.createElement(
        "div"
      );


    responseText.className =
      "report-table-response";


    if (
      report.maintenance_comment
    ) {

      responseText.textContent =
        report.maintenance_comment;

    } else if (
      statusValue ===
      "UNDER_REVIEW"
    ) {

      responseText.textContent =
        "Under review by Maintenance";

    } else if (
      statusValue ===
      "CONVERTED"
    ) {

      if (
        report.resolution_type ===
        "BREAKDOWN"
      ) {

        responseText.textContent =
          report.breakdown_id
            ? `Converted to Breakdown BD-${String(
                report.breakdown_id
              ).padStart(5, "0")}`
            : "Converted to Breakdown";

      } else if (
        report.resolution_type ===
        "PLANNED_TASK"
      ) {

        responseText.textContent =
          "Converted to Planned Maintenance";

      } else {

        responseText.textContent =
          "Maintenance action created";

      }

    } else if (
      statusValue ===
      "CLOSED"
    ) {

      responseText.textContent =
        report.resolution_type ===
        "NO_ACTION"
          ? "Reviewed — no maintenance action required"
          : "Reviewed by Maintenance";

    } else {

      responseText.textContent =
        "Awaiting Maintenance review";

    }


    responseCell.appendChild(
      responseText
    );


    if (report.reviewed_by) {

      const reviewedBy =
        document.createElement(
          "div"
        );


      reviewedBy.className =
        "report-table-subtext";


      reviewedBy.textContent =
        `Reviewed by ${report.reviewed_by}`;


      responseCell.appendChild(
        reviewedBy
      );

    }


    /* ===================================================
       STATUS
    =================================================== */

    const statusCell =
      document.createElement(
        "td"
      );


    const statusBadge =
      document.createElement(
        "span"
      );


    statusBadge.className =
      "production-report-status";


    statusBadge.classList.add(
      `status-${statusValue
        .toLowerCase()
        .replace(/_/g, "-")}`
    );


    statusBadge.textContent =
      statusValue.replace(
        /_/g,
        " "
      );


    statusCell.appendChild(
      statusBadge
    );


    /* ===================================================
       UPDATED
    =================================================== */

    const updatedCell =
      document.createElement(
        "td"
      );


    updatedCell.className =
      "report-table-updated";


    const updatedAt =
      report.updated_at ||
      report.reviewed_at ||
      report.reported_at;


    const updatedDate =
      updatedAt
        ? new Date(
            updatedAt
          )
        : null;


    updatedCell.textContent =
      updatedDate &&
      !Number.isNaN(
        updatedDate.getTime()
      )
        ? updatedDate.toLocaleString(
            "el-GR"
          )
        : "—";


    /* ===================================================
       APPEND ROW
    =================================================== */

    row.append(
      reportCell,
      assetCell,
      issueCell,
      responseCell,
      statusCell,
      updatedCell
    );


    tbody.appendChild(
      row
    );

  });


  table.appendChild(
    tbody
  );


  wrapper.appendChild(
    table
  );


  container.appendChild(
    wrapper
  );

}

/* =========================================================
   LOAD NEW REPORT BADGE
   Maintenance Team only
========================================================= */

async function loadMaintenanceReportsBadge() {

  const badge =
    document.getElementById(
      "maintenanceReportsBadge"
    );


  if (!badge) {
    return;
  }


  const role =
    String(
      localStorage.getItem(
        ROLE_STORAGE_KEY
      ) || ""
    )
      .trim()
      .toLowerCase();


  const isMaintenanceTeam =
    (
      role === "admin" ||
      role === "planner" ||
      role === "technician"
    );


  if (!isMaintenanceTeam) {

    badge.style.display =
      "none";

    return;
  }


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/new-count`
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to load Maintenance Report count"
      );

    }


    const count =
      Number(
        data?.new_count || 0
      );


    badge.textContent =
      String(count);


    badge.style.display =
      count > 0
        ? "inline-flex"
        : "none";


  } catch (err) {

    console.error(
      "LOAD MAINTENANCE REPORT BADGE ERROR:",
      err
    );


    badge.style.display =
      "none";

  }

}

/* =========================================================
   LOAD MAINTENANCE REPORTS QUEUE
   Admin / Planner / Technician
========================================================= */

async function loadMaintenanceReportsQueue() {

  const container =
    document.getElementById(
      "maintenanceReportsQueue"
    );


  if (!container) {
    return;
  }


  const role =
    String(
      localStorage.getItem(
        ROLE_STORAGE_KEY
      ) || ""
    )
      .trim()
      .toLowerCase();


  const isMaintenanceTeam =
    (
      role === "admin" ||
      role === "planner" ||
      role === "technician"
    );


  if (!isMaintenanceTeam) {
    return;
  }


  container.textContent =
    "Loading Production Reports...";


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports`
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to load Production Reports"
      );

    }

    const reports =
      Array.isArray(
        data?.reports
      )
        ? data.reports
        : [];


    /*
      Keep the complete dataset.

      Filters work client-side without
      requesting the backend again.
    */

    maintenanceReportsAllData =
      reports;


    /*
      Build Line choices from the
      available Production Reports.
    */

    populateMaintenanceReportsLineFilter(
      maintenanceReportsAllData
    );


    /*
      Initialise filter controls once.
    */

    setupMaintenanceReportsFilters();


    /*
      Apply the current filters.

      This also renders the queue.
    */

    applyMaintenanceReportsFilters();


  } catch (err) {

    console.error(
      "LOAD MAINTENANCE REPORTS QUEUE ERROR:",
      err
    );


    container.textContent =
      "Could not load Production Reports.";

  }

}

/* =========================================================
   MAINTENANCE REPORTS — FILTER STATE
========================================================= */

let maintenanceReportsAllData = [];

let maintenanceReportsDateFrom = null;
let maintenanceReportsDateTo = null;

let maintenanceReportsPeriodPicker = null;


/* =========================================================
   POPULATE LINE FILTER

   Lines are taken directly from the loaded reports.
========================================================= */

function populateMaintenanceReportsLineFilter(
  reports
) {

  const select =
    document.getElementById(
      "maintenanceReportsLineFilter"
    );


  if (!select) {
    return;
  }


  const currentValue =
    select.value;


  select.replaceChildren(
    new Option(
      "All Lines",
      ""
    )
  );


  const lineMap =
    new Map();


  (
    Array.isArray(reports)
      ? reports
      : []
  ).forEach(report => {

    const lineCode =
      String(
        report?.line_code || ""
      ).trim();


    if (!lineCode) {
      return;
    }


    const key =
      lineCode.toLocaleLowerCase(
        "el-GR"
      );


    if (!lineMap.has(key)) {

      lineMap.set(
        key,
        lineCode
      );

    }

  });


  const lines =
    Array
      .from(
        lineMap.values()
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            "el",
            {
              numeric: true,
              sensitivity: "base"
            }
          )
      );


  lines.forEach(line => {

    select.add(
      new Option(
        line,
        line
      )
    );

  });


  if (
    lines.includes(
      currentValue
    )
  ) {

    select.value =
      currentValue;

  }

}


/* =========================================================
   APPLY MAINTENANCE REPORT FILTERS
========================================================= */

function applyMaintenanceReportsFilters() {

  const lineFilter =
    String(
      document.getElementById(
        "maintenanceReportsLineFilter"
      )?.value || ""
    ).trim();


  const statusFilter =
    String(
      document.getElementById(
        "maintenanceReportsStatusFilter"
      )?.value || ""
    )
      .trim()
      .toUpperCase();


  const searchText =
    String(
      document.getElementById(
        "maintenanceReportsSearch"
      )?.value || ""
    )
      .trim()
      .toLocaleLowerCase(
        "el-GR"
      );


  const filteredReports =
    maintenanceReportsAllData.filter(
      report => {

        /* =====================
           LINE
        ===================== */

        if (lineFilter) {

          const reportLine =
            String(
              report?.line_code || ""
            ).trim();


          if (
            reportLine !==
            lineFilter
          ) {

            return false;

          }

        }


        /* =====================
           STATUS
        ===================== */

        if (statusFilter) {

          const reportStatus =
            String(
              report?.status || ""
            )
              .trim()
              .toUpperCase();


          if (
            reportStatus !==
            statusFilter
          ) {

            return false;

          }

        }


        /* =====================
           PERIOD

           Filters by reported_at.
        ===================== */

        if (
          maintenanceReportsDateFrom ||
          maintenanceReportsDateTo
        ) {

          if (!report?.reported_at) {

            return false;

          }


          const reportedDate =
            new Date(
              report.reported_at
            );


          if (
            Number.isNaN(
              reportedDate.getTime()
            )
          ) {

            return false;

          }


          if (
            maintenanceReportsDateFrom &&
            reportedDate <
              maintenanceReportsDateFrom
          ) {

            return false;

          }


          if (
            maintenanceReportsDateTo &&
            reportedDate >
              maintenanceReportsDateTo
          ) {

            return false;

          }

        }


        /* =====================
           SEARCH
        ===================== */

        if (searchText) {

          const searchSource = [
            report?.report_code,
            report?.id,
            report?.asset_name,
            report?.asset_model,
            report?.asset_serial,
            report?.line_code,
            report?.description,
            report?.category,
            report?.priority,
            report?.reported_by,
            report?.reviewed_by,
            report?.status
          ]
            .map(value =>
              String(
                value ?? ""
              )
            )
            .join(" ")
            .toLocaleLowerCase(
              "el-GR"
            );


          if (
            !searchSource.includes(
              searchText
            )
          ) {

            return false;

          }

        }


        return true;

      }
    );


  renderMaintenanceReportsQueue(
    filteredReports
  );

}


/* =========================================================
   SETUP MAINTENANCE REPORT FILTERS
========================================================= */

function setupMaintenanceReportsFilters() {

  const lineFilter =
    document.getElementById(
      "maintenanceReportsLineFilter"
    );

  const statusFilter =
    document.getElementById(
      "maintenanceReportsStatusFilter"
    );

  const searchInput =
    document.getElementById(
      "maintenanceReportsSearch"
    );

  const periodInput =
    document.getElementById(
      "maintenanceReportsPeriodFilter"
    );


  /* =====================
     LINE
  ===================== */

  lineFilter?.addEventListener(
    "change",
    applyMaintenanceReportsFilters
  );


  /* =====================
     STATUS
  ===================== */

  statusFilter?.addEventListener(
    "change",
    applyMaintenanceReportsFilters
  );


  /* =====================
     SEARCH
  ===================== */

  searchInput?.addEventListener(
    "input",
    applyMaintenanceReportsFilters
  );


  /* =====================
     PERIOD
  ===================== */

  if (
    periodInput &&
    typeof flatpickr === "function" &&
    !maintenanceReportsPeriodPicker
  ) {

    maintenanceReportsPeriodPicker =
      flatpickr(
        periodInput,
        {
          mode:
            "range",

          dateFormat:
            "d-m-Y",

          allowInput:
            true,

          onClose:
            function(selectedDates) {

              /*
                Two dates selected:
                use full inclusive period.
              */

              if (
                selectedDates.length ===
                2
              ) {

                maintenanceReportsDateFrom =
                  new Date(
                    selectedDates[0]
                  );

                maintenanceReportsDateTo =
                  new Date(
                    selectedDates[1]
                  );


                maintenanceReportsDateFrom
                  .setHours(
                    0,
                    0,
                    0,
                    0
                  );


                maintenanceReportsDateTo
                  .setHours(
                    23,
                    59,
                    59,
                    999
                  );


                applyMaintenanceReportsFilters();

                return;

              }


              /*
                Picker cleared:
                remove Period filter.
              */

              if (
                selectedDates.length ===
                0
              ) {

                maintenanceReportsDateFrom =
                  null;

                maintenanceReportsDateTo =
                  null;


                applyMaintenanceReportsFilters();

              }

            }
        }
      );

  }

}


/* =========================================================
   RESET MAINTENANCE REPORT FILTERS

   Useful when needed later.
========================================================= */

function resetMaintenanceReportsFilters() {

  const lineFilter =
    document.getElementById(
      "maintenanceReportsLineFilter"
    );

  const statusFilter =
    document.getElementById(
      "maintenanceReportsStatusFilter"
    );

  const searchInput =
    document.getElementById(
      "maintenanceReportsSearch"
    );


  if (lineFilter) {
    lineFilter.value = "";
  }


  if (statusFilter) {
    statusFilter.value = "";
  }


  if (searchInput) {
    searchInput.value = "";
  }


  maintenanceReportsDateFrom =
    null;

  maintenanceReportsDateTo =
    null;


  if (
    maintenanceReportsPeriodPicker
  ) {

    maintenanceReportsPeriodPicker.clear();

  }


  applyMaintenanceReportsFilters();

}

/* =========================================================
   RENDER MAINTENANCE REPORTS QUEUE
========================================================= */

function renderMaintenanceReportsQueue(
  reports
) {

  const container =
    document.getElementById(
      "maintenanceReportsQueue"
    );


  if (!container) {
    return;
  }


  const safeReports =
    Array.isArray(reports)
      ? reports
      : [];

window.currentMaintenanceReportsQueue =
  safeReports;


  container.replaceChildren();


  /* =====================
     SUMMARY
  ===================== */

  const newReports =
    safeReports.filter(report =>
      String(
        report.status || ""
      )
        .trim()
        .toUpperCase() ===
      "NEW"
    );


  const underReview =
    safeReports.filter(report =>
      String(
        report.status || ""
      )
        .trim()
        .toUpperCase() ===
      "UNDER_REVIEW"
    );


  const openReports =
    safeReports.filter(report => {

      const status =
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase();


      return (
        status === "NEW" ||
        status === "UNDER_REVIEW"
      );

    });


  const urgentOpen =
    openReports.filter(report =>
      String(
        report.priority || ""
      )
        .trim()
        .toUpperCase() ===
      "URGENT"
    );


  const stoppedOpen =
    openReports.filter(report =>
      report.production_stopped ===
      true
    );


  const newCount =
    document.getElementById(
      "maintenanceReportsNewCount"
    );


  const reviewCount =
    document.getElementById(
      "maintenanceReportsReviewCount"
    );


  const urgentCount =
    document.getElementById(
      "maintenanceReportsUrgentCount"
    );


  const stoppedCount =
    document.getElementById(
      "maintenanceReportsStoppedCount"
    );


  if (newCount) {
    newCount.textContent =
      String(newReports.length);
  }


  if (reviewCount) {
    reviewCount.textContent =
      String(underReview.length);
  }


  if (urgentCount) {
    urgentCount.textContent =
      String(urgentOpen.length);
  }


  if (stoppedCount) {
    stoppedCount.textContent =
      String(stoppedOpen.length);
  }


  /* =====================
     EMPTY
  ===================== */

  if (safeReports.length === 0) {

    const empty =
      document.createElement(
        "div"
      );


    empty.className =
      "maintenance-reports-empty";


    empty.textContent =
      "No Production Reports available.";


    container.appendChild(
      empty
    );


    return;
  }


  /* =====================
     TABLE
  ===================== */

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "maintenance-reports-table-wrap";


  const table =
    document.createElement(
      "table"
    );


  table.className =
    "maintenance-reports-table";


  table.innerHTML = `
    <thead>
      <tr>
        <th>Report</th>
        <th>Asset</th>
        <th>Issue</th>
        <th>Reported By</th>
        <th>Status</th>
        <th>Reported</th>
        <th>Action</th>
      </tr>
    </thead>
  `;


  const tbody =
    document.createElement(
      "tbody"
    );


  safeReports.forEach(report => {

    const tr =
      document.createElement(
        "tr"
      );


    const status =
      String(
        report.status ||
        "NEW"
      )
        .trim()
        .toUpperCase();


    const priority =
      String(
        report.priority ||
        "NORMAL"
      )
        .trim()
        .toUpperCase();


    if (
      priority === "URGENT"
    ) {

      tr.classList.add(
        "urgent"
      );

    }


    if (
      report.production_stopped ===
      true
    ) {

      tr.classList.add(
        "stopped"
      );

    }


    const reportedDate =
      report.reported_at
        ? new Date(
            report.reported_at
          )
        : null;


    const reportCode =
      report.report_code ||
      `MR-${String(
        report.id
      ).padStart(5, "0")}`;


    const asset =
      report.asset_name ||
      report.asset_model ||
      "—";


    const issueTags = [];


    if (report.category) {

      issueTags.push(
        String(
          report.category
        ).replace(
          /_/g,
          " "
        )
      );

    }


    if (
      priority === "URGENT"
    ) {

      issueTags.push(
        "URGENT"
      );

    }


    if (
      report.production_stopped ===
      true
    ) {

      issueTags.push(
        "PRODUCTION STOPPED"
      );

    }


    /* =====================
       ACTION
    ===================== */

    const reviewedBy =
      String(
        report.reviewed_by || ""
      ).trim();


    let actionHtml =
      "";


    if (
      status === "NEW"
    ) {

      actionHtml = `
        <button
          type="button"
          class="btn-table maintenance-report-start-review-btn"
          data-report-id="${report.id}"
        >
          Start Review
        </button>
      `;

    }
    else if (
    status === "UNDER_REVIEW"
    ) {

    actionHtml = `
        <button
        type="button"
        class="btn-table maintenance-report-open-review-btn"
        data-report-id="${report.id}"
        >
        Review
        </button>

        ${
        reviewedBy
            ? `
            <div class="maintenance-report-subtext">
                ${escapeMaintenanceReportHtml(
                reviewedBy
                )}
            </div>
            `
            : ""
        }
    `;

    }
    else {

      actionHtml = `
        <span class="maintenance-report-subtext">
          —
        </span>
      `;

    }


    /* =====================
       ROW HTML
    ===================== */

    tr.innerHTML = `
      <td>
        <strong>
          ${escapeMaintenanceReportHtml(reportCode)}
        </strong>
      </td>

      <td>
        <strong>
          ${escapeMaintenanceReportHtml(asset)}
        </strong>

        <div class="maintenance-report-subtext">
          ${
            escapeMaintenanceReportHtml(
              report.line_code || ""
            )
          }
          ${
            report.asset_serial
              ? ` · SN ${escapeMaintenanceReportHtml(
                  report.asset_serial
                )}`
              : ""
          }
        </div>
      </td>

      <td>
        <div class="maintenance-report-description">
          ${escapeMaintenanceReportHtml(
            report.description || "—"
          )}
        </div>

        <div class="maintenance-report-tags">
          ${
            issueTags
              .map(tag => `
                <span>
                  ${escapeMaintenanceReportHtml(tag)}
                </span>
              `)
              .join("")
          }
        </div>
      </td>

      <td>
        ${escapeMaintenanceReportHtml(
          report.reported_by || "—"
        )}
      </td>

      <td>
        <span
          class="maintenance-report-status status-${status
            .toLowerCase()
            .replace(/_/g, "-")}"
        >
          ${escapeMaintenanceReportHtml(
            status.replace(/_/g, " ")
          )}
        </span>
      </td>

      <td>
        ${
          reportedDate &&
          !Number.isNaN(
            reportedDate.getTime()
          )
            ? escapeMaintenanceReportHtml(
                reportedDate.toLocaleString(
                  "el-GR"
                )
              )
            : "—"
        }
      </td>

      <td class="maintenance-report-action-cell">
        ${actionHtml}
      </td>
    `;


    tbody.appendChild(
      tr
    );

  });


  table.appendChild(
    tbody
  );


  wrapper.appendChild(
    table
  );


  container.appendChild(
    wrapper
  );

}

/* =========================================================
   START MAINTENANCE REPORT REVIEW
========================================================= */

async function startMaintenanceReportReview(
  reportId
) {

  const id =
    Number(reportId);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }


  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  if (
    !Number.isInteger(technicianId) ||
    technicianId <= 0
  ) {

    alert(
      "Unable to identify logged Maintenance user."
    );

    return;
  }


  const confirmed =
    window.confirm(
      `Start Maintenance review for MR-${String(
        id
      ).padStart(5, "0")}?`
    );


  if (!confirmed) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${id}/start-review`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            technician_id:
              technicianId
          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to start review"
      );

    }


    /* =====================
       REFRESH QUEUE
    ===================== */

    await loadMaintenanceReportsQueue();


    /* =====================
       REFRESH TAB BADGE
    ===================== */

    if (
      typeof loadMaintenanceReportsBadge ===
      "function"
    ) {

      await loadMaintenanceReportsBadge();

    }


  } catch (err) {

    console.error(
      "START MAINTENANCE REPORT REVIEW ERROR:",
      err
    );


    alert(
      err.message ||
      "Maintenance Report review could not be started."
    );

  }

}

/* =========================================================
   SAFE HTML
========================================================= */

function escapeMaintenanceReportHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}

/* =========================================================
   CURRENT MAINTENANCE REPORT REVIEW
========================================================= */

let currentMaintenanceReportReview =
  null;

/* =========================================================
   OPEN MAINTENANCE REPORT REVIEW
========================================================= */

function openMaintenanceReportReview(report) {

  if (!report) {
    return;
  }


  currentMaintenanceReportReview =
    report;


  const overlay =
    document.getElementById(
      "maintenanceReportReviewOverlay"
    );


  if (!overlay) {
    return;
  }


  const code =
    report.report_code ||
    `MR-${String(
      report.id
    ).padStart(5, "0")}`;


  const asset =
    report.asset_name ||
    report.asset_model ||
    "—";


  const title =
    document.getElementById(
      "maintenanceReportReviewTitle"
    );


  const status =
    document.getElementById(
      "maintenanceReportReviewStatus"
    );


  const assetEl =
    document.getElementById(
      "maintenanceReportReviewAsset"
    );


  const reporter =
    document.getElementById(
      "maintenanceReportReviewReporter"
    );


  const issue =
    document.getElementById(
      "maintenanceReportReviewIssue"
    );


  const comment =
    document.getElementById(
      "maintenanceReportReviewComment"
    );


  const meta =
    document.getElementById(
      "maintenanceReportReviewMeta"
    );


  /* =====================
     BASIC REPORT DATA
  ===================== */

  if (title) {

    title.textContent =
      `${code} — Maintenance Review`;

  }


  if (status) {

    status.textContent =
      String(
        report.status ||
        "UNDER_REVIEW"
      )
        .replace(
          /_/g,
          " "
        );

  }


  if (assetEl) {

    assetEl.textContent =
      asset;

  }


  if (reporter) {

    reporter.textContent =
      report.reported_by ||
      "—";

  }


  if (issue) {

    issue.textContent =
      report.description ||
      "—";

  }


  if (comment) {

    comment.value =
      report.maintenance_comment ||
      "";

  }


  /* =====================
     HIDE CONVERSION SECTIONS
     BY DEFAULT
  ===================== */

  const breakdownSection =
    document.getElementById(
      "maintenanceReportBreakdownSection"
    );


  const plannedSection =
    document.getElementById(
      "maintenanceReportPlannedSection"
    );


  if (breakdownSection) {

    breakdownSection.style.display =
      "none";

  }


  if (plannedSection) {

    plannedSection.style.display =
      "none";

  }


  /* =====================
     RESET BREAKDOWN FIELDS
  ===================== */

  const breakdownTitle =
    document.getElementById(
      "maintenanceReportBreakdownTitle"
    );


  if (breakdownTitle) {

    breakdownTitle.value =
      "";

  }


  /* =====================
     RESET PLANNED TASK
     BASIC FIELDS
  ===================== */

  const plannedTask =
    document.getElementById(
      "maintenanceReportPlannedTask"
    );


  const plannedDue =
    document.getElementById(
      "maintenanceReportPlannedDue"
    );


  const plannedDuration =
    document.getElementById(
      "maintenanceReportPlannedDuration"
    );


  const plannedType =
    document.getElementById(
      "maintenanceReportPlannedType"
    );


  const plannedNotes =
    document.getElementById(
      "maintenanceReportPlannedNotes"
    );


  if (plannedTask) {

    plannedTask.value =
      "";

  }


  if (plannedDue) {

    plannedDue.value =
      "";

  }


  if (plannedDuration) {

    plannedDuration.value =
      "";

  }


  if (plannedType) {

    plannedType.value =
      "";

  }


  if (plannedNotes) {

    plannedNotes.value =
      "";

  }


  /* =====================
     RESET SECTION
  ===================== */

  const plannedSectionSelect =
    document.getElementById(
      "maintenanceReportPlannedSection"
    );


  const plannedSectionInput =
    document.getElementById(
      "maintenanceReportPlannedSectionInput"
    );


  if (plannedSectionSelect) {

    plannedSectionSelect.innerHTML =
      `<option value="">Select Section</option>`;

    plannedSectionSelect.value =
      "";

    plannedSectionSelect.style.display =
      "none";

  }


  if (plannedSectionInput) {

    plannedSectionInput.value =
      "";

    plannedSectionInput.style.display =
      "none";

  }


  /* =====================
     RESET UNIT
  ===================== */

  const plannedUnitSelect =
    document.getElementById(
      "maintenanceReportPlannedUnit"
    );


  const plannedUnitInput =
    document.getElementById(
      "maintenanceReportPlannedUnitInput"
    );


  if (plannedUnitSelect) {

    plannedUnitSelect.innerHTML =
      `<option value="">Select Unit</option>`;

    plannedUnitSelect.value =
      "";

    plannedUnitSelect.style.display =
      "none";

  }


  if (plannedUnitInput) {

    plannedUnitInput.value =
      "";

    plannedUnitInput.style.display =
      "none";

  }


  /* =====================
     POPULATE SECTIONS
     FROM REPORT ASSET
  ===================== */

  if (
    report.asset_id &&
    typeof populateMaintenanceReportPlannedSections ===
      "function"
  ) {

    populateMaintenanceReportPlannedSections(
      report.asset_id
    );

  }


  /* =====================
     REVIEW META
  ===================== */

  if (meta) {

    const reviewedBy =
      report.reviewed_by ||
      "—";


    const reviewedAt =
      report.reviewed_at
        ? new Date(
            report.reviewed_at
          )
        : null;


    const reviewedAtText =
      reviewedAt &&
      !Number.isNaN(
        reviewedAt.getTime()
      )
        ? reviewedAt.toLocaleString(
            "el-GR"
          )
        : "—";


    meta.textContent =
      `Reviewed by ${reviewedBy} · ${reviewedAtText}`;

  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display =
    "flex";

}

/* =========================================================
   CLOSE REVIEW MODAL
========================================================= */

function closeMaintenanceReportReview() {

  const overlay =
    document.getElementById(
      "maintenanceReportReviewOverlay"
    );


  if (overlay) {

    overlay.style.display =
      "none";

  }


  currentMaintenanceReportReview =
    null;

}

/* =========================================================
   SAVE MAINTENANCE COMMENT
========================================================= */

async function saveMaintenanceReportComment() {

  const report =
    currentMaintenanceReportReview;


  if (!report) {
    return;
  }


  const commentInput =
    document.getElementById(
      "maintenanceReportReviewComment"
    );


  const comment =
    String(
      commentInput?.value || ""
    ).trim();


  if (!comment) {

    alert(
      "Maintenance Comment is required."
    );

    return;

  }


  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${report.id}/comment`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            technician_id:
              technicianId,

            maintenance_comment:
              comment
          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to save Maintenance Comment"
      );

    }


    await loadMaintenanceReportsQueue();


    currentMaintenanceReportReview =
      data.report;


    alert(
      "Maintenance Comment saved."
    );


  } catch (err) {

    console.error(
      "SAVE MAINTENANCE COMMENT ERROR:",
      err
    );


    alert(
      err.message ||
      "Maintenance Comment could not be saved."
    );

  }

}

/* =========================================================
   CLOSE REPORT — NO ACTION
========================================================= */

async function closeMaintenanceReportNoAction() {

  const report =
    currentMaintenanceReportReview;


  if (!report) {
    return;
  }


  const commentInput =
    document.getElementById(
      "maintenanceReportReviewComment"
    );


  const comment =
    String(
      commentInput?.value || ""
    ).trim();


  if (!comment) {

    alert(
      "Maintenance Comment is required before closing the Report."
    );

    return;

  }


  const confirmed =
    window.confirm(
      "Close this Production Report with no Maintenance action?"
    );


  if (!confirmed) {
    return;
  }


  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${report.id}/close-no-action`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            technician_id:
              technicianId,

            maintenance_comment:
              comment
          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to close Production Report"
      );

    }


    closeMaintenanceReportReview();


    await loadMaintenanceReportsQueue();


    if (
      typeof loadMaintenanceReportsBadge ===
      "function"
    ) {

      await loadMaintenanceReportsBadge();

    }


  } catch (err) {

    console.error(
      "CLOSE MAINTENANCE REPORT ERROR:",
      err
    );


    alert(
      err.message ||
      "Production Report could not be closed."
    );

  }

}

/* =========================================================
   CONVERT MAINTENANCE REPORT TO BREAKDOWN
========================================================= */

async function createBreakdownFromMaintenanceReport() {

  const report =
    currentMaintenanceReportReview;


  if (!report) {
    return;
  }


  const titleInput =
    document.getElementById(
      "maintenanceReportBreakdownTitle"
    );


  const commentInput =
    document.getElementById(
      "maintenanceReportReviewComment"
    );


  const breakdownTitle =
    String(
      titleInput?.value || ""
    ).trim();


  const maintenanceComment =
    String(
      commentInput?.value || ""
    ).trim();


  /* =====================
     VALIDATE TITLE
  ===================== */

  if (!breakdownTitle) {

    alert(
      "Breakdown Title is required."
    );

    titleInput?.focus();

    return;

  }


  /* =====================
     MAINTENANCE USER
  ===================== */

  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  if (
    !Number.isInteger(technicianId) ||
    technicianId <= 0
  ) {

    alert(
      "Logged Maintenance user information is missing."
    );

    return;

  }


  /* =====================
     CONFIRM
  ===================== */

  const confirmed =
    window.confirm(
      "Create a Breakdown from this Production Report?"
    );


  if (!confirmed) {
    return;
  }


  const button =
    document.getElementById(
      "createBreakdownFromReportBtn"
    );


  const originalText =
    button?.textContent;


  if (button) {

    button.disabled = true;

    button.textContent =
      "Creating...";

  }


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${report.id}/convert-to-breakdown`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            technician_id:
              technicianId,

            title:
              breakdownTitle,

            maintenance_comment:
              maintenanceComment

          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to create Breakdown"
      );

    }


    /* =====================================================
      SUCCESS

      IMPORTANT:
      At this point the Breakdown has already been
      successfully created by the backend.

      Any following UI refresh/detail error must NOT
      be reported as a Breakdown creation failure.
    ===================================================== */

    const breakdownId =
      Number(
        data?.breakdown?.id
      );


    /* =====================
      CLOSE REVIEW MODAL
    ===================== */

    closeMaintenanceReportReview();


    /* =====================================================
      POST-CREATE UI REFRESH

      These actions happen AFTER successful creation.

      If one of them fails:
      - The Breakdown remains successfully created.
      - Do NOT fall into the CREATE error handler.
    ===================================================== */

    try {

      /* =====================
        REFRESH REPORT QUEUE
      ===================== */

      await loadMaintenanceReportsQueue();


      /* =====================
        REFRESH BADGE
      ===================== */

      if (
        typeof loadMaintenanceReportsBadge ===
        "function"
      ) {

        await loadMaintenanceReportsBadge();

      }


      /* =====================
        REFRESH BREAKDOWN LIST
      ===================== */

      if (
        typeof loadBreakdowns ===
        "function"
      ) {

        await loadBreakdowns();

      }


      /* =====================
        OPEN CREATED BD DETAIL
      ===================== */

      if (
        Number.isInteger(breakdownId) &&
        breakdownId > 0 &&
        typeof openBreakdownDetail ===
          "function"
      ) {

        await openBreakdownDetail(
          breakdownId
        );

      }

    } catch (uiError) {

      /* =====================
        UI ERROR ONLY

        Breakdown creation has already succeeded.
      ===================== */

      console.error(
        "POST-CREATE REPORT BREAKDOWN UI ERROR:",
        uiError
      );

    }


  } catch (err) {

    console.error(
      "CREATE BREAKDOWN FROM MAINTENANCE REPORT ERROR:",
      err
    );


    alert(
      err.message ||
      "Breakdown could not be created."
    );


  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        originalText ||
        "Create Breakdown";

    }

  }

}

/* =========================================================
   CONVERT MAINTENANCE REPORT TO PLANNED TASK
========================================================= */

async function createPlannedTaskFromMaintenanceReport() {

  const report =
    currentMaintenanceReportReview;


  if (!report) {
    return;
  }


  const taskInput =
  document.getElementById(
    "maintenanceReportPlannedTask"
  );


const dueInput =
  document.getElementById(
    "maintenanceReportPlannedDue"
  );


const durationInput =
  document.getElementById(
    "maintenanceReportPlannedDuration"
  );


const typeInput =
  document.getElementById(
    "maintenanceReportPlannedType"
  );


const notesInput =
  document.getElementById(
    "maintenanceReportPlannedNotes"
  );


const commentInput =
  document.getElementById(
    "maintenanceReportReviewComment"
  );


const sectionSelect =
  document.getElementById(
    "maintenanceReportPlannedSection"
  );


const sectionCustomInput =
  document.getElementById(
    "maintenanceReportPlannedSectionInput"
  );


const unitSelect =
  document.getElementById(
    "maintenanceReportPlannedUnit"
  );


const unitCustomInput =
  document.getElementById(
    "maintenanceReportPlannedUnitInput"
  );


const task =
  String(
    taskInput?.value || ""
  ).trim();


const dueRaw =
  String(
    dueInput?.value || ""
  ).trim();


const durationRaw =
  String(
    durationInput?.value || ""
  ).trim();


const section =
  sectionSelect &&
  sectionSelect.style.display !== "none"
    ? String(
        sectionSelect.value || ""
      ).trim()
    : String(
        sectionCustomInput?.value || ""
      ).trim();


const unit =
  unitSelect &&
  unitSelect.style.display !== "none" &&
  unitSelect.value !== "__new__"
    ? String(
        unitSelect.value || ""
      ).trim()
    : String(
        unitCustomInput?.value || ""
      ).trim();


const type =
  String(
    typeInput?.value || ""
  ).trim();


const notes =
  String(
    notesInput?.value || ""
  ).trim();


const maintenanceComment =
  String(
    commentInput?.value || ""
  ).trim();


  /* =====================
     VALIDATION
  ===================== */

  if (!task) {

    alert(
      "Task description is required."
    );

    taskInput?.focus();

    return;

  }


  if (!dueRaw) {

    alert(
      "Due Date is required."
    );

    dueInput?.focus();

    return;

  }


  const dueDate =
    new Date(dueRaw);


  if (
    Number.isNaN(
      dueDate.getTime()
    )
  ) {

    alert(
      "Invalid Due Date."
    );

    return;

  }


  let durationMin =
    null;


  if (durationRaw !== "") {

    durationMin =
      Number(
        durationRaw
      );


    if (
      !Number.isFinite(durationMin) ||
      durationMin < 0
    ) {

      alert(
        "Estimated Duration must be a valid positive number."
      );

      durationInput?.focus();

      return;

    }

  }


  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  if (
    !Number.isInteger(technicianId) ||
    technicianId <= 0
  ) {

    alert(
      "Logged Maintenance user information is missing."
    );

    return;

  }


  const confirmed =
    window.confirm(
      "Create a Planned Task from this Production Report?"
    );


  if (!confirmed) {
    return;
  }


  const button =
    document.getElementById(
      "createPlannedTaskFromReportBtn"
    );


  const originalText =
    button?.textContent;


  if (button) {

    button.disabled = true;

    button.textContent =
      "Creating...";

  }


  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${report.id}/convert-to-planned-task`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            technician_id:
              technicianId,

            task,

            section:
              section || null,

            unit:
              unit || null,

            type:
              type || null,

            impact:
              "normal",

            due_date:
              dueDate.toISOString(),

            duration_min:
              durationMin,

            notes:
              notes || null,

            maintenance_comment:
              maintenanceComment

          })

        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Failed to create Planned Task"
      );

    }


    closeMaintenanceReportReview();


    await loadMaintenanceReportsQueue();


    if (
      typeof loadMaintenanceReportsBadge ===
      "function"
    ) {

      await loadMaintenanceReportsBadge();

    }


    if (
      typeof renderTable ===
      "function"
    ) {

      renderTable();

    }


    const taskId =
      data?.task?.id;


    const message =
      taskId
        ? `Planned Task #${taskId} created successfully.`
        : "Planned Task created successfully.";


    alert(
      message
    );


  } catch (err) {

    console.error(
      "CREATE PLANNED TASK FROM MAINTENANCE REPORT ERROR:",
      err
    );


    alert(
      err.message ||
      "Planned Task could not be created."
    );


  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        originalText ||
        "Create Planned Task";

    }

  }

}

/* =========================================================
   SHOW BREAKDOWN CONVERSION SECTION
========================================================= */

function showMaintenanceReportBreakdownSection() {

  const breakdownSection =
    document.getElementById(
      "maintenanceReportBreakdownSection"
    );

  const plannedSection =
    document.getElementById(
      "maintenanceReportPlannedConversionSection"
    );


  if (plannedSection) {

    plannedSection.style.display =
      "none";

  }


  if (breakdownSection) {

    breakdownSection.style.display =
      "block";


    breakdownSection.scrollIntoView({
      behavior:
        "smooth",

      block:
        "nearest"
    });

  }

}

/* =========================================================
   SHOW PLANNED TASK CONVERSION SECTION
========================================================= */

function showMaintenanceReportPlannedSection() {

  const breakdownSection =
    document.getElementById(
      "maintenanceReportBreakdownSection"
    );

  const plannedSection =
    document.getElementById(
      "maintenanceReportPlannedConversionSection"
    );


  if (breakdownSection) {

    breakdownSection.style.display =
      "none";

  }


  if (plannedSection) {

    plannedSection.style.display =
      "block";


    plannedSection.scrollIntoView({
      behavior:
        "smooth",

      block:
        "nearest"
    });

  }

}

/* =========================================================
   POPULATE PLANNED REPORT SECTIONS
========================================================= */

function populateMaintenanceReportPlannedSections(assetId) {

  const sectionSelect =
    document.getElementById(
      "maintenanceReportPlannedSection"
    );

  const sectionInput =
    document.getElementById(
      "maintenanceReportPlannedSectionInput"
    );

  const unitSelect =
    document.getElementById(
      "maintenanceReportPlannedUnit"
    );

  const unitInput =
    document.getElementById(
      "maintenanceReportPlannedUnitInput"
    );


  if (
    !sectionSelect ||
    !sectionInput
  ) {
    return;
  }


  /* RESET UNIT */

  if (unitSelect) {

    unitSelect.innerHTML =
      `<option value="">Select Unit</option>`;

    unitSelect.style.display =
      "none";

  }


  if (unitInput) {

    unitInput.value =
      "";

    unitInput.style.display =
      "none";

  }


  const sections =
    getSectionsForAsset(
      assetId
    );


  sectionSelect.innerHTML =
    "";


  if (
    Array.isArray(sections) &&
    sections.length > 0
  ) {

    sectionSelect.innerHTML =
      `<option value="">Select Section</option>` +
      sections
        .map(
          section =>
            `<option value="${section}">${section}</option>`
        )
        .join("");


    sectionSelect.style.display =
      "block";


    sectionInput.style.display =
      "none";


    sectionInput.value =
      "";

  } else {

    sectionSelect.style.display =
      "none";


    sectionInput.style.display =
      "block";


    sectionInput.value =
      "";

  }

}

/* =========================================================
   POPULATE PLANNED REPORT UNITS
========================================================= */

function populateMaintenanceReportPlannedUnits(
  assetId,
  section
) {

  const unitSelect =
    document.getElementById(
      "maintenanceReportPlannedUnit"
    );

  const unitInput =
    document.getElementById(
      "maintenanceReportPlannedUnitInput"
    );


  if (
    !unitSelect ||
    !unitInput
  ) {
    return;
  }


  unitSelect.innerHTML =
    "";


  const units =
    getUnitsForAssetSection(
      assetId,
      section
    );


  if (
    Array.isArray(units) &&
    units.length > 0
  ) {

    unitSelect.innerHTML =
      `<option value="">Select Unit</option>` +
      units
        .map(
          unit =>
            `<option value="${unit}">${unit}</option>`
        )
        .join("") +
      `<option value="__new__">➕ New unit</option>`;


    unitSelect.style.display =
      "block";


    unitInput.style.display =
      "none";


    unitInput.value =
      "";

  } else {

    unitSelect.style.display =
      "none";


    unitInput.style.display =
      "block";


    unitInput.value =
      "";

  }

}

/* =========================================================
   INIT MAINTENANCE REPORTING
========================================================= */

async function initMaintenanceReporting() {

  const role =
    String(
      localStorage.getItem(
        ROLE_STORAGE_KEY
      ) || ""
    )
      .trim()
      .toLowerCase();


  /* =====================
     SHIFT FOREMAN ONLY
  ===================== */

  if (
    role !==
    "shift_foreman"
  ) {
    return;
  }


  /* =====================
     LOAD REPORTING DATA
  ===================== */

  await loadReportingAssets();

  await loadProductionReports();


  /* =====================
     SUBMIT BUTTON

     Bind only once.
  ===================== */

  const submitBtn =
    document.getElementById(
      "submitMaintenanceReportBtn"
    );


  if (
    submitBtn &&
    submitBtn.dataset.reportHandlerBound !==
      "true"
  ) {

    submitBtn.addEventListener(
      "click",
      submitMaintenanceReport
    );


    submitBtn.dataset.reportHandlerBound =
      "true";

  }

}

let maintenanceReportsBadgeInterval =
  null;


function startMaintenanceReportsBadgeRefresh() {

  loadMaintenanceReportsBadge();


  if (
    maintenanceReportsBadgeInterval
  ) {

    clearInterval(
      maintenanceReportsBadgeInterval
    );

  }


  maintenanceReportsBadgeInterval =
    setInterval(
      loadMaintenanceReportsBadge,
      90000
    );

}

/* =========================================================
   OPEN / CLOSE NEW REPORT MODAL
========================================================= */

function openMaintenanceReportModal() {

  const overlay =
    document.getElementById(
      "maintenanceReportModalOverlay"
    );


  if (!overlay) {
    return;
  }


  overlay.style.display =
    "flex";

}

function closeMaintenanceReportModal() {

  const overlay =
    document.getElementById(
      "maintenanceReportModalOverlay"
    );


  if (!overlay) {
    return;
  }


  overlay.style.display =
    "none";

}

function openProductionReportsPrintModal() {

  const reports =
    getFilteredProductionReports();


  const overlay =
    document.getElementById(
      "productionReportsPrintOverlay"
    );


  if (!overlay) {
    return;
  }


  const openReports =
    reports.filter(report => {

      const status =
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase();

      return (
        status === "NEW" ||
        status === "UNDER_REVIEW"
      );

    });


  const urgentOpen =
    openReports.filter(report =>
      String(
        report.priority || ""
      )
        .trim()
        .toUpperCase() === "URGENT"
    ).length;


  const stoppedOpen =
    openReports.filter(report =>
      report.production_stopped === true
    ).length;


  const totalEl =
    document.getElementById(
      "productionPrintTotal"
    );

  const openEl =
    document.getElementById(
      "productionPrintOpen"
    );

  const urgentEl =
    document.getElementById(
      "productionPrintUrgent"
    );

  const stoppedEl =
    document.getElementById(
      "productionPrintStopped"
    );


  if (totalEl) {
    totalEl.textContent =
      String(reports.length);
  }

  if (openEl) {
    openEl.textContent =
      String(openReports.length);
  }

  if (urgentEl) {
    urgentEl.textContent =
      String(urgentOpen);
  }

  if (stoppedEl) {
    stoppedEl.textContent =
      String(stoppedOpen);
  }

  /* =====================
    SHOW ACTIVE FILTERS
  ===================== */

  const filterSummary =
    document.getElementById(
      "productionPrintFilterSummary"
    );


  if (filterSummary) {

    filterSummary.textContent =
      getProductionReportsPrintFilterSummary();

  }

  overlay.style.display =
    "flex";
}

/* =========================================================
   PRINT PRODUCTION REPORTS

   Prints exactly the reports currently visible according
   to the active Shift Foreman filters.

   FLOW:
   1. Get the same filtered dataset used by the screen.
   2. Calculate report summary KPIs.
   3. Build a clean printable A4 document.
   4. Open browser print dialog.

   IMPORTANT:
   - No separate filtering logic is used here.
   - getFilteredProductionReports() remains the single
     source of truth for screen and print results.
========================================================= */

function printProductionReports() {

  /* =====================
     FILTERED DATASET
  ===================== */

  const reports =
    getFilteredProductionReports();


  if (
    !Array.isArray(reports) ||
    reports.length === 0
  ) {

    alert(
      "No Production Reports available for the current filters."
    );

    return;

  }


  /* =====================
     OPEN REPORTS

     OPEN =
     NEW + UNDER_REVIEW
  ===================== */

  const openReports =
    reports.filter(report => {

      const status =
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase();


      return (
        status === "NEW" ||
        status === "UNDER_REVIEW"
      );

    });


  /* =====================
     URGENT OPEN
  ===================== */

  const urgentOpen =
    openReports.filter(report =>

      String(
        report.priority || ""
      )
        .trim()
        .toUpperCase() === "URGENT"

    ).length;


  /* =====================
     PRODUCTION STOPPED OPEN
  ===================== */

  const stoppedOpen =
    openReports.filter(report =>

      report.production_stopped === true

    ).length;


  /* =====================
     SAFE HTML HELPER

     Prevent report text from being interpreted
     as HTML inside the printable document.
  ===================== */

  const escapeHtml =
    value =>
      String(
        value ?? ""
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");


  /* =====================
     DATE / TIME HELPER
  ===================== */

  const formatPrintDateTime =
    value => {

      if (!value) {
        return "—";
      }


      const date =
        new Date(value);


      if (
        Number.isNaN(
          date.getTime()
        )
      ) {

        return "—";

      }


      return date.toLocaleString(
        "el-GR"
      );

    };


  /* =====================
     FILTER SUMMARY
  ===================== */

  const filterSummary =
    getProductionReportsPrintFilterSummary();


  /* =====================
     PRINT DATE
  ===================== */

  const printedAt =
    new Date()
      .toLocaleString(
        "el-GR"
      );


  /* =====================
     BUILD TABLE ROWS
  ===================== */

  const rowsHtml =
    reports
      .map(report => {

        const status =
          String(
            report.status || "NEW"
          )
            .trim()
            .toUpperCase();


        const priority =
          String(
            report.priority || "NORMAL"
          )
            .trim()
            .toUpperCase();


        /* =====================
           REPORT NUMBER
        ===================== */

        const reportCode =
          report.report_code ||
          `MR-${String(
            report.id
          ).padStart(
            5,
            "0"
          )}`;


        /* =====================
           ASSET
        ===================== */

        const assetName =
          report.asset_name ||
          report.asset_model ||
          "—";


        const assetMeta =
          [
            report.line_code,
            report.asset_serial
              ? `SN ${report.asset_serial}`
              : null
          ]
            .filter(Boolean)
            .join(" · ");


        /* =====================
           ISSUE TAGS
        ===================== */

        const tags = [];


        if (report.category) {

          tags.push(
            String(
              report.category
            ).replace(
              /_/g,
              " "
            )
          );

        }


        if (
          priority === "URGENT"
        ) {

          tags.push(
            "URGENT"
          );

        }


        if (
          report.production_stopped === true
        ) {

          tags.push(
            "PRODUCTION STOPPED"
          );

        }


        /* =====================
           MAINTENANCE RESPONSE

           Same semantic logic used by
           renderProductionReports().
        ===================== */

        let maintenanceResponse =
          "Awaiting Maintenance review";


        if (
          report.maintenance_comment
        ) {

          maintenanceResponse =
            report.maintenance_comment;

        } else if (
          status === "UNDER_REVIEW"
        ) {

          maintenanceResponse =
            "Under review by Maintenance";

        } else if (
          status === "CONVERTED"
        ) {

          if (
            report.resolution_type ===
            "BREAKDOWN"
          ) {

            maintenanceResponse =
              report.breakdown_id
                ? `Converted to Breakdown BD-${String(
                    report.breakdown_id
                  ).padStart(
                    5,
                    "0"
                  )}`
                : "Converted to Breakdown";

          } else if (
            report.resolution_type ===
            "PLANNED_TASK"
          ) {

            maintenanceResponse =
              "Converted to Planned Maintenance";

          } else {

            maintenanceResponse =
              "Maintenance action created";

          }

        } else if (
          status === "CLOSED"
        ) {

          maintenanceResponse =
            report.resolution_type ===
            "NO_ACTION"
              ? "Reviewed — no maintenance action required"
              : "Reviewed by Maintenance";

        }


        /* =====================
           UPDATED DATE
        ===================== */

        const updatedAt =
          report.updated_at ||
          report.reviewed_at ||
          report.reported_at;


        /* =====================
           PRINT TABLE ROW
        ===================== */

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(reportCode)}
              </strong>

              <div class="sub">
                ${escapeHtml(
                  formatPrintDateTime(
                    report.reported_at
                  )
                )}
              </div>

              ${
                report.reported_by
                  ? `
                    <div class="sub">
                      By ${escapeHtml(
                        report.reported_by
                      )}
                    </div>
                  `
                  : ""
              }
            </td>


            <td>
              <strong>
                ${escapeHtml(assetName)}
              </strong>

              ${
                assetMeta
                  ? `
                    <div class="sub">
                      ${escapeHtml(assetMeta)}
                    </div>
                  `
                  : ""
              }
            </td>


            <td>
              <div>
                ${escapeHtml(
                  report.description ||
                  "—"
                )}
              </div>

              ${
                tags.length > 0
                  ? `
                    <div class="tags">
                      ${tags
                        .map(
                          tag =>
                            `<span>${escapeHtml(tag)}</span>`
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
            </td>


            <td>
              ${escapeHtml(
                maintenanceResponse
              )}

              ${
                report.reviewed_by
                  ? `
                    <div class="sub">
                      Reviewed by ${escapeHtml(
                        report.reviewed_by
                      )}
                    </div>
                  `
                  : ""
              }
            </td>


            <td>
              <strong>
                ${escapeHtml(
                  status.replace(
                    /_/g,
                    " "
                  )
                )}
              </strong>
            </td>


            <td>
              ${escapeHtml(
                formatPrintDateTime(
                  updatedAt
                )
              )}
            </td>

          </tr>
        `;

      })
      .join("");


  /* =====================
     PRINT WINDOW
  ===================== */

  const printWindow =
    window.open(
      "",
      "_blank",
      "width=1200,height=800"
    );


  if (!printWindow) {

    alert(
      "The print window could not be opened. Please allow pop-ups for this site."
    );

    return;

  }


  /* =====================================================
     PRINT DOCUMENT
  ===================================================== */

  printWindow.document.write(`
    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="UTF-8">

        <title>
          Production Reporting
        </title>


        <style>

          /* =============================================
             PAGE SETUP
          ============================================= */

          @page {
            size: A4 landscape;
            margin: 12mm;
          }


          * {
            box-sizing: border-box;
          }


          body {
            margin: 0;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            color: #172033;

            background: #ffffff;

            font-size: 10px;
          }


          /* =============================================
             REPORT HEADER
          ============================================= */

          .report-header {
            display: flex;

            justify-content: space-between;
            align-items: flex-start;

            gap: 20px;

            padding-bottom: 12px;

            border-bottom: 2px solid #172033;
          }


          .report-header h1 {
            margin: 0 0 4px;

            font-size: 22px;
          }


          .report-header h2 {
            margin: 0;

            font-size: 13px;

            font-weight: 500;

            color: #667085;
          }


          .report-meta {
            text-align: right;

            font-size: 9px;

            line-height: 1.5;

            color: #667085;
          }


          /* =============================================
             KPI SUMMARY
          ============================================= */

          .summary {
            display: grid;

            grid-template-columns:
              repeat(4, 1fr);

            gap: 8px;

            margin: 14px 0 10px;
          }


          .summary-card {
            padding: 9px 12px;

            border: 1px solid #d7dce3;

            border-radius: 6px;

            background: #f7f8fa;
          }


          .summary-card span {
            display: block;

            margin-bottom: 3px;

            font-size: 8px;

            text-transform: uppercase;

            color: #667085;
          }


          .summary-card strong {
            font-size: 19px;
          }


          /* =============================================
             FILTER SUMMARY
          ============================================= */

          .filters {
            margin-bottom: 12px;

            padding: 7px 10px;

            border: 1px solid #e0e4ea;

            border-radius: 5px;

            background: #fafafa;

            font-size: 9px;

            color: #475467;
          }


          /* =============================================
             REPORT TABLE
          ============================================= */

          table {
            width: 100%;

            border-collapse: collapse;

            table-layout: fixed;
          }


          thead {
            display: table-header-group;
          }


          th {
            padding: 7px 6px;

            border: 1px solid #cfd5dd;

            background: #eceff3;

            text-align: left;

            font-size: 8px;

            text-transform: uppercase;

            color: #344054;
          }


          td {
            padding: 7px 6px;

            border: 1px solid #d9dee5;

            vertical-align: top;

            overflow-wrap: break-word;

            line-height: 1.35;
          }


          tr {
            break-inside: avoid;
          }


          th:nth-child(1),
          td:nth-child(1) {
            width: 14%;
          }


          th:nth-child(2),
          td:nth-child(2) {
            width: 13%;
          }


          th:nth-child(3),
          td:nth-child(3) {
            width: 26%;
          }


          th:nth-child(4),
          td:nth-child(4) {
            width: 23%;
          }


          th:nth-child(5),
          td:nth-child(5) {
            width: 11%;
          }


          th:nth-child(6),
          td:nth-child(6) {
            width: 13%;
          }


          .sub {
            margin-top: 2px;

            font-size: 8px;

            color: #667085;
          }


          .tags {
            display: flex;

            flex-wrap: wrap;

            gap: 3px;

            margin-top: 5px;
          }


          .tags span {
            padding: 2px 4px;

            border: 1px solid #cfd5dd;

            border-radius: 3px;

            font-size: 7px;

            font-weight: 700;
          }


          /* =============================================
             FOOTER
          ============================================= */

          .footer {
            margin-top: 10px;

            text-align: right;

            font-size: 8px;

            color: #98a2b3;
          }

        </style>

      </head>


      <body>

        <!-- =============================================
             HEADER
        ============================================== -->

        <div class="report-header">

          <div>

            <h1>
              ASTIR — Production Reporting
            </h1>

            <h2>
              Shift Foreman Report
            </h2>

          </div>


          <div class="report-meta">

            <div>
              Printed:
              ${escapeHtml(printedAt)}
            </div>

            <div>
              Records:
              ${reports.length}
            </div>

          </div>

        </div>


        <!-- =============================================
             KPI SUMMARY
        ============================================== -->

        <div class="summary">

          <div class="summary-card">

            <span>
              Total Reports
            </span>

            <strong>
              ${reports.length}
            </strong>

          </div>


          <div class="summary-card">

            <span>
              Open
            </span>

            <strong>
              ${openReports.length}
            </strong>

          </div>


          <div class="summary-card">

            <span>
              Urgent
            </span>

            <strong>
              ${urgentOpen}
            </strong>

          </div>


          <div class="summary-card">

            <span>
              Production Stopped
            </span>

            <strong>
              ${stoppedOpen}
            </strong>

          </div>

        </div>


        <!-- =============================================
             ACTIVE FILTERS
        ============================================== -->

        <div class="filters">

          ${escapeHtml(
            filterSummary
          )}

        </div>


        <!-- =============================================
             FILTERED REPORT TABLE
        ============================================== -->

        <table>

          <thead>

            <tr>
              <th>Report</th>
              <th>Asset</th>
              <th>Issue</th>
              <th>Maintenance Response</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>

          </thead>


          <tbody>

            ${rowsHtml}

          </tbody>

        </table>


        <!-- =============================================
             FOOTER
        ============================================== -->

        <div class="footer">

          ASTIR CMMS · Production Reporting

        </div>


        <script>

          /*
           * Wait until the printable document is loaded,
           * then open the browser print dialog.
           */

          window.onload = function() {

            window.focus();

            window.print();

          };

        <\/script>

      </body>

    </html>
  `);


  /* =====================
     COMPLETE DOCUMENT
  ===================== */

  printWindow.document.close();

}

/* =========================================================
   GET PRODUCTION REPORT ASSET KEY

   Returns the unique value used internally by the
   Production Reporting Asset filter.

   Priority:
   1. asset_id
   2. fallback to Line + Asset Name + Serial

   This prevents Assets with the same visible name
   from being mixed together.
========================================================= */

function getProductionReportAssetKey(
  report
) {

  /* =====================
     USE DATABASE ASSET ID
  ===================== */

  const assetId =
    Number(
      report?.asset_id
    );


  if (
    Number.isInteger(assetId) &&
    assetId > 0
  ) {

    return String(assetId);

  }


  /* =====================
     FALLBACK VALUES
  ===================== */

  const line =
    String(
      report?.line_code ||
      ""
    )
      .trim()
      .toUpperCase();


  const name =
    String(
      report?.asset_name ||
      report?.asset_model ||
      ""
    )
      .trim()
      .toUpperCase();


  const serial =
    String(
      report?.asset_serial ||
      ""
    )
      .trim()
      .toUpperCase();


  /* =====================
     FALLBACK UNIQUE KEY
  ===================== */

  return (
    `${line}||${name}||${serial}`
  );

}

/* =========================================================
   BUILD PRODUCTION REPORT ASSET DROPDOWN

   Builds a multi-select Asset filter using the already
   loaded productionReportsData.

   DISPLAY RULES:
   - Assets are grouped by Line.
   - Line names are hidden.
   - A separator is shown between Lines.
   - Visible Asset text:
       Asset Name | Serial
   - Multiple Assets can be selected.

   IMPORTANT:
   This function only builds the dropdown.
   It does not perform filtering.
========================================================= */

function buildProductionReportsAssetDropdown() {

  /* =====================
     REQUIRED ELEMENTS
  ===================== */

  const menu =
    document.getElementById(
      "productionReportsAssetDropdownMenu"
    );


  const button =
    document.getElementById(
      "productionReportsAssetDropdownBtn"
    );


  if (
    !menu ||
    !button
  ) {

    return;

  }


  /* =====================
     CLEAR EXISTING MENU
  ===================== */

  menu.innerHTML =
    "";


  /* =====================
     COLLECT UNIQUE ASSETS
  ===================== */

  const assetMap =
    new Map();


  const reports =
    Array.isArray(
      productionReportsData
    )
      ? productionReportsData
      : [];


  reports.forEach(report => {

    /* =====================
       UNIQUE ASSET KEY
    ===================== */

    const value =
      getProductionReportAssetKey(
        report
      );


    /* =====================
       ASSET NAME
    ===================== */

    const name =
      String(
        report.asset_name ||
        report.asset_model ||
        ""
      ).trim();


    if (!name) {
      return;
    }


    /* =====================
       AVOID DUPLICATES
    ===================== */

    if (
      assetMap.has(value)
    ) {

      return;

    }


    /* =====================
       STORE ASSET DATA
    ===================== */

    assetMap.set(
      value,
      {

        value,

        name,

        serial:
          String(
            report.asset_serial ||
            ""
          ).trim(),

        line:
          String(
            report.line_code ||
            ""
          ).trim()

      }
    );

  });


  /* =====================
     CONVERT MAP TO ARRAY
  ===================== */

  const assets =
    Array.from(
      assetMap.values()
    );


  /* =====================
     GROUP ASSETS BY LINE
  ===================== */

  const grouped =
    new Map();


  assets.forEach(asset => {

    const line =
      asset.line ||
      "OTHER";


    if (
      !grouped.has(line)
    ) {

      grouped.set(
        line,
        []
      );

    }


    grouped
      .get(line)
      .push(asset);

  });


  /* =====================
     SORT LINES
  ===================== */

  const sortedGroups =
    Array.from(
      grouped.entries()
    )
      .sort(
        ([lineA], [lineB]) =>

          lineA.localeCompare(
            lineB,
            "en",
            {
              numeric: true,
              sensitivity: "base"
            }
          )

      );


  /* =====================================================
     ALL MACHINES OPTION
  ===================================================== */

  const allOption =
    document.createElement(
      "div"
    );


  allOption.className =
    "production-reports-asset-option production-reports-asset-option-all";


  /* =====================
     ALL MACHINES CHECKBOX
  ===================== */

  const allCheckbox =
    document.createElement(
      "input"
    );


  allCheckbox.type =
    "checkbox";


  allCheckbox.checked =
    productionReportsViewState
      .assets
      .length === 0;


  /* =====================
     ALL MACHINES LABEL
  ===================== */

  const allLabel =
    document.createElement(
      "span"
    );


  allLabel.textContent =
    "All Machines";


  allOption.append(
    allCheckbox,
    allLabel
  );


  /* =====================
     ALL MACHINES CLICK

     Clearing the selection means
     all Assets become visible.
  ===================== */

  allOption.addEventListener(
    "click",
    event => {

      event.preventDefault();


      productionReportsViewState
        .assets =
        [];


      buildProductionReportsAssetDropdown();


      refreshProductionReportsView();

    }
  );


  menu.appendChild(
    allOption
  );


  /* =====================================================
     GROUPED ASSET OPTIONS
  ===================================================== */

  sortedGroups.forEach(
    (
      [line, lineAssets],
      groupIndex
    ) => {

      /* =====================
         LINE SEPARATOR

         The Line name itself is hidden.
         Only the visual separator is shown.
      ===================== */

      if (
        groupIndex > 0
      ) {

        const separator =
          document.createElement(
            "div"
          );


        separator.className =
          "production-reports-asset-line-separator";


        menu.appendChild(
          separator
        );

      }


      /* =====================
         SORT ASSETS INSIDE LINE
      ===================== */

      lineAssets.sort(
        (a, b) => {

          const labelA =
            `${a.name} ${a.serial}`;


          const labelB =
            `${b.name} ${b.serial}`;


          return labelA.localeCompare(
            labelB,
            "el",
            {
              numeric: true,
              sensitivity: "base"
            }
          );

        }
      );


      /* =====================
         RENDER EACH ASSET
      ===================== */

      lineAssets.forEach(
        asset => {

          const option =
            document.createElement(
              "div"
            );


          option.className =
            "production-reports-asset-option";


          option.dataset.value =
            asset.value;


          /* =====================
             CHECKBOX
          ===================== */

          const checkbox =
            document.createElement(
              "input"
            );


          checkbox.type =
            "checkbox";


          checkbox.checked =
            productionReportsViewState
              .assets
              .includes(
                asset.value
              );


          /* =====================
             ASSET LABEL
          ===================== */

          const label =
            document.createElement(
              "div"
            );


          label.className =
            "production-reports-asset-option-line";


          /* =====================
             ASSET NAME
          ===================== */

          const name =
            document.createElement(
              "strong"
            );


          name.textContent =
            asset.name ||
            "Unnamed Asset";


          label.appendChild(
            name
          );


          /* =====================
             SERIAL NUMBER
          ===================== */

          if (
            asset.serial
          ) {

            const separator =
              document.createElement(
                "span"
              );


            separator.className =
              "production-reports-asset-option-separator";


            separator.textContent =
              "|";


            const serial =
              document.createElement(
                "span"
              );


            serial.className =
              "production-reports-asset-option-serial";


            serial.textContent =
              asset.serial;


            label.append(
              separator,
              serial
            );

          }


          option.append(
            checkbox,
            label
          );


          /* =====================
             ASSET CLICK

             Toggle the selected Asset.
          ===================== */

          option.addEventListener(
            "click",
            event => {

              event.preventDefault();


              const current =
                new Set(
                  productionReportsViewState
                    .assets
                );


              /* =====================
                 REMOVE IF SELECTED
              ===================== */

              if (
                current.has(
                  asset.value
                )
              ) {

                current.delete(
                  asset.value
                );

              }


              /* =====================
                 ADD IF NOT SELECTED
              ===================== */

              else {

                current.add(
                  asset.value
                );

              }


              /* =====================
                 SAVE NEW SELECTION
              ===================== */

              productionReportsViewState
                .assets =
                Array.from(
                  current
                );


              /* =====================
                 REFRESH DROPDOWN
                 AND TABLE
              ===================== */

              buildProductionReportsAssetDropdown();


              refreshProductionReportsView();

            }
          );


          menu.appendChild(
            option
          );

        }
      );

    }
  );


  /* =====================
     UPDATE BUTTON LABEL
  ===================== */

  updateProductionReportsAssetFilterLabel();

}

/* =========================================================
   UPDATE PRODUCTION REPORT ASSET FILTER LABEL

   Button label rules:

   0 selected:
     All Machines

   1 selected:
     Asset Name

   More than 1:
     Assets: X selected
========================================================= */

function updateProductionReportsAssetFilterLabel() {

  /* =====================
     REQUIRED ELEMENT
  ===================== */

  const label =
    document.getElementById(
      "productionReportsAssetDropdownText"
    );


  if (!label) {
    return;
  }


  /* =====================
     SELECTED ASSETS
  ===================== */

  const selected =
    Array.isArray(
      productionReportsViewState.assets
    )
      ? productionReportsViewState.assets
      : [];


  /* =====================
     NO FILTER
  ===================== */

  if (
    selected.length === 0
  ) {

    label.textContent =
      "All Machines";


    return;

  }


  /* =====================
     MULTIPLE ASSETS
  ===================== */

  if (
    selected.length > 1
  ) {

    label.textContent =
      `Assets: ${selected.length} selected`;


    return;

  }


  /* =====================
     SINGLE ASSET

     Find the visible Asset name
     from the loaded reports.
  ===================== */

  const selectedValue =
    selected[0];


  const report =
    (
      Array.isArray(
        productionReportsData
      )
        ? productionReportsData
        : []
    )
      .find(
        item =>
          getProductionReportAssetKey(
            item
          ) ===
          selectedValue
      );


  /* =====================
     DISPLAY ASSET NAME
  ===================== */

  label.textContent =
    report?.asset_name ||
    report?.asset_model ||
    "1 Machine";

}

/* =========================================================
   SETUP PRODUCTION REPORT ASSET DROPDOWN

   Initializes the open / close behavior of the custom
   multi-select Asset filter.

   IMPORTANT:
   - Safe to call more than once.
   - Event listeners are registered only once.
   - Prevents duplicate listeners from opening and
     immediately closing the dropdown.
========================================================= */

function setupProductionReportsAssetDropdown() {

  /* =====================
     REQUIRED ELEMENTS
  ===================== */

  const button =
    document.getElementById(
      "productionReportsAssetDropdownBtn"
    );


  const menu =
    document.getElementById(
      "productionReportsAssetDropdownMenu"
    );


  const wrapper =
    document.querySelector(
      ".production-reports-asset-filter-wrap"
    );


  if (
    !button ||
    !menu ||
    !wrapper
  ) {

    console.warn(
      "Production Reports Asset dropdown elements not found."
    );

    return;

  }


  /* =====================
     PREVENT DOUBLE INIT

     initProductionReportsFilters() may potentially
     run more than once during the application lifecycle.

     This flag guarantees that the dropdown listeners
     are attached only once.
  ===================== */

  if (
    button.dataset.assetDropdownInitialized ===
    "true"
  ) {

    return;

  }


  button.dataset.assetDropdownInitialized =
    "true";


  /* =====================
     OPEN / CLOSE BUTTON
  ===================== */

  button.addEventListener(
    "click",
    event => {

      event.preventDefault();
      event.stopPropagation();


      /* =====================
         DETECT CURRENT STATE

         Use computed style instead of relying only
         on the inline style value.
      ===================== */

      const isOpen =
        window
          .getComputedStyle(menu)
          .display !== "none";


      /* =====================
         TOGGLE DROPDOWN
      ===================== */

      menu.style.display =
        isOpen
          ? "none"
          : "block";

    }
  );


  /* =====================
     MENU CLICK

     Clicking checkboxes / Assets inside the dropdown
     must not trigger the global outside-click handler.
  ===================== */

  menu.addEventListener(
    "click",
    event => {

      event.stopPropagation();

    }
  );


  /* =====================
     CLICK OUTSIDE

     Close the Asset dropdown when the user clicks
     anywhere outside its wrapper.
  ===================== */

  document.addEventListener(
    "click",
    event => {

      if (
        !wrapper.contains(
          event.target
        )
      ) {

        menu.style.display =
          "none";

      }

    }
  );


  /* =====================
     ESC KEY

     Close the Asset dropdown with Escape.
  ===================== */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Escape"
      ) {

        menu.style.display =
          "none";

      }

    }
  );

}

function closeProductionReportsPrintModal() {

  const overlay =
    document.getElementById(
      "productionReportsPrintOverlay"
    );


  if (overlay) {
    overlay.style.display =
      "none";
  }

}

/* =========================================================
   OPEN MAINTENANCE REPORT DETAIL

   Shared read-only Maintenance Report view.

   Uses the logged user ID stored in:
   TECHNICIAN_ID_STORAGE_KEY

   Accessible by:
   - Shift Foreman
   - Technician
   - Planner
   - Admin
========================================================= */

async function openMaintenanceReportDetail(
  reportId
) {

  /* =====================
     VALIDATE REPORT ID
  ===================== */

  const id =
    Number(
      reportId
    );


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    console.error(
      "Invalid Maintenance Report ID:",
      reportId
    );

    return;

  }


  /* =====================
     LOGGED USER ID
  ===================== */

  const technicianId =
    Number(
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      )
    );


  if (
    !Number.isInteger(
      technicianId
    ) ||
    technicianId <= 0
  ) {

    console.error(
      "Unable to identify logged user."
    );

    return;

  }


  /* =====================
     REQUIRED ELEMENTS
  ===================== */

  const overlay =
    document.getElementById(
      "maintenanceReportDetailOverlay"
    );


  const content =
    document.getElementById(
      "maintenanceReportDetailContent"
    );


  const title =
    document.getElementById(
      "maintenanceReportDetailTitle"
    );


  const subtitle =
    document.getElementById(
      "maintenanceReportDetailSubtitle"
    );


  if (
    !overlay ||
    !content
  ) {

    console.error(
      "Maintenance Report Detail modal elements not found."
    );

    return;

  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display =
    "flex";


  content.innerHTML = `
    <div class="maintenance-report-detail-loading">
      Loading Maintenance Report...
    </div>
  `;


  /* =====================
     LOAD REPORT
  ===================== */

  try {

    const response =
      await fetch(
        `${API}/maintenance-reports/${id}?technician_id=${technicianId}`
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok
    ) {

      throw new Error(
        data?.error ||
        "Failed to load Maintenance Report"
      );

    }


    const report =
      data?.report;


    if (!report) {

      throw new Error(
        "Maintenance Report data is missing"
      );

    }


    /* =====================
      MODAL HEADER

      The MR code is already displayed prominently
      inside the Detail content, so the outer modal
      header keeps a simple descriptive title.
    ===================== */

    if (title) {

      title.textContent =
        "Maintenance Report";

    }


    if (subtitle) {

      subtitle.textContent =
        "Maintenance Report Detail";

    }


    /* =====================
       RENDER REPORT
    ===================== */

    renderMaintenanceReportDetail(
      report
    );


  } catch (err) {

    /* =====================
       LOAD ERROR
    ===================== */

    console.error(
      "LOAD MAINTENANCE REPORT DETAIL ERROR:",
      err
    );


    content.innerHTML = `
      <div class="maintenance-report-detail-error">
        ${
          err?.message ||
          "Could not load Maintenance Report."
        }
      </div>
    `;

  }

}


/* =========================================================
   RENDER MAINTENANCE REPORT DETAIL

   Displays one Maintenance Report in the shared modal.
========================================================= */

function renderMaintenanceReportDetail(
  report
) {

  /* =====================
     TARGET
  ===================== */

  const content =
    document.getElementById(
      "maintenanceReportDetailContent"
    );


  if (!content) {
    return;
  }


  /* =====================
     DATE FORMATTER
  ===================== */

  const formatDateTime =
    value => {

      if (!value) {
        return "—";
      }


      const date =
        new Date(value);


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
          day:
            "2-digit",

          month:
            "2-digit",

          year:
            "numeric",

          hour:
            "2-digit",

          minute:
            "2-digit",

          hour12:
            false
        }
      );

    };


  /* =====================
     STATUS
  ===================== */

  const status =
    String(
      report.status ||
      "—"
    )
      .trim()
      .toUpperCase();


  /* =====================
     PRIORITY
  ===================== */

  const priority =
    String(
      report.priority ||
      "NORMAL"
    )
      .trim()
      .toUpperCase();


  /* =====================
     CATEGORY
  ===================== */

  const category =
    String(
      report.category ||
      "—"
    )
      .replace(
        /_/g,
        " "
      );


  /* =====================
     ASSET LABEL
  ===================== */

  const assetLabel =
    [
      report.line_code,
      report.asset_name,
      report.asset_model,
      report.asset_serial
        ? `SN ${report.asset_serial}`
        : null
    ]
      .filter(Boolean)
      .join(" · ");


  /* =====================
     RESOLUTION
  ===================== */

  let resolutionHtml =
    `<div>—</div>`;


  if (
    report.resolution_type ===
    "BREAKDOWN" &&
    report.breakdown_id
  ) {

    resolutionHtml = `
      <div>
        Converted to Breakdown
      </div>

      <div
        class="maintenance-report-detail-link"
        title="Open Breakdown details"
        onclick="
          event.stopPropagation();
          openBreakdownDetail(${Number(report.breakdown_id)});
        "
      >
        BD-${String(
          report.breakdown_id
        ).padStart(
          5,
          "0"
        )}
      </div>
    `;

  }

  else if (
    report.resolution_type ===
    "PLANNED_TASK" &&
    report.maintenance_task_id
  ) {

    resolutionHtml = `
      <div>
        Converted to Planned Maintenance Task
      </div>

      <div>
        Task #${report.maintenance_task_id}
      </div>
    `;

  }

  else if (
    report.resolution_type ===
    "NO_ACTION"
  ) {

    resolutionHtml = `
      <div>
        Reviewed — no maintenance action required
      </div>
    `;

  }

  else if (
    status ===
    "UNDER_REVIEW"
  ) {

    resolutionHtml = `
      <div>
        Under review by Maintenance
      </div>
    `;

  }

  else if (
    status ===
    "NEW"
  ) {

    resolutionHtml = `
      <div>
        Awaiting Maintenance review
      </div>
    `;

  }


  /* =====================
     MAIN CONTENT
  ===================== */

  content.innerHTML = `

    <!-- =====================
         TOP SUMMARY
    ===================== -->

    <div class="maintenance-report-detail-top">

      <div>

        <div class="maintenance-report-detail-code">
          ${
            report.report_code ||
            `MR-${String(
              report.id
            ).padStart(
              5,
              "0"
            )}`
          }
        </div>

        <div class="maintenance-report-detail-asset">
          ${assetLabel || "—"}
        </div>

      </div>


      <!-- =====================
        STATUS

        Adds the same status-specific class pattern
        used by Production Reporting.
      ===================== -->

      <div
        class="
          maintenance-report-detail-status
          status-${status
            .toLowerCase()
            .replace(/_/g, "-")}
        "
      >
        ${status.replace(
          /_/g,
          " "
        )}
      </div>

    </div>


    <!-- =====================
         DETAIL GRID
    ===================== -->

    <div class="maintenance-report-detail-grid">


      <!-- =====================
           REPORTED
      ===================== -->

      <div class="maintenance-report-detail-section">

        <strong>
          Reported
        </strong>

        <div>
          ${formatDateTime(
            report.reported_at
          )}
        </div>

        <div>
          By ${report.reported_by || "—"}
        </div>

      </div>


      <!-- =====================
           REVIEW
      ===================== -->

      <div class="maintenance-report-detail-section">

        <strong>
          Maintenance Review
        </strong>

        <div>
          ${report.reviewed_by || "—"}
        </div>

        <div>
          ${formatDateTime(
            report.reviewed_at
          )}
        </div>

      </div>


      <!-- =====================
           ISSUE
      ===================== -->

      <div class="maintenance-report-detail-section full-width">

        <strong>
          Issue
        </strong>

        <div>
          ${report.description || "—"}
        </div>


        <!-- =====================
             ISSUE TAGS
        ===================== -->

        <div class="maintenance-report-detail-tags">

          <span class="maintenance-report-detail-tag">
            ${category}
          </span>


          <span
            class="
              maintenance-report-detail-tag
              ${
                priority === "URGENT"
                  ? "urgent"
                  : ""
              }
            "
          >
            ${priority}
          </span>


          ${
            report.production_stopped ===
            true
              ? `
                <span
                  class="
                    maintenance-report-detail-tag
                    stopped
                  "
                >
                  PRODUCTION STOPPED
                </span>
              `
              : ""
          }

        </div>

      </div>


      <!-- =====================
           MAINTENANCE RESPONSE
      ===================== -->

      <div class="maintenance-report-detail-section full-width">

        <strong>
          Maintenance Response
        </strong>

        <div>
          ${
            report.maintenance_comment ||
            "No Maintenance comment."
          }
        </div>

      </div>


      <!-- =====================
           RESOLUTION
      ===================== -->

      <div class="maintenance-report-detail-section full-width">

        <strong>
          Resolution
        </strong>

        ${resolutionHtml}

      </div>

    </div>
  `;

}


/* =========================================================
   CLOSE MAINTENANCE REPORT DETAIL

   Closes the shared MR Detail modal.
========================================================= */

function closeMaintenanceReportDetail() {

  const overlay =
    document.getElementById(
      "maintenanceReportDetailOverlay"
    );


  if (overlay) {

    overlay.style.display =
      "none";

  }

}

/* =========================================================
   PAGE LOAD

   Useful only if a valid Shift Foreman
   session already exists.
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    /* =====================
       SHIFT FOREMAN INIT
    ===================== */

    const role =
      String(
        localStorage.getItem(
          ROLE_STORAGE_KEY
        ) || ""
      )
        .trim()
        .toLowerCase();


    if (
      role ===
      "shift_foreman"
    ) {

      initMaintenanceReporting();

    }

    document
      .getElementById(
        "openMaintenanceReportModalBtn"
      )
      ?.addEventListener(
        "click",
        openMaintenanceReportModal
      );


    document
      .getElementById(
        "closeMaintenanceReportModalBtn"
      )
      ?.addEventListener(
        "click",
        closeMaintenanceReportModal
      );


    document
      .getElementById(
        "cancelMaintenanceReportModalBtn"
      )
      ?.addEventListener(
        "click",
        closeMaintenanceReportModal
      );

      
    /* =====================
       MAINTENANCE REVIEW
       ACTION BUTTONS
    ===================== */

    document
      .getElementById(
        "saveMaintenanceReportCommentBtn"
      )
      ?.addEventListener(
        "click",
        saveMaintenanceReportComment
      );


    document
      .getElementById(
        "closeMaintenanceReportNoActionBtn"
      )
      ?.addEventListener(
        "click",
        closeMaintenanceReportNoAction
      );


    document
      .getElementById(
        "cancelMaintenanceReportReviewBtn"
      )
      ?.addEventListener(
        "click",
        closeMaintenanceReportReview
      );


    /* =====================
       SHOW BREAKDOWN SECTION
    ===================== */

    document
      .getElementById(
        "showBreakdownConversionBtn"
      )
      ?.addEventListener(
        "click",
        showMaintenanceReportBreakdownSection
      );


    /* =====================
       SHOW PLANNED TASK SECTION
    ===================== */

    document
      .getElementById(
        "showPlannedConversionBtn"
      )
      ?.addEventListener(
        "click",
        showMaintenanceReportPlannedSection
      );

      document
        .getElementById(
          "maintenanceReportPlannedSection"
        )
        ?.addEventListener(
          "change",
          event => {

            const section =
              String(
                event.target.value ||
                ""
              ).trim();


            const report =
              currentMaintenanceReportReview;


            if (
              !report ||
              !report.asset_id
            ) {
              return;
            }


            if (!section) {

              const unitSelect =
                document.getElementById(
                  "maintenanceReportPlannedUnit"
                );

              const unitInput =
                document.getElementById(
                  "maintenanceReportPlannedUnitInput"
                );


              if (unitSelect) {

                unitSelect.style.display =
                  "none";

              }


              if (unitInput) {

                unitInput.style.display =
                  "none";

              }


              return;

            }


            populateMaintenanceReportPlannedUnits(
              report.asset_id,
              section
            );

          }
        );

        document
          .getElementById(
            "maintenanceReportPlannedUnit"
          )
          ?.addEventListener(
            "change",
            event => {

              const unitInput =
                document.getElementById(
                  "maintenanceReportPlannedUnitInput"
                );


              if (!unitInput) {
                return;
              }


              if (
                event.target.value ===
                "__new__"
              ) {

                event.target.style.display =
                  "none";


                unitInput.style.display =
                  "block";


                unitInput.value =
                  "";


                unitInput.focus();

              }

            }
          );


    /* =====================
       CREATE BREAKDOWN
    ===================== */

    document
      .getElementById(
        "createBreakdownFromReportBtn"
      )
      ?.addEventListener(
        "click",
        createBreakdownFromMaintenanceReport
      );


    /* =====================
       CREATE PLANNED TASK
    ===================== */

    document
      .getElementById(
        "createPlannedTaskFromReportBtn"
      )
      ?.addEventListener(
        "click",
        createPlannedTaskFromMaintenanceReport
      );

    /* =========================================================
   INITIALIZE PRODUCTION REPORT ASSET FILTER

    Run once when the Production Reporting UI is initialized.
  ========================================================= */

  setupProductionReportsAssetDropdown();

  }
);


/* =========================================================
   START REVIEW
   Delegated because Queue rows are rendered dynamically.
========================================================= */

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".maintenance-report-start-review-btn"
      );


    if (!button) {
      return;
    }


    const reportId =
      Number(
        button.dataset.reportId
      );


    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {
      return;
    }


    startMaintenanceReportReview(
      reportId
    );

  }
);

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".maintenance-report-open-review-btn"
      );


    if (!button) {
      return;
    }


    const reportId =
      Number(
        button.dataset.reportId
      );


    if (
      !Number.isInteger(reportId)
    ) {
      return;
    }


    const report =
      window.currentMaintenanceReportsQueue
        ?.find(
          item =>
            Number(item.id) ===
            reportId
        );


    if (!report) {

      console.error(
        "Maintenance Report not found in queue:",
        reportId
      );

      return;
    }


    openMaintenanceReportReview(
      report
    );

  }
);