/* =========================================================
   SCHEDULED MAINTENANCE — CURRENT DETAIL

   Keeps the currently loaded SM separate from
   currentBreakdown and currentBreakdownId.
========================================================= */

let currentScheduledMaintenance = null;

/* =========================================================
   SM PLANNED TASK — ATTACHMENT SELECTION

   Rules:
   - Maximum 3 files
   - Maximum 10 MB total
   - JPG / JPEG / PNG / WEBP / PDF
========================================================= */

const SM_TASK_ATTACHMENT_MAX_FILES =
  3;


const SM_TASK_ATTACHMENT_MAX_TOTAL_BYTES =
  8 * 1024 * 1024;


let smTaskAttachmentFiles =
  [];

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

    /* =====================
      TASK SUMMARY
    ===================== */

    const taskSummary =
      document.getElementById(
        "sm-task-summary"
      );


    const completedTasks =
      tasks.filter(task =>
        String(
          task.status || ""
        )
          .trim()
          .toUpperCase() === "DONE"
      );


    const totalActualMinutes =
      completedTasks.reduce(
        (sum, task) =>
          sum +
          (
            Number(
              task.actual_duration_min
            ) || 0
          ),
        0
      );


    function formatTaskDuration(minutes) {

      const total =
        Number(minutes) || 0;


      const hours =
        Math.floor(
          total / 60
        );


      const mins =
        total % 60;


      if (hours > 0 && mins > 0) {
        return `${hours} h ${mins} min`;
      }


      if (hours > 0) {
        return `${hours} h`;
      }


      return `${mins} min`;

    }


    if (taskSummary) {

      taskSummary.textContent =
        `${tasks.length} task${tasks.length === 1 ? "" : "s"} · ` +
        `Actual Work: ${formatTaskDuration(totalActualMinutes)}`;

    }


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
      TASK DATE

      DONE:
      → show actual completion date/time

      PLANNED / OVERDUE:
      → show due date/time
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


    if (isDone) {

      due.textContent =
        task.execution_executed_at
          ? `Done: ${formatDate(
              task.execution_executed_at
            )}`
          : "Done: —";

    } else {

      due.textContent =
        task.due_date
          ? `Due: ${formatDate(
              task.due_date
            )}`
          : "Due: —";

    }

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
        ATTACHMENTS
      ===================== */

      const attachmentCount =
        Number(
          task.attachment_count || 0
        );


      const attachmentBtn =
        document.createElement(
          "button"
        );


      attachmentBtn.type =
        "button";


      attachmentBtn.className =
        "btn-table sm-task-attachment-btn";


      attachmentBtn.textContent =
        attachmentCount > 0
          ? `📎 ${attachmentCount} Attachment${
              attachmentCount === 1
                ? ""
                : "s"
            }`
          : "📎 Add Attachment";


      attachmentBtn.addEventListener(
        "click",
        () => {

          if (
            typeof openTaskAttachmentsManager !==
            "function"
          ) {

            console.error(
              "Task attachment manager is not available"
            );

            return;
          }


          openTaskAttachmentsManager(
            task.id
          );

        }
      );


      actions.appendChild(
        attachmentBtn
      );

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
   TASK ATTACHMENT MANAGER

   Generic manager for TASK attachments.

   - Loads existing attachments
   - Opens image / PDF
   - Allows adding more attachments
   - Maximum 3 files total
   - Maximum 10 MB total
========================================================= */

let taskAttachmentManagerTaskId =
  null;


let taskAttachmentManagerPendingFiles =
  [];


function ensureTaskAttachmentManagerModal() {

  let overlay =
    document.getElementById(
      "taskAttachmentManagerOverlay"
    );


  if (overlay) {
    return overlay;
  }


  overlay =
    document.createElement(
      "div"
    );


  overlay.id =
    "taskAttachmentManagerOverlay";


  overlay.className =
    "modal-overlay";


  overlay.style.display =
    "none";


  overlay.style.zIndex =
    "1400";


  overlay.innerHTML = `

    <div
      class="modal"
      style="
        width:min(680px, calc(100vw - 32px));
        max-height:90vh;
        overflow-y:auto;
      "
    >

      <!-- =====================
           HEADER
      ===================== -->

      <div class="modal-header">

        <div>

          <h2 style="margin:0;">
            Task Attachments
          </h2>

          <div
            id="task-attachment-manager-reference"
            class="section-subtitle"
          >
            Task
          </div>

        </div>

        <button
          id="closeTaskAttachmentManagerBtn"
          class="modal-close"
          type="button"
        >
          ×
        </button>

      </div>


      <!-- =====================
           EXISTING ATTACHMENTS
      ===================== -->

      <div
        id="task-attachment-manager-existing"
        class="task-attachments-section"
        style="
          display:block;
          margin-top:18px;
        "
      >

        <div class="task-attachments-header">

          <h4 style="margin:0;">
            Existing Attachments
          </h4>

          <span
            id="task-attachment-manager-usage"
            class="task-attachments-usage"
          >
          </span>

        </div>


        <div
          id="task-attachment-manager-list"
          class="task-attachments-view-list"
        >
        </div>

      </div>


      <!-- =====================
           ADD ATTACHMENTS
      ===================== -->

      <div
        class="addtask-block"
        style="margin-top:20px;"
      >

        <label>
          Add Attachments
        </label>


        <input
          id="task-attachment-manager-input"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          multiple
          hidden
        />


        <button
          id="task-attachment-manager-add-btn"
          type="button"
          class="btn-table task-attachment-select-btn"
        >
          📎 Add Photo or PDF
        </button>


        <div
          id="task-attachment-manager-summary"
          class="task-attachments-summary"
        >
          No new files selected
        </div>


        <div
          id="task-attachment-manager-pending-list"
          class="task-attachment-list"
        >
        </div>


        <small class="field-hint">
          Up to 3 files total · Max 8 MB total
        </small>

      </div>


      <!-- =====================
           ACTIONS
      ===================== -->

      <div class="modal-actions">

        <button
          id="saveTaskAttachmentManagerBtn"
          class="btn-table"
          type="button"
        >
          Upload
        </button>

        <button
          id="cancelTaskAttachmentManagerBtn"
          class="btn-cancel"
          type="button"
        >
          Close
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(
    overlay
  );


  /* =====================
     CLOSE
  ===================== */

  const closeManager = () => {

    overlay.style.display =
      "none";


    taskAttachmentManagerTaskId =
      null;


    taskAttachmentManagerPendingFiles =
      [];

  };


  document
    .getElementById(
      "closeTaskAttachmentManagerBtn"
    )
    ?.addEventListener(
      "click",
      closeManager
    );


  document
    .getElementById(
      "cancelTaskAttachmentManagerBtn"
    )
    ?.addEventListener(
      "click",
      closeManager
    );


  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target === overlay
      ) {

        closeManager();

      }

    }
  );


  /* =====================
     OPEN PICKER
  ===================== */

  const input =
    document.getElementById(
      "task-attachment-manager-input"
    );


  document
    .getElementById(
      "task-attachment-manager-add-btn"
    )
    ?.addEventListener(
      "click",
      () => {

        if (!input) {
          return;
        }


        input.value =
          "";


        input.click();

      }
    );


  /* =====================
     FILE SELECTION
  ===================== */

  input?.addEventListener(
    "change",
    async event => {

      const newFiles =
        Array.from(
          event.target.files || []
        );


      if (
        newFiles.length === 0
      ) {
        return;
      }


      const combinedFiles =
        [
          ...taskAttachmentManagerPendingFiles
        ];


      newFiles.forEach(
        file => {

          const exists =
            combinedFiles.some(
              existing =>
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );


          if (!exists) {

            combinedFiles.push(
              file
            );

          }

        }
      );


      let existingCount =
        0;


      let existingBytes =
        0;


      if (
        Number.isInteger(
          taskAttachmentManagerTaskId
        )
      ) {

        try {

          const response =
            await fetch(
              `/attachments/TASK/${taskAttachmentManagerTaskId}`
            );


          const result =
            await response
              .json()
              .catch(() => ({}));


          if (response.ok) {

            existingCount =
              Number(
                result?.usage?.count || 0
              );


            existingBytes =
              Number(
                result?.usage?.total_bytes || 0
              );

          }

        } catch (err) {

          console.error(
            "ATTACHMENT USAGE LOAD ERROR:",
            err
          );

        }

      }


      if (
        existingCount +
        combinedFiles.length >
        3
      ) {

        alert(
          "Maximum 3 attachments per task."
        );


        event.target.value =
          "";


        return;

      }


      const pendingBytes =
        combinedFiles.reduce(
          (
            total,
            file
          ) =>
            total +
            Number(
              file.size || 0
            ),
          0
        );


      if (
        existingBytes +
        pendingBytes >
        8 * 1024 * 1024
      ) {

        alert(
          "Maximum total attachment size is 8 MB."
        );


        event.target.value =
          "";


        return;

      }


      taskAttachmentManagerPendingFiles =
        combinedFiles;


      renderTaskAttachmentManagerPendingFiles();

    }
  );


  /* =====================
     UPLOAD
  ===================== */

  document
    .getElementById(
      "saveTaskAttachmentManagerBtn"
    )
    ?.addEventListener(
      "click",
      uploadTaskAttachmentManagerFiles
    );


  return overlay;

}


/* =========================================================
   OPEN MANAGER
========================================================= */

async function openTaskAttachmentsManager(
  taskId
) {

  const id =
    Number(
      taskId
    );


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    alert(
      "Invalid Task ID."
    );

    return;

  }


  taskAttachmentManagerTaskId =
    id;


  taskAttachmentManagerPendingFiles =
    [];


  const overlay =
    ensureTaskAttachmentManagerModal();


  const reference =
    document.getElementById(
      "task-attachment-manager-reference"
    );


  if (reference) {

    reference.textContent =
      `Task #${id}`;

  }


  renderTaskAttachmentManagerPendingFiles();


  overlay.style.display =
    "flex";


  await loadTaskAttachmentManagerExisting();

}


/* =========================================================
   LOAD EXISTING
========================================================= */

