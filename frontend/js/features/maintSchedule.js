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

  const overlay = document.getElementById(
    "scheduledMaintenanceDetailOverlay"
  );

  const taskContainer = document.getElementById(
    "sm-maintenance-tasks"
  );

  if (!overlay || !taskContainer) {
    console.error("SM Detail HTML not found");
    return;
  }


  /* =====================
     CLOSE MODAL
  ===================== */

  const closeModal = () => {
    overlay.style.display = "none";
  };

  const closeBtn = document.getElementById(
    "closeScheduledMaintenanceDetailBtn"
  );

  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }

  overlay.onclick = event => {
    if (event.target === overlay) {
      closeModal();
    }
  };


  /* =====================
     HELPERS
  ===================== */

  const setText = (elementId, value) => {

    const element = document.getElementById(elementId);

    if (element) {
      element.textContent = value ?? "—";
    }

  };

  const formatDate = value => {

    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("el-GR");
  };


  /* =====================
     OPEN / LOADING
  ===================== */

  overlay.style.display = "flex";

  taskContainer.textContent =
    "Loading maintenance tasks...";


  try {

    /* =====================
       LOAD SM + LINKED TASKS
       Read-only requests.
    ===================== */

    const [smResponse, tasksResponse] =
      await Promise.all([

        fetch(`/scheduled-maintenance/${id}`),

        fetch(`/scheduled-maintenance/${id}/tasks`)

      ]);

    if (!smResponse.ok || !tasksResponse.ok) {
      throw new Error(
        "Failed to load Scheduled Maintenance detail"
      );
    }

    const smResult = await smResponse.json();
    const tasksResult = await tasksResponse.json();

    const sm = smResult.scheduled_maintenance;

    if (!sm) {
      throw new Error("Scheduled Maintenance not found");
    }

    // Keep the loaded SM for its own Task modal.
    currentScheduledMaintenance = sm;

    // CLOSED SM incidents cannot receive new Tasks.
    if (addTaskBtn) {
      const isClosed =
        String(sm.status || "").toUpperCase() === "CLOSED";

      addTaskBtn.style.display =
        isClosed ? "none" : "";

      addTaskBtn.disabled = isClosed;
    }


    /* =====================
       RENDER SM DETAILS
    ===================== */

    setText(
      "sm-detail-code",
      `SM-${String(sm.id).padStart(5, "0")}`
    );

    setText("sm-detail-status", sm.status);

    setText(
      "sm-detail-asset",
      `${sm.line_name || "—"} · ` +
      `${sm.asset_model || "—"} · ` +
      `SN ${sm.asset_serial || "—"}`
    );

    setText("sm-detail-title", sm.title || "—");

    setText(
      "sm-detail-description",
      sm.description || "—"
    );

    setText(
      "sm-detail-scheduled-start",
      formatDate(sm.scheduled_start_at)
    );

    setText(
      "sm-detail-scheduled-end",
      formatDate(sm.scheduled_end_at)
    );

    setText(
      "sm-detail-actual-start",
      formatDate(sm.actual_started_at)
    );

    setText(
      "sm-detail-actual-closed",
      formatDate(sm.actual_closed_at)
    );


    /* =====================
       RENDER LINKED TASKS

       Initial read-only cards.
       Task actions will be connected separately.
    ===================== */

    const tasks = Array.isArray(tasksResult.tasks)
      ? tasksResult.tasks
      : [];

    taskContainer.replaceChildren();

    if (tasks.length === 0) {

      taskContainer.textContent =
        "No maintenance tasks yet.";

      return;
    }

    /* =====================
       RENDER SM TASK CARDS

       - Open Tasks: show Complete action.
       - Done Tasks: show completion status.
       - Completion uses the existing CMMS engine.
       - No Breakdown functions or routes are modified.
    ===================== */

    tasks.forEach(task => {

      const card = document.createElement("div");
      card.className = "restoration-task-item";

      const title = document.createElement("div");
      title.className = "restoration-task-title";
      title.textContent = task.task || "—";

      const meta = document.createElement("div");
      meta.className = "task-meta";

      const estimated =
        task.duration_min == null
          ? "—"
          : `${task.duration_min} min`;

      meta.textContent =
        `Task #${task.id} · ${task.status || "—"}` +
        ` · Est. ${estimated}`;

      card.append(title, meta);

      const status =
        String(task.status || "").trim().toUpperCase();

      const isOpen =
        status === "PLANNED" ||
        status === "OVERDUE";

      if (isOpen) {

        const completeBtn =
          document.createElement("button");

        completeBtn.type = "button";
        completeBtn.className = "btn-table sm-task-complete-btn";
        completeBtn.textContent = "Complete";

        completeBtn.addEventListener("click", () => {

          // Use the existing Task completion modal.
          // No SM-specific completion route is created.

          if (typeof askTechnician !== "function") {
            console.error(
              "SM TASK: Standard completion modal unavailable"
            );
            return;
          }

          askTechnician(task.id);

        });

        card.appendChild(completeBtn);

      } else if (status === "DONE") {

        const doneLabel =
          document.createElement("div");

        doneLabel.className = "restoration-task-done";
        doneLabel.textContent = "✓ Done";

        card.appendChild(doneLabel);
      }

      taskContainer.appendChild(card);

    });


  } catch (err) {

    console.error("LOAD SM DETAIL ERROR:", err);

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

function openNewScheduledMaintenanceModal() {

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
            disabled
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
     SHOW MODAL
  ===================== */

  overlay.style.display = "flex";

  document.getElementById("new-sm-title")?.focus();

}