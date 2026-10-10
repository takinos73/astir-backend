/* =========================================================
   MAINTENANCE REPORTS
   Production → Maintenance reporting layer
========================================================= */


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
    ===================== */

    sortedGroups.forEach(
      ([lineLabel, lineAssets]) => {

        const optgroup =
          document.createElement(
            "optgroup"
          );


        optgroup.label =
          lineLabel;


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


            optgroup.appendChild(
              option
            );

          });


        select.appendChild(
          optgroup
        );

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
              reporterName

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


    renderProductionReports(
      reports
    );


    if (count) {

      count.textContent =
        `${reports.length} Report${reports.length === 1 ? "" : "s"}`;

    }


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
========================================================= */

function renderProductionReports(
  reports
) {

  const container =
    document.getElementById(
      "productionReportsList"
    );


  if (!container) {
    return;
  }


  container.replaceChildren();


  if (
    !Array.isArray(reports) ||
    reports.length === 0
  ) {

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


  reports.forEach(report => {

    const card =
      document.createElement(
        "div"
      );


    card.className =
      "production-report-card";


    /* =====================
       URGENT
    ===================== */

    if (
      String(
        report.priority || ""
      ).toUpperCase() ===
      "URGENT"
    ) {

      card.classList.add(
        "is-urgent"
      );

    }


    /* =====================
       PRODUCTION STOPPED
    ===================== */

    if (
      report.production_stopped ===
      true
    ) {

      card.classList.add(
        "production-stopped"
      );

    }


    /* =====================
       TOP ROW
    ===================== */

    const top =
      document.createElement(
        "div"
      );


    top.className =
      "production-report-top";


    const identity =
      document.createElement(
        "div"
      );


    identity.className =
      "production-report-identity";


    const code =
      document.createElement(
        "span"
      );


    code.className =
      "production-report-code";


    code.textContent =
      report.report_code ||
      `MR-${String(
        report.id
      ).padStart(5, "0")}`;


    const asset =
      document.createElement(
        "span"
      );


    asset.className =
      "production-report-asset";


    asset.textContent =
      report.asset_name ||
      report.asset_model ||
      "Unknown Asset";


    identity.append(
      code,
      asset
    );


    /* =====================
       STATUS
    ===================== */

    const status =
      document.createElement(
        "span"
      );


    const statusValue =
      String(
        report.status ||
        "NEW"
      )
        .trim()
        .toUpperCase();


    status.className =
      "production-report-status";


    status.classList.add(
      `status-${statusValue
        .toLowerCase()
        .replace(/_/g, "-")}`
    );


    status.textContent =
      statusValue.replace(
        /_/g,
        " "
      );


    top.append(
      identity,
      status
    );


    /* =====================
       BADGES
    ===================== */

    const badges =
      document.createElement(
        "div"
      );


    badges.className =
      "production-report-badges";


    if (report.category) {

      const category =
        document.createElement(
          "span"
        );


      category.className =
        "production-report-badge";


      category.textContent =
        String(
          report.category
        ).replace(
          /_/g,
          " "
        );


      badges.appendChild(
        category
      );

    }


    if (
      String(
        report.priority || ""
      ).toUpperCase() ===
      "URGENT"
    ) {

      const urgent =
        document.createElement(
          "span"
        );


      urgent.className =
        "production-report-badge urgent";


      urgent.textContent =
        "URGENT";


      badges.appendChild(
        urgent
      );

    }


    if (
      report.production_stopped ===
      true
    ) {

      const stopped =
        document.createElement(
          "span"
        );


      stopped.className =
        "production-report-badge stopped";


      stopped.textContent =
        "PRODUCTION STOPPED";


      badges.appendChild(
        stopped
      );

    }


    /* =====================
       DESCRIPTION
    ===================== */

    const description =
      document.createElement(
        "div"
      );


    description.className =
      "production-report-description";


    description.textContent =
      report.description ||
      "—";


    /* =====================
       META
    ===================== */

    const meta =
      document.createElement(
        "div"
      );


    meta.className =
      "production-report-meta";


    const reportedBy =
      document.createElement(
        "span"
      );


    reportedBy.textContent =
      `Reported by ${report.reported_by || "—"}`;


    const separator =
      document.createElement(
        "span"
      );


    separator.textContent =
      "•";


    const reportedAt =
      document.createElement(
        "span"
      );


    const date =
      report.reported_at
        ? new Date(
            report.reported_at
          )
        : null;


    reportedAt.textContent =
      date &&
      !Number.isNaN(
        date.getTime()
      )
        ? date.toLocaleString(
            "el-GR"
          )
        : "—";


    meta.append(
      reportedBy,
      separator,
      reportedAt
    );


    /* =====================
       MAINTENANCE FEEDBACK
       Later becomes useful after review
    ===================== */

    card.append(
      top,
      badges,
      description,
      meta
    );


    container.appendChild(
      card
    );

  });

}

/* =====================
   INIT REPORTING
===================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadReportingAssets();
    
    loadProductionReports();

    const submitBtn =
      document.getElementById(
        "submitMaintenanceReportBtn"
      );


    if (submitBtn) {

      submitBtn.addEventListener(
        "click",
        submitMaintenanceReport
      );

    }

  }
);