async function loadTaskAttachmentManagerExisting() {

  const taskId =
    Number(
      taskAttachmentManagerTaskId
    );


  if (
    !Number.isInteger(taskId)
  ) {
    return;
  }


  const list =
    document.getElementById(
      "task-attachment-manager-list"
    );


  const usage =
    document.getElementById(
      "task-attachment-manager-usage"
    );


  if (!list) {
    return;
  }


  list.textContent =
    "Loading...";


  try {

    const response =
      await fetch(
        `/attachments/TASK/${taskId}`
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (
      !response.ok
    ) {

      throw new Error(
        result?.error ||
        "Could not load attachments."
      );

    }


    const attachments =
      Array.isArray(
        result.attachments
      )
        ? result.attachments
        : [];


    list.replaceChildren();


    if (usage) {

      usage.textContent =
        `${attachments.length}/3 · ${formatAttachmentSize(
          result?.usage?.total_bytes || 0
        )} / 10 MB`;

    }


    if (
      attachments.length === 0
    ) {

      list.textContent =
        "No attachments.";

      return;

    }


    for (
      const attachment of attachments
    ) {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "task-attachment-view-item";


      const preview =
        document.createElement(
          "div"
        );


      preview.className =
        "task-attachment-preview";


      if (
        String(
          attachment.mime_type || ""
        ).startsWith(
          "image/"
        )
      ) {

        try {

          const openResponse =
            await fetch(
              `/attachments/${attachment.id}/open`
            );


          const openResult =
            await openResponse
              .json()
              .catch(() => ({}));


          if (
            openResponse.ok &&
            openResult?.url
          ) {

            const img =
              document.createElement(
                "img"
              );


            img.src =
              openResult.url;


            img.alt =
              attachment.file_name;


            img.className =
              "task-attachment-thumbnail";


            img.addEventListener(
              "click",
              () => {

                openTaskAttachment(
                  attachment.id
                );

              }
            );


            preview.appendChild(
              img
            );

          }

        } catch (err) {

          console.error(
            "ATTACHMENT THUMBNAIL ERROR:",
            err
          );

        }

      } else {

        const pdf =
          document.createElement(
            "span"
          );


        pdf.className =
          "task-attachment-pdf-badge";


        pdf.textContent =
          "PDF";


        preview.appendChild(
          pdf
        );

      }


      const main =
        document.createElement(
          "div"
        );


      main.className =
        "task-attachment-main";


      const name =
        document.createElement(
          "div"
        );


      name.className =
        "task-attachment-name";


      name.textContent =
        attachment.file_name;


      const meta =
        document.createElement(
          "div"
        );


      meta.className =
        "task-attachment-meta";


      meta.textContent =
        `${formatAttachmentSize(
          attachment.file_size
        )}${
          attachment.uploaded_by
            ? ` · ${attachment.uploaded_by}`
            : ""
        }`;


      main.append(
        name,
        meta
      );


      const openBtn =
        document.createElement(
          "button"
        );


      openBtn.type =
        "button";


      openBtn.className =
        "btn-table";


      openBtn.textContent =
        "Open";


      openBtn.addEventListener(
        "click",
        () => {

          openTaskAttachment(
            attachment.id
          );

        }
      );


      item.append(
        preview,
        main,
        openBtn
      );


      list.appendChild(
        item
      );

    }


  } catch (err) {

    console.error(
      "LOAD TASK ATTACHMENTS MANAGER ERROR:",
      err
    );


    list.textContent =
      "Could not load attachments.";

  }

}


/* =========================================================
   RENDER PENDING FILES
========================================================= */

function renderTaskAttachmentManagerPendingFiles() {

  const summary =
    document.getElementById(
      "task-attachment-manager-summary"
    );


  const list =
    document.getElementById(
      "task-attachment-manager-pending-list"
    );


  if (
    !summary ||
    !list
  ) {
    return;
  }


  list.replaceChildren();


  if (
    taskAttachmentManagerPendingFiles.length ===
    0
  ) {

    summary.textContent =
      "No new files selected";

    return;

  }


  const totalBytes =
    taskAttachmentManagerPendingFiles.reduce(
      (
        total,
        file
      ) =>
        total +
        Number(
          file.size || 0
        ),
      0
    );


  summary.textContent =
    `${taskAttachmentManagerPendingFiles.length} new file${
      taskAttachmentManagerPendingFiles.length === 1
        ? ""
        : "s"
    } · ${formatAttachmentSize(
      totalBytes
    )}`;


  taskAttachmentManagerPendingFiles.forEach(
    (
      file,
      index
    ) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "task-attachment-chip";


      const preview =
        document.createElement(
          "div"
        );


      preview.className =
        "task-attachment-chip-preview";


      if (
        String(
          file.type || ""
        ).startsWith(
          "image/"
        )
      ) {

        const img =
          document.createElement(
            "img"
          );


        const objectUrl =
          URL.createObjectURL(
            file
          );


        img.src =
          objectUrl;


        img.alt =
          file.name;


        img.className =
          "task-attachment-chip-thumb";


        img.addEventListener(
          "load",
          () => {

            URL.revokeObjectURL(
              objectUrl
            );

          },
          {
            once: true
          }
        );


        preview.appendChild(
          img
        );

      } else {

        const pdf =
          document.createElement(
            "span"
          );


        pdf.className =
          "task-attachment-chip-pdf";


        pdf.textContent =
          "PDF";


        preview.appendChild(
          pdf
        );

      }


      const info =
        document.createElement(
          "div"
        );


      info.className =
        "task-attachment-chip-info";


      const name =
        document.createElement(
          "div"
        );


      name.className =
        "task-attachment-chip-name";


      name.textContent =
        file.name;


      name.title =
        file.name;


      const size =
        document.createElement(
          "div"
        );


      size.className =
        "task-attachment-chip-size";


      size.textContent =
        formatAttachmentSize(
          file.size
        );


      info.append(
        name,
        size
      );


      const removeBtn =
        document.createElement(
          "button"
        );


      removeBtn.type =
        "button";


      removeBtn.className =
        "task-attachment-remove-btn";


      removeBtn.textContent =
        "×";


      removeBtn.addEventListener(
        "click",
        () => {

          taskAttachmentManagerPendingFiles.splice(
            index,
            1
          );


          renderTaskAttachmentManagerPendingFiles();

        }
      );


      item.append(
        preview,
        info,
        removeBtn
      );


      list.appendChild(
        item
      );

    }
  );

}


/* =========================================================
   UPLOAD PENDING FILES
========================================================= */

