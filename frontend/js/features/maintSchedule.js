/* =========================================================
   SCHEDULED MAINTENANCE — CURRENT DETAIL

   Keeps the currently loaded SM separate from
   currentBreakdown and currentBreakdownId.
========================================================= */

let currentScheduledMaintenance = null;

/* =========================================================
   SCHEDULED MAINTENANCE DETAIL — READ ONLY

   Displays one SM incident and its linked Planned Tasks.

   IMPORTANT:
   - Independent from currentBreakdownId and BD Detail.
   - Uses only GET /scheduled-maintenance/:id
     and GET /scheduled-maintenance/:id/tasks.
   - Does NOT create, edit or complete Tasks.
   - Does NOT change SM status or dates.
========================================================= */

async function openScheduledMaintenanceDetail(smId) {

  const id = Number(smId);

  if (!Number.isInteger(id) || id <= 0) {
    return;
  }


  // Clear the previously selected SM before loading another.
  currentScheduledMaintenance = null;


  const addTaskBtn =
    document.getElementById("addSmTaskBtn");


  if (addTaskBtn) {
    addTaskBtn.disabled = true;
  }


  const overlay =
    document.getElementById(
      "scheduledMaintenanceDetailOverlay"
    );


  const taskContainer =
    document.getElementById(
      "sm-maintenance-tasks"
    );


  if (!overlay || !taskContainer) {

    console.error(
      "SM Detail HTML not found"
    );

    return;
  }


  /* =====================
     CLOSE MODAL
  ===================== */

  const closeModal = () => {

    overlay.style.display =
      "none";

  };


  const closeBtn =
    document.getElementById(
      "closeScheduledMaintenanceDetailBtn"
    );


  if (closeBtn) {

    closeBtn.onclick =
      closeModal;

  }


  overlay.onclick = event => {

    if (event.target === overlay) {

      closeModal();

    }

  };


  /* =====================
     HELPERS
  ===================== */

  const setText = (
    elementId,
    value
  ) => {

    const element =
      document.getElementById(
        elementId
      );


    if (element) {

      element.textContent =
        value ?? "—";

    }

  };


  const formatDate =
    value => {

      if (!value) {
        return "—";
      }


      const date =
        new Date(value);


      return Number.isNaN(
        date.getTime()
      )
        ? "—"
        : date.toLocaleString(
            "el-GR"
          );

    };


  /* =====================
     OPEN / LOADING
  ===================== */

  overlay.style.display =
    "flex";


  taskContainer.textContent =
    "Loading maintenance tasks...";


  try {

    /* =====================
       LOAD SM + LINKED TASKS
    ===================== */

    const [
      smResponse,
      tasksResponse
    ] =
      await Promise.all([

        fetch(
          `/scheduled-maintenance/${id}`
        ),

        fetch(
          `/scheduled-maintenance/${id}/tasks`
        )

      ]);


    if (
      !smResponse.ok ||
      !tasksResponse.ok
    ) {

      throw new Error(
        "Failed to load Scheduled Maintenance detail"
      );

    }


    const smResult =
      await smResponse.json();


    const tasksResult =
      await tasksResponse.json();


    const sm =
      smResult.scheduled_maintenance;


    if (!sm) {

      throw new Error(
        "Scheduled Maintenance not found"
      );

    }


    // Keep the loaded SM for its own Task modal.
    currentScheduledMaintenance =
      sm;


    /* =====================
       CREATE / REFRESH
       SM ACTION BAR
    ===================== */

    ensureSmActionBar();


    /* =====================
       REFRESH SM ACTIONS
    ===================== */

    refreshSmStartButton();

    refreshSmCloseButton();


    /* =====================
       ADD TASK VISIBILITY
    ===================== */

    if (addTaskBtn) {

      const isClosed =
        String(
          sm.status || ""
        ).toUpperCase() ===
        "CLOSED";


      addTaskBtn.style.display =
        isClosed
          ? "none"
          : "";


      addTaskBtn.disabled =
        isClosed;

    }


    /* =====================
       ADD COMPLETED TASK
       IN_PROGRESS ONLY
    ===================== */

    const completedTaskBtn =
      document.getElementById(
        "addCompletedSmTaskBtn"
      );


    if (completedTaskBtn) {

      const isInProgress =
        String(
          sm.status || ""
        ).toUpperCase() ===
        "IN_PROGRESS";


      completedTaskBtn.style.display =
        isInProgress
          ? ""
          : "none";


      completedTaskBtn.disabled =
        !isInProgress;

    }


    /* =====================
       RENDER SM DETAILS
    ===================== */

    setText(
      "sm-detail-code",
      `SM-${String(
        sm.id
      ).padStart(5, "0")}`
    );


    setText(
      "sm-detail-status",
      sm.status
    );


    setText(
      "sm-detail-asset",
      `${sm.line_name || "—"} · ` +
      `${sm.asset_model || "—"} · ` +
      `SN ${sm.asset_serial || "—"}`
    );


    setText(
      "sm-detail-title",
      sm.title || "—"
    );


    setText(
      "sm-detail-description",
      sm.description || "—"
    );


    setText(
      "sm-detail-scheduled-start",
      formatDate(
        sm.scheduled_start_at
      )
    );


    setText(
      "sm-detail-scheduled-end",
      formatDate(
        sm.scheduled_end_at
      )
    );


    setText(
      "sm-detail-actual-start",
      formatDate(
        sm.actual_started_at
      )
    );


    setText(
      "sm-detail-actual-closed",
      formatDate(
        sm.actual_closed_at
      )
    );


    /* =====================
       LINKED TASKS
    ===================== */

    const tasks =
      Array.isArray(
        tasksResult.tasks
      )
        ? tasksResult.tasks
        : [];


    taskContainer.replaceChildren();


    if (tasks.length === 0) {

      taskContainer.textContent =
        "No maintenance tasks yet.";

      return;

    }


    /* =====================
       SM STATUS
    ===================== */

    const smStatus =
      String(
        sm.status || ""
      )
        .trim()
        .toUpperCase();


    const smIsInProgress =
      smStatus ===
      "IN_PROGRESS";


    /* =====================
       RENDER TASK CARDS
    ===================== */

    tasks.forEach(task => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "restoration-task-item";


      /* =====================
         TASK TITLE
      ===================== */

      const title =
        document.createElement(
          "div"
        );


      title.className =
        "restoration-task-title";


      title.textContent =
        task.task || "—";


      /* =====================
         TASK STATUS
      ===================== */

      const status =
        String(
          task.status || ""
        )
          .trim()
          .toUpperCase();


      const isOpen =
        status === "PLANNED" ||
        status === "OVERDUE";


      const isDone =
        status === "DONE";


      /* =====================
         TASK META
      ===================== */

      const meta =
        document.createElement(
          "div"
        );


      meta.className =
        "task-meta";


      let durationText =
        "";


      if (isDone) {

        const actualDuration =
          task.actual_duration_min;


        durationText =
          actualDuration == null
            ? "Duration —"
            : `Duration ${actualDuration} min`;

      } else {

        const estimatedDuration =
          task.duration_min;


        durationText =
          estimatedDuration == null
            ? "Est. —"
            : `Est. ${estimatedDuration} min`;

      }


      meta.textContent =
        `Task #${task.id} · ` +
        `${task.status || "—"} · ` +
        durationText;


      /* =====================
         DUE DATE
      ===================== */

      const due =
        document.createElement(
          "div"
        );


      due.style.marginTop =
        "4px";


      due.style.fontSize =
        "12px";


      due.style.color =
        "#9ca3af";


      due.textContent =
        task.due_date
          ? `Due: ${formatDate(
              task.due_date
            )}`
          : "Due: —";


      /* =====================
         APPEND TASK INFO
      ===================== */

      card.append(
        title,
        meta,
        due
      );


      /* =====================
         ACTIONS CONTAINER
      ===================== */

      const actions =
        document.createElement(
          "div"
        );


      actions.style.display =
        "flex";


      actions.style.alignItems =
        "center";


      actions.style.gap =
        "8px";


      actions.style.marginTop =
        "10px";


      /* =====================
         OPEN TASK
         COMPLETE
      ===================== */

      if (isOpen) {

        const completeBtn =
          document.createElement(
            "button"
          );


        completeBtn.type =
          "button";


        completeBtn.className =
          "btn-table sm-task-complete-btn";


        completeBtn.textContent =
          "Complete";


        completeBtn.addEventListener(
          "click",
          () => {

            /*
              Use normal CMMS
              completion flow.
            */

            if (
              typeof askTechnician !==
              "function"
            ) {

              console.error(
                "SM TASK: Standard completion modal unavailable"
              );

              return;
            }


            askTechnician(
              task.id
            );

          }
        );


        actions.appendChild(
          completeBtn
        );

      }


      /* =====================
         DONE TASK
      ===================== */

      if (isDone) {

        const doneLabel =
          document.createElement(
            "div"
          );


        doneLabel.className =
          "restoration-task-done";


        doneLabel.textContent =
          "✓ Done";


        actions.appendChild(
          doneLabel
        );

      }


      /* =====================
         DELETE

         Available ONLY while
         SM is IN_PROGRESS.
      ===================== */

      if (smIsInProgress) {

        const deleteBtn =
          document.createElement(
            "button"
          );


        deleteBtn.type =
          "button";


        deleteBtn.className =
          "btn-table sm-task-delete-btn";


        deleteBtn.textContent =
          "Delete";


        deleteBtn.dataset.smId =
          String(sm.id);


        deleteBtn.dataset.taskId =
          String(task.id);


        deleteBtn.addEventListener(
          "click",
          () => {

            if (
              typeof deleteScheduledMaintenanceTask !==
              "function"
            ) {

              console.error(
                "SM TASK: Delete function is not connected yet"
              );

              return;
            }


            deleteScheduledMaintenanceTask(
              sm.id,
              task
            );

          }
        );


        actions.appendChild(
          deleteBtn
        );

      }


      /* =====================
         APPEND ACTIONS
      ===================== */

      if (
        actions.children.length >
        0
      ) {

        card.appendChild(
          actions
        );

      }


      taskContainer.appendChild(
        card
      );

    });


  } catch (err) {

    console.error(
      "LOAD SM DETAIL ERROR:",
      err
    );


    taskContainer.textContent =
      "Could not load Scheduled Maintenance detail.";

  }

}

