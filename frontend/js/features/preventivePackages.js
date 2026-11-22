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
  const assetSelect = document.getElementById("preventivePackageAsset");
  const sourceControls = document.getElementById("preventivePackageSourceControls");
  const sourceSelect = document.getElementById("preventivePackageSource");
  const importButton = document.getElementById("preventivePackageImport");
  const sourceStatus = document.getElementById("preventivePackageSourceStatus");
  let selectedAsset = null;
  let sourceRequest = 0;
  let planning = false;
  let plannerSubmission = {};
  let editingTask = false;
  let draftTasks = [];
  let libraryPlans = [];

  function renderDraft() {
    const items = draftTasks.map((task, index) => {
      const item = document.createElement("li");
      const context = [task.section, task.unit].filter(Boolean).join(" / ");
      const title = document.createElement("span");
      title.className = "pp-draft-task-title";
      title.textContent = [task.task || "Εργασία χωρίς τίτλο", context]
        .filter(Boolean).join(" · ");
      item.appendChild(title);
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

  saveForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (saveControls.disabled || !selectedAsset || !hasRole("admin")) return;
    if (libraryTask.value !== "") {
      saveStatus.textContent = "Πάτησε Αντιγραφή για την επιλεγμένη εργασία ή καθάρισε την επιλογή.";
      libraryTask.focus();
      return;
    }
    const title = saveForm.elements.title.value.trim();
    if (!title || !draftTasks.length) {
      saveStatus.textContent = "Συμπλήρωσε τίτλο και πρόσθεσε τουλάχιστον μία εργασία.";
      return;
    }

    function returnFromPlanner() {
      planning = false;
      if (!dialog.open) dialog.showModal();
      saveForm.querySelector('button[type="submit"]').focus();
    }

    function finishScheduling() {
      planning = false;
      closeDraft();
      const model = document.getElementById("libraryModelSelect");
      if ([...model.options].some(option => option.value === selectedAsset?.model)) {
        model.value = selectedAsset.model;
        model.dispatchEvent(new Event("change"));
      }
      alert("Το Preventive Pack δημιουργήθηκε και προγραμματίστηκε.");
      button.focus();
    }

    saveStatus.textContent = "";
    planning = true;
    dialog.close();

    try {
      const opened = await openNewScheduledMaintenanceModal({
        asset_id: selectedAsset.id,
        asset_model: selectedAsset.model,
        title,
        interval_months: saveForm.elements.interval.valueAsNumber,
        next_due_date: saveForm.elements.dueDate.value,
        tasks: draftTasks.map(task => ({ ...task })),
        submission: plannerSubmission,
        onClose: returnFromPlanner,
        onSaved: finishScheduling
      });
      if (!opened) throw new Error("Δεν άνοιξε ο προγραμματισμός του πακέτου.");
    } catch (error) {
      console.error("Could not open Preventive Pack preview:", error);
      returnFromPlanner();
      saveStatus.textContent = error.message || "Δεν άνοιξε ο προγραμματισμός του πακέτου.";
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
      if (request !== sourceRequest || (!dialog.open && !editingTask && !planning)) return;

      for (const sm of previous) {
        if (sm.status !== "CLOSED" || sm.asset_model?.trim() !== model) continue;
        const code = "SM-" + String(sm.id).padStart(5, "0");
        const label = [code, sm.title, "SN " + sm.asset_serial].filter(Boolean).join(" · ");
        sourceSelect.add(new Option(label, String(sm.id)));
      }
      sourceStatus.textContent = sourceSelect.options.length > 1
        ? "" : "Δεν βρέθηκαν κλειστά SM για αυτό το μοντέλο.";
    } catch (error) {
      if (request !== sourceRequest || (!dialog.open && !editingTask && !planning)) return;
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
      if (request !== sourceRequest || (!dialog.open && !editingTask && !planning)) return;

      for (const { task, section, unit, duration_min, notes, impact } of tasks) {
        draftTasks.push({ task, section, unit, duration_min, notes, impact });
      }

      sourceStatus.textContent = tasks.length
        ? "Προστέθηκαν εργασίες: " + tasks.length : "Το SM δεν έχει εργασίες.";
      sourceSelect.value = "";
      importButton.disabled = true;
      renderDraft();
    } catch (error) {
      if (request !== sourceRequest || (!dialog.open && !editingTask && !planning)) return;
      console.error("Could not load SM tasks:", error);
      sourceStatus.textContent = "Δεν ήταν δυνατή η φόρτωση των εργασιών.";
    } finally {
      if (request === sourceRequest && (dialog.open || editingTask || planning)) {
        sourceControls.disabled = false;
        saveControls.disabled = false;
      }
    }
  });

  function closeDraft() {
    sourceRequest++;
    saveForm.reset();
    draftTasks = [];
    libraryPlans = [];
    plannerSubmission = {};
  }

  dialog.addEventListener("close", () => {
    if (editingTask || planning) return;
    if (plannerSubmission.uncertain) {
      alert("Έλεγξε τα Προγραμματισμένα πακέτα πριν δημιουργήσεις ξανά την ίδια επίσκεψη.");
    }
    closeDraft();
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
  const definitions = document.createElement("section");
  definitions.className = "pp-library-definitions";
  const archiveFilter = document.createElement("label");
  archiveFilter.className = "pp-library-archive-filter";
  const includeArchived = document.createElement("input");
  includeArchived.type = "checkbox";
  archiveFilter.append(includeArchived, " Εμφάνιση αρχειοθετημένων προτύπων");
  section.append(archiveFilter, definitions);
  includeArchived.addEventListener("change", loadPackagePlan);
  document.addEventListener("preventive-package-updated", loadPackagePlan);

  function createAssignmentRow(assignment) {
    const row = document.createElement("tr");

    const title = document.createElement("strong");
    title.textContent = assignment.title;
    const packageCell = row.insertCell();
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "preventive-pack-badge";
    badge.textContent = "PP" + String(assignment.package_id).padStart(4, "0");
    badge.addEventListener("click", () => openPreventivePackageDefinition(assignment.package_id, modelSelect.value.trim()));
    packageCell.append(badge, " ", title);

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
    definitions.replaceChildren();
    table.hidden = true;
    section.hidden = !model;
    status.textContent = model ? "Φόρτωση προγραμματισμένων πακέτων…" : "";
    if (!model) return;

    try {
      const query = new URLSearchParams({ model });
      const [response, packageResponse] = await Promise.all([
        fetch("/preventive-package-assignments?" + query, { cache: "no-store" }),
        fetch("/preventive-packages?" + query + (includeArchived.checked ? "&include_archived=true" : ""), { cache: "no-store" })
      ]);
      if (!packageResponse.ok) throw new Error("Could not load package definitions");
      const { packages } = await packageResponse.json();
      if (!Array.isArray(packages)) throw new Error("Invalid package definitions");
      if (!response.ok) throw new Error("HTTP " + response.status);

      const { assignments } = await response.json();
      if (!Array.isArray(assignments)) throw new Error("Invalid assignments response");
      if (request !== currentRequest) return;

      rows.replaceChildren(...assignments.map(createAssignmentRow));
      const heading = document.createElement("h3");
      heading.textContent = "Πρότυπα πακέτων";
      definitions.appendChild(heading);
      for (const pack of packages) {
        const entry = document.createElement("div");
        entry.className = "pp-library-definition-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preventive-pack-badge";
        button.textContent = "PP" + String(pack.id).padStart(4, "0");
        button.addEventListener("click", () => openPreventivePackageDefinition(pack.id, model));
        const title = document.createElement("strong");
        title.textContent = pack.title;
        const meta = document.createElement("span");
        meta.textContent = (pack.archived_at ? "Αρχειοθετημένο · " : "") + "Κάθε " + pack.interval_months + " μήνες · " + pack.tasks.length + " εργασίες";
        entry.append(button, title, meta);
        definitions.appendChild(entry);
      }
      if (!packages.length) definitions.append("Δεν υπάρχουν πρότυπα πακέτων για αυτό το μοντέλο.");
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


async function openPreventivePackageDefinition(packageId, model) {
  const existing = document.querySelector("dialog.pp-definition-view");
  if (existing?.open) { existing.focus(); return; }
  existing?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "preventive-pack-detail pp-definition-view";
  dialog.setAttribute("aria-label", "Πρότυπο πακέτου προληπτικής συντήρησης");
  dialog.innerHTML = `
    <header class="pp-detail-header"><span class="pp-detail-code"></span><h3>Πρότυπο πακέτου</h3></header>
    <div class="pp-detail-body">
      <p class="pp-definition-model"></p>
      <p>Οι αλλαγές εφαρμόζονται στις επόμενες επισκέψεις που δημιουργούνται.</p>
      <form class="pp-definition-form">
        <fieldset disabled>
          <label>Τίτλος<input name="title" required></label>
          <label>Συχνότητα (μήνες)<input name="interval" type="number" min="1" step="1" required></label>
          <div class="pp-definition-tasks"></div>
          <button type="button" class="btn-secondary pp-definition-add">+ Εργασία</button>
        </fieldset>
        <label class="pp-definition-password" hidden>Admin password<input name="password" type="password" autocomplete="current-password"></label>
        <div class="pp-definition-actions">
          <button type="button" class="btn-secondary pp-definition-edit" hidden>Edit</button>
          <button type="button" class="btn-secondary pp-definition-archive" hidden>Αρχειοθέτηση</button>
          <button type="submit" class="btn-primary pp-definition-save" hidden>Αποθήκευση</button>
          <button type="button" class="btn-secondary pp-definition-cancel" hidden>Ακύρωση αλλαγών</button>
        </div>
      </form>
      <form class="pp-definition-archive-form" hidden>
        <p>Η αρχειοθέτηση σταματά τη δημιουργία επόμενων επισκέψεων. Οι υπάρχουσες εργασίες, το History και τα συνημμένα διατηρούνται.</p>
        <label>Admin password<input type="password" required autocomplete="current-password"></label>
        <div class="pp-definition-actions">
          <button type="submit" class="btn-secondary">Επιβεβαίωση αρχειοθέτησης</button>
          <button type="button" class="btn-secondary pp-definition-archive-cancel">Ακύρωση</button>
        </div>
      </form>
      <p class="pp-definition-status" role="status">Φόρτωση…</p>
    </div>
    <form method="dialog" class="pp-detail-footer"><button type="submit" class="btn-secondary">Κλείσιμο</button></form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  const form = dialog.querySelector(".pp-definition-form");
  const fields = form.querySelector("fieldset");
  const status = dialog.querySelector(".pp-definition-status");
  const title = form.elements.title;
  const interval = form.elements.interval;
  const password = form.elements.password;
  const edit = dialog.querySelector(".pp-definition-edit");
  const save = dialog.querySelector(".pp-definition-save");
  const cancel = dialog.querySelector(".pp-definition-cancel");
  const taskList = dialog.querySelector(".pp-definition-tasks");
  const archive = dialog.querySelector(".pp-definition-archive");
  const archiveForm = dialog.querySelector(".pp-definition-archive-form");
  const archivePassword = archiveForm.querySelector('input[type="password"]');
  let saved, draft = [], editing = false, saving = false;

  function setEditing(value) {
    editing = value;
    fields.disabled = !value;
    edit.hidden = archive.hidden = value || !hasRole("admin") || Boolean(saved?.archived_at);
    save.hidden = cancel.hidden = !value;
    dialog.querySelector(".pp-definition-password").hidden = !value;
    password.required = value;
    password.value = "";
  }
  function renderTasks() {
    taskList.replaceChildren();
    draft.forEach((task, index) => {
      const section = document.createElement("section");
      section.className = "pp-definition-task";
      const heading = document.createElement("strong");
      heading.textContent = "Εργασία " + (index + 1);
      section.appendChild(heading);
      for (const [key, labelText] of [
        ["task", "Εργασία"], ["section", "Section"], ["unit", "Unit"],
        ["duration_min", "Εκτιμώμενα λεπτά"], ["impact", "Impact"], ["notes", "Σημειώσεις"]
      ]) {
        const label = document.createElement("label");
        label.textContent = labelText;
        const input = document.createElement(key === "notes" ? "textarea" : key === "impact" ? "select" : "input");
        if (key === "impact") {
          for (const value of ["normal", "safety", "quality", "safety_quality"]) {
            input.add(new Option(value, value));
          }
        }
        if (key === "duration_min") { input.type = "number"; input.min = "0"; input.step = "1"; }
        if (key === "task") input.required = true;
        input.value = task[key] ?? (key === "impact" ? "normal" : "");
        input.addEventListener("input", () => {
          task[key] = key === "duration_min" ? (input.value === "" ? null : Number(input.value)) : input.value;
        });
        label.appendChild(input);
        section.appendChild(label);
      }
      const actions = document.createElement("div");
      actions.className = "pp-definition-actions";
      for (const [text, target] of [["↑", index - 1], ["↓", index + 1], ["Αφαίρεση", null]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-secondary";
        button.textContent = text;
        button.setAttribute("aria-label", text + " · " + (task.task || "Εργασία " + (index + 1)));
        button.disabled = target !== null && (target < 0 || target >= draft.length);
        button.onclick = () => {
          if (!editing) return;
          const [selected] = draft.splice(index, 1);
          if (target !== null) draft.splice(target, 0, selected);
          renderTasks();
        };
        actions.appendChild(button);
      }
      section.appendChild(actions);
      taskList.appendChild(section);
    });
  }
  function reset() {
    dialog.querySelector("h3").textContent = saved.title + (saved.archived_at ? " · Αρχειοθετημένο" : "");
    title.value = saved.title;
    interval.value = saved.interval_months;
    draft = JSON.parse(JSON.stringify(saved.tasks));
    renderTasks();
  }
  edit.onclick = () => { archiveForm.hidden = true; archivePassword.value = ""; setEditing(true); title.focus(); };
  archive.onclick = () => { archiveForm.hidden = false; edit.disabled = true; archivePassword.focus(); };
  dialog.querySelector(".pp-definition-archive-cancel").onclick = () => {
    archiveForm.hidden = true; archivePassword.value = ""; edit.disabled = false;
  };
  archiveForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !saved || saved.archived_at) return;
    saving = true;
    const controls = [...dialog.querySelectorAll("button, input")].map(control => [control, control.disabled]);
    for (const [control] of controls) control.disabled = true;
    status.textContent = "Αρχειοθέτηση…";
    try {
      const response = await fetch("/preventive-packages/" + encodeURIComponent(packageId) + "/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cmms-role": localStorage.getItem("cmmsRole") },
        body: JSON.stringify({ admin_password: archivePassword.value, version: saved.version })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Η αρχειοθέτηση απέτυχε.");
      saved = data.package;
      archiveForm.hidden = true;
      reset(); setEditing(false);
      status.textContent = "Το πακέτο αρχειοθετήθηκε.";
      document.dispatchEvent(new CustomEvent("preventive-package-updated"));
    } catch (error) { status.textContent = error.message; }
    finally {
      saving = false;
      for (const [control, disabled] of controls) control.disabled = disabled;
      archivePassword.value = "";
      edit.disabled = false;
    }
  });
  cancel.onclick = () => { reset(); setEditing(false); status.textContent = ""; };
  dialog.querySelector(".pp-definition-add").onclick = () => {
    if (!editing) return;
    draft.push({ task: "", section: "", unit: "", duration_min: 0, impact: "normal", notes: "" });
    renderTasks();
    taskList.lastElementChild.querySelector("input").focus();
  };
  const blockClose = event => {
    if (saving || (editing && !confirm("Να κλείσει το πρόχειρο χωρίς αποθήκευση;"))) event.preventDefault();
  };
  dialog.addEventListener("cancel", blockClose);
  dialog.querySelector('form[method="dialog"]').addEventListener("submit", blockClose);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !editing) return;
    if (!draft.length) { status.textContent = "Απαιτείται τουλάχιστον μία εργασία."; return; }
    saving = true;
    fields.disabled = save.disabled = cancel.disabled = password.disabled = true;
    status.textContent = "Αποθήκευση…";
    try {
      const response = await fetch("/preventive-packages/" + encodeURIComponent(packageId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-cmms-role": localStorage.getItem("cmmsRole") },
        body: JSON.stringify({
          title: title.value.trim(), interval_months: Number(interval.value),
          tasks: draft, version: saved.version, admin_password: password.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Η αποθήκευση απέτυχε.");
      saved = data.package;
      reset(); setEditing(false);
      status.textContent = "Το πρότυπο αποθηκεύτηκε.";
      document.dispatchEvent(new CustomEvent("preventive-package-updated"));
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saving = false;
      fields.disabled = !editing;
      save.disabled = cancel.disabled = password.disabled = false;
      password.value = "";
    }
  });
  try {
    const response = await fetch("/preventive-packages?" + new URLSearchParams({ model, include_archived: "true" }), { cache: "no-store" });
    if (!response.ok) throw new Error("Δεν φορτώθηκε το πακέτο.");
    const data = await response.json();
    saved = data.packages?.find(item => String(item.id) === String(packageId));
    if (!saved) throw new Error("Το πακέτο δεν βρέθηκε.");
    if (!dialog.isConnected) return;
    dialog.querySelector(".pp-detail-code").textContent = "PP" + String(saved.id).padStart(4, "0");
    dialog.querySelector("h3").textContent = saved.title;
    dialog.querySelector(".pp-definition-model").textContent = saved.asset_model;
    reset(); setEditing(false); status.textContent = "";
  } catch (error) { status.textContent = error.message; }
}
