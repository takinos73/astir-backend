(() => {
  const button = document.getElementById("previewPreventivePackageBtn");
  const dialog = document.getElementById("preventivePackagePreview");
  const status = document.getElementById("preventivePackagePreviewStatus");
  const list = document.getElementById("preventivePackagePreviewTasks");
  const controls = document.getElementById("preventivePackageDraftControls");
  const newTask = document.getElementById("preventivePackageNewTask");
  const libraryTask = document.getElementById("preventivePackageLibraryTask");
  const saveForm = document.getElementById("preventivePackageSaveForm");
  const saveControls = document.getElementById("preventivePackageSaveControls");
  const saveStatus = document.getElementById("preventivePackageSaveStatus");
  const closeButton = dialog.querySelector('form[method="dialog"] button');
  const assetSelect = document.getElementById("preventivePackageAsset");
  const sourceControls = document.getElementById("preventivePackageSourceControls");
  const sourceSelect = document.getElementById("preventivePackageSource");
  const importButton = document.getElementById("preventivePackageImport");
  const sourceStatus = document.getElementById("preventivePackageSourceStatus");
  let selectedAsset = null;
  let sourceRequest = 0;
  let saving = false;
  let editingTask = false;
  let draftTasks = [];
  let libraryPlans = [];

  function renderDraft() {
    const items = draftTasks.map((task, index) => {
      const item = document.createElement("li");
      const context = [task.section, task.unit].filter(Boolean).join(" / ");
      item.textContent = [task.task || "Εργασία χωρίς τίτλο", context]
        .filter(Boolean).join(" · ");
      const actions = [
        { text: "↑", label: "Μετακίνηση πάνω", target: index - 1 },
        { text: "↓", label: "Μετακίνηση κάτω", target: index + 1 },
        { text: "Αφαίρεση", label: "Αφαίρεση εργασίας", target: null }
      ];

      for (const action of actions) {
        const control = document.createElement("button");
        control.type = "button";
        control.className = "btn-secondary";
        control.textContent = action.text;
        control.setAttribute("aria-label", action.label + ": " + task.task);
        control.disabled = action.target !== null &&
          (action.target < 0 || action.target >= draftTasks.length);
        control.addEventListener("click", () => {
          if (controls.disabled) return;

          const [selectedTask] = draftTasks.splice(index, 1);
          if (action.target !== null) {
            draftTasks.splice(action.target, 0, selectedTask);
          }

          renderDraft();
          const nextIndex = action.target ?? Math.min(index, draftTasks.length - 1);
          (list.children[nextIndex]?.querySelector("button:enabled") || newTask).focus();
        });
        item.append(" ", control);
      }

      return item;
    });
    list.replaceChildren(...items);
    status.textContent = "Εργασίες στο προσχέδιο: " + draftTasks.length;
  }

  newTask.addEventListener("click", () => {
    if (controls.disabled || !selectedAsset || editingTask) return;

    const get = id => document.getElementById(id);
    const overlay = get("addTaskOverlay");
    if (!overlay || overlay.style.display === "flex") return;

    const asset = selectedAsset;
    const line = get("nt-line");
    const assetField = get("nt-asset");
    const taskField = get("nt-task");
    const durationField = get("nt-duration");
    const title = get("addTaskTitle");
    const assetLabel = get("ctx-asset");
    const locationLabel = get("ctx-location");
    const previousLabels = [title, assetLabel, locationLabel].map(node => node.textContent);
    const hiddenFields = [
      get("taskPlannedType").closest(".addtask-block"),
      get("nt-record-completed").closest(".addtask-block"),
      get("nt-due").closest(".field"),
      get("nt-attachments").closest(".addtask-block"),
      get("cancelAddTask"),
      get("saveTaskBtn")
    ];

    resetAddTaskForm();
    resetTaskAttachments();
    get("nt-record-completed").checked = false;
    applyCompletedPlannedUI();

    populateAddTaskLines();
    line.value = asset.line || "";
    line.disabled = true;

    assetField.replaceChildren(new Option(
      asset.model + " · SN " + asset.serial_number,
      String(asset.id)
    ));
    assetField.disabled = true;
    triggerChange(assetField);

    title.textContent = "Νέα εργασία στο πακέτο";
    assetLabel.textContent = asset.model + " · SN " + asset.serial_number;
    locationLabel.textContent = asset.line || "—";
    const previousDisplays = hiddenFields.map(node => node.style.display);
    hiddenFields.forEach(node => { node.style.display = "none"; });

    // Use draft-only buttons so the normal Create handler is never called.
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn-cancel";
    cancel.textContent = "Ακύρωση";

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn-table";
    add.textContent = "Προσθήκη στο πακέτο";

    get("saveTaskBtn").parentElement.append(cancel, add);

    function returnToDraft(event) {
      if (event?.key && event.key !== "Escape") return;
      event?.preventDefault();
      overlay.removeEventListener("keydown", returnToDraft);
      overlay.style.display = "none";
      cancel.remove();
      add.remove();
      resetAddTaskForm();
      resetTaskAttachments();
      hiddenFields.forEach((node, index) => { node.style.display = previousDisplays[index]; });
      [title, assetLabel, locationLabel].forEach((node, index) => {
        node.textContent = previousLabels[index];
      });
      editingTask = false;
      dialog.showModal();
      newTask.focus();
    }

    cancel.addEventListener("click", returnToDraft);
    overlay.addEventListener("keydown", returnToDraft);
    add.addEventListener("click", () => {
      const task = taskField.value.trim();
      if (!task) {
        alert("Συμπλήρωσε τον τίτλο της εργασίας.");
        taskField.focus();
        return;
      }

      const duration = durationField.value.trim();
      if (durationField.validity.badInput || (duration && !durationField.checkValidity())) {
        durationField.reportValidity();
        return;
      }

      draftTasks.push({
        task,
        section: getCurrentAddTaskSection() || null,
        unit: getCurrentAddTaskUnit() || null,
        duration_min: duration ? Number(duration) : null,
        impact: get("nt-impact").value || "normal",
        notes: get("nt-notes").value.trim() || null
      });

      renderDraft();
      returnToDraft();
    });

    editingTask = true;
    dialog.close();
    overlay.style.display = "flex";
    taskField.focus();
  });

  document.getElementById("preventivePackageCopyTaskForm").addEventListener("submit", event => {
    event.preventDefault();
    if (controls.disabled || libraryTask.value === "") return;

    const plan = libraryPlans[Number(libraryTask.value)];
    if (!plan) return;

    const { task, section, unit, duration_min, notes, impact } = plan;
    draftTasks.push({ task, section, unit, duration_min, notes, impact });
    libraryTask.value = "";
    renderDraft();
  });

    function refreshPackagePlan() {
      const modelSelect = document.getElementById("libraryModelSelect");

      if (modelSelect?.value === selectedAsset?.model) {
        modelSelect.dispatchEvent(new Event("change"));
      }
  }

  dialog.addEventListener("cancel", event => {
    if (saving) event.preventDefault();
  });

  saveForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (saveControls.disabled || !hasRole("admin")) return;
    if (!draftTasks.length) {
      saveStatus.textContent = "Πρόσθεσε τουλάχιστον μία εργασία.";
      return;
    }

    if (libraryTask.value !== "") {
      saveStatus.textContent =
        "Πάτησε Αντιγραφή για την επιλεγμένη εργασία ή καθάρισε την επιλογή.";
      libraryTask.focus();
      return;
    }

    const title = saveForm.elements.title.value.trim();
    if (!title) {
      saveStatus.textContent = "Συμπλήρωσε τον τίτλο του πακέτου.";
      return;
    }

    const passwordInput = saveForm.elements.adminPassword;
    const requestBody = JSON.stringify({
      asset_id: Number(selectedAsset.id),
      next_due_date: saveForm.elements.dueDate.value,
      title,
      interval_months: saveForm.elements.interval.valueAsNumber,
      admin_password: passwordInput.value,
      tasks: draftTasks
    });

    passwordInput.value = "";
    saving = true;
    sourceRequest++;
    assetSelect.disabled = true;
    sourceControls.disabled = true;
    list.inert = true;
    saveControls.disabled = true;
    controls.disabled = true;
    closeButton.disabled = true;
    saveStatus.textContent = "Αποθήκευση πακέτου…";

    try {
      const response = await fetch("/preventive-packages/with-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cmms-role": "admin"
        },
        body: requestBody
      });

      if (response.status === 201) {
        saveStatus.textContent = "Το πακέτο και η ανάθεση αποθηκεύτηκαν.";
        refreshPackagePlan();
      } else if ([400, 401, 403].includes(response.status)) {
        const result = await response.json().catch(() => null);
        saveStatus.textContent = result?.error || "Η αποθήκευση απορρίφθηκε.";
        saveControls.disabled = false;
        controls.disabled = false;
        list.inert = false;
        assetSelect.disabled = false;
        sourceControls.disabled = false;
        passwordInput.focus();
      } else {
        throw new Error("HTTP " + response.status);
      }
    } catch (error) {
      console.error("Could not confirm the package save:", error);
      saveStatus.textContent =
        "Η αποθήκευση δεν επιβεβαιώθηκε. Έλεγξε τα Προγραμματισμένα πακέτα πριν ξαναδοκιμάσεις.";
      refreshPackagePlan();
    } finally {
      saving = false;
      closeButton.disabled = false;
    }
  });

  button.addEventListener("click", () => {
    if (!hasRole("admin")) {
      alert("Η δημιουργία πακέτου είναι διαθέσιμη στον Admin.");
      return;
    }

    const assets = state.assetsData.filter(asset => asset.model?.trim() && asset.active !== false);
    assetSelect.replaceChildren(new Option("— Επιλογή asset —", ""));
    for (const asset of assets) {
      assetSelect.add(new Option(asset.model + " · SN " + asset.serial_number, String(asset.id)));
    }

    selectedAsset = null;
    draftTasks = [];
    libraryPlans = [];
    list.inert = false;
    list.replaceChildren();
    saveForm.reset();
    saveForm.hidden = false;
    saveControls.disabled = true;
    saveStatus.textContent = "";
    controls.disabled = true;
    assetSelect.disabled = false;
    sourceControls.disabled = true;
    sourceSelect.replaceChildren(new Option("— Επιλογή προηγούμενου SM —", ""));
    sourceStatus.textContent = "";
    status.textContent = assets.length ? "Επίλεξε asset για να ξεκινήσεις." : "Δεν υπάρχουν διαθέσιμα assets.";
    dialog.showModal();
  });

  assetSelect.addEventListener("change", async () => {
    if (draftTasks.length && !confirm("Η αλλαγή asset θα καθαρίσει τη λίστα του προσχεδίου. Συνέχεια;")) {
      assetSelect.value = selectedAsset ? String(selectedAsset.id) : "";
      return;
    }

    const request = ++sourceRequest;
    selectedAsset = state.assetsData.find(asset => String(asset.id) === assetSelect.value) || null;
    draftTasks = [];
    saveStatus.textContent = "";
    saveForm.elements.adminPassword.value = "";
    sourceSelect.replaceChildren(new Option("— Επιλογή προηγούμενου SM —", ""));
    importButton.disabled = true;
    controls.disabled = !selectedAsset;
    saveControls.disabled = !selectedAsset;
    sourceControls.disabled = !selectedAsset;
    sourceStatus.textContent = "";

    const entry = libraryData.find(item => item.model === selectedAsset?.model);
    libraryPlans = (entry?.plans || []).filter(plan => plan.task?.trim());
    libraryTask.replaceChildren(new Option(
      libraryPlans.length ? "— Επιλογή εργασίας —" : "Δεν υπάρχουν κανόνες για αυτό το μοντέλο",
      ""
    ));
    libraryPlans.forEach((plan, index) => {
      const label = [plan.task, plan.section, plan.unit].filter(Boolean).join(" · ");
      libraryTask.add(new Option(label, String(index)));
    });
    libraryTask.form.querySelector("button").disabled = !libraryPlans.length;
    renderDraft();
    if (!selectedAsset) {
      status.textContent = "Επίλεξε asset για να ξεκινήσεις.";
      return;
    }

    const model = selectedAsset.model.trim();
    sourceStatus.textContent = "Φόρτωση προηγούμενων SM…";
    try {
      const response = await fetch("/scheduled-maintenance");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const previous = await response.json();
      if (request !== sourceRequest || (!dialog.open && !editingTask)) return;

      for (const sm of previous) {
        if (sm.status !== "CLOSED" || sm.asset_model?.trim() !== model) continue;
        const code = "SM-" + String(sm.id).padStart(5, "0");
        const label = [code, sm.title, "SN " + sm.asset_serial].filter(Boolean).join(" · ");
        sourceSelect.add(new Option(label, String(sm.id)));
      }
      sourceStatus.textContent = sourceSelect.options.length > 1
        ? "" : "Δεν βρέθηκαν κλειστά SM για αυτό το μοντέλο.";
    } catch (error) {
      if (request !== sourceRequest || (!dialog.open && !editingTask)) return;
      console.error("Could not load previous SMs:", error);
      sourceStatus.textContent = "Δεν ήταν δυνατή η φόρτωση προηγούμενων SM.";
    }
  });

  sourceSelect.addEventListener("change", () => {
    importButton.disabled = !sourceSelect.value;
  });

  importButton.addEventListener("click", async () => {
    const smId = Number(sourceSelect.value);
    if (!Number.isSafeInteger(smId) || smId < 1 || !selectedAsset) return;

    const request = ++sourceRequest;
    sourceControls.disabled = true;
    saveControls.disabled = true;
    sourceStatus.textContent = "Φόρτωση εργασιών…";

    try {
      const response = await fetch("/scheduled-maintenance/" + smId + "/tasks");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const { tasks } = await response.json();
      if (!Array.isArray(tasks)) throw new Error("Invalid SM tasks response");
      if (request !== sourceRequest || (!dialog.open && !editingTask)) return;

      for (const { task, section, unit, duration_min, notes, impact } of tasks) {
        draftTasks.push({ task, section, unit, duration_min, notes, impact });
      }

      sourceStatus.textContent = tasks.length
        ? "Προστέθηκαν εργασίες: " + tasks.length : "Το SM δεν έχει εργασίες.";
      sourceSelect.value = "";
      importButton.disabled = true;
      renderDraft();
    } catch (error) {
      if (request !== sourceRequest || (!dialog.open && !editingTask)) return;
      console.error("Could not load SM tasks:", error);
      sourceStatus.textContent = "Δεν ήταν δυνατή η φόρτωση των εργασιών.";
    } finally {
      if (request === sourceRequest && (dialog.open || editingTask)) {
        sourceControls.disabled = false;
        saveControls.disabled = false;
      }
    }
  });

  dialog.addEventListener("close", () => {
    if (editingTask) return;
    sourceRequest++;
    saveForm.reset();
    draftTasks = [];
    libraryPlans = [];
  });
})();