async function uploadTaskAttachmentManagerFiles() {

  const taskId =
    Number(
      taskAttachmentManagerTaskId
    );


  if (
    !Number.isInteger(taskId) ||
    taskId <= 0
  ) {
    return;
  }


  if (
    taskAttachmentManagerPendingFiles.length ===
    0
  ) {

    alert(
      "No new files selected."
    );

    return;

  }


  const saveBtn =
    document.getElementById(
      "saveTaskAttachmentManagerBtn"
    );


  try {

    if (saveBtn) {

      saveBtn.disabled =
        true;


      saveBtn.textContent =
        "Uploading...";

    }


    const formData =
      new FormData();


    taskAttachmentManagerPendingFiles.forEach(
      file => {

        formData.append(
          "files",
          file
        );

      }
    );


    const uploadedById =
      localStorage.getItem(
        TECHNICIAN_ID_STORAGE_KEY
      );


    if (uploadedById) {

      formData.append(
        "uploaded_by_id",
        uploadedById
      );

    }


    const response =
      await fetch(
        `/attachments/TASK/${taskId}`,
        {
          method:
            "POST",

          body:
            formData
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (
      !response.ok
    ) {

      throw new Error(
        result?.error ||
        "Attachment upload failed."
      );

    }


    taskAttachmentManagerPendingFiles =
      [];


    renderTaskAttachmentManagerPendingFiles();


    await loadTaskAttachmentManagerExisting();


    /*
      Refresh SM Detail so attachment_count
      is updated on the task card.
    */
    if (
      currentScheduledMaintenance?.id &&
      typeof openScheduledMaintenanceDetail ===
        "function"
    ) {

      await openScheduledMaintenanceDetail(
        currentScheduledMaintenance.id
      );

    }

    /*
      Refresh Breakdown Detail so attachment_count
      is updated on the Restoration Task card.
    */

    if (
      Number.isInteger(
        Number(currentBreakdownId)
      ) &&
      Number(currentBreakdownId) > 0 &&
      typeof openBreakdownDetail ===
        "function"
    ) {

      await openBreakdownDetail(
        Number(currentBreakdownId)
      );

    }


  } catch (err) {

    console.error(
      "TASK ATTACHMENT MANAGER UPLOAD ERROR:",
      err
    );


    alert(
      err.message ||
      "Could not upload attachment."
    );


  } finally {

    if (saveBtn) {

      saveBtn.disabled =
        false;


      saveBtn.textContent =
        "Upload";

    }

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

  resetSmTaskAttachments();

}

/* =========================================================
   SCHEDULED MAINTENANCE — ACTION BAR

   Creates a common action area for:
   - Add Task
   - Add Completed Task
   - Close Maintenance
   - Print
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


  /* =====================
     PRINT
  ===================== */

  let printBtn =
    document.getElementById(
      "printSmBtn"
    );


  if (!printBtn) {

    printBtn =
      document.createElement("button");

    printBtn.id =
      "printSmBtn";

    printBtn.type =
      "button";

    printBtn.className =
      "btn-table";

    printBtn.textContent =
      "🖨 Print";


    printBtn.addEventListener(
      "click",
      () => {

        printScheduledMaintenanceDetail();

      }
    );


    actionBar.appendChild(
      printBtn
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

  const sm =
    currentScheduledMaintenance;


  const saveBtn =
    document.getElementById(
      "saveSmTaskBtn"
    );


  const taskInput =
    document.getElementById(
      "sm-task"
    );


  const sectionSelect =
    document.getElementById(
      "sm-section"
    );


  const sectionInput =
    document.getElementById(
      "sm-section-input"
    );


  const unitSelect =
    document.getElementById(
      "sm-unit"
    );


  const unitInput =
    document.getElementById(
      "sm-unit-input"
    );


  const dueDateInput =
    document.getElementById(
      "sm-due-date"
    );


  const durationInput =
    document.getElementById(
      "sm-duration"
    );


  const notesInput =
    document.getElementById(
      "sm-notes"
    );


  /* =====================
     VALIDATE SELECTED SM
  ===================== */

  const smId =
    Number(
      sm?.id
    );


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
    ).toUpperCase() ===
    "CLOSED"
  ) {

    alert(
      "This Scheduled Maintenance is closed."
    );

    return;

  }


  /* =====================
     READ TASK
  ===================== */

  const task =
    String(
      taskInput?.value || ""
    ).trim();


  if (!task) {

    alert(
      "Please enter the Maintenance Task."
    );


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

      ? String(
          sectionSelect?.value || ""
        ).trim()

      : String(
          sectionInput?.value || ""
        ).trim();


  const unit =
    unitSelect?.style.display !== "none" &&
    unitSelect?.value !== "__new__"

      ? String(
          unitSelect?.value || ""
        ).trim()

      : String(
          unitInput?.value || ""
        ).trim();


  if (
    sectionSelect?.value === "__new__" &&
    !section
  ) {

    alert(
      "Please enter the new Section."
    );


    sectionInput?.focus();


    return;

  }


  if (
    unitSelect?.value === "__new__" &&
    !unit
  ) {

    alert(
      "Please enter the new Unit."
    );


    unitInput?.focus();


    return;

  }


  /* =====================
     DUE DATE
  ===================== */

  let dueDate =
    null;


  if (
    dueDateInput?.value
  ) {

    const parsedDueDate =
      new Date(
        dueDateInput.value
      );


    if (
      Number.isNaN(
        parsedDueDate.getTime()
      )
    ) {

      alert(
        "Invalid Due Date."
      );


      dueDateInput.focus();


      return;

    }


    dueDate =
      parsedDueDate.toISOString();

  }


  /* =====================
     ESTIMATED DURATION
  ===================== */

  let durationMin =
    null;


  if (
    durationInput?.value !== ""
  ) {

    durationMin =
      Number(
        durationInput.value
      );


    if (
      !Number.isFinite(
        durationMin
      ) ||
      durationMin < 0
    ) {

      alert(
        "Invalid Estimated Duration."
      );


      durationInput.focus();


      return;

    }

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

    due_date:
      dueDate,

    duration_min:
      durationMin,

    notes:
      String(
        notesInput?.value || ""
      ).trim() || null

  };


  /* =====================
     CREATE TASK
  ===================== */

  if (
    saveBtn?.disabled
  ) {
    return;
  }


  let taskCreated =
    false;


  try {

    if (saveBtn) {

      saveBtn.disabled =
        true;


      saveBtn.textContent =
        "Adding...";

    }


    const response =
      await fetch(
        `/scheduled-maintenance/${smId}/tasks`,
        {
          method:
            "POST",

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


    if (
      !response.ok
    ) {

      throw new Error(
        result?.error ||
        "Failed to create Maintenance Task"
      );

    }


    taskCreated =
      true;


    /* =====================
       UPLOAD ATTACHMENTS
    ===================== */

    if (
      smTaskAttachmentFiles.length > 0
    ) {

      try {

        const formData =
          new FormData();


        smTaskAttachmentFiles.forEach(
          file => {

            formData.append(
              "files",
              file
            );

          }
        );


        const uploadedById =
          localStorage.getItem(
            TECHNICIAN_ID_STORAGE_KEY
          );


        if (
          uploadedById
        ) {

          formData.append(
            "uploaded_by_id",
            uploadedById
          );

        }


        const attachmentResponse =
          await fetch(
            `/attachments/TASK/${result.id}`,
            {
              method:
                "POST",

              body:
                formData
            }
          );


        const attachmentResult =
          await attachmentResponse
            .json()
            .catch(() => ({}));


        if (
          !attachmentResponse.ok
        ) {

          throw new Error(
            attachmentResult?.error ||
            "Attachment upload failed."
          );

        }

      } catch (
        attachmentErr
      ) {

        console.error(
          "SM TASK ATTACHMENT UPLOAD ERROR:",
          attachmentErr
        );


        alert(
          "Task was created successfully, but attachment upload failed. Do not create the task again."
        );

      }

    }


    /* =====================
       RESET ATTACHMENTS
    ===================== */

    resetSmTaskAttachments();


    /* =====================
       CLOSE TASK MODAL
    ===================== */

    closeSmTaskModal();


    /* =====================
       REFRESH

       Task was created successfully.
       Refresh failures must NOT trigger
       another task creation.
    ===================== */

    await openScheduledMaintenanceDetail(
      smId
    );


    if (
      typeof loadTasks ===
      "function"
    ) {

      await loadTasks();

    }


  } catch (err) {

    console.error(
      "CREATE SM TASK ERROR:",
      err
    );


    alert(
      taskCreated
        ? "Task created, but refresh failed. Please reload the page. Do not save it again."
        : err.message ||
          "Could not create Maintenance Task."
    );


  } finally {

    if (saveBtn) {

      saveBtn.disabled =
        false;


      saveBtn.textContent =
        "Add Task";

    }

  }

}


/* =====================
   RESET
===================== */

function resetSmTaskAttachments() {

  smTaskAttachmentFiles =
    [];


  const input =
    document.getElementById(
      "sm-task-attachments"
    );


  const summary =
    document.getElementById(
      "sm-task-attachments-summary"
    );


  const list =
    document.getElementById(
      "sm-task-attachments-list"
    );


  if (input) {
    input.value = "";
  }


  if (summary) {
    summary.textContent =
      "No files selected";
  }


  if (list) {
    list.innerHTML = "";
  }

}


/* =====================
   RENDER
===================== */

function renderSmTaskAttachments() {

  const summary =
    document.getElementById(
      "sm-task-attachments-summary"
    );


  const list =
    document.getElementById(
      "sm-task-attachments-list"
    );


  if (
    !summary ||
    !list
  ) {
    return;
  }


  list.innerHTML =
    "";


  if (
    smTaskAttachmentFiles.length === 0
  ) {

    summary.textContent =
      "No files selected";

    return;

  }


  const totalBytes =
    smTaskAttachmentFiles.reduce(
      (
        total,
        file
      ) =>
        total +
        Number(
          file.size || 0
        ),
      0
    );


  summary.textContent =
    `${smTaskAttachmentFiles.length} file${
      smTaskAttachmentFiles.length === 1
        ? ""
        : "s"
    } · ${formatAttachmentSize(
      totalBytes
    )}`;


  smTaskAttachmentFiles.forEach(
    (
      file,
      index
    ) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "task-attachment-chip";


      const preview =
        document.createElement(
          "div"
        );


      preview.className =
        "task-attachment-chip-preview";


      if (
        String(
          file.type || ""
        ).startsWith(
          "image/"
        )
      ) {

        const img =
          document.createElement(
            "img"
          );


        const objectUrl =
          URL.createObjectURL(
            file
          );


        img.src =
          objectUrl;


        img.alt =
          file.name;


        img.className =
          "task-attachment-chip-thumb";


        img.addEventListener(
          "load",
          () => {

            URL.revokeObjectURL(
              objectUrl
            );

          },
          {
            once: true
          }
        );


        preview.appendChild(
          img
        );

      } else {

        const pdf =
          document.createElement(
            "span"
          );


        pdf.className =
          "task-attachment-chip-pdf";


        pdf.textContent =
          "PDF";


        preview.appendChild(
          pdf
        );

      }


      const info =
        document.createElement(
          "div"
        );


      info.className =
        "task-attachment-chip-info";


      const name =
        document.createElement(
          "div"
        );


      name.className =
        "task-attachment-chip-name";


      name.textContent =
        file.name;


      name.title =
        file.name;


      const size =
        document.createElement(
          "div"
        );


      size.className =
        "task-attachment-chip-size";


      size.textContent =
        formatAttachmentSize(
          file.size
        );


      info.appendChild(
        name
      );


      info.appendChild(
        size
      );


      const removeBtn =
        document.createElement(
          "button"
        );


      removeBtn.type =
        "button";


      removeBtn.className =
        "task-attachment-remove-btn";


      removeBtn.textContent =
        "×";


      removeBtn.title =
        "Remove attachment";


      removeBtn.addEventListener(
        "click",
        () => {

          smTaskAttachmentFiles.splice(
            index,
            1
          );


          renderSmTaskAttachments();

        }
      );


      item.appendChild(
        preview
      );


      item.appendChild(
        info
      );


      item.appendChild(
        removeBtn
      );


      list.appendChild(
        item
      );

    }
  );

}

/* =====================
   OPEN PICKER
===================== */

document
  .getElementById(
    "sm-task-attachments-btn"
  )
  ?.addEventListener(
    "click",
    () => {

      const input =
        document.getElementById(
          "sm-task-attachments"
        );


      if (!input) {
        return;
      }


      input.value =
        "";


      input.click();

    }
  );


/* =====================
   ADD FILES
===================== */

document
  .getElementById(
    "sm-task-attachments"
  )
  ?.addEventListener(
    "change",
    event => {

      const newFiles =
        Array.from(
          event.target.files || []
        );


      if (
        newFiles.length === 0
      ) {
        return;
      }


      const combinedFiles =
        [
          ...smTaskAttachmentFiles
        ];


      newFiles.forEach(
        file => {

          const alreadyExists =
            combinedFiles.some(
              existing =>
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );


          if (!alreadyExists) {

            combinedFiles.push(
              file
            );

          }

        }
      );


      if (
        combinedFiles.length >
        SM_TASK_ATTACHMENT_MAX_FILES
      ) {

        alert(
          "Maximum 3 attachments per task."
        );


        event.target.value =
          "";


        return;

      }


      const totalBytes =
        combinedFiles.reduce(
          (
            total,
            file
          ) =>
            total +
            Number(
              file.size || 0
            ),
          0
        );


      if (
        totalBytes >
        SM_TASK_ATTACHMENT_MAX_TOTAL_BYTES
      ) {

        alert(
          "Maximum total attachment size is 10 MB."
        );


        event.target.value =
          "";


        return;

      }


      smTaskAttachmentFiles =
        combinedFiles;


      event.target.value =
        "";


      renderSmTaskAttachments();

    }
  );


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
   MOVE SCHEDULED MAINTENANCE DRAFT TASK

   Moves one Task up or down inside the frontend Draft.

   direction:
   -1 → move up
    1 → move down

   IMPORTANT:
   - Draft only.
   - Does NOT modify source Tasks.
   - Does NOT write anything to the database.
========================================================= */

function moveScheduledMaintenanceDraftTask(
  draftIndex,
  direction
) {

  /* =====================
     NORMALIZE INPUT
  ===================== */

  const index =
    Number(draftIndex);

  const moveDirection =
    Number(direction);


  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= scheduledMaintenanceSetDraft.tasks.length
  ) {
    return;
  }


  if (
    moveDirection !== -1 &&
    moveDirection !== 1
  ) {
    return;
  }


  /* =====================
     TARGET POSITION
  ===================== */

  const targetIndex =
    index + moveDirection;


  if (
    targetIndex < 0 ||
    targetIndex >= scheduledMaintenanceSetDraft.tasks.length
  ) {
    return;
  }


  /* =====================
     SWAP TASKS
  ===================== */

  const currentTask =
    scheduledMaintenanceSetDraft.tasks[
      index
    ];


  scheduledMaintenanceSetDraft.tasks[
    index
  ] =
    scheduledMaintenanceSetDraft.tasks[
      targetIndex
    ];


  scheduledMaintenanceSetDraft.tasks[
    targetIndex
  ] =
    currentTask;


  /* =====================
     REFRESH SORT ORDER

     Keeps explicit sequence numbers
     synchronized with the array order.
  ===================== */

  scheduledMaintenanceSetDraft.tasks.forEach(
    (task, taskIndex) => {

      task.sortOrder =
        taskIndex + 1;

    }
  );


  /* =====================
     RENDER UPDATED ORDER
  ===================== */

  renderScheduledMaintenanceSetDraft();

}

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
   SCHEDULED MAINTENANCE SET — DRAFT STATE

   Frontend-only working copy.

   IMPORTANT:
   - Does NOT modify the source Scheduled Maintenance.
   - Does NOT modify source Tasks.
   - Does NOT create a new SM.
   - Does NOT write anything to the database.
========================================================= */

let scheduledMaintenanceSetDraft = {

  /* =====================
     SOURCE
  ===================== */

  sourceSmId: null,

  sourceSmCode: null,

  sourceSmTitle: null,

  sourceAssetId: null,

  sourceAssetModel: null,


  /* =====================
     TARGET
  ===================== */

  targetAssetId: null,

  targetAssetModel: null,


  /* =====================
     DRAFT TASKS
  ===================== */

  tasks: []

};


/* =========================================================
   RESET SM SET DRAFT
========================================================= */

function resetScheduledMaintenanceSetDraft() {

  /* =====================
     RESET MEMORY
  ===================== */

  scheduledMaintenanceSetDraft = {

    sourceSmId: null,

    sourceSmCode: null,

    sourceSmTitle: null,

    sourceAssetId: null,

    sourceAssetModel: null,

    targetAssetId: null,

    targetAssetModel: null,

    tasks: []

  };


  /* =====================
     RESET DRAFT UI
  ===================== */

  const draftContainer =
    document.getElementById(
      "newSmSetDraft"
    );


  if (draftContainer) {

    draftContainer.style.display =
      "none";

    draftContainer.innerHTML =
      "";

  }

}

/* =========================================================
   FORMAT DRAFT DURATION
========================================================= */

function formatSmDraftDuration(minutes) {

  /* =====================
     NORMALIZE MINUTES
  ===================== */

  const total =
    Number(minutes) || 0;


  const hours =
    Math.floor(
      total / 60
    );


  const mins =
    total % 60;


  /* =====================
     FORMAT
  ===================== */

  if (
    hours > 0 &&
    mins > 0
  ) {

    return `${hours}h ${mins}m`;

  }


  if (hours > 0) {

    return `${hours}h`;

  }


  return `${mins}m`;

}


/* =========================================================
   CALCULATE SM SET DRAFT SUMMARY

   Only included Tasks count toward
   the planned maintenance workload.
========================================================= */

function getScheduledMaintenanceSetDraftSummary() {

  /* =====================
     INCLUDED TASKS
  ===================== */

  const includedTasks =
    scheduledMaintenanceSetDraft.tasks.filter(
      task =>
        task.included === true
    );


  /* =====================
     TOTAL MINUTES
  ===================== */

  const totalMinutes =
    includedTasks.reduce(
      (sum, task) =>
        sum +
        (
          Number(
            task.duration_min
          ) || 0
        ),
      0
    );


  return {

    totalTasks:
      scheduledMaintenanceSetDraft.tasks.length,

    includedTasks:
      includedTasks.length,

    totalMinutes

  };

}


/* =========================================================
   UPDATE SM SET DRAFT SUMMARY
========================================================= */

function refreshScheduledMaintenanceSetDraftSummary() {

  const summaryElement =
    document.getElementById(
      "newSmDraftSummary"
    );


  if (!summaryElement) {
    return;
  }


  /* =====================
     CALCULATE SUMMARY
  ===================== */

  const summary =
    getScheduledMaintenanceSetDraftSummary();


  /* =====================
     RENDER SUMMARY
  ===================== */

  summaryElement.textContent =
    `${summary.includedTasks} / ${summary.totalTasks} Tasks selected · ` +
    `Total Planned Work: ${formatSmDraftDuration(summary.totalMinutes)}`;

}


/* =========================================================
   UPDATE ONE DRAFT TASK DURATION

   Frontend draft only.
========================================================= */

function updateScheduledMaintenanceDraftDuration(
  draftIndex,
  value
) {

  /* =====================
     VALIDATE INDEX
  ===================== */

  const index =
    Number(draftIndex);


  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= scheduledMaintenanceSetDraft.tasks.length
  ) {
    return;
  }


  /* =====================
     VALIDATE DURATION
  ===================== */

  const duration =
    Number(value);


  if (
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    return;
  }


  /* =====================
     UPDATE DRAFT ONLY
  ===================== */

  scheduledMaintenanceSetDraft.tasks[
    index
  ].duration_min =
    Math.round(duration);


  refreshScheduledMaintenanceSetDraftSummary();

}


/* =========================================================
   TOGGLE DRAFT TASK INCLUDE / EXCLUDE
========================================================= */

function toggleScheduledMaintenanceDraftTask(
  draftIndex,
  included
) {

  /* =====================
     VALIDATE INDEX
  ===================== */

  const index =
    Number(draftIndex);


  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= scheduledMaintenanceSetDraft.tasks.length
  ) {
    return;
  }


  /* =====================
     UPDATE DRAFT ONLY
  ===================== */

  scheduledMaintenanceSetDraft.tasks[
    index
  ].included =
    included === true;


  refreshScheduledMaintenanceSetDraftSummary();

}


/* =========================================================
   RENDER SCHEDULED MAINTENANCE SET DRAFT

   Displays the working copy of source SM Tasks.

   Editable now:
   - Include / Exclude
   - Estimated Duration

   Source Tasks remain untouched.
========================================================= */

function renderScheduledMaintenanceSetDraft() {

  const container =
    document.getElementById(
      "newSmSetDraft"
    );


  if (!container) {
    return;
  }


  /* =====================
     OPEN DRAFT AREA
  ===================== */

  container.style.display =
    "block";


  container.replaceChildren();


  /* =====================
     SOURCE HEADER
  ===================== */

  const header =
    document.createElement(
      "div"
    );


  header.style.marginBottom =
    "14px";


  header.innerHTML = `
    <!-- =====================
         DRAFT HEADER
    ===================== -->

    <div
      style="
        font-size: 14px;
        font-weight: 800;
        color: #f1f5f9;
      "
    >
      Maintenance Set Draft
    </div>

    <div
      style="
        margin-top: 4px;
        font-size: 11px;
        color: #94a3b8;
      "
    >
      Based on
      ${scheduledMaintenanceSetDraft.sourceSmCode || "—"}
      ·
      ${scheduledMaintenanceSetDraft.sourceSmTitle || "Scheduled Maintenance"}
    </div>
  `;


  container.appendChild(
    header
  );


  /* =====================
     TASK LIST
  ===================== */

  const taskList =
    document.createElement(
      "div"
    );


  taskList.style.display =
    "flex";

  taskList.style.flexDirection =
    "column";

  taskList.style.gap =
    "8px";


  scheduledMaintenanceSetDraft.tasks.forEach(
    (task, index) => {

      /* =====================
         TASK CARD
      ===================== */

      const card =
        document.createElement(
          "div"
        );


      card.style.boxSizing =
        "border-box";

      card.style.padding =
        "12px";

      card.style.border =
        "1px solid rgba(255,255,255,.10)";

      card.style.borderRadius =
        "8px";

      card.style.background =
        "#181f29";


      /* =====================
        TOP ROW

        Columns:
        - Include checkbox
        - Task information
        - Duration
        - Reorder controls
      ===================== */

      const topRow =
        document.createElement(
          "div"
        );


      topRow.style.display =
        "grid";

      topRow.style.gridTemplateColumns =
        "24px minmax(0, 1fr) 110px 68px";

      topRow.style.gap =
        "10px";

      topRow.style.alignItems =
        "start";


      /* =====================
         INCLUDE CHECKBOX
      ===================== */

      const checkbox =
        document.createElement(
          "input"
        );


      checkbox.type =
        "checkbox";

      checkbox.checked =
        task.included === true;

      checkbox.title =
        "Include this Task in the new Scheduled Maintenance";


      checkbox.addEventListener(
        "change",
        () => {

          /* =====================
             INCLUDE / EXCLUDE
          ===================== */

          toggleScheduledMaintenanceDraftTask(
            index,
            checkbox.checked
          );


          /* =====================
             VISUAL STATE
          ===================== */

          card.style.opacity =
            checkbox.checked
              ? "1"
              : ".48";

        }
      );


      /* =====================
         TASK INFO
      ===================== */

      const info =
        document.createElement(
          "div"
        );


      const title =
        document.createElement(
          "div"
        );


      title.style.fontSize =
        "13px";

      title.style.fontWeight =
        "700";

      title.style.color =
        "#f1f5f9";


      title.textContent =
        `${String(index + 1).padStart(2, "0")} · ` +
        `${task.task || "—"}`;


      const meta =
        document.createElement(
          "div"
        );


      meta.style.marginTop =
        "4px";

      meta.style.fontSize =
        "11px";

      meta.style.color =
        "#94a3b8";


      meta.textContent =
        [
          task.section || null,
          task.unit || null,
          task.impact || null
        ]
          .filter(Boolean)
          .join(" · ") ||
        "No additional classification";


      info.append(
        title,
        meta
      );


      /* =====================
         DURATION EDITOR
      ===================== */

      const durationWrap =
        document.createElement(
          "div"
        );


      durationWrap.style.display =
        "flex";

      durationWrap.style.flexDirection =
        "column";

      durationWrap.style.gap =
        "4px";


      const durationLabel =
        document.createElement(
          "label"
        );


      durationLabel.style.fontSize =
        "10px";

      durationLabel.style.color =
        "#94a3b8";


      durationLabel.textContent =
        "Duration (min)";


      const durationInput =
        document.createElement(
          "input"
        );


      durationInput.type =
        "number";

      durationInput.min =
        "0";

      durationInput.step =
        "1";

      durationInput.value =
        task.duration_min ?? "";


      durationInput.style.boxSizing =
        "border-box";

      durationInput.style.width =
        "100%";


      durationInput.addEventListener(
        "change",
        () => {

          /* =====================
             UPDATE DRAFT DURATION
          ===================== */

          updateScheduledMaintenanceDraftDuration(
            index,
            durationInput.value
          );

        }
      );


      durationWrap.append(
        durationLabel,
        durationInput
      );

      /* =====================
        REORDER CONTROLS

        Changes only the Draft sequence.

        This sequence will later be used
        by the Preview Scheduler.
      ===================== */

      const reorderWrap =
        document.createElement(
          "div"
        );


      reorderWrap.style.display =
        "flex";

      reorderWrap.style.alignItems =
        "center";

      reorderWrap.style.justifyContent =
        "flex-end";

      reorderWrap.style.gap =
        "5px";

      reorderWrap.style.paddingTop =
        "18px";


      /* =====================
        MOVE UP
      ===================== */

      const moveUpButton =
        document.createElement(
          "button"
        );


      moveUpButton.type =
        "button";

      moveUpButton.className =
        "btn-table";

      moveUpButton.textContent =
        "↑";

      moveUpButton.title =
        "Move Task up";


      /* =====================
        FIRST TASK CANNOT
        MOVE FURTHER UP
      ===================== */

      moveUpButton.disabled =
        index === 0;


      moveUpButton.addEventListener(
        "click",
        () => {

          /* =====================
            MOVE UP
          ===================== */

          moveScheduledMaintenanceDraftTask(
            index,
            -1
          );

        }
      );


      /* =====================
        MOVE DOWN
      ===================== */

      const moveDownButton =
        document.createElement(
          "button"
        );


      moveDownButton.type =
        "button";

      moveDownButton.className =
        "btn-table";

      moveDownButton.textContent =
        "↓";

      moveDownButton.title =
        "Move Task down";


      /* =====================
        LAST TASK CANNOT
        MOVE FURTHER DOWN
      ===================== */

      moveDownButton.disabled =
        index ===
        scheduledMaintenanceSetDraft.tasks.length - 1;


      moveDownButton.addEventListener(
        "click",
        () => {

          /* =====================
            MOVE DOWN
          ===================== */

          moveScheduledMaintenanceDraftTask(
            index,
            1
          );

        }
      );


      reorderWrap.append(
        moveUpButton,
        moveDownButton
      );


      /* =====================
        BUILD TOP ROW
      ===================== */

      topRow.append(
        checkbox,
        info,
        durationWrap,
        reorderWrap
      );


      card.appendChild(
        topRow
      );


      taskList.appendChild(
        card
      );

    }
  );


  container.appendChild(
    taskList
  );


  /* =====================
     DRAFT SUMMARY
  ===================== */

  const summary =
    document.createElement(
      "div"
    );


  summary.id =
    "newSmDraftSummary";


  summary.style.marginTop =
    "14px";

  summary.style.padding =
    "12px";

  summary.style.border =
    "1px solid #35506f";

  summary.style.borderRadius =
    "8px";

  summary.style.background =
    "#172233";

  summary.style.color =
    "#cfe1ff";

  summary.style.fontSize =
    "12px";

  summary.style.fontWeight =
    "700";


  container.appendChild(
    summary
  );


  /* =====================
     INITIAL SUMMARY
  ===================== */

  refreshScheduledMaintenanceSetDraftSummary();

}


/* =========================================================
   LOAD PREVIOUS SM TASKS INTO DRAFT

   Uses:
   GET /scheduled-maintenance/:id
   GET /scheduled-maintenance/:id/tasks

   IMPORTANT:
   - Read only.
   - Creates frontend copies.
   - Does NOT reuse mutable source Task objects.
========================================================= */

async function loadPreviousScheduledMaintenanceSetDraft(
  sourceSmId
) {

  const smId =
    Number(
      sourceSmId
    );


  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {
    return;
  }


  const assetSelect =
    document.getElementById(
      "new-sm-asset"
    );


  const loadButton =
    document.getElementById(
      "loadPreviousSmSetBtn"
    );


  const summaryElement =
    document.getElementById(
      "newSmSetSummary"
    );


  /* =====================
     TARGET ASSET
  ===================== */

  const targetAssetId =
    Number(
      assetSelect?.value
    );


  const targetAsset =
    Array.isArray(state.assetsData)
      ? state.assetsData.find(
          asset =>
            Number(asset.id) ===
            targetAssetId
        )
      : null;


  if (!targetAsset) {

    alert(
      "Please select a valid target Asset."
    );

    return;
  }


  /* =====================
     LOADING STATE
  ===================== */

  if (loadButton) {

    loadButton.disabled =
      true;

    loadButton.textContent =
      "Loading...";

  }


  try {

    /* =====================
       LOAD SOURCE SM + TASKS
    ===================== */

    const [
      smResponse,
      tasksResponse
    ] =
      await Promise.all([

        fetch(
          `/scheduled-maintenance/${smId}`
        ),

        fetch(
          `/scheduled-maintenance/${smId}/tasks`
        )

      ]);


    if (
      !smResponse.ok ||
      !tasksResponse.ok
    ) {

      throw new Error(
        "Failed to load Maintenance Set"
      );

    }


    const smResult =
      await smResponse.json();


    const tasksResult =
      await tasksResponse.json();


    const sourceSm =
      smResult.scheduled_maintenance;


    const sourceTasks =
      Array.isArray(
        tasksResult.tasks
      )
        ? tasksResult.tasks
        : [];


    if (!sourceSm) {

      throw new Error(
        "Source Scheduled Maintenance not found"
      );

    }


    /* =====================================================
       MODEL SAFETY CHECK

       Frontend guard.

       The source Asset model MUST match
       the target Asset model.
    ===================================================== */

    const sourceModel =
      String(
        sourceSm.asset_model || ""
      ).trim();


    const targetModel =
      String(
        targetAsset.model || ""
      ).trim();


    if (
      !sourceModel ||
      !targetModel ||
      sourceModel !== targetModel
    ) {

      throw new Error(
        "Source Scheduled Maintenance is not compatible with the selected Asset model"
      );

    }


    /* =====================
       REQUIRE SOURCE TASKS
    ===================== */

    if (sourceTasks.length === 0) {

      resetScheduledMaintenanceSetDraft();


      if (summaryElement) {

        summaryElement.textContent =
          "The selected Scheduled Maintenance has no Tasks.";

      }


      return;

    }

    /* =====================================================
      SOURCE TASK ORDER

      Rebuild the Maintenance Set in the real execution order.

      Rules:
      - Task completed first appears first.
      - Task completed last appears last.
      - Tasks without execution time are placed after
        the executed Tasks.
      - Source data itself is NOT modified.
    ===================================================== */

    const orderedSourceTasks =
      [...sourceTasks].sort(
        (a, b) => {

          /* =====================
            EXECUTION TIMES
          ===================== */

          const timeA =
            a.execution_executed_at
              ? new Date(
                  a.execution_executed_at
                ).getTime()
              : null;


          const timeB =
            b.execution_executed_at
              ? new Date(
                  b.execution_executed_at
                ).getTime()
              : null;


          /* =====================
            BOTH EXECUTED

            Earliest Done first.
          ===================== */

          if (
            timeA !== null &&
            timeB !== null
          ) {

            if (timeA !== timeB) {

              return timeA - timeB;

            }


            /* =====================
              STABLE FALLBACK
            ===================== */

            return (
              Number(a.id) -
              Number(b.id)
            );

          }


          /* =====================
            EXECUTED BEFORE
            NON-EXECUTED
          ===================== */

          if (timeA !== null) {
            return -1;
          }


          if (timeB !== null) {
            return 1;
          }


          /* =====================
            BOTH WITHOUT EXECUTION

            Stable fallback.
          ===================== */

          return (
            Number(a.id) -
            Number(b.id)
          );

        }
      );


    /* =====================================================
       CREATE FRONTEND DRAFT

       Every Task becomes a COPY.

       Source IDs are kept only for traceability.
       They will NOT become the new Task IDs.
    ===================================================== */

    scheduledMaintenanceSetDraft = {

      sourceSmId:
        Number(sourceSm.id),

      sourceSmCode:
        `SM-${String(
          sourceSm.id
        ).padStart(5, "0")}`,

      sourceSmTitle:
        sourceSm.title ||
        "Scheduled Maintenance",

      sourceAssetId:
        Number(sourceSm.asset_id),

      sourceAssetModel:
        sourceModel,

      targetAssetId:
        targetAssetId,

      targetAssetModel:
        targetModel,

      /* =====================
        BUILD DRAFT IN
        EXECUTION ORDER
      ===================== */

      tasks:
        orderedSourceTasks.map(
          (task, index) => ({

            /* =====================
               SOURCE TRACE
            ===================== */

            sourceTaskId:
              Number(task.id),


            /* =====================
               DRAFT CONTROL
            ===================== */

            included:
              true,

            sortOrder:
              index + 1,


            /* =====================
               TASK DEFINITION

               Copies only reusable planning data.
               Does NOT copy execution status/history.
            ===================== */

            task:
              String(
                task.task || ""
              ).trim(),

            section:
              task.section || null,

            unit:
              task.unit || null,

            impact:
              task.impact || "normal",

            duration_min:
              Number(
                task.duration_min
              ) || 0,

            notes:
              task.notes || null

          })
        )

    };


    /* =====================
       RENDER DRAFT
    ===================== */

    renderScheduledMaintenanceSetDraft();


    /* =====================
      SOURCE SUMMARY
    ===================== */

    if (summaryElement) {

      summaryElement.textContent =
        `${scheduledMaintenanceSetDraft.sourceSmCode} loaded from ${sourceModel}. ` +
        `${orderedSourceTasks.length} Tasks copied to Draft.`;

    }


  } catch (err) {

    console.error(
      "LOAD SM SET DRAFT ERROR:",
      err
    );


    resetScheduledMaintenanceSetDraft();


    alert(
      err.message ||
      "Could not load Maintenance Set."
    );

  } finally {

    /* =====================
       RESTORE LOAD BUTTON
    ===================== */

    if (loadButton) {

      loadButton.textContent =
        "Load Set";


      refreshPreviousSmSetSelection();

    }

  }

}

/* =========================================================
   SCHEDULED MAINTENANCE SET PLANNER
   LOAD COMPATIBLE PREVIOUS SM INCIDENTS

   RULES:
   - Target Asset must be selected.
   - Previous SM must belong to an Asset with the SAME model.
   - Uses existing GET /scheduled-maintenance.
   - Read-only operation.
   - Does NOT create or modify any SM or Task.
========================================================= */

async function loadCompatiblePreviousScheduledMaintenance() {

  const assetSelect =
    document.getElementById(
      "new-sm-asset"
    );

  const sourceSelect =
    document.getElementById(
      "new-sm-source-set"
    );

  const summary =
    document.getElementById(
      "newSmSetSummary"
    );

  const loadButton =
    document.getElementById(
      "loadPreviousSmSetBtn"
    );


  /* =====================
     BASIC UI GUARD
  ===================== */

  if (
    !assetSelect ||
    !sourceSelect
  ) {
    return;
  }


  /* =====================
     RESET SOURCE LIST
  ===================== */

  sourceSelect.innerHTML = `
    <option value="">
      Loading compatible maintenance...
    </option>
  `;

  sourceSelect.disabled =
    true;


  if (loadButton) {

    loadButton.disabled =
      true;

  }


  /* =====================
     TARGET ASSET
  ===================== */

  const targetAssetId =
    Number(
      assetSelect.value
    );


  if (
    !Number.isInteger(targetAssetId) ||
    targetAssetId <= 0
  ) {

    sourceSelect.innerHTML = `
      <option value="">
        Select Asset first
      </option>
    `;


    if (summary) {

      summary.textContent =
        "Select an Asset to load compatible previous maintenance sets.";

    }


    return;

  }


  /* =====================
     FIND TARGET ASSET

     Uses existing CMMS Asset state.
  ===================== */

  const targetAsset =
    Array.isArray(state.assetsData)
      ? state.assetsData.find(
          asset =>
            Number(asset.id) ===
            targetAssetId
        )
      : null;


  if (!targetAsset) {

    sourceSelect.innerHTML = `
      <option value="">
        Asset not found
      </option>
    `;


    if (summary) {

      summary.textContent =
        "Could not identify the selected Asset.";

    }


    return;

  }


  /* =====================
     TARGET MODEL
  ===================== */

  const targetModel =
    String(
      targetAsset.model || ""
    ).trim();


  if (!targetModel) {

    sourceSelect.innerHTML = `
      <option value="">
        Asset model unavailable
      </option>
    `;


    if (summary) {

      summary.textContent =
        "The selected Asset has no Model information.";

    }


    return;

  }


  try {

    /* =====================
       LOAD EXISTING SM LIST

       Existing read-only endpoint.
    ===================== */

    const response =
      await fetch(
        "/scheduled-maintenance"
      );


    if (!response.ok) {

      throw new Error(
        "Failed to load Scheduled Maintenance list"
      );

    }


    const data =
      await response.json();


    const scheduledMaintenance =
      Array.isArray(data)
        ? data
        : [];


    /* =====================
       MODEL COMPATIBILITY

       Same model only.

       Example:
       PMC250 → PMC250 only.
    ===================== */

    const compatible =
      scheduledMaintenance.filter(
        sm =>
          String(
            sm.asset_model || ""
          ).trim() === targetModel
      );


    /* =====================
       SORT

       Most recent first.

       Prefer actual close date,
       then scheduled start,
       then ID.
    ===================== */

    compatible.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.actual_closed_at ||
            a.scheduled_start_at ||
            0
          ).getTime();


        const dateB =
          new Date(
            b.actual_closed_at ||
            b.scheduled_start_at ||
            0
          ).getTime();


        if (dateB !== dateA) {
          return dateB - dateA;
        }


        return (
          Number(b.id) -
          Number(a.id)
        );

      }
    );


    /* =====================
       EMPTY RESULT
    ===================== */

    if (compatible.length === 0) {

      sourceSelect.innerHTML = `
        <option value="">
          No previous ${targetModel} maintenance found
        </option>
      `;


      if (summary) {

        summary.textContent =
          `No previous Scheduled Maintenance was found for model ${targetModel}.`;

      }


      return;

    }


    /* =====================
       BUILD SOURCE OPTIONS
    ===================== */

    sourceSelect.innerHTML = `
      <option value="">
        Select previous maintenance...
      </option>
    `;


    compatible.forEach(sm => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        String(sm.id);


      const code =
        `SM-${String(
          sm.id
        ).padStart(5, "0")}`;


      const title =
        sm.title ||
        "Scheduled Maintenance";


      const status =
        String(
          sm.status || ""
        )
          .trim()
          .toUpperCase();


      option.textContent =
        `${code} · ${title} · ${status}`;


      sourceSelect.appendChild(
        option
      );

    });


    sourceSelect.disabled =
      false;


    /* =====================
       SUMMARY
    ===================== */

    if (summary) {

      summary.textContent =
        `${compatible.length} compatible Scheduled Maintenance ` +
        `incident${compatible.length === 1 ? "" : "s"} found for ${targetModel}.`;

    }


  } catch (err) {

    console.error(
      "LOAD COMPATIBLE SM ERROR:",
      err
    );


    sourceSelect.innerHTML = `
      <option value="">
        Could not load maintenance history
      </option>
    `;


    if (summary) {

      summary.textContent =
        "Could not load previous Scheduled Maintenance.";

    }

  }

}


