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

      taskContainer.appendChild(card);

    });


  } catch (err) {

    console.error("LOAD SM DETAIL ERROR:", err);

    taskContainer.textContent =
      "Could not load Scheduled Maintenance detail.";

  }

}