/* =========================================================
   SCHEDULED MAINTENANCE — ADD TASK MODAL

   OPEN / CLOSE ONLY.

   - Uses the selected Scheduled Maintenance incident.
   - Does NOT use currentBreakdownId.
   - Does NOT create or modify Tasks.
   - Save will be connected in a separate step.
========================================================= */

function openSmTaskModal() {

  const sm = currentScheduledMaintenance;

  if (!sm || !Number.isInteger(Number(sm.id))) {
    console.error("ADD SM TASK: No SM incident selected");
    return;
  }

  if (
    String(sm.status || "").toUpperCase() === "CLOSED"
  ) {
    alert("This Scheduled Maintenance is closed.");
    return;
  }

  const overlay =
    document.getElementById("smTaskOverlay");

  if (!overlay) {
    console.error("SM Task modal HTML not found");
    return;
  }

  /* =====================
     RESET FIELDS
  ===================== */

  [
    "sm-task",
    "sm-section",
    "sm-section-input",
    "sm-unit",
    "sm-unit-input",
    "sm-due-date",
    "sm-duration",
    "sm-notes"
  ].forEach(elementId => {

    const element =
      document.getElementById(elementId);

    if (element) {
      element.value = "";
    }

  });


  /* =====================
     SHOW SELECTED SM
  ===================== */

  const reference =
    document.getElementById("smTaskIncidentRef");

  if (reference) {
    reference.textContent =
      `SM-${String(sm.id).padStart(5, "0")}`;
  }


  /* =====================
     LOAD SECTION / UNIT

     Read-only options from the selected SM Asset.
  ===================== */

  populateSmTaskSections(sm.asset_id);


  /* =====================
     OPEN MODAL
  ===================== */

  overlay.style.display = "flex";

  document.getElementById("sm-task")?.focus();

}

function closeSmTaskModal() {

  const overlay =
    document.getElementById("smTaskOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }

}

/* =========================================================
   SCHEDULED MAINTENANCE — ACTION BAR

   Creates a common action area for:
   - Add Task
   - Add Completed Task
   - Close Maintenance
========================================================= */

function ensureSmActionBar() {

  const addTaskBtn =
    document.getElementById("addSmTaskBtn");

  if (!addTaskBtn) return null;


  let actionBar =
    document.getElementById("smActionBar");


  if (!actionBar) {

    actionBar =
      document.createElement("div");

    actionBar.id =
      "smActionBar";

    actionBar.style.display =
      "flex";

    actionBar.style.flexWrap =
      "wrap";

    actionBar.style.alignItems =
      "center";

    actionBar.style.gap =
      "10px";

    actionBar.style.marginTop =
      "14px";

    actionBar.style.marginBottom =
      "18px";


    addTaskBtn.parentNode.insertBefore(
      actionBar,
      addTaskBtn
    );


    actionBar.appendChild(
      addTaskBtn
    );

  }


  /* =====================
     ADD COMPLETED TASK
  ===================== */

  let completedTaskBtn =
    document.getElementById(
      "addCompletedSmTaskBtn"
    );


  if (!completedTaskBtn) {

    completedTaskBtn =
      document.createElement("button");

    completedTaskBtn.id =
      "addCompletedSmTaskBtn";

    completedTaskBtn.type =
      "button";

    completedTaskBtn.className =
      "btn-table";

    completedTaskBtn.textContent =
      "+ Add Completed Task";


    actionBar.appendChild(
      completedTaskBtn
    );

  }


  /* =====================
     CLOSE MAINTENANCE
  ===================== */

  let closeBtn =
    document.getElementById(
      "closeSmBtn"
    );


  if (!closeBtn) {

    closeBtn =
      document.createElement("button");

    closeBtn.id =
      "closeSmBtn";

    closeBtn.type =
      "button";

    closeBtn.className =
      "btn-table";

    closeBtn.textContent =
      "✓ Close Maintenance";


    actionBar.appendChild(
      closeBtn
    );

  }


  return actionBar;
}

/* =====================
   SM TASK MODAL BUTTONS

   Event delegation allows the buttons to work
   independently of script loading order.
===================== */

document.addEventListener("click", event => {

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("#addSmTaskBtn")) {
    openSmTaskModal();
    return;
  }

  if (
    target.closest("#closeSmTaskBtn") ||
    target.closest("#cancelSmTaskBtn")
  ) {
    closeSmTaskModal();
    return;
  }

  if (
    target.id === "smTaskOverlay"
  ) {
    closeSmTaskModal();
  }

});

/* =========================================================
   SCHEDULED MAINTENANCE — SECTION / UNIT

   Read-only options from existing CMMS Tasks.

   - Uses the selected SM Asset.
   - Supports existing or new Section / Unit.
   - Does NOT create or modify Tasks.
   - Independent from BD Section / Unit controls.
========================================================= */