/* =========================================================
   PREVIOUS SM SET SELECTION

   Enables Load Set only after
   a valid source SM has been selected.

   Still read-only.
========================================================= */

function refreshPreviousSmSetSelection() {

  const sourceSelect =
    document.getElementById(
      "new-sm-source-set"
    );

  const loadButton =
    document.getElementById(
      "loadPreviousSmSetBtn"
    );


  if (
    !sourceSelect ||
    !loadButton
  ) {
    return;
  }


  const smId =
    Number(
      sourceSelect.value
    );


  /* =====================
     VALID SOURCE
  ===================== */

  loadButton.disabled =
    !Number.isInteger(smId) ||
    smId <= 0;

}


/* =========================================================
   NEW SCHEDULED MAINTENANCE — CREATION FORM

   Independent from New Breakdown.

   PLANNING MODES
   ---------------------------------------------------------
   1. EMPTY SM
      Existing Scheduled Maintenance creation flow.
      No behavior is changed.

   2. LOAD PREVIOUS SET
      New planning workflow.

      CURRENT IMPLEMENTATION:
      - Loads compatible previous SM incidents.
      - Compatibility is based on Asset Model.
      - Does NOT create an SM.
      - Does NOT create Tasks.
      - Does NOT modify previous SM records.
========================================================= */

