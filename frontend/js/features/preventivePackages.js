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
  const model = "CSDX 137";
  let saving = false;
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

  document.getElementById("preventivePackageNewTaskForm").addEventListener("submit", event => {
    event.preventDefault();
    const title = newTask.value.trim();
    if (controls.disabled || !title) return;

    draftTasks.push({ task: title });
    newTask.value = "";
    renderDraft();
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

    function refreshSavedPackages() {
      const modelSelect = document.getElementById("libraryModelSelect");

      if (modelSelect?.value === model) {
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

    if (newTask.value.trim() || libraryTask.value !== "") {
      saveStatus.textContent =
        "Πάτησε Προσθήκη ή Αντιγραφή για την εκκρεμή εργασία, ή καθάρισε το πεδίο.";
      (newTask.value.trim() ? newTask : libraryTask).focus();
      return;
    }

    const title = saveForm.elements.title.value.trim();
    if (!title) {
      saveStatus.textContent = "Συμπλήρωσε τον τίτλο του πακέτου.";
      return;
    }

    const passwordInput = saveForm.elements.adminPassword;
    const requestBody = JSON.stringify({
      asset_model: model,
      title,
      interval_months: saveForm.elements.interval.valueAsNumber,
      admin_password: passwordInput.value,
      tasks: draftTasks
    });

    passwordInput.value = "";
    saving = true;
    list.inert = true;
    saveControls.disabled = true;
    controls.disabled = true;
    closeButton.disabled = true;
    saveStatus.textContent = "Αποθήκευση πακέτου…";

    try {
      const response = await fetch("/preventive-packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cmms-role": "admin"
        },
        body: requestBody
      });

      if (response.status === 201) {
        saveStatus.textContent = "Το πακέτο αποθηκεύτηκε.";
        refreshSavedPackages();
      } else if ([400, 401, 403].includes(response.status)) {
        const result = await response.json().catch(() => null);
        saveStatus.textContent = result?.error || "Η αποθήκευση απορρίφθηκε.";
        saveControls.disabled = false;
        controls.disabled = false;
        list.inert = false;
        passwordInput.focus();
      } else {
        throw new Error("HTTP " + response.status);
      }
    } catch (error) {
      console.error("Could not confirm the package save:", error);
      saveStatus.textContent =
        "Η αποθήκευση δεν επιβεβαιώθηκε. Έλεγξε τα Αποθηκευμένα πακέτα πριν ξαναδοκιμάσεις.";
      refreshSavedPackages();
    } finally {
      saving = false;
      closeButton.disabled = false;
    }
  });

  button.addEventListener("click", async () => {
    list.inert = false;
    saveForm.reset();
    saveForm.hidden = !hasRole("admin");
    saveControls.disabled = true;
    saveStatus.textContent = "";
    button.disabled = true;
    controls.disabled = true;
    draftTasks = [];
    newTask.value = "";
    list.replaceChildren();
    status.textContent = "Φόρτωση εργασιών από το SM‑00021…";
    dialog.showModal();

    try {
      const response = await fetch("/scheduled-maintenance/21/tasks");
      if (!response.ok) throw new Error("HTTP " + response.status);

      const { tasks } = await response.json();
      if (!Array.isArray(tasks)) throw new Error("Invalid SM tasks response");
      if (!dialog.open) return;

      draftTasks = tasks.map(task => ({ ...task }));
      const entry = libraryData.find(item => item.model === model);
      libraryPlans = (entry?.plans || []).filter(plan => plan.task?.trim());

      libraryTask.replaceChildren(new Option(
        libraryPlans.length ? "— Επιλογή εργασίας —" : "Δεν υπάρχουν κανόνες για CSDX 137",
        ""
      ));
      libraryPlans.forEach((plan, index) => {
        const label = [plan.task, plan.section, plan.unit].filter(Boolean).join(" · ");
        libraryTask.add(new Option(label, String(index)));
      });
      libraryTask.form.querySelector("button").disabled = libraryPlans.length === 0;

      renderDraft();
      controls.disabled = false;
      saveControls.disabled = saveForm.hidden;
    } catch (error) {
      console.error("Could not load the preventive package draft:", error);
      status.textContent = "Δεν ήταν δυνατή η φόρτωση του προσχεδίου.";
    } finally {
      button.disabled = false;
    }
  });

  dialog.addEventListener("close", () => {
    saveForm.reset();
    draftTasks = [];
    libraryPlans = [];
  });
})();

(() => {
  const modelSelect = document.getElementById("libraryModelSelect");
  const section = document.getElementById("savedPreventivePackages");
  const status = document.getElementById("savedPreventivePackagesStatus");
  const list = document.getElementById("savedPreventivePackagesList");
  let requestNumber = 0;

  async function loadSavedPackages() {
    const currentRequest = ++requestNumber;
    const model = modelSelect.value.trim();

    list.replaceChildren();
    section.hidden = !model;
    if (!model) return;

    status.textContent = "Φόρτωση πακέτων…";

    try {
      const query = new URLSearchParams({ model });
      const response = await fetch(`/preventive-packages?${query}`, {
        cache: "no-store"
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const { packages } = await response.json();
      if (!Array.isArray(packages)) throw new Error("Invalid packages response");

      // Ignore a response if the selected model has changed.
      if (currentRequest !== requestNumber) return;

      const entries = packages.map(savedPackage => {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const tasks = document.createElement("ol");

        summary.textContent =
          `${savedPackage.title} · Κάθε ${savedPackage.interval_months} μήνες`;

        for (const task of savedPackage.tasks) {
          const item = document.createElement("li");
          const context = [task.section, task.unit].filter(Boolean).join(" / ");
          item.textContent = [task.task, context].filter(Boolean).join(" · ");
          tasks.appendChild(item);
        }

        details.append(summary, tasks);
        return details;
      });

      list.replaceChildren(...entries);
      status.textContent = entries.length ? "" : "Δεν υπάρχουν πακέτα για αυτό το μοντέλο.";
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      console.error("Could not load saved preventive packages:", error);
      status.textContent = "Δεν ήταν δυνατή η φόρτωση των πακέτων.";
    }
  }

  modelSelect.addEventListener("change", loadSavedPackages);

  // Refresh when the Library rebuilds the model dropdown.
  const modelObserver = new MutationObserver(loadSavedPackages);
  modelObserver.observe(modelSelect, { childList: true });

  loadSavedPackages();
})();