function populateSmTaskSections(assetId) {

  const sectionSelect =
    document.getElementById("sm-section");

  const sectionInput =
    document.getElementById("sm-section-input");

  if (!sectionSelect || !sectionInput) return;

  const assetTasks =
    (Array.isArray(state.tasksData) ? state.tasksData : [])
      .filter(t =>
        Number(t.asset_id) === Number(assetId) &&
        t.deleted_at == null
      );

  const sections = [
    ...new Set(
      assetTasks
        .map(t => String(t.section || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, "el", { numeric: true })
  );

  sectionSelect.replaceChildren(
    new Option("Select section", "")
  );

  sections.forEach(section => {
    sectionSelect.add(new Option(section, section));
  });

  if (sections.length > 0) {

    sectionSelect.add(
      new Option("➕ New section", "__new__")
    );

    sectionSelect.style.display = "";
    sectionInput.style.display = "none";

  } else {

    sectionSelect.style.display = "none";
    sectionInput.style.display = "";
  }

  sectionInput.value = "";

  updateSmTaskUnits();

}


/* =====================
   UPDATE UNIT OPTIONS

   Uses the selected Section of the SM Asset.
===================== */

function updateSmTaskUnits() {

  const sectionSelect =
    document.getElementById("sm-section");

  const sectionInput =
    document.getElementById("sm-section-input");

  const unitSelect =
    document.getElementById("sm-unit");

  const unitInput =
    document.getElementById("sm-unit-input");

  if (
    !sectionSelect ||
    !sectionInput ||
    !unitSelect ||
    !unitInput
  ) return;

  unitSelect.replaceChildren(
    new Option("Select unit", "")
  );

  unitSelect.style.display = "none";
  unitInput.style.display = "none";
  unitInput.value = "";

  const manualSection =
    sectionSelect.style.display === "none" ||
    sectionSelect.value === "__new__";

  if (manualSection) {
    unitInput.style.display = "";
    return;
  }

  const section = sectionSelect.value;

  if (!section) return;

  const assetId =
    currentScheduledMaintenance?.asset_id;

  const units = [
    ...new Set(
      (Array.isArray(state.tasksData) ? state.tasksData : [])
        .filter(t =>
          Number(t.asset_id) === Number(assetId) &&
          t.deleted_at == null &&
          String(t.section || "").trim() === section
        )
        .map(t => String(t.unit || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, "el", { numeric: true })
  );

  if (units.length === 0) {
    unitInput.style.display = "";
    return;
  }

  units.forEach(unit => {
    unitSelect.add(new Option(unit, unit));
  });

  unitSelect.add(
    new Option("➕ New unit", "__new__")
  );

  unitSelect.style.display = "";

}


/* =====================
   SM SECTION / UNIT CHANGES

   Event delegation; listeners are registered once.
===================== */

document.addEventListener("change", event => {

  if (event.target?.id === "sm-section") {

    const sectionInput =
      document.getElementById("sm-section-input");

    if (sectionInput) {

      sectionInput.value = "";

      sectionInput.style.display =
        event.target.value === "__new__"
          ? ""
          : "none";
    }

    updateSmTaskUnits();
  }

  if (event.target?.id === "sm-unit") {

    const unitInput =
      document.getElementById("sm-unit-input");

    if (unitInput) {

      unitInput.value = "";

      unitInput.style.display =
        event.target.value === "__new__"
          ? ""
          : "none";
    }
  }

});

/* =========================================================
   SCHEDULED MAINTENANCE — CREATE TASK

   Creates one Planned Task in the selected SM.

   - Uses the existing SM Task form.
   - Uses POST /scheduled-maintenance/:id/tasks.
   - Does NOT use Breakdown routes.
   - Does NOT create a task execution.
   - Refreshes SM Detail and the main Tasks list.
========================================================= */

async function createSmTask() {

  const sm = currentScheduledMaintenance;

  const saveBtn =
    document.getElementById("saveSmTaskBtn");

  const taskInput =
    document.getElementById("sm-task");

  const sectionSelect =
    document.getElementById("sm-section");

  const sectionInput =
    document.getElementById("sm-section-input");

  const unitSelect =
    document.getElementById("sm-unit");

  const unitInput =
    document.getElementById("sm-unit-input");

  const dueDateInput =
    document.getElementById("sm-due-date");

  const durationInput =
    document.getElementById("sm-duration");

  const notesInput =
    document.getElementById("sm-notes");


  /* =====================
     VALIDATE SELECTED SM
  ===================== */

  const smId = Number(sm?.id);

  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {
    alert("No Scheduled Maintenance selected.");
    return;
  }

  if (
    String(sm.status || "").toUpperCase() === "CLOSED"
  ) {
    alert("This Scheduled Maintenance is closed.");
    return;
  }


  /* =====================
     READ TASK
  ===================== */

  const task =
    String(taskInput?.value || "").trim();

  if (!task) {
    alert("Please enter the Maintenance Task.");
    taskInput?.focus();
    return;
  }


  /* =====================
     READ SECTION / UNIT

     Existing dropdown or manual input.
  ===================== */

  const section =
    sectionSelect?.style.display !== "none" &&
    sectionSelect?.value !== "__new__"

      ? String(sectionSelect?.value || "").trim()

      : String(sectionInput?.value || "").trim();


  const unit =
    unitSelect?.style.display !== "none" &&
    unitSelect?.value !== "__new__"

      ? String(unitSelect?.value || "").trim()

      : String(unitInput?.value || "").trim();


  if (
    sectionSelect?.value === "__new__" &&
    !section
  ) {
    alert("Please enter the new Section.");
    sectionInput?.focus();
    return;
  }

  if (
    unitSelect?.value === "__new__" &&
    !unit
  ) {
    alert("Please enter the new Unit.");
    unitInput?.focus();
    return;
  }


  /* =====================
     DUE DATE
  ===================== */

  let dueDate = null;

  if (dueDateInput?.value) {

    const parsedDueDate =
      new Date(dueDateInput.value);

    if (
      Number.isNaN(parsedDueDate.getTime())
    ) {
      alert("Invalid Due Date.");
      dueDateInput.focus();
      return;
    }

    dueDate =
      parsedDueDate.toISOString();
  }


  /* =====================
     ESTIMATED DURATION
  ===================== */

  let durationMin = null;

  if (durationInput?.value !== "") {

    durationMin =
      Number(durationInput.value);

    if (
      !Number.isFinite(durationMin) ||
      durationMin < 0
    ) {
      alert("Invalid Estimated Duration.");
      durationInput.focus();
      return;
    }
  }


  /* =====================
     PAYLOAD
  ===================== */

  const payload = {

    task,

    section: section || null,

    unit: unit || null,

    due_date: dueDate,

    duration_min: durationMin,

    notes:
      String(notesInput?.value || "").trim() || null

  };


  /* =====================
     CREATE TASK
  ===================== */

  if (saveBtn?.disabled) return;

  let taskCreated = false;

  try {

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Adding...";
    }

    const response = await fetch(
      `/scheduled-maintenance/${smId}/tasks`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result?.error ||
        "Failed to create Maintenance Task"
      );
    }

    taskCreated = true;

    closeSmTaskModal();

    /* =====================
       REFRESH

       Task was created successfully.
       Refresh failures must NOT trigger
       another task creation.
    ===================== */

    await openScheduledMaintenanceDetail(smId);

    await loadTasks();

  } catch (err) {

    console.error(
      "CREATE SM TASK ERROR:",
      err
    );

    alert(
      taskCreated
        ? "Task created, but refresh failed. Please reload the page. Do not save it again."
        : err.message || "Could not create Maintenance Task."
    );

  } finally {

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Add Task";
    }
  }

}


/* =====================
   SM TASK SAVE BUTTON
===================== */

document.addEventListener("click", event => {

  if (
    event.target instanceof Element &&
    event.target.closest("#saveSmTaskBtn")
  ) {
    createSmTask();
  }

});

/* =========================================================
   NEW MAINTENANCE INCIDENT — TYPE SELECTOR

   Common entry point for BD and SM.

   - Breakdown opens the EXISTING BD creation modal.
   - Scheduled Maintenance opens its independent SM form.
   - Does NOT create or modify any incident or task.
   - Does NOT modify existing BD modal functions.
========================================================= */

window.openNewIncidentChooser = function () {

  let overlay =
    document.getElementById("newIncidentChooserOverlay");


  /* =====================
     CREATE SELECTOR ONCE
  ===================== */

  if (!overlay) {

    overlay = document.createElement("div");

    overlay.id = "newIncidentChooserOverlay";
    overlay.className = "modal-overlay";

    overlay.style.zIndex = "1200";

    overlay.innerHTML = `
      <div
        class="modal"
        style="
          box-sizing: border-box;
          width: min(440px, calc(100vw - 32px));
          padding: 20px 24px;
          background: #181b22;
          color: #f5f7fa;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 14px;
        "
      >

        <div
          class="modal-header"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >

          <h2 style="margin: 0;">
            New Maintenance Incident
          </h2>

          <button
            id="closeNewIncidentChooserBtn"
            class="modal-close"
            type="button"
            aria-label="Close"
          >
            ×
          </button>

        </div>

        <p class="section-subtitle">
          Select incident type
        </p>

        <div
          class="modal-actions"
          style="
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 10px;
          "
        >

          <button
            id="chooseNewBreakdownBtn"
            class="btn-table"
            type="button"
          >
            + Breakdown
          </button>

          <button
            id="chooseNewSmBtn"
            class="btn-table"
            type="button"
          >
            + Scheduled Maintenance
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);


    /* =====================
       CLOSE SELECTOR
    ===================== */

    const closeChooser = () => {
      overlay.style.display = "none";
    };


    overlay
      .querySelector("#closeNewIncidentChooserBtn")
      ?.addEventListener("click", closeChooser);


    overlay.addEventListener("click", event => {

      if (event.target === overlay) {
        closeChooser();
      }

    });


    /* =====================
       BREAKDOWN — EXISTING FLOW
    ===================== */

    overlay
      .querySelector("#chooseNewBreakdownBtn")
      ?.addEventListener("click", () => {

        closeChooser();

        openNewBreakdownModal();

      });


    /* =====================
       SCHEDULED MAINTENANCE
       Independent creation form
    ===================== */

    overlay
      .querySelector("#chooseNewSmBtn")
      ?.addEventListener("click", () => {

        if (
          typeof openNewScheduledMaintenanceModal !== "function"
        ) {
          console.error(
            "New Scheduled Maintenance modal is not available."
          );
          return;
        }

        closeChooser();

        openNewScheduledMaintenanceModal();

      });

  }


  /* =====================
     SHOW SELECTOR
  ===================== */

  overlay.style.display = "flex";

};

/* =========================================================
   NEW SCHEDULED MAINTENANCE — CREATION FORM

   Independent from New Breakdown.

   Current step:
   - Open / close the SM form.
   - Collect SM incident fields.
   - No POST request or database changes yet.

   Asset selection and Save will be connected next.
========================================================= */

async function openNewScheduledMaintenanceModal() {

  let overlay =
    document.getElementById("newScheduledMaintenanceOverlay");


  /* =====================
     CREATE MODAL ONCE
  ===================== */

  if (!overlay) {

    overlay = document.createElement("div");

    overlay.id = "newScheduledMaintenanceOverlay";
    overlay.className = "modal-overlay";

    overlay.style.display = "none";
    overlay.style.zIndex = "1250";

    overlay.innerHTML = `
      <div
        id="newScheduledMaintenanceModal"
        class="modal"
        style="
          box-sizing: border-box;
          width: min(650px, calc(100vw - 32px));
          padding: 24px;
          background: #181b22;
          color: #f5f7fa;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 14px;
        "
      >

        <div
          class="modal-header"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
          "
        >

          <h2 style="margin: 0;">
            New Scheduled Maintenance
          </h2>

          <button
            id="closeNewSmBtn"
            class="modal-close"
            type="button"
            aria-label="Close"
          >
            ×
          </button>

        </div>

        <div class="restoration-form-grid">

          <div class="field">
            <label for="new-sm-asset">
              Asset *
            </label>

            <select id="new-sm-asset" disabled>
              <option value="">
                Select Asset
              </option>
            </select>
          </div>

          <div class="field">
            <label for="new-sm-title">
              Maintenance Title *
            </label>

            <input
              id="new-sm-title"
              type="text"
              placeholder="Scheduled Maintenance"
            >
          </div>

          <div class="field">
            <label for="new-sm-scheduled-start">
              Scheduled Start
            </label>

            <input
              id="new-sm-scheduled-start"
              type="datetime-local"
            >
          </div>

          <div class="field">
            <label for="new-sm-scheduled-end">
              Scheduled End
            </label>

            <input
              id="new-sm-scheduled-end"
              type="datetime-local"
            >
          </div>

          <div class="field" style="grid-column: 1 / -1;">
            <label for="new-sm-description">
              Description
            </label>

            <textarea
              id="new-sm-description"
              rows="3"
            ></textarea>
          </div>

        </div>

        <div
          class="modal-actions"
          style="
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
          "
        >

          <button
            id="cancelNewSmBtn"
            class="btn-table"
            type="button"
          >
            Cancel
          </button>

          <button
            id="saveNewSmBtn"
            class="btn-table"
            type="button"
          >
            Create Scheduled Maintenance
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);


    /* =====================
       CLOSE HANDLERS
    ===================== */

    const closeModal = () => {
      overlay.style.display = "none";
    };

    overlay
      .querySelector("#closeNewSmBtn")
      ?.addEventListener("click", closeModal);

    overlay
      .querySelector("#cancelNewSmBtn")
      ?.addEventListener("click", closeModal);

    overlay.addEventListener("click", event => {

      if (event.target === overlay) {
        closeModal();
      }

    });

  }


  /* =====================
     RESET NEW INCIDENT FORM
  ===================== */

  [
    "new-sm-title",
    "new-sm-scheduled-start",
    "new-sm-scheduled-end",
    "new-sm-description"
  ].forEach(id => {

    const field = document.getElementById(id);

    if (field) {
      field.value = "";
    }

  });


  /* =====================
     LOAD ASSETS

     Uses the existing CMMS asset data.
     No independent SM asset API is needed.
  ===================== */

  const assetSelect =
    document.getElementById("new-sm-asset");

  if (assetSelect) {
    assetSelect.disabled = true;
  }

  try {

    if (
      !Array.isArray(state.assetsData) ||
      state.assetsData.length === 0
    ) {
      await loadAssets();
    }

    populateScheduledMaintenanceAssetDropdown();

    if (assetSelect) {
      assetSelect.value = "";
    }

  } catch (err) {

    console.error(
      "SM ASSET LOADING ERROR:",
      err
    );

    alert("Could not load Assets. Please try again.");

    return;
  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display = "flex";

  assetSelect?.focus();

}

/* =========================================================
   SCHEDULED MAINTENANCE — POPULATE ASSET DROPDOWN

   Uses the SAME asset data, sorting and labels
   as the existing New Breakdown form.

   Populates ONLY #new-sm-asset.
   Does not modify the Breakdown dropdown.
========================================================= */

function populateScheduledMaintenanceAssetDropdown() {

  const select =
    document.getElementById("new-sm-asset");

  if (!select) return;


  const assets =
    Array.isArray(state.assetsData)
      ? state.assetsData
      : [];


  /* =====================
     DEFAULT OPTION
  ===================== */

  select.innerHTML = `
    <option value="">
      Select asset...
    </option>
  `;


  /* =====================
     SORT ASSETS
     Line → Model → Serial
  ===================== */

  const sortedAssets =
    [...assets].sort((a, b) => {

      const lineA =
        String(
          a.line_name ||
          a.line_code ||
          a.line ||
          ""
        );

      const lineB =
        String(
          b.line_name ||
          b.line_code ||
          b.line ||
          ""
        );


      const lineCompare =
        lineA.localeCompare(
          lineB,
          undefined,
          { numeric: true }
        );


      if (lineCompare !== 0) {
        return lineCompare;
      }


      const modelCompare =
        String(a.model || "")
          .localeCompare(
            String(b.model || "")
          );


      if (modelCompare !== 0) {
        return modelCompare;
      }


      return String(
        a.serial_number || ""
      ).localeCompare(
        String(
          b.serial_number || ""
        )
      );

    });


  /* =====================
     CREATE OPTIONS
  ===================== */

  sortedAssets.forEach(asset => {

    if (!asset?.id) return;


    const option =
      document.createElement("option");

    option.value = asset.id;


    const line =
      asset.line_name ||
      asset.line_code ||
      asset.line ||
      "-";


    const model =
      asset.model ||
      "Unknown Asset";


    const serial =
      asset.serial_number ||
      "-";


    option.textContent =
      `${line} — ${model} — S/N ${serial}`;


    select.appendChild(option);

  });


  /* =====================
     ENABLE DROPDOWN
  ===================== */

  select.disabled = false;

}

/* =========================================================
   NEW SCHEDULED MAINTENANCE — SAVE

   Creates ONE Scheduled Maintenance incident.

   - Uses POST /scheduled-maintenance.
   - Scheduled dates are optional.
   - Does NOT create Tasks or Task Executions.
   - Does NOT use or modify Breakdown routes.
   - Opens SM Detail after successful creation.
========================================================= */

let newSmCreateInProgress = false;


async function createScheduledMaintenance() {

  /* =====================
     PREVENT DOUBLE SAVE
  ===================== */

  if (newSmCreateInProgress) return;


  /* =====================
     FORM FIELDS
  ===================== */

  const assetSelect =
    document.getElementById("new-sm-asset");

  const titleInput =
    document.getElementById("new-sm-title");

  const descriptionInput =
    document.getElementById("new-sm-description");

  const scheduledStartInput =
    document.getElementById("new-sm-scheduled-start");

  const scheduledEndInput =
    document.getElementById("new-sm-scheduled-end");

  const saveBtn =
    document.getElementById("saveNewSmBtn");

  const overlay =
    document.getElementById(
      "newScheduledMaintenanceOverlay"
    );


  /* =====================
     VALIDATE ASSET
  ===================== */

  const assetId =
    Number(assetSelect?.value);

  if (
    !Number.isInteger(assetId) ||
    assetId <= 0
  ) {
    alert("Please select an Asset.");
    assetSelect?.focus();
    return;
  }


  /* =====================
     VALIDATE TITLE
  ===================== */

  const title =
    String(titleInput?.value || "").trim();

  if (!title) {
    alert("Please enter a Maintenance Title.");
    titleInput?.focus();
    return;
  }


  /* =====================
     OPTIONAL SCHEDULED DATES

     datetime-local is interpreted as
     the browser's LOCAL date/time.

     ISO conversion provides the timezone
     information required by the API.
  ===================== */

  const startValue =
    scheduledStartInput?.value || "";

  const endValue =
    scheduledEndInput?.value || "";

  let scheduledStartAt = null;
  let scheduledEndAt = null;


  if (startValue) {

    const startDate =
      new Date(startValue);

    if (
      Number.isNaN(startDate.getTime())
    ) {
      alert("Invalid Scheduled Start.");
      scheduledStartInput?.focus();
      return;
    }

    scheduledStartAt =
      startDate.toISOString();

  }


  if (endValue) {

    const endDate =
      new Date(endValue);

    if (
      Number.isNaN(endDate.getTime())
    ) {
      alert("Invalid Scheduled End.");
      scheduledEndInput?.focus();
      return;
    }

    scheduledEndAt =
      endDate.toISOString();

  }


  /* =====================
     CHECK DATE ORDER
  ===================== */

  if (
    scheduledStartAt &&
    scheduledEndAt &&
    new Date(scheduledEndAt) <
      new Date(scheduledStartAt)
  ) {
    alert(
      "Scheduled End cannot be earlier than Scheduled Start."
    );

    scheduledEndInput?.focus();
    return;
  }


  /* =====================
     PAYLOAD

     No actual dates or status are supplied.
     Backend creates the incident as PLANNED.
  ===================== */

  const payload = {

    asset_id: assetId,

    title,

    description:
      String(
        descriptionInput?.value || ""
      ).trim() || null,

    scheduled_start_at:
      scheduledStartAt,

    scheduled_end_at:
      scheduledEndAt

  };


  /* =====================
     CREATE INCIDENT
  ===================== */

  newSmCreateInProgress = true;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Creating...";
  }

  let incidentCreated = false;


  try {

    const response = await fetch(
      "/scheduled-maintenance",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );


    const result =
      await response.json().catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        result?.error ||
        result?.message ||
        "Could not create Scheduled Maintenance."
      );

    }


    /* =====================
       SUCCESS

       Do not repeat POST if opening
       the Detail fails afterwards.
    ===================== */

    incidentCreated = true;


    const createdSmId = Number(
      result?.id ??
      result?.scheduled_maintenance?.id ??
      result?.maintenance?.id ??
      result?.sm?.id
    );


    if (overlay) {
      overlay.style.display = "none";
    }


    if (
      Number.isInteger(createdSmId) &&
      createdSmId > 0
    ) {

      await openScheduledMaintenanceDetail(
        createdSmId
      );

    } else {

      console.warn(
        "SM created, but response did not include a recognized ID:",
        result
      );

      alert(
        "Scheduled Maintenance created successfully, " +
        "but its Detail could not be opened automatically. " +
        "Do not press Create again."
      );

    }

  } catch (err) {

    console.error(
      "CREATE SCHEDULED MAINTENANCE ERROR:",
      err
    );


    alert(
      incidentCreated
        ? "Scheduled Maintenance was created, but its Detail could not be opened. Do not create it again."
        : err.message ||
          "Could not create Scheduled Maintenance."
    );

  } finally {

    newSmCreateInProgress = false;

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent =
        "Create Scheduled Maintenance";
    }

  }

}

