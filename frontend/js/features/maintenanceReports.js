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


    assets.forEach(asset => {

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


      const line =
        String(
          asset.line_code ||
          asset.line_name ||
          ""
        ).trim();


      option.textContent =
        [
          line,
          assetName,
          serial
            ? `| ${serial}`
            : ""
        ]
          .filter(Boolean)
          .join(" ");


      select.appendChild(
        option
      );

    });


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


/* =====================
   INIT REPORTING
===================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadReportingAssets();


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