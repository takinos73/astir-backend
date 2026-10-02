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


  /* =====================
     INIT
  ===================== */

  updateScopeLabel();


  /* =====================
     TEMPORARY GLOBAL ACCESS
     Useful during development
  ===================== */

  window.managementDashboardState =
    managementState;

})();