/* =========================================================
   DELETE SCHEDULED MAINTENANCE TASK

   Allowed only while parent SM is IN_PROGRESS.

   OPEN TASK:
   - Deletes maintenance_tasks row.

   DONE TASK:
   - Deletes task_executions first.
   - Deletes maintenance_tasks row.

   Backend performs the final safety checks.
========================================================= */

async function deleteScheduledMaintenanceTask(smId, task) {

  const scheduledMaintenanceId =
    Number(smId);

  const taskId =
    Number(task?.id);


  if (
    !Number.isInteger(scheduledMaintenanceId) ||
    scheduledMaintenanceId <= 0 ||
    !Number.isInteger(taskId) ||
    taskId <= 0
  ) {

    alert(
      "Invalid Scheduled Maintenance Task."
    );

    return;
  }


  /* =====================
     CURRENT SM GUARD
  ===================== */

  const currentSm =
    currentScheduledMaintenance;


  if (
    !currentSm ||
    Number(currentSm.id) !==
      scheduledMaintenanceId
  ) {

    alert(
      "Scheduled Maintenance context is no longer valid."
    );

    return;
  }


  if (
    String(
      currentSm.status || ""
    )
      .trim()
      .toUpperCase() !==
    "IN_PROGRESS"
  ) {

    alert(
      "Tasks can only be deleted while Scheduled Maintenance is IN_PROGRESS."
    );

    return;
  }


  /* =====================
     TASK STATUS
  ===================== */

  const taskStatus =
    String(
      task?.status || ""
    )
      .trim()
      .toUpperCase();


  const isDone =
    taskStatus === "DONE";


  /* =====================
     CONFIRM MESSAGE
  ===================== */

  let confirmMessage = "";


  if (isDone) {

    confirmMessage =
      `Delete completed task?\n\n` +
      `${task.task || `Task #${taskId}`}\n\n` +
      `This will permanently remove:\n` +
      `• the Task\n` +
      `• its Execution History\n\n` +
      `Use this only to correct a wrong entry.`;

  } else {

    confirmMessage =
      `Delete this task?\n\n` +
      `${task.task || `Task #${taskId}`}\n\n` +
      `This task has not been executed.`;

  }


  const confirmed =
    window.confirm(
      confirmMessage
    );


  if (!confirmed) {
    return;
  }


  /* =====================
     DELETE
  ===================== */

  try {

    const response =
      await fetch(
        `/scheduled-maintenance/${scheduledMaintenanceId}/tasks/${taskId}`,
        {
          method: "DELETE"
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Could not delete Scheduled Maintenance Task."
      );

    }


    /* =====================
       REFRESH SM DETAIL
    ===================== */

    await openScheduledMaintenanceDetail(
      scheduledMaintenanceId
    );


    /* =====================
       REFRESH GLOBAL TASKS

       Important for consistency
       outside SM Detail.
    ===================== */

    if (
      typeof loadTasks ===
      "function"
    ) {

      await loadTasks();

    }


  } catch (err) {

    console.error(
      "DELETE SM TASK ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not delete Scheduled Maintenance Task."
    );

  }

}

