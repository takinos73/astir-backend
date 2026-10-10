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
    "Status",
    "Updated"
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


    code.className =
      "report-table-code";


    code.textContent =
      report.report_code ||
      `MR-${String(
        report.id
      ).padStart(5, "0")}`;


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