// Scheduled preventive packages in the Library.
(() => {
  const modelSelect = document.getElementById("libraryModelSelect");
  const section = document.getElementById("preventivePackagePlan");
  if (!modelSelect || !section) return;

  const status = document.getElementById("preventivePackagePlanStatus");
  const table = section.querySelector(".preventive-package-plan-table");
  const rows = document.getElementById("preventivePackagePlanRows");
  let currentRequest = 0;

  function createAssignmentRow(assignment) {
    const row = document.createElement("tr");

    const title = document.createElement("strong");
    title.textContent = assignment.title;
    row.insertCell().appendChild(title);

    const asset = row.insertCell();
    asset.textContent = assignment.serial_number
      ? assignment.asset_model + " · SN " + assignment.serial_number
      : assignment.asset_model + " · #" + assignment.asset_id;

    const interval = document.createElement("span");
    interval.className = "package-plan-interval";
    interval.textContent = assignment.interval_months === 1
      ? "Κάθε μήνα" : "Κάθε " + assignment.interval_months + " μήνες";
    row.insertCell().appendChild(interval);

    const dueDate = document.createElement("time");
    dueDate.dateTime = assignment.next_due_date;
    const [year, month, day] = assignment.next_due_date.split("-");
    dueDate.textContent = [day, month, year].join("/");
    row.insertCell().appendChild(dueDate);

    return row;
  }

  async function loadPackagePlan() {
    const request = ++currentRequest;
    const model = modelSelect.value.trim();
    rows.replaceChildren();
    table.hidden = true;
    section.hidden = !model;
    status.textContent = model ? "Φόρτωση προγραμματισμένων πακέτων…" : "";
    if (!model) return;

    try {
      const query = new URLSearchParams({ model });
      const response = await fetch("/preventive-package-assignments?" + query, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error("HTTP " + response.status);

      const { assignments } = await response.json();
      if (!Array.isArray(assignments)) throw new Error("Invalid assignments response");
      if (request !== currentRequest) return;

      rows.replaceChildren(...assignments.map(createAssignmentRow));
      table.hidden = assignments.length === 0;
      status.textContent = assignments.length
        ? "" : "Δεν υπάρχουν προγραμματισμένα πακέτα για αυτό το μοντέλο.";
    } catch (error) {
      if (request !== currentRequest) return;
      console.error("Could not load the preventive package plan:", error);
      status.textContent = "Δεν ήταν δυνατή η φόρτωση του προγράμματος πακέτων.";
    }
  }

  modelSelect.addEventListener("change", loadPackagePlan);
  const modelObserver = new MutationObserver(loadPackagePlan);
  modelObserver.observe(modelSelect, { childList: true });
  loadPackagePlan();
})();