/* =====================
   NEW SM — SAVE BUTTON

   Event delegation because the modal
   is created dynamically.
===================== */

document.addEventListener("click", event => {

  if (
    event.target instanceof Element &&
    event.target.closest("#saveNewSmBtn")
  ) {

    createScheduledMaintenance();

  }

});

/* =========================================================
   SCHEDULED MAINTENANCE — START ACTION

   - Adds Start Maintenance to the SM Detail header.
   - Available only when SM status is PLANNED.
   - Asks for the REAL start date/time.
   - Uses the independent SM Start endpoint.
   - Refreshes SM Detail after successful start.

   No Breakdown or Task actions are modified.
========================================================= */

let smStartInProgress = false;


/* =====================
   SHOW / HIDE START BUTTON

   Called after SM Detail has loaded.
===================== */

function refreshSmStartButton() {

  const sm =
    currentScheduledMaintenance;

  const assetEl =
    document.getElementById("sm-detail-asset");

  if (!assetEl) return;


  let startBtn =
    document.getElementById("startSmBtn");


  /* =====================
     CREATE BUTTON ONCE
  ===================== */

  if (!startBtn) {

    startBtn =
      document.createElement("button");

    startBtn.id = "startSmBtn";
    startBtn.type = "button";
    startBtn.className = "btn-table";

    startBtn.textContent =
      "▶ Start Maintenance";

    startBtn.style.marginTop = "14px";
    startBtn.style.marginBottom = "18px";
    startBtn.style.padding = "10px 16px";

    startBtn.style.background = "#61d69a";
    startBtn.style.color = "#12251b";
    startBtn.style.border = "none";
    startBtn.style.borderRadius = "9px";

    assetEl.insertAdjacentElement(
      "afterend",
      startBtn
    );

  }

  /* =====================
     AVAILABLE ONLY FOR PLANNED SM
  ===================== */

  startBtn.hidden =
    !sm ||
    String(sm.status || "").toUpperCase() !== "PLANNED";

  startBtn.disabled =
    smStartInProgress;

}

/* =====================
   START MAINTENANCE
===================== */