async function openNewScheduledMaintenanceModal() {

  let overlay =
    document.getElementById(
      "newScheduledMaintenanceOverlay"
    );


  /* =====================
     CREATE MODAL ONCE
  ===================== */

  if (!overlay) {

    overlay =
      document.createElement(
        "div"
      );

    overlay.id =
      "newScheduledMaintenanceOverlay";

    overlay.className =
      "modal-overlay";

    overlay.style.display =
      "none";

    overlay.style.zIndex =
      "1250";


    overlay.innerHTML = `
      <div
        id="newScheduledMaintenanceModal"
        class="modal"
        style="
          box-sizing: border-box;
          width: min(760px, calc(100vw - 32px));
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          padding: 24px;
          background: #181b22;
          color: #f5f7fa;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 14px;
        "
      >

        <!-- =====================
             HEADER
        ===================== -->

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


        <!-- =================================================
             PLANNING METHOD

             Existing Empty SM remains the default.
        ================================================= -->

        <div class="sm-planning-method">

          <div class="sm-planning-method-title">
            Planning Method
          </div>


          <!-- =====================
               EMPTY SM
               Existing flow
          ===================== -->

          <label class="sm-planning-option">

            <input
              id="new-sm-mode-empty"
              type="radio"
              name="new-sm-planning-mode"
              value="EMPTY"
              checked
            >

            <span class="sm-planning-option-content">

              <span class="sm-planning-option-title">
                Create Empty Scheduled Maintenance
              </span>

              <span class="sm-planning-option-description">
                Create the SM incident now and add Planned Tasks manually.
              </span>

            </span>

          </label>


          <!-- =====================
               LOAD PREVIOUS SET
          ===================== -->

          <label class="sm-planning-option">

            <input
              id="new-sm-mode-set"
              type="radio"
              name="new-sm-planning-mode"
              value="SET"
            >

            <span class="sm-planning-option-content">

              <span class="sm-planning-option-title">
                Load Previous Maintenance Set
              </span>

              <span class="sm-planning-option-description">
                Load Tasks from a previous compatible Scheduled Maintenance,
                edit the set and preview the new schedule before creation.
              </span>

            </span>

          </label>

        </div>


        <!-- =================================================
             EXISTING SM FORM

             Remains available in both modes.
        ================================================= -->

        <div class="restoration-form-grid">

          <div class="field">

            <label for="new-sm-asset">
              Asset *
            </label>

            <select
              id="new-sm-asset"
              disabled
            >

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


          <div
            class="field"
            style="grid-column: 1 / -1;"
          >

            <label for="new-sm-description">
              Description
            </label>

            <textarea
              id="new-sm-description"
              rows="3"
            ></textarea>

          </div>

        </div>


        <!-- =================================================
             LOAD SET PLANNING AREA

             Hidden during existing Empty SM flow.
             Read-only source loading only for now.
        ================================================= -->

        <div
          id="newSmSetPlanningSection"
          style="
            display: none;
            margin-top: 20px;
            padding: 16px;
            border: 1px solid #30425a;
            border-radius: 10px;
            background: #141b24;
          "
        >

          <!-- =====================
               SECTION HEADER
          ===================== -->

          <div
            style="
              display: flex;
              justify-content: space-between;
              gap: 16px;
              align-items: flex-start;
              margin-bottom: 14px;
            "
          >

            <div>

              <div
                style="
                  font-size: 13px;
                  font-weight: 800;
                  color: #dbeafe;
                "
              >
                Maintenance Set
              </div>

              <div
                style="
                  margin-top: 3px;
                  font-size: 11px;
                  color: #94a3b8;
                "
              >
                Previous maintenance is filtered by the selected Asset model.
              </div>

            </div>

            <span
              style="
                padding: 3px 7px;
                border: 1px solid #35506f;
                border-radius: 5px;
                background: #172233;
                color: #9fc5ff;
                font-size: 10px;
                font-weight: 700;
              "
            >
              PLANNER
            </span>

          </div>


          <!-- =====================
               PREVIOUS SM
          ===================== -->

          <div class="field">

            <label for="new-sm-source-set">
              Previous Scheduled Maintenance
            </label>

            <select
              id="new-sm-source-set"
              disabled
            >

              <option value="">
                Select Asset first
              </option>

            </select>

          </div>


          <!-- =====================
               SOURCE SUMMARY
          ===================== -->

          <div
            id="newSmSetSummary"
            style="
              margin-top: 14px;
              padding: 12px;
              border: 1px dashed rgba(255,255,255,.14);
              border-radius: 8px;
              color: #94a3b8;
              font-size: 12px;
            "
          >
            Select an Asset to load compatible previous maintenance sets.
          </div>


          <!-- =====================
              LOAD SET ACTION

              Loads the selected SM Tasks
              into the frontend Draft.
          ===================== -->

          <div
            style="
              display: flex;
              justify-content: flex-end;
              margin-top: 14px;
            "
          >

            <button
              id="loadPreviousSmSetBtn"
              class="btn-table"
              type="button"
              disabled
            >
              Load Set
            </button>

          </div>


          <!-- =================================================
              MAINTENANCE SET DRAFT

              IMPORTANT:
              This block is OUTSIDE the Load Set flex container.

              Populated only after Load Set.

              Frontend-only working copy.
              No database records are created here.
          ================================================= -->

          <div
            id="newSmSetDraft"
            style="
              display: none;
              margin-top: 18px;
              padding-top: 16px;
              border-top: 1px solid rgba(255,255,255,.10);
            "
          >
          </div>

        </div>


        <!-- =================================================
             ACTIONS
        ================================================= -->

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


          <!-- =====================
               EXISTING CREATE BUTTON

               Empty SM flow continues to
               use this exact button.
          ===================== -->

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


    document.body.appendChild(
      overlay
    );


    /* =====================
       CLOSE HANDLERS
    ===================== */

    const closeModal = () => {

      overlay.style.display =
        "none";

    };


    overlay
      .querySelector(
        "#closeNewSmBtn"
      )
      ?.addEventListener(
        "click",
        closeModal
      );


    overlay
      .querySelector(
        "#cancelNewSmBtn"
      )
      ?.addEventListener(
        "click",
        closeModal
      );


    overlay.addEventListener(
      "click",
      event => {

        if (
          event.target === overlay
        ) {

          closeModal();

        }

      }
    );


    /* =====================================================
       PLANNING MODE
    ===================================================== */

    const emptyMode =
      overlay.querySelector(
        "#new-sm-mode-empty"
      );


    const setMode =
      overlay.querySelector(
        "#new-sm-mode-set"
      );


    const setSection =
      overlay.querySelector(
        "#newSmSetPlanningSection"
      );


    const saveButton =
      overlay.querySelector(
        "#saveNewSmBtn"
      );


    const refreshPlanningMode = () => {

      const useSet =
        setMode?.checked === true;


      /* =====================
         SHOW / HIDE SET AREA
      ===================== */

      if (setSection) {

        setSection.style.display =
          useSet
            ? "block"
            : "none";

      }


      /* =====================
         EXISTING EMPTY FLOW

         Existing Create button remains
         active only for Empty mode.

         Set mode is still planning-only.
      ===================== */

      if (saveButton) {

        if (useSet) {

          saveButton.textContent =
            "Preview Set";

          saveButton.disabled =
            true;

          saveButton.title =
            "Load a previous Maintenance Set first.";

        } else {

          saveButton.textContent =
            "Create Scheduled Maintenance";

          saveButton.disabled =
            false;

          saveButton.title =
            "";

        }

      }


      /* =====================
         LOAD COMPATIBLE SOURCES

         Only when Set mode is active.
      ===================== */

      if (useSet) {

        loadCompatiblePreviousScheduledMaintenance();

      }

    };


    emptyMode?.addEventListener(
      "change",
      refreshPlanningMode
    );


    setMode?.addEventListener(
      "change",
      refreshPlanningMode
    );


    /* =====================================================
       SET PLANNER — ASSET CHANGE
    ===================================================== */

    const assetSelector =
      overlay.querySelector(
        "#new-sm-asset"
      );


    const previousSmSelector =
      overlay.querySelector(
        "#new-sm-source-set"
      );


    /* =====================================================
      SET PLANNER — ASSET CHANGE

      IMPORTANT:
      Changing target Asset invalidates any previously
      loaded Maintenance Set Draft.

      Therefore:
      - Clear the current Draft immediately.
      - Clear previous source selection.
      - Reload only compatible SMs for the new Asset model.

      No database write occurs here.
    ===================================================== */

    assetSelector?.addEventListener(
      "change",
      async () => {

        /* =====================
          CLEAR EXISTING DRAFT

          Prevents accidental use of Tasks
          loaded for a previous Asset.
        ===================== */

        resetScheduledMaintenanceSetDraft();


        /* =====================
          RESET SOURCE SELECTION
        ===================== */

        const previousSmSelector =
          document.getElementById(
            "new-sm-source-set"
          );


        if (previousSmSelector) {

          previousSmSelector.disabled =
            true;

          previousSmSelector.innerHTML = `
            <option value="">
              Loading compatible maintenance...
            </option>
          `;

        }


        /* =====================
          RESET LOAD BUTTON
        ===================== */

        const loadSetButton =
          document.getElementById(
            "loadPreviousSmSetBtn"
          );


        if (loadSetButton) {

          loadSetButton.disabled =
            true;

        }


        /* =====================
          ONLY SET MODE

          Existing Empty SM flow remains
          completely unaffected.
        ===================== */

        if (
          setMode?.checked === true
        ) {

          await loadCompatiblePreviousScheduledMaintenance();

        }

      }
    );


/* =====================================================
   PREVIOUS SM SOURCE CHANGE

   Changing source SM invalidates
   the currently loaded Draft.
===================================================== */

previousSmSelector?.addEventListener(
  "change",
  () => {

    /* =====================
       CLEAR OLD DRAFT
    ===================== */

    resetScheduledMaintenanceSetDraft();


    /* =====================
       REFRESH LOAD BUTTON
    ===================== */

    refreshPreviousSmSetSelection();

  }
);


    /* =====================================================
      LOAD PREVIOUS MAINTENANCE SET

      Loads source Tasks into a frontend-only Draft.

      No database write occurs here.
    ===================================================== */

    overlay
      .querySelector(
        "#loadPreviousSmSetBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          /* =====================
            SOURCE SM
          ===================== */

          const sourceId =
            Number(
              previousSmSelector?.value
            );


          if (
            !Number.isInteger(sourceId) ||
            sourceId <= 0
          ) {
            return;
          }


          /* =====================
            LOAD DRAFT
          ===================== */

          await loadPreviousScheduledMaintenanceSetDraft(
            sourceId
          );

        }
      );

    /* =====================
       INITIAL MODE
    ===================== */

    refreshPlanningMode();

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

    const field =
      document.getElementById(id);


    if (field) {

      field.value =
        "";

    }

  });


  /* =====================
     RESET PLANNING MODE

     Existing Empty SM remains
     default every time.
  ===================== */

  const emptyMode =
    document.getElementById(
      "new-sm-mode-empty"
    );


  const setMode =
    document.getElementById(
      "new-sm-mode-set"
    );


  const setSection =
    document.getElementById(
      "newSmSetPlanningSection"
    );


  const saveButton =
    document.getElementById(
      "saveNewSmBtn"
    );


  const sourceSelect =
    document.getElementById(
      "new-sm-source-set"
    );


  const summary =
    document.getElementById(
      "newSmSetSummary"
    );


  const loadButton =
    document.getElementById(
      "loadPreviousSmSetBtn"
    );


  if (emptyMode) {

    emptyMode.checked =
      true;

  }


  if (setMode) {

    setMode.checked =
      false;

  }


  if (setSection) {

    setSection.style.display =
      "none";

  }


  if (saveButton) {

    saveButton.disabled =
      false;

    saveButton.textContent =
      "Create Scheduled Maintenance";

    saveButton.title =
      "";

  }


  if (sourceSelect) {

    sourceSelect.disabled =
      true;

    sourceSelect.innerHTML = `
      <option value="">
        Select Asset first
      </option>
    `;

  }


  if (summary) {

    summary.textContent =
      "Select an Asset to load compatible previous maintenance sets.";

  }


  if (loadButton) {

    loadButton.disabled =
      true;

  }


  /* =====================
     LOAD ASSETS

     Uses existing CMMS asset data.
  ===================== */

  const assetSelect =
    document.getElementById(
      "new-sm-asset"
    );


  if (assetSelect) {

    assetSelect.disabled =
      true;

  }


  try {

    if (
      !Array.isArray(
        state.assetsData
      ) ||
      state.assetsData.length === 0
    ) {

      await loadAssets();

    }


    populateScheduledMaintenanceAssetDropdown();


    if (assetSelect) {

      assetSelect.value =
        "";

    }


  } catch (err) {

    console.error(
      "SM ASSET LOADING ERROR:",
      err
    );


    alert(
      "Could not load Assets. Please try again."
    );


    return;

  }


  /* =====================
     SHOW MODAL
  ===================== */

  overlay.style.display =
    "flex";


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
   COMPLETED SM TASK — ATTACHMENTS

   Rules:
   - Maximum 3 files
   - Maximum 10 MB total
   - JPG / JPEG / PNG / WEBP / PDF
========================================================= */

const COMPLETED_SM_ATTACHMENT_MAX_FILES =
  3;


const COMPLETED_SM_ATTACHMENT_MAX_TOTAL_BYTES =
  8 * 1024 * 1024;


let completedSmTaskAttachmentFiles =
  [];


/* =====================
   RESET
===================== */

function resetCompletedSmTaskAttachments() {

  completedSmTaskAttachmentFiles =
    [];


  const input =
    document.getElementById(
      "completed-sm-attachments"
    );


  const summary =
    document.getElementById(
      "completed-sm-attachments-summary"
    );


  const list =
    document.getElementById(
      "completed-sm-attachments-list"
    );


  if (input) {

    input.value =
      "";

  }


  if (summary) {

    summary.textContent =
      "No files selected";

  }


  if (list) {

    list.innerHTML =
      "";

  }

}


/* =====================
   RENDER
===================== */

function renderCompletedSmTaskAttachments() {

  const summary =
    document.getElementById(
      "completed-sm-attachments-summary"
    );


  const list =
    document.getElementById(
      "completed-sm-attachments-list"
    );


  if (
    !summary ||
    !list
  ) {
    return;
  }


  list.innerHTML =
    "";


  if (
    completedSmTaskAttachmentFiles.length ===
    0
  ) {

    summary.textContent =
      "No files selected";

    return;

  }


  const totalBytes =
    completedSmTaskAttachmentFiles.reduce(
      (
        total,
        file
      ) =>
        total +
        Number(
          file.size || 0
        ),
      0
    );


  summary.textContent =
    `${completedSmTaskAttachmentFiles.length} file${
      completedSmTaskAttachmentFiles.length === 1
        ? ""
        : "s"
    } · ${formatAttachmentSize(
      totalBytes
    )}`;


  completedSmTaskAttachmentFiles.forEach(
    (
      file,
      index
    ) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "task-attachment-chip";


      /* =====================
         PREVIEW
      ===================== */

      const preview =
        document.createElement(
          "div"
        );


      preview.className =
        "task-attachment-chip-preview";


      if (
        String(
          file.type || ""
        ).startsWith(
          "image/"
        )
      ) {

        const img =
          document.createElement(
            "img"
          );


        const objectUrl =
          URL.createObjectURL(
            file
          );


        img.src =
          objectUrl;


        img.alt =
          file.name;


        img.className =
          "task-attachment-chip-thumb";


        img.addEventListener(
          "load",
          () => {

            URL.revokeObjectURL(
              objectUrl
            );

          },
          {
            once: true
          }
        );


        preview.appendChild(
          img
        );

      } else {

        const pdf =
          document.createElement(
            "span"
          );


        pdf.className =
          "task-attachment-chip-pdf";


        pdf.textContent =
          "PDF";


        preview.appendChild(
          pdf
        );

      }


      /* =====================
         FILE INFO
      ===================== */

      const info =
        document.createElement(
          "div"
        );


      info.className =
        "task-attachment-chip-info";


      const name =
        document.createElement(
          "div"
        );


      name.className =
        "task-attachment-chip-name";


      name.textContent =
        file.name;


      name.title =
        file.name;


      const size =
        document.createElement(
          "div"
        );


      size.className =
        "task-attachment-chip-size";


      size.textContent =
        formatAttachmentSize(
          file.size
        );


      info.appendChild(
        name
      );


      info.appendChild(
        size
      );


      /* =====================
         REMOVE
      ===================== */

      const removeBtn =
        document.createElement(
          "button"
        );


      removeBtn.type =
        "button";


      removeBtn.className =
        "task-attachment-remove-btn";


      removeBtn.textContent =
        "×";


      removeBtn.title =
        "Remove attachment";


      removeBtn.addEventListener(
        "click",
        () => {

          completedSmTaskAttachmentFiles.splice(
            index,
            1
          );


          renderCompletedSmTaskAttachments();

        }
      );


      item.appendChild(
        preview
      );


      item.appendChild(
        info
      );


      item.appendChild(
        removeBtn
      );


      list.appendChild(
        item
      );

    }
  );

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
    document.createElement(
      "div"
    );


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

      <!-- =====================
           HEADER
      ===================== -->

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


      <!-- =====================
           ASSET
      ===================== -->

      <div
        class="addtask-block"
        style="margin-top:20px;"
      >

        <label>
          Asset
        </label>

        <input
          id="completed-sm-asset"
          type="text"
          disabled
          style="width:100%;"
        />

      </div>


      <!-- =====================
           SECTION / UNIT
      ===================== -->

      <div
        class="addtask-block addtask-grid"
      >

        <div class="field">

          <label>
            Section
          </label>

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

          <label>
            Unit
          </label>

          <select
            id="completed-sm-unit"
            style="width:100%;"
            disabled
          >

            <option value="">
              Select Unit
            </option>

          </select>

          <input
            id="completed-sm-unit-input"
            type="text"
            placeholder="Enter new unit"
            style="
              width:100%;
              display:none;
              margin-top:10px;
            "
          />

        </div>

      </div>


      <!-- =====================
           TASK
      ===================== -->

      <div class="addtask-block">

        <label>
          Maintenance Task *
        </label>

        <input
          id="completed-sm-task"
          type="text"
          placeholder="Describe the completed maintenance task"
          style="width:100%;"
        />

      </div>


      <!-- =====================
           IMPACT / TECHNICIAN
      ===================== -->

      <div
        class="addtask-block addtask-grid"
      >

        <div class="field">

          <label>
            Impact
          </label>

          <select
            id="completed-sm-impact"
            style="width:100%;"
          >

            <option
              value="normal"
              selected
            >
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

          <label>
            Technician *
          </label>

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


      <!-- =====================
           COMPLETION / DURATION
      ===================== -->

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


      <!-- =====================
           DUE DATE
      ===================== -->

      <div class="addtask-block">

        <label>
          Due Date
        </label>


        <div
          class="completed-sm-due-options"
        >

          <label
            class="completed-sm-radio"
          >

            <input
              id="completed-sm-due-same"
              type="radio"
              name="completed-sm-due-mode"
              value="same"
              checked
            />

            <span>
              Same as Actual Completion
            </span>

          </label>


          <label
            class="completed-sm-radio"
          >

            <input
              id="completed-sm-due-custom"
              type="radio"
              name="completed-sm-due-mode"
              value="custom"
            />

            <span>
              Specify Due Date
            </span>

          </label>

        </div>


        <div
          id="completed-sm-due-custom-wrap"
          style="
            display:none;
            margin-top:10px;
          "
        >

          <input
            id="completed-sm-due-date"
            type="datetime-local"
            style="width:100%;"
          />

        </div>


        <small class="field-hint">
          Used for Schedule Delivery reporting
        </small>

      </div>


      <!-- =====================
           NOTES
      ===================== -->

      <div class="addtask-block">

        <label>
          Notes
        </label>

        <textarea
          id="completed-sm-notes"
          rows="3"
          style="width:100%;"
          placeholder="Optional notes"
        ></textarea>

      </div>


      <!-- =====================
           ATTACHMENTS
      ===================== -->

      <div class="addtask-block">

        <label>
          Attachments
        </label>


        <input
          id="completed-sm-attachments"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          multiple
          hidden
        />


        <button
          id="completed-sm-attachments-btn"
          class="btn-table task-attachment-select-btn"
          type="button"
        >
          📎 Add Photo or PDF
        </button>


        <div
          id="completed-sm-attachments-summary"
          class="task-attachments-summary"
        >
          No files selected
        </div>


        <div
          id="completed-sm-attachments-list"
          class="task-attachment-list"
        ></div>


        <small class="field-hint">
          Optional · Up to 3 files · Max 8 MB total · JPG, PNG, WEBP or PDF
        </small>

      </div>


      <!-- =====================
           ACTIONS
      ===================== -->

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


  /* =====================
     DUE DATE MODE
  ===================== */

  const dueSame =
    document.getElementById(
      "completed-sm-due-same"
    );


  const dueCustom =
    document.getElementById(
      "completed-sm-due-custom"
    );


  const dueCustomWrap =
    document.getElementById(
      "completed-sm-due-custom-wrap"
    );


  const dueDateInput =
    document.getElementById(
      "completed-sm-due-date"
    );


  function refreshCompletedSmDueMode() {

    const useCustom =
      dueCustom?.checked ===
      true;


    if (dueCustomWrap) {

      dueCustomWrap.style.display =
        useCustom
          ? ""
          : "none";

    }


    if (
      !useCustom &&
      dueDateInput
    ) {

      dueDateInput.value =
        "";

    }

  }


  dueSame?.addEventListener(
    "change",
    refreshCompletedSmDueMode
  );


  dueCustom?.addEventListener(
    "change",
    refreshCompletedSmDueMode
  );


  refreshCompletedSmDueMode();


  /* =====================
     ATTACHMENT PICKER
  ===================== */

  const attachmentInput =
    document.getElementById(
      "completed-sm-attachments"
    );


  const attachmentBtn =
    document.getElementById(
      "completed-sm-attachments-btn"
    );


  attachmentBtn?.addEventListener(
    "click",
    () => {

      if (!attachmentInput) {
        return;
      }


      attachmentInput.value =
        "";


      attachmentInput.click();

    }
  );


  /* =====================
     ATTACHMENT SELECTION
  ===================== */

  attachmentInput?.addEventListener(
    "change",
    event => {

      const newFiles =
        Array.from(
          event.target.files || []
        );


      if (
        newFiles.length === 0
      ) {
        return;
      }


      const combinedFiles =
        [
          ...completedSmTaskAttachmentFiles
        ];


      newFiles.forEach(
        file => {

          const alreadyExists =
            combinedFiles.some(
              existing =>
                existing.name ===
                  file.name &&
                existing.size ===
                  file.size &&
                existing.lastModified ===
                  file.lastModified
            );


          if (!alreadyExists) {

            combinedFiles.push(
              file
            );

          }

        }
      );


      /* =====================
         MAX FILE COUNT
      ===================== */

      if (
        combinedFiles.length >
        COMPLETED_SM_ATTACHMENT_MAX_FILES
      ) {

        alert(
          "Maximum 3 attachments per task."
        );


        event.target.value =
          "";


        return;

      }


      /* =====================
         MAX TOTAL SIZE
      ===================== */

      const totalBytes =
        combinedFiles.reduce(
          (
            total,
            file
          ) =>
            total +
            Number(
              file.size || 0
            ),
          0
        );


      if (
        totalBytes >
        COMPLETED_SM_ATTACHMENT_MAX_TOTAL_BYTES
      ) {

        alert(
          "Maximum total attachment size is 10 MB."
        );


        event.target.value =
          "";


        return;

      }


      completedSmTaskAttachmentFiles =
        combinedFiles;


      event.target.value =
        "";


      renderCompletedSmTaskAttachments();

    }
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


  /* =====================
     ENABLE / DISABLE
  ===================== */

  select.disabled =
    sections.length === 0;

}

/* =========================================================
   POPULATE UNITS

   Uses:
   SAME ASSET + SELECTED SECTION

   Same behavior as Add Maintenance Task:
   ➕ New unit -> show manual input
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


  const unitInput =
    document.getElementById(
      "completed-sm-unit-input"
    );


  if (
    !sm ||
    !sectionSelect ||
    !unitSelect ||
    !unitInput
  ) {
    return;
  }


  unitSelect.replaceChildren(
    new Option(
      "Select Unit",
      ""
    )
  );

  unitSelect.disabled = true;
 
  unitSelect.style.display = "none";

  unitInput.style.display = "none";

  unitInput.value = "";


  const section =
    String(
      sectionSelect.value || ""
    ).trim();


  if (!section) {
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

          Number(task.asset_id) === assetId &&

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


  /* =====================
     NO EXISTING UNITS

     Open manual input
     directly
  ===================== */

  if (units.length === 0) {

    unitInput.style.display = "";

    return;
  }


  /* =====================
     EXISTING UNITS
  ===================== */

  units.forEach(unit => {

    unitSelect.add(
      new Option(
        unit,
        unit
      )
    );

  });


unitSelect.add(
  new Option(
    "➕ New unit",
    "__new__"
  )
);


unitSelect.disabled = false;

unitSelect.style.display = "";


  /* =====================
     NEW UNIT SELECTION
  ===================== */

  unitSelect.onchange = function () {

    if (
      this.value === "__new__"
    ) {

      unitInput.style.display = "";

      unitInput.value = "";

      unitInput.focus();

    } else {

      unitInput.style.display = "none";

      unitInput.value = "";

    }

  };

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
    RESET ATTACHMENTS
  ===================== */

  resetCompletedSmTaskAttachments();


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


  const unitSelect =
    document.getElementById(
      "completed-sm-unit"
    );


  const unitInput =
    document.getElementById(
      "completed-sm-unit-input"
    );


  const unit =
    unitSelect?.value === "__new__" ||
    unitSelect?.style.display === "none"

      ? String(
          unitInput?.value || ""
        ).trim()

      : String(
          unitSelect?.value || ""
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


  const dueMode =
    document.querySelector(
      'input[name="completed-sm-due-mode"]:checked'
    )?.value || "same";


  const customDueValue =
    document.getElementById(
      "completed-sm-due-date"
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
     RESOLVE / VALIDATE DUE DATE
  ===================== */

  let dueAt =
    executedAt;


  if (dueMode === "custom") {

    if (!customDueValue) {

      alert(
        "Please specify Due Date."
      );

      document.getElementById(
        "completed-sm-due-date"
      )?.focus();

      return;
    }


    dueAt =
      new Date(
        customDueValue
      );


    if (
      Number.isNaN(
        dueAt.getTime()
      )
    ) {

      alert(
        "Invalid Due Date."
      );

      return;
    }

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

    due_at:
      dueAt.toISOString(),

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


    /* =====================
       UPLOAD ATTACHMENTS
    ===================== */

    if (
      completedSmTaskAttachmentFiles.length > 0
    ) {

      try {

        const formData =
          new FormData();


        completedSmTaskAttachmentFiles.forEach(
          file => {

            formData.append(
              "files",
              file
            );

          }
        );


        const uploadedById =
          localStorage.getItem(
            TECHNICIAN_ID_STORAGE_KEY
          );


        if (
          uploadedById
        ) {

          formData.append(
            "uploaded_by_id",
            uploadedById
          );

        }


        const attachmentResponse =
          await fetch(
            `/attachments/TASK/${result.id}`,
            {
              method: "POST",
              body: formData
            }
          );


        const attachmentResult =
          await attachmentResponse
            .json()
            .catch(() => ({}));


        if (
          !attachmentResponse.ok
        ) {

          throw new Error(
            attachmentResult?.error ||
            "Attachment upload failed."
          );

        }

      } catch (attachmentErr) {

        console.error(
          "COMPLETED SM TASK ATTACHMENT UPLOAD ERROR:",
          attachmentErr
        );


        alert(
          "Completed Task was saved successfully, but attachment upload failed. Do not save the task again."
        );

      }

    }


    /* =====================
       RESET ATTACHMENTS
    ===================== */

    resetCompletedSmTaskAttachments();


    /* =====================
       CLOSE MODAL
    ===================== */

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
   DELETE SCHEDULED MAINTENANCE — ADMIN ONLY

   Permanent historical deletion.

   Deletes through backend:
   - Scheduled Maintenance
   - ALL linked Tasks
   - ALL linked Task Executions
========================================================= */

async function deleteScheduledMaintenancePermanently(
  smId
) {

  const id =
    Number(smId);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }


  const currentRole =
    String(
      localStorage.getItem(
        "cmmsRole"
      ) || ""
    ).toLowerCase();


  if (currentRole !== "admin") {

    alert(
      "Administrator access is required."
    );

    return;
  }


  const smCode =
    `SM-${String(id).padStart(5, "0")}`;


  /* =====================
     FIRST WARNING
  ===================== */

  const warningAccepted =
    window.confirm(
      `${smCode}\n\n` +

      `WARNING — HISTORICAL DATA WILL BE PERMANENTLY CHANGED.\n\n` +

      `This action will permanently delete:\n` +
      `• The Scheduled Maintenance record\n` +
      `• All open linked Tasks\n` +
      `• All completed linked Tasks\n` +
      `• All linked execution history\n\n` +

      `Use this function ONLY for an incorrect or accidental Scheduled Maintenance entry.\n\n` +

      `This action cannot be undone.\n\n` +

      `Continue?`
    );


  if (!warningAccepted) {
    return;
  }


  /* =====================
     FINAL CONFIRMATION
  ===================== */

  const finalAccepted =
    window.confirm(
      `FINAL CONFIRMATION\n\n` +

      `Permanently delete ${smCode} and all its linked historical data?`
    );


  if (!finalAccepted) {
    return;
  }


  try {

    const response =
      await fetch(
        `/scheduled-maintenance/${id}`,
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",

            "x-cmms-role":
              currentRole
          }
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        result?.error ||
        "Scheduled Maintenance could not be deleted."
      );

    }


    const deletedTasks =
      Number(
        result?.deleted?.tasks || 0
      );


    const deletedExecutions =
      Number(
        result?.deleted?.executions || 0
      );


    alert(
      `${smCode} permanently deleted.\n\n` +

      `Linked Tasks deleted: ${deletedTasks}\n` +
      `Executions deleted: ${deletedExecutions}`
    );


    window.location.reload();


  } catch (err) {

    console.error(
      "DELETE SCHEDULED MAINTENANCE ERROR:",
      err
    );


    alert(
      err.message ||
      "Scheduled Maintenance could not be deleted."
    );

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

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".sm-delete-btn"
      );


    if (!button) {
      return;
    }


    const smId =
      Number(
        button.dataset.smId
      );


    deleteScheduledMaintenancePermanently(
      smId
    );

  }
);


/* =========================================================
   PRINT SCHEDULED MAINTENANCE DETAIL
========================================================= */

async function printScheduledMaintenanceDetail() {

  if (
    !currentScheduledMaintenance ||
    !currentScheduledMaintenance.id
  ) {

    alert(
      "Scheduled Maintenance not loaded."
    );

    return;

  }


  const smId =
    Number(
      currentScheduledMaintenance.id
    );


  try {

    /* =====================
       FRESH DATA
    ===================== */

    const [
      smResponse,
      tasksResponse
    ] =
      await Promise.all([

        fetch(
          `/scheduled-maintenance/${smId}`
        ),

        fetch(
          `/scheduled-maintenance/${smId}/tasks`
        )

      ]);


    if (
      !smResponse.ok ||
      !tasksResponse.ok
    ) {

      throw new Error(
        "Failed to load Scheduled Maintenance print data"
      );

    }

    const smResult =
      await smResponse.json();


    const tasksResult =
      await tasksResponse.json();


    const sm =
      smResult.scheduled_maintenance;


    const tasks =
      Array.isArray(
        tasksResult.tasks
      )
        ? tasksResult.tasks
        : [];


    if (!sm) {

      throw new Error(
        "Scheduled Maintenance not found"
      );

    }

    /* =====================
       HELPERS
    ===================== */

    const escapeHtml =
      value =>
        String(
          value ?? ""
        )
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");


    const formatDate =
      value => {

        if (!value) {
          return "-";
        }


        const date =
          new Date(value);


        if (
          Number.isNaN(
            date.getTime()
          )
        ) {

          return "-";

        }

        return date.toLocaleString(
          "en-GB"
        );

      };

    const formatMinutes =
      minutes => {

        const total =
          Number(minutes) || 0;


        const hours =
          Math.floor(
            total / 60
          );


        const mins =
          total % 60;


        if (
          hours > 0 &&
          mins > 0
        ) {

          return `${hours} h ${mins} min`;

        }


        if (hours > 0) {

          return `${hours} h`;

        }

        return `${mins} min`;

      };


    /* =====================
       HEADER DATA
    ===================== */

    const code =
      `SM-${String(
        sm.id || ""
      ).padStart(5, "0")}`;


    const status =
      String(
        sm.status || "-"
      ).toUpperCase();


    const scheduledStart =
      formatDate(
        sm.scheduled_start_at
      );


    const scheduledEnd =
      formatDate(
        sm.scheduled_end_at
      );


    const actualStart =
      formatDate(
        sm.actual_started_at
      );


    const actualCompletion =
      formatDate(
        sm.actual_closed_at
      );


    /* =====================
       TOTAL ACTUAL WORK
    ===================== */

    const completedTasks =
      tasks.filter(task =>
        String(
          task.status || ""
        )
          .trim()
          .toUpperCase() === "DONE"
      );


    const totalActualMinutes =
      completedTasks.reduce(
        (sum, task) =>
          sum +
          (
            Number(
              task.actual_duration_min
            ) || 0
          ),
        0
      );


    /* =====================
       TASK ROWS
    ===================== */

    const taskRows =
      tasks.length

        ? tasks
            .map(task => {

              const taskStatus =
                String(
                  task.status || "-"
                ).toUpperCase();


              const isDone =
                taskStatus === "DONE";

              const duration =
                isDone
                  ? (
                      task.actual_duration_min != null
                        ? formatMinutes(
                            task.actual_duration_min
                          )
                        : "-"
                    )
                  : (
                      task.duration_min != null
                        ? `Est. ${formatMinutes(
                            task.duration_min
                          )}`
                        : "-"
                    );

              const due =
                task.due_date
                  ? formatDate(
                      task.due_date
                    )
                  : "-";


              return `

                <tr>

                  <td>
                    #${escapeHtml(
                      task.id ?? ""
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      task.task || "-"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      taskStatus
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      task.section || "-"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      due
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      duration
                    )}
                  </td>

                </tr>

              `;

            })
            .join("")

        : `

            <tr>

              <td
                colspan="6"
                class="empty"
              >
                No maintenance tasks recorded.
              </td>

            </tr>

          `;


    const printedAt =
      new Date()
        .toLocaleString(
          "en-GB"
        );


    /* =====================
       PRINT FRAME
    ===================== */

    const printFrame =
      document.createElement(
        "iframe"
      );


    printFrame.style.position =
      "fixed";

    printFrame.style.right =
      "0";

    printFrame.style.bottom =
      "0";

    printFrame.style.width =
      "1px";

    printFrame.style.height =
      "1px";

    printFrame.style.border =
      "0";

    printFrame.style.opacity =
      "0";

    printFrame.style.pointerEvents =
      "none";


    document.body.appendChild(
      printFrame
    );


    const printDocument =
      printFrame.contentDocument ||
      printFrame.contentWindow.document;


    printDocument.write(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>
  ${escapeHtml(code)} - Scheduled Maintenance Report
</title>

<style>

@page {
  size: A4 portrait;
  margin: 8mm 10mm;
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

.report {
  width: 100%;
}


/* =====================
   HEADER
===================== */

.report-header {
  display: flex;

  justify-content: space-between;
  align-items: flex-start;

  padding-bottom: 8px;
  margin-bottom: 10px;

  border-bottom: 2px solid #d6dde8;
}

.brand {
  font-size: 21px;
  font-weight: 800;

  color: #17233c;
}

.brand span {
  color: #2588e8;
}

.brand-sub {
  margin-top: 2px;

  font-size: 7px;
  font-weight: 700;

  letter-spacing: .7px;

  color: #65738a;
}

.report-meta {
  text-align: right;

  font-size: 8px;
  line-height: 1.4;

  color: #59677d;
}

.report-meta strong {
  display: block;

  margin-bottom: 1px;

  font-size: 11px;

  color: #21304c;
}


/* =====================
   SM HEADER
===================== */

.sm-heading {
  display: flex;
  align-items: center;

  gap: 9px;

  margin-bottom: 2px;
}

.sm-code {
  font-size: 19px;
  font-weight: 800;
}

.status {
  display: inline-flex;
  align-items: center;

  padding: 3px 12px;

  border-radius: 20px;

  font-size: 8px;
  font-weight: 700;

  color: #ffffff;

  background:
    ${
      status === "CLOSED"
        ? "#169c55"
        : status === "IN_PROGRESS"
          ? "#2588e8"
          : "#d99b16"
    };
}

.asset-line {
  margin-bottom: 9px;

  font-size: 12px;
  font-weight: 600;

  color: #28354c;
}


/* =====================
   GRID
===================== */

.grid {
  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 6px;

  margin-bottom: 7px;
}

.card {
  padding: 7px 8px;

  border: 1px solid #d5dde8;
  border-radius: 5px;

  background: #fbfcfe;

  break-inside: avoid;
}

.span-4 {
  grid-column: span 4;
}

.label {
  margin-bottom: 3px;

  font-size: 7px;
  font-weight: 700;

  text-transform: uppercase;

  color: #63728b;
}

.value {
  font-size: 10px;
  font-weight: 600;

  line-height: 1.3;

  overflow-wrap: anywhere;
}

.value-large {
  font-size: 11px;
  font-weight: 700;
}


/* =====================
   SUMMARY
===================== */

.summary {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 6px;

  margin-bottom: 8px;
}


/* =====================
   SECTION
===================== */

.section-title {
  margin: 9px 0 5px 0;

  padding-bottom: 4px;

  border-bottom: 1px solid #d8e0ea;

  font-size: 10px;
  font-weight: 800;

  text-transform: uppercase;

  color: #263651;
}


/* =====================
   TABLE
===================== */

table {
  width: 100%;

  border-collapse: collapse;

  font-size: 8px;

  break-inside: auto;
}

thead {
  display: table-header-group;
}

tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

th {
  padding: 5px 6px;

  text-align: left;

  background: #eef2f7;

  border: 1px solid #d6dee9;

  color: #34425a;
}

td {
  padding: 5px 6px;

  border: 1px solid #dfe5ed;

  vertical-align: top;
}

.empty {
  text-align: center;

  color: #748197;
}


/* =====================
   FOOTER
===================== */

.footer {
  display: flex;

  justify-content: space-between;

  margin-top: 10px;
  padding-top: 5px;

  border-top: 1px solid #cbd4df;

  font-size: 7px;

  color: #67758a;
}


@media print {

  body {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .report-header,
  .sm-heading,
  .card,
  .section-title {
    break-inside: avoid;
    page-break-inside: avoid;
  }

}

</style>

</head>


<body>

<div class="report">


  <!-- HEADER -->

  <div class="report-header">

    <div>

      <div class="brand">
        ASTIR <span>CMMS</span>
      </div>

      <div class="brand-sub">
        MAINTENANCE MANAGEMENT SYSTEM
      </div>

    </div>


    <div class="report-meta">

      <strong>
        SCHEDULED MAINTENANCE REPORT
      </strong>

      Maintenance Detail<br>

      Printed:
      ${escapeHtml(
        printedAt
      )}

    </div>

  </div>


  <!-- SM HEADER -->

  <div class="sm-heading">

    <div class="sm-code">
      ${escapeHtml(
        code
      )}
    </div>

    <div class="status">
      ${escapeHtml(
        status
      )}
    </div>

  </div>


  <div class="asset-line">

    ${escapeHtml(
      sm.asset_model || "-"
    )}

    • S/N

    ${escapeHtml(
      sm.asset_serial || "-"
    )}

    •

    ${escapeHtml(
      sm.line_name || "-"
    )}

  </div>


  <!-- TITLE / DESCRIPTION -->

  <div class="grid">

    <div class="card span-4">

      <div class="label">
        Maintenance Title
      </div>

      <div class="value value-large">
        ${escapeHtml(
          sm.title || "-"
        )}
      </div>


      <div
        class="label"
        style="margin-top:10px;"
      >
        Description
      </div>

      <div class="value">
        ${escapeHtml(
          sm.description || "-"
        )}
      </div>

    </div>

  </div>


  <!-- TIMING -->

  <div class="grid">

    <div class="card">

      <div class="label">
        Scheduled Start
      </div>

      <div class="value">
        ${escapeHtml(
          scheduledStart
        )}
      </div>

    </div>


    <div class="card">

      <div class="label">
        Scheduled End
      </div>

      <div class="value">
        ${escapeHtml(
          scheduledEnd
        )}
      </div>

    </div>


    <div class="card">

      <div class="label">
        Actual Start
      </div>

      <div class="value">
        ${escapeHtml(
          actualStart
        )}
      </div>

    </div>


    <div class="card">

      <div class="label">
        Actual Completion
      </div>

      <div class="value">
        ${escapeHtml(
          actualCompletion
        )}
      </div>

    </div>

  </div>


  <!-- WORK SUMMARY -->

  <div class="summary">

    <div class="card">

      <div class="label">
        Linked Tasks
      </div>

      <div class="value value-large">
        ${tasks.length}
      </div>

    </div>


    <div class="card">

      <div class="label">
        Completed Tasks
      </div>

      <div class="value value-large">
        ${completedTasks.length}
      </div>

    </div>


    <div class="card">

      <div class="label">
        Total Actual Work
      </div>

      <div class="value value-large">
        ${escapeHtml(
          formatMinutes(
            totalActualMinutes
          )
        )}
      </div>

    </div>

  </div>


  <!-- TASKS -->

  <div class="section-title">
    Maintenance Tasks
  </div>


  <table>

    <thead>

      <tr>

        <th style="width:7%;">
          ID
        </th>

        <th style="width:31%;">
          Task
        </th>

        <th style="width:13%;">
          Status
        </th>

        <th style="width:18%;">
          Section
        </th>

        <th style="width:18%;">
          Due
        </th>

        <th style="width:13%;">
          Duration
        </th>

      </tr>

    </thead>


    <tbody>
      ${taskRows}
    </tbody>

  </table>


  <!-- FOOTER -->

  <div class="footer">

    <div>
      ASTIR S.A. | CMMS
    </div>

    <div>
      ${escapeHtml(
        code
      )}
    </div>

  </div>


</div>


<script>

window.addEventListener(
  "load",
  () => {

    setTimeout(
      () => window.print(),
      250
    );

  }
);

<\/script>


</body>

</html>

    `);


    printDocument.close();


    printFrame.contentWindow.onafterprint =
      () => {

        printFrame.remove();

      };


  } catch (err) {

    console.error(
      "PRINT SCHEDULED MAINTENANCE ERROR:",
      err
    );


    alert(
      "Unable to print Scheduled Maintenance."
    );

  }

}

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