async function startScheduledMaintenance() {

  if (smStartInProgress) return;

  const sm =
    currentScheduledMaintenance;

  const smId =
    Number(sm?.id);

  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {
    alert("No Scheduled Maintenance selected.");
    return;
  }

  if (
    String(sm.status || "").toUpperCase() !== "PLANNED"
  ) {
    alert("This Scheduled Maintenance is not PLANNED.");
    return;
  }


  /* =====================
     ACTUAL START DATE/TIME

     Prefill current LOCAL date/time.
     User may change it to the real start.
  ===================== */

  const now =
    new Date();

  const localNow =
    new Date(
      now.getTime() -
      now.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);


  const dateValue =
    window.prompt(
      "Actual Start — πραγματική ημερομηνία και ώρα έναρξης\n" +
      "Μορφή: YYYY-MM-DDTHH:mm\n\n" +
      "Άλλαξε την προτεινόμενη ώρα εάν η συντήρηση έχει ήδη ξεκινήσει.",
      localNow
    );


  // Cancel: no changes.
  if (dateValue === null) return;


  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateValue)
  ) {
    alert("Invalid date format. Use YYYY-MM-DDTHH:mm.");
    return;
  }


  const actualStart =
    new Date(dateValue);

  if (
    Number.isNaN(actualStart.getTime())
  ) {
    alert("Invalid Actual Start.");
    return;
  }


  /* =====================
     CONFIRM START
  ===================== */

  const confirmed =
    window.confirm(
      `Start SM-${String(smId).padStart(5, "0")}?\n\n` +
      `Actual Start: ${actualStart.toLocaleString("el-GR")}\n\n` +
      "Το SM θα αλλάξει σε IN_PROGRESS."
    );

  if (!confirmed) return;


  /* =====================
     SEND START REQUEST
  ===================== */

  const startBtn =
    document.getElementById("startSmBtn");

  smStartInProgress = true;

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "Starting...";
  }

  let startedSuccessfully = false;


  try {

    const response = await fetch(
      `/scheduled-maintenance/${smId}/start`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          actual_start_at:
            actualStart.toISOString()
        })
      }
    );


    const result =
      await response.json().catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        result.error ||
        "Could not start Scheduled Maintenance."
      );

    }


    startedSuccessfully = true;


    /* =====================
       REFRESH SM DETAIL

       Do not repeat PATCH if the
       Detail refresh fails.
    ===================== */

    await openScheduledMaintenanceDetail(smId);

    if (
      typeof loadBreakdowns === "function"
    ) {
      await loadBreakdowns();
    }

  } catch (err) {

    console.error(
      "START SM ERROR:",
      err
    );

    alert(
      startedSuccessfully
        ? "Maintenance started, but the screen could not refresh. Reload the page; do not press Start again."
        : err.message ||
          "Could not start Scheduled Maintenance. Check its status before trying again."
    );

  } finally {

    smStartInProgress = false;

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "▶ Start Maintenance";

      if (startedSuccessfully) {
        startBtn.hidden = true;
      }
    }

  }

}

/* =====================
   START BUTTON EVENT
===================== */

document.addEventListener("click", event => {

  if (
    event.target instanceof Element &&
    event.target.closest("#startSmBtn")
  ) {
    startScheduledMaintenance();
  }

});

/* =========================================================
   SCHEDULED MAINTENANCE
   ADD COMPLETED TASK

   Creates a maintenance task that has already been
   performed during an IN_PROGRESS Scheduled Maintenance.

   RULES:
   - SM must be IN_PROGRESS.
   - Asset is fixed from the SM.
   - Section / Unit come from existing Asset Tasks.
   - Technician comes from active technicians.
   - Actual Completion:
       >= SM Actual Start
       <= NOW
   - Task is created directly as Done by backend.
========================================================= */

let smCompletedTaskSaveInProgress = false;


/* =====================
   LOCAL DATETIME VALUE

   Converts Date / ISO timestamp to
   datetime-local format:
   YYYY-MM-DDTHH:mm
===================== */

function toSmLocalDateTimeValue(value) {

  const date =
    value instanceof Date
      ? value
      : new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  return new Date(
    date.getTime() -
    date.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

}


/* =========================================================
   CREATE COMPLETED TASK MODAL
   Created once dynamically.
========================================================= */

function ensureCompletedSmTaskModal() {

  let overlay =
    document.getElementById(
      "completedSmTaskOverlay"
    );


  if (overlay) {
    return overlay;
  }


  overlay =
    document.createElement("div");


  overlay.id =
    "completedSmTaskOverlay";

  overlay.className =
    "modal-overlay";

  overlay.style.display =
    "none";

  overlay.style.zIndex =
    "1300";


  overlay.innerHTML = `
    <div
      class="modal"
      style="
        box-sizing:border-box;
        width:min(720px, calc(100vw - 32px));
        max-height:90vh;
        overflow-y:auto;
        padding:24px;
        background:#181b22;
        color:#f5f7fa;
        border:1px solid rgba(255,255,255,.13);
        border-radius:14px;
      "
    >

      <!-- HEADER -->

      <div
        class="modal-header"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
        "
      >

        <div>

          <h2 style="margin:0;">
            Add Completed Task
          </h2>

          <div
            id="completed-sm-reference"
            style="
              margin-top:5px;
              font-size:12px;
              opacity:.7;
            "
          >
          </div>

        </div>


        <button
          id="closeCompletedSmTaskBtn"
          class="modal-close"
          type="button"
          aria-label="Close"
        >
          ×
        </button>

      </div>


      <!-- ASSET -->

      <div
        class="addtask-block"
        style="margin-top:20px;"
      >

        <label>Asset</label>

        <input
          id="completed-sm-asset"
          type="text"
          disabled
          style="width:100%;"
        />

      </div>


      <!-- SECTION / UNIT -->

      <div
        class="addtask-block addtask-grid"
      >

        <div class="field">

          <label>Section</label>

          <select
            id="completed-sm-section"
            style="width:100%;"
          >
            <option value="">
              Select Section
            </option>
          </select>

        </div>


        <div class="field">

          <label>Unit</label>

          <select
            id="completed-sm-unit"
            style="width:100%;"
            disabled
          >
            <option value="">
              Select Unit
            </option>
          </select>

        </div>

      </div>


      <!-- TASK -->

      <div class="addtask-block">

        <label>Maintenance Task *</label>

        <input
          id="completed-sm-task"
          type="text"
          placeholder="Describe the completed maintenance task"
          style="width:100%;"
        />

      </div>


      <!-- IMPACT / TECHNICIAN -->

      <div
        class="addtask-block addtask-grid"
      >

        <div class="field">

          <label>Impact</label>

          <select
            id="completed-sm-impact"
            style="width:100%;"
          >
            <option value="normal" selected>
              Normal
            </option>

            <option value="safety">
              Safety
            </option>

            <option value="quality">
              Quality
            </option>

            <option value="safety_quality">
              Safety &amp; Quality
            </option>
          </select>

        </div>


        <div class="field">

          <label>Technician *</label>

          <select
            id="completed-sm-technician"
            style="width:100%;"
          >
            <option value="">
              Select Technician
            </option>
          </select>

        </div>

      </div>


      <!-- COMPLETION / DURATION -->

      <div
        class="addtask-block addtask-grid"
      >

        <div class="field">

          <label>
            Actual Completion *
          </label>

          <input
            id="completed-sm-date"
            type="datetime-local"
            style="width:100%;"
          />

          <small class="field-hint">
            Must be between SM Actual Start and current time
          </small>

        </div>


        <div class="field">

          <label>
            Actual Duration (minutes) *
          </label>

          <input
            id="completed-sm-duration"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 45"
            style="width:100%;"
          />

        </div>

      </div>


      <!-- NOTES -->

      <div class="addtask-block">

        <label>Notes</label>

        <textarea
          id="completed-sm-notes"
          rows="3"
          style="width:100%;"
          placeholder="Optional notes"
        ></textarea>

      </div>


      <!-- ACTIONS -->

      <div
        class="modal-actions"
        style="
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:22px;
        "
      >

        <button
          id="cancelCompletedSmTaskBtn"
          type="button"
          class="btn-table"
        >
          Cancel
        </button>


        <button
          id="saveCompletedSmTaskBtn"
          type="button"
          class="btn-table"
        >
          ✓ Save Completed Task
        </button>

      </div>

    </div>
  `;


  document.body.appendChild(
    overlay
  );


  return overlay;

}


/* =========================================================
   POPULATE SECTIONS

   Uses existing maintenance_tasks
   already loaded in state.tasksData.
========================================================= */

function populateCompletedSmSections() {

  const sm =
    currentScheduledMaintenance;


  const select =
    document.getElementById(
      "completed-sm-section"
    );


  if (!select || !sm) {
    return;
  }


  const assetId =
    Number(sm.asset_id);


  const assetTasks =
    (
      Array.isArray(state.tasksData)
        ? state.tasksData
        : []
    )
      .filter(task =>
        Number(task.asset_id) === assetId &&
        task.deleted_at == null
      );


  const sections = [

    ...new Set(

      assetTasks
        .map(task =>
          String(
            task.section || ""
          ).trim()
        )
        .filter(Boolean)

    )

  ].sort((a, b) =>
    a.localeCompare(
      b,
      "el",
      { numeric: true }
    )
  );


  select.replaceChildren(
    new Option(
      "Select Section",
      ""
    )
  );


  sections.forEach(section => {

    select.add(
      new Option(
        section,
        section
      )
    );

  });

}


/* =========================================================
   POPULATE UNITS

   Units are restricted to:
   SAME ASSET + SELECTED SECTION
========================================================= */

function populateCompletedSmUnits() {

  const sm =
    currentScheduledMaintenance;


  const sectionSelect =
    document.getElementById(
      "completed-sm-section"
    );


  const unitSelect =
    document.getElementById(
      "completed-sm-unit"
    );


  if (
    !sm ||
    !sectionSelect ||
    !unitSelect
  ) {
    return;
  }


  const section =
    String(
      sectionSelect.value || ""
    ).trim();


  unitSelect.replaceChildren(
    new Option(
      "Select Unit",
      ""
    )
  );


  if (!section) {

    unitSelect.disabled = true;

    return;
  }


  const assetId =
    Number(sm.asset_id);


  const units = [

    ...new Set(

      (
        Array.isArray(state.tasksData)
          ? state.tasksData
          : []
      )

        .filter(task =>

          Number(task.asset_id) ===
            assetId &&

          task.deleted_at == null &&

          String(
            task.section || ""
          ).trim() === section

        )

        .map(task =>
          String(
            task.unit || ""
          ).trim()
        )

        .filter(Boolean)

    )

  ].sort((a, b) =>
    a.localeCompare(
      b,
      "el",
      { numeric: true }
    )
  );


  units.forEach(unit => {

    unitSelect.add(
      new Option(
        unit,
        unit
      )
    );

  });


  unitSelect.disabled =
    units.length === 0;

}


/* =========================================================
   POPULATE TECHNICIANS
========================================================= */

async function populateCompletedSmTechnicians() {

  const select =
    document.getElementById(
      "completed-sm-technician"
    );


  if (!select) {
    return;
  }


  /* Ensure technician data exists */

  if (
    (
      !Array.isArray(
        state.techniciansData
      ) ||
      state.techniciansData.length === 0
    ) &&
    typeof loadTechnicians === "function"
  ) {

    await loadTechnicians();

  }


  select.replaceChildren(
    new Option(
      "Select Technician",
      ""
    )
  );


  if (
    !Array.isArray(
      state.techniciansData
    )
  ) {
    return;
  }


  state.techniciansData

    .filter(
      technician =>
        technician.active !== false
    )

    .sort(
      (a, b) =>
        String(a.name || "")
          .localeCompare(
            String(b.name || ""),
            "el"
          )
    )

    .forEach(technician => {

      const option =
        new Option(
          technician.name,
          technician.id
        );


      select.add(
        option
      );

    });

}


/* =========================================================
   OPEN MODAL
========================================================= */

async function openCompletedSmTaskModal() {

  const sm =
    currentScheduledMaintenance;


  if (
    !sm ||
    !Number.isInteger(
      Number(sm.id)
    )
  ) {

    alert(
      "No Scheduled Maintenance selected."
    );

    return;
  }


  if (
    String(
      sm.status || ""
    ).toUpperCase() !==
    "IN_PROGRESS"
  ) {

    alert(
      "Completed Tasks can only be added while Scheduled Maintenance is IN_PROGRESS."
    );

    return;
  }


  if (!sm.actual_started_at) {

    alert(
      "Scheduled Maintenance has no Actual Start."
    );

    return;
  }


  const overlay =
    ensureCompletedSmTaskModal();


  /* =====================
     RESET
  ===================== */

  const taskInput =
    document.getElementById(
      "completed-sm-task"
    );

  const sectionSelect =
    document.getElementById(
      "completed-sm-section"
    );

  const unitSelect =
    document.getElementById(
      "completed-sm-unit"
    );

  const impactSelect =
    document.getElementById(
      "completed-sm-impact"
    );

  const technicianSelect =
    document.getElementById(
      "completed-sm-technician"
    );

  const dateInput =
    document.getElementById(
      "completed-sm-date"
    );

  const durationInput =
    document.getElementById(
      "completed-sm-duration"
    );

  const notesInput =
    document.getElementById(
      "completed-sm-notes"
    );


  if (taskInput) {
    taskInput.value = "";
  }

  if (sectionSelect) {
    sectionSelect.value = "";
  }

  if (unitSelect) {

    unitSelect.replaceChildren(
      new Option(
        "Select Unit",
        ""
      )
    );

    unitSelect.disabled = true;

  }

  if (impactSelect) {
    impactSelect.value = "normal";
  }

  if (technicianSelect) {
    technicianSelect.value = "";
  }

  if (durationInput) {
    durationInput.value = "";
  }

  if (notesInput) {
    notesInput.value = "";
  }


  /* =====================
     SM REFERENCE
  ===================== */

  const reference =
    document.getElementById(
      "completed-sm-reference"
    );


  if (reference) {

    reference.textContent =
      `SM-${String(sm.id).padStart(5, "0")}`;

  }


  /* =====================
     LOCKED ASSET
  ===================== */

  const assetInput =
    document.getElementById(
      "completed-sm-asset"
    );


  if (assetInput) {

    assetInput.value =
      `${sm.line_name || "—"} · ` +
      `${sm.asset_model || "—"} · ` +
      `SN ${sm.asset_serial || "—"}`;

  }


  /* =====================
     ACTUAL COMPLETION LIMITS

     MIN = SM Actual Start
     MAX = Current Time
     DEFAULT = Current Time
  ===================== */

  if (dateInput) {

    const minimum =
      toSmLocalDateTimeValue(
        sm.actual_started_at
      );


    const maximum =
      toSmLocalDateTimeValue(
        new Date()
      );


    dateInput.min =
      minimum;

    dateInput.max =
      maximum;

    dateInput.value =
      maximum;

  }


  /* =====================
     POPULATE DROPDOWNS
  ===================== */

  populateCompletedSmSections();

  await populateCompletedSmTechnicians();


  /* =====================
     OPEN
  ===================== */

  overlay.style.display =
    "flex";


  taskInput?.focus();

}


/* =========================================================
   CLOSE MODAL
========================================================= */

function closeCompletedSmTaskModal() {

  const overlay =
    document.getElementById(
      "completedSmTaskOverlay"
    );


  if (overlay) {
    overlay.style.display = "none";
  }

}


/* =========================================================
   SAVE COMPLETED TASK
========================================================= */

async function saveCompletedSmTask() {

  if (
    smCompletedTaskSaveInProgress
  ) {
    return;
  }


  const sm =
    currentScheduledMaintenance;


  const smId =
    Number(sm?.id);


  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {

    alert(
      "No Scheduled Maintenance selected."
    );

    return;
  }


  if (
    String(
      sm.status || ""
    ).toUpperCase() !==
    "IN_PROGRESS"
  ) {

    alert(
      "Scheduled Maintenance is not IN_PROGRESS."
    );

    return;
  }


  /* =====================
     READ FIELDS
  ===================== */

  const task =
    String(
      document.getElementById(
        "completed-sm-task"
      )?.value || ""
    ).trim();


  const section =
    String(
      document.getElementById(
        "completed-sm-section"
      )?.value || ""
    ).trim();


  const unit =
    String(
      document.getElementById(
        "completed-sm-unit"
      )?.value || ""
    ).trim();


  const impact =
    String(
      document.getElementById(
        "completed-sm-impact"
      )?.value || "normal"
    ).trim();


  const technicianId =
    Number(
      document.getElementById(
        "completed-sm-technician"
      )?.value
    );


  const completionValue =
    document.getElementById(
      "completed-sm-date"
    )?.value;


  const durationValue =
    String(
      document.getElementById(
        "completed-sm-duration"
      )?.value || ""
    ).trim();


  const notes =
    String(
      document.getElementById(
        "completed-sm-notes"
      )?.value || ""
    ).trim() || null;


  /* =====================
     VALIDATE TASK
  ===================== */

  if (!task) {

    alert(
      "Please enter the Maintenance Task."
    );

    document.getElementById(
      "completed-sm-task"
    )?.focus();

    return;
  }


  /* =====================
     VALIDATE TECHNICIAN
  ===================== */

  if (
    !Number.isInteger(technicianId) ||
    technicianId <= 0
  ) {

    alert(
      "Please select Technician."
    );

    return;
  }


  /* =====================
     VALIDATE COMPLETION TIME
  ===================== */

  if (!completionValue) {

    alert(
      "Actual Completion is required."
    );

    return;
  }


  const executedAt =
    new Date(
      completionValue
    );


  if (
    Number.isNaN(
      executedAt.getTime()
    )
  ) {

    alert(
      "Invalid Actual Completion."
    );

    return;
  }


  const actualStart =
    new Date(
      sm.actual_started_at
    );


  if (
    executedAt < actualStart
  ) {

    alert(
      "Actual Completion cannot be earlier than the Scheduled Maintenance Actual Start."
    );

    return;
  }


  if (
    executedAt.getTime() >
    Date.now()
  ) {

    alert(
      "Actual Completion cannot be in the future."
    );

    return;
  }


  /* =====================
     VALIDATE DURATION
  ===================== */

  if (durationValue === "") {

    alert(
      "Actual Duration is required."
    );

    return;
  }


  const actualDurationMin =
    Number(durationValue);


  if (
    !Number.isInteger(
      actualDurationMin
    ) ||
    actualDurationMin < 0
  ) {

    alert(
      "Actual Duration must be a non-negative integer."
    );

    return;
  }


  /* =====================
     PAYLOAD
  ===================== */

  const payload = {

    task,

    section:
      section || null,

    unit:
      unit || null,

    impact,

    technician_id:
      technicianId,

    executed_at:
      executedAt.toISOString(),

    actual_duration_min:
      actualDurationMin,

    notes

  };


  /* =====================
     SAVE
  ===================== */

  const saveBtn =
    document.getElementById(
      "saveCompletedSmTaskBtn"
    );


  smCompletedTaskSaveInProgress =
    true;


  if (saveBtn) {

    saveBtn.disabled =
      true;

    saveBtn.textContent =
      "Saving...";

  }


  let taskCreated =
    false;


  try {

    const response =
      await fetch(
        `/scheduled-maintenance/${smId}/completed-task`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Could not save Completed Task."
      );

    }


    taskCreated =
      true;


    closeCompletedSmTaskModal();


    /* =====================
       REFRESH SM DETAIL
    ===================== */

    await openScheduledMaintenanceDetail(
      smId
    );


    /*
      Refresh normal Tasks state as well.
      This task is Done, so it will not remain
      in the open Tasks list.
    */
    if (
      typeof loadTasks ===
      "function"
    ) {

      await loadTasks();

    }


  } catch (err) {

    console.error(
      "SAVE COMPLETED SM TASK ERROR:",
      err
    );


    alert(
      taskCreated
        ? "Completed Task was recorded, but refresh failed. Reload the page. Do not save it again."
        : err.message ||
          "Could not save Completed Task."
    );


  } finally {

    smCompletedTaskSaveInProgress =
      false;


    if (saveBtn) {

      saveBtn.disabled =
        false;

      saveBtn.textContent =
        "✓ Save Completed Task";

    }

  }

}


/* =========================================================
   COMPLETED TASK MODAL EVENTS
========================================================= */

document.addEventListener(
  "change",
  event => {

    if (
      event.target?.id ===
      "completed-sm-section"
    ) {

      populateCompletedSmUnits();

    }

  }
);


document.addEventListener(
  "click",
  event => {

    const target =
      event.target;


    if (
      !(target instanceof Element)
    ) {
      return;
    }


    /* CLOSE / CANCEL */

    if (
      target.closest(
        "#closeCompletedSmTaskBtn"
      ) ||
      target.closest(
        "#cancelCompletedSmTaskBtn"
      )
    ) {

      closeCompletedSmTaskModal();

      return;
    }


    /* SAVE */

    if (
      target.closest(
        "#saveCompletedSmTaskBtn"
      )
    ) {

      saveCompletedSmTask();

      return;
    }


    /* CLICK OUTSIDE MODAL */

    if (
      target.id ===
      "completedSmTaskOverlay"
    ) {

      closeCompletedSmTaskModal();

    }

  }
);

/* =========================================================
   SCHEDULED MAINTENANCE — CLOSE ACTION

   - Available only when SM status = IN_PROGRESS.
   - Checks all linked Tasks before closing.
   - If open Tasks remain → informs user and stops.
   - If all Tasks are Done → asks for confirmation.
   - Backend performs the final validation again.
========================================================= */

let smCloseInProgress = false;


/* =====================
   SHOW / HIDE CLOSE BUTTON
===================== */

function refreshSmCloseButton() {

  const sm =
    currentScheduledMaintenance;

  const closeBtn =
    document.getElementById(
      "closeSmBtn"
    );

  if (!closeBtn) return;


  const isInProgress =
    !!sm &&
    String(sm.status || "")
      .trim()
      .toUpperCase() ===
      "IN_PROGRESS";


  closeBtn.hidden =
    !isInProgress;

  closeBtn.style.display =
    isInProgress
      ? "inline-flex"
      : "none";

  closeBtn.disabled =
    smCloseInProgress;

}

/* =====================
   CLOSE SCHEDULED MAINTENANCE
===================== */

async function closeScheduledMaintenance() {

  if (smCloseInProgress) {
    return;
  }


  const sm =
    currentScheduledMaintenance;


  const smId =
    Number(sm?.id);


  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {

    alert(
      "No Scheduled Maintenance selected."
    );

    return;
  }


  if (
    String(
      sm.status || ""
    ).toUpperCase() !==
    "IN_PROGRESS"
  ) {

    alert(
      "This Scheduled Maintenance is not IN_PROGRESS."
    );

    return;
  }


  const closeBtn =
    document.getElementById(
      "closeSmBtn"
    );


  smCloseInProgress = true;


  if (closeBtn) {

    closeBtn.disabled = true;

    closeBtn.textContent =
      "Checking Tasks...";

  }


  try {

    /* =====================
       1. LOAD LINKED TASKS
    ===================== */

    const tasksResponse =
      await fetch(
        `/scheduled-maintenance/${smId}/tasks`
      );


    const tasksResult =
      await tasksResponse
        .json()
        .catch(() => ({}));


    if (!tasksResponse.ok) {

      throw new Error(
        tasksResult?.error ||
        "Could not check Maintenance Tasks."
      );

    }


    const tasks =
      Array.isArray(tasksResult.tasks)
        ? tasksResult.tasks
        : [];


    /* =====================
       2. FIND OPEN TASKS
    ===================== */

    const openTasks =
      tasks.filter(task => {

        const status =
          String(
            task.status || ""
          )
            .trim()
            .toUpperCase();


        return (
          status !== "DONE"
        );

      });


    /* =====================
       3. OPEN TASKS EXIST
    ===================== */

    if (openTasks.length > 0) {

      const taskWord =
        openTasks.length === 1
          ? "task is"
          : "tasks are";


      alert(
        `Scheduled Maintenance cannot be closed.\n\n` +
        `${openTasks.length} maintenance ${taskWord} still open.\n\n` +
        `Complete all Maintenance Tasks first.`
      );


      return;
    }


    /* =====================
       4. ALL TASKS COMPLETED
       CONFIRM CLOSE
    ===================== */

    const confirmed =
      window.confirm(
        `All Maintenance Tasks are completed.\n\n` +
        `Close SM-${String(smId).padStart(5, "0")}?\n\n` +
        `OK = Close SM\n` +
        `Cancel = Keep IN_PROGRESS`
      );


    if (!confirmed) {
      return;
    }


    /* =====================
       5. ACTUAL CLOSE TIME

       Current real time is sent.
    ===================== */

    const actualClose =
      new Date();


    if (closeBtn) {

      closeBtn.textContent =
        "Closing...";

    }


    /* =====================
       6. SEND CLOSE REQUEST

       Backend checks Tasks again.
    ===================== */

    const response =
      await fetch(
        `/scheduled-maintenance/${smId}/close`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            actual_close_at:
              actualClose.toISOString()
          })
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      if (
        response.status === 409 &&
        Number(result?.open_tasks) > 0
      ) {

        alert(
          `Scheduled Maintenance cannot be closed.\n\n` +
          `${result.open_tasks} maintenance task(s) are still open.`
        );

        return;
      }


      throw new Error(
        result?.error ||
        "Could not close Scheduled Maintenance."
      );

    }


    /* =====================
       7. REFRESH DETAIL

       New backend state:
       status = CLOSED
       actual_closed_at populated
    ===================== */

    await openScheduledMaintenanceDetail(
      smId
    );


    /*
      Refresh main incident list as well.
      Existing SMs are loaded together with
      the Maintenance incident view.
    */
    if (
      typeof loadBreakdowns ===
      "function"
    ) {

      await loadBreakdowns();

    }


  } catch (err) {

    console.error(
      "CLOSE SM ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not close Scheduled Maintenance."
    );

  } finally {

    smCloseInProgress = false;


    const refreshedCloseBtn =
      document.getElementById(
        "closeSmBtn"
      );


    if (refreshedCloseBtn) {

      refreshedCloseBtn.disabled =
        false;

      refreshedCloseBtn.textContent =
        "✓ Close Maintenance";


      /*
        After successful close,
        currentScheduledMaintenance
        has already been reloaded
        with status = CLOSED.
      */
      refreshedCloseBtn.hidden =
        !currentScheduledMaintenance ||
        String(
          currentScheduledMaintenance.status ||
          ""
        ).toUpperCase() !==
          "IN_PROGRESS";

    }

  }

}

/* =====================
   CLOSE BUTTON EVENT
===================== */

document.addEventListener(
  "click",
  event => {

    if (
      event.target instanceof Element &&
      event.target.closest("#closeSmBtn")
    ) {

      closeScheduledMaintenance();

    }

  }
);

document.addEventListener("click", event => {

  const target =
    event.target;


  if (!(target instanceof Element)) {
    return;
  }


  if (
    target.closest(
      "#addCompletedSmTaskBtn"
    )
  ) {

    if (
      typeof openCompletedSmTaskModal ===
      "function"
    ) {

      openCompletedSmTaskModal();

    } else {

      console.error(
        "Completed SM Task modal is not available yet."
      );

    }

    return;
  }

});