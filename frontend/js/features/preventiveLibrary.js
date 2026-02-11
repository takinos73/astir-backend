/* =====================
   PREVENTIVE LIBRARY – CONSTANTS
===================== */
const LIBRARY_STORAGE_KEY = "cmms_preventive_library_v1";

/* =====================
   DEFAULT PREVENTIVE LIBRARY
===================== */
const DEFAULT_LIBRARY = [
  {
    model: "PTC027",
    plans: [
      {
        section: "Feeder",
        unit: "-",
        task: "Lubricate moving parts",
        type: "Lubrication",
        frequency_hours: 168,
        duration_min: 30,
        notes: ""
      },
      {
        section: "Main Unit",
        unit: "-",
        task: "Visual inspection & tightening",
        type: "Inspection",
        frequency_hours: 720,
        duration_min: 45,
        notes: ""
      }
    ]
  },
  {
    model: "PMC250",
    plans: [
      {
        section: "Safety",
        unit: "-",
        task: "Check guards & sensors",
        type: "Safety",
        frequency_hours: 24,
        duration_min: 15,
        notes: ""
      }
    ]
  }
];

/* =====================
   STATE
===================== */
let libraryData = [];

document.addEventListener("DOMContentLoaded", () => {
  handleContextCustomInput({
    selectId: "pm-section",
    inputId: "pm-section-custom"
  });

  handleContextCustomInput({
    selectId: "pm-unit",
    inputId: "pm-unit-custom"
  });
});


/* =====================
   LOAD / SAVE
===================== */
function loadLibrary() {
  const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
  if (raw) {
    libraryData = JSON.parse(raw);
  } else {
    libraryData = [...DEFAULT_LIBRARY];
    saveLibrary();
  }
}

function saveLibrary() {
  localStorage.setItem(
    LIBRARY_STORAGE_KEY,
    JSON.stringify(libraryData)
  );
}

function populateLibraryModels() {
  const select = document.getElementById("libraryModelSelect");
  if (!select) return;

  select.innerHTML = `<option value="">— Select model —</option>`;

  if (!Array.isArray(assetsData) || assetsData.length === 0) {
    console.warn("Library: assetsData not ready");
    return;
  }

  const models = [...new Set(
    assetsData
      .map(a => a.model)
      .filter(Boolean)
  )];

  models.forEach(model => {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model;
    select.appendChild(opt);
  });

  console.log("Library models:", models);
}
function detectPreventiveRuleImpact({
  model,
  section,
  unit,
  task,
  frequency_hours,
  excludeAssetId
}) {
  if (!Array.isArray(tasksData) || !Array.isArray(assetsData)) {
    return { assets: 0, models: 0 };
  }

  const affectedAssetIds = new Set();
  const affectedModels = new Set();

  // normalize helpers
  const norm = v => (v ?? "").toString().trim().toUpperCase();

  tasksData.forEach(t => {
    if (!isPreventive(t)) return;

    // 🔒 frequency
    if (Number(t.frequency_hours) !== Number(frequency_hours)) return;

    // 🔒 task
    if (norm(t.task) !== norm(task)) return;

    // 🔒 section (allow empty / null = wildcard)
    if (section && norm(t.section) !== norm(section)) return;

    // 🔒 unit (allow empty / null = wildcard)
    if (unit && norm(t.unit) !== norm(unit)) return;

    // 🔒 exclude current asset
    if (t.asset_id === excludeAssetId) return;

    // 🔒 model check (via assetsData)
    const asset = assetsData.find(a => a.id === t.asset_id);
    if (!asset) return;

    if (model && norm(asset.model) !== norm(model)) return;

    affectedAssetIds.add(t.asset_id);
    affectedModels.add(asset.model);
  });

  return {
    assets: affectedAssetIds.size,
    models: affectedModels.size
  };
}


/* =====================
   OPEN ADD PREVENTIVE MODAL
===================== */
document.getElementById("addPreventiveBtn")?.addEventListener("click", e => {
  e.preventDefault();

  const overlay = document.getElementById("addPreventiveOverlay");
  if (!overlay) {
    console.warn("Add Preventive modal not found");
    return;
  }

  // Reset preventive form if exists
  overlay
    .querySelectorAll("input, textarea, select")
    .forEach(el => (el.value = ""));

  // Optional: mark context (useful later)
  overlay.dataset.mode = "preventive";

  overlay.style.display = "flex";

  // UX: focus first meaningful field
  overlay.querySelector("input, textarea, select")?.focus();
  populatePreventiveAssets();
  clearPreventiveAssetContext();

});
/* =====================
    UTILS
    ===================*/

function calculateBucketMonthlyLoad(plans) {
  let minutes = 0;

  plans.forEach(p => {
    const freq = Number(p.frequency_hours);
    const dur = Number(p.duration_min);

    if (!freq || !dur) return;

    const executionsPerMonth = (24 * 30) / freq;
    minutes += dur * executionsPerMonth;
  });

  return {
    tasks: plans.length,
    hours: (minutes / 60).toFixed(1)
  };
}


/* =====================
   RENDERING (WITH BUCKET GROUP HEADERS)
===================== */

function renderLibraryTable() {
  const model = document.getElementById("libraryModelSelect")?.value;
  const container = document.getElementById("libraryContent");
  if (!container) return;

  if (!model) {
    container.innerHTML = `
      <div class="library-empty">
        Select an asset model to view its preventive plan
      </div>
    `;
    return;
  }

  const entry = libraryData.find(e => e.model === model);

  if (!entry || !Array.isArray(entry.plans) || entry.plans.length === 0) {
    container.innerHTML = `
      <div class="library-empty">
        No preventive plans defined for <strong>${model}</strong>
      </div>
    `;
    return;
  }

  // ✅ Sort by frequency ASC (numeric), then by section/task for stability
  const plansSorted = [...entry.plans].sort((a, b) => {
    const fa = Number(a.frequency_hours ?? 999999);
    const fb = Number(b.frequency_hours ?? 999999);
    if (fa !== fb) return fa - fb;

    const sa = (a.section || "").localeCompare(b.section || "", "el", { sensitivity: "base" });
    if (sa !== 0) return sa;

    return (a.task || "").localeCompare(b.task || "", "el", { sensitivity: "base" });
  });

  // ✅ Group by your existing bucket function
  const groups = new Map(); // bucket -> { label, className, rows: [] }

  plansSorted.forEach(r => {
    const freq = getFrequencyBucket(r.frequency_hours);
    const key = freq.bucket || "none";

    if (!groups.has(key)) {
      groups.set(key, {
        label: freq.label || "—",
        className: freq.className || "",
        rows: []
      });
    }

    groups.get(key).rows.push(r);
  });

  const load = calculatePreventiveMonthlyLoad(entry.plans);

const groupRowsHtml = Array.from(groups.values()).map(g => {
  const subtotal = calculateBucketMonthlyLoad(g.rows);

  const groupHeader = `
    <tr class="library-group-row">
      <td colspan="5">
        <div class="library-group-header ${g.className}">
          <span class="library-group-title">${g.label}</span>
          <span class="library-group-subtotal">
            ${subtotal.tasks} task${subtotal.tasks === 1 ? "" : "s"} · ~${subtotal.hours}h / month
          </span>
        </div>
      </td>
    </tr>
  `;

  const rowsHtml = g.rows.map(r => {
    const freq = getFrequencyBucket(r.frequency_hours);

    return `
      <tr>
        <td>${r.section || "-"}</td>
        <td>${r.task}</td>
        <td class="${freq.className}">
          ${freq.label}
        </td>
        <td>${r.duration_min ?? "—"} min</td>
        <td class="library-actions">
          <button
            class="btn-ghost btn-sm edit-preventive-btn"
            title="Edit preventive"
            data-preventive='${encodeURIComponent(JSON.stringify(r))}'
          >
            ✏️
          </button>
        </td>
      </tr>
    `;
  }).join("");

  return groupHeader + rowsHtml;
}).join("");

  container.innerHTML = `
    <!-- PRINT HEADER (PRINT ONLY) -->
    <div class="print-only">
      <h2>Preventive Maintenance Plan</h2>
      <div>
        Model: <strong>${model}</strong>
      </div>
      <div>
        Generated: ${new Date().toLocaleDateString()}
      </div>
    </div>

    <div class="library-load ${load.status}">
      <span>
        ⏱ Monthly preventive workload:
        <strong>${load.hours} h</strong>
        (${load.tasksPerMonth} tasks)
      </span>
      <span class="library-load-status">
        ${
          load.status === "ok"
            ? "🟢 Balanced"
            : load.status === "heavy"
            ? "🟠 Heavy"
            : "🔴 Overloaded"
        }
      </span>
    </div>

    <table class="library-table">
      <thead>
        <tr>
          <th>Section</th>
          <th>Task</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th style="width:60px;"></th>
        </tr>
      </thead>
      <tbody>
        ${groupRowsHtml}
      </tbody>
    </table>
  `;

  /* =====================
   LIBRARY BUCKET COLLAPSE / EXPAND
===================== */

container.querySelectorAll(".library-group-header").forEach(header => {
  header.addEventListener("click", () => {
    const row = header.closest("tr");
    if (!row) return;

    let next = row.nextElementSibling;
    const collapsed = row.classList.toggle("collapsed");

    while (next && !next.classList.contains("library-group-row")) {
      next.style.display = collapsed ? "none" : "";
      next = next.nextElementSibling;
    }
  });
});
const rules320 = tasksData.filter(t =>
  t.frequency_hours === 320 &&
  t.is_planned === true &&
  t.deleted_at == null
);

console.table(
  rules320.map(t => ({
    task: t.task,
    section: t.section,
    unit: t.unit,
    freq: t.frequency_hours,
    duration: t.duration_min
  }))
);

}


/* =====================
   HELPERS
===================== */

function formatFrequency(hours) {
  if (!hours) return "—";
  if (hours % 720 === 0) return `${hours / 720} mo`;
  if (hours % 168 === 0) return `${hours / 168} wk`;
  if (hours % 24 === 0) return `${hours / 24} d`;
  return `${hours} h`;
}

function getContextValue(selectId, customInputId) {
  const select = document.getElementById(selectId);
  const custom = document.getElementById(customInputId);

  if (!select) return null;

  if (select.value === "__new__") {
    return custom?.value?.trim() || null;
  }

  return select.value || null;
}


/* =====================
   EVENTS
===================== */
document
  .getElementById("libraryModelSelect")
  ?.addEventListener("change", renderLibraryTable);

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLibrary();
  populateLibraryModels();
  renderLibraryTable();
});
/* =====================
   GENERATE LIBRARY FROM LIVE TASKS
===================== */
function generateLibraryFromTasks() {
  if (!Array.isArray(tasksData) || tasksData.length === 0) {
    alert("No tasks available to generate library");
    return;
  }

  const map = {};

  tasksData.forEach(t => {
    if (
      t.is_planned !== true ||
      !t.frequency_hours ||
      !t.machine_name
    ) return;

    const model = t.machine_name;

    if (!map[model]) {
      map[model] = [];
    }

    // avoid duplicates (same section + task + frequency)
    const exists = map[model].some(p =>
      p.section === t.section &&
      (p.unit || "") === (t.unit || "") &&
      p.task === t.task &&
      Number(p.frequency_hours) === Number(t.frequency_hours) &&
      Number(p.duration_min || 0) === Number(t.duration_min || 0) &&
      (p.type || "") === (t.type || "")
    );

    if (exists) return;

    map[model].push({
      section: t.section || "-",
      unit: t.unit || "-",
      task: t.task,
      type: t.type || "Preventive",
      frequency_hours: Number(t.frequency_hours),
      duration_min: t.duration_min ?? null,
      notes: "Generated from live tasks"
    });
  });

  // 🔄 Convert map → libraryData format
  libraryData = Object.entries(map).map(([model, plans]) => ({
    model,
    plans
  }));

  saveLibrary();
  populateLibraryModels();
  renderLibraryTable(); 

}

function renderLibrarySummary(plans) {
  const wrap = document.getElementById("librarySummary");
  const out = document.getElementById("libraryMonthlyWorkload");

  if (!wrap || !out || !Array.isArray(plans) || plans.length === 0) {
    if (wrap) wrap.style.display = "none";
    return;
  }

  let totalMinutes = 0;

  plans.forEach(p => {
    if (!p.frequency_hours || !p.duration_min) return;

    const runsPerMonth = 720 / Number(p.frequency_hours);
    if (runsPerMonth > 0 && Number.isFinite(runsPerMonth)) {
      totalMinutes += runsPerMonth * Number(p.duration_min);
    }
  });

  const hours = totalMinutes / 60;

  out.textContent =
    hours >= 1
      ? `~${hours.toFixed(1)} hours`
      : `${Math.round(totalMinutes)} min`;

  wrap.style.display = "block";
}
/* =====================
   PREVENTIVE LOAD INTELLIGENCE
   - Calculates monthly workload for preventive plans
   - Input: plans[] (from library or extracted tasks)
   - Output: { hours, minutes, tasksPerMonth, status }
===================== */
function calculatePreventiveMonthlyLoad(plans = []) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return {
      hours: 0,
      minutes: 0,
      tasksPerMonth: 0,
      status: "ok"
    };
  }

  const HOURS_PER_MONTH = 24 * 30;

  let totalMinutes = 0;
  let totalRuns = 0;

  plans.forEach(p => {
    const freq = Number(p.frequency_hours);
    const dur = Number(p.duration_min);

    if (!freq || freq <= 0) return;
    if (!dur || dur <= 0) return;

    const runsPerMonth = HOURS_PER_MONTH / freq;

    totalRuns += runsPerMonth;
    totalMinutes += runsPerMonth * dur;
  });

  const totalHours = totalMinutes / 60;

  // 🎯 Load status (tunable thresholds)
  let status = "ok";
  if (totalHours >= 20) status = "overload";
  else if (totalHours >= 8) status = "heavy";

  return {
    hours: Number(totalHours.toFixed(1)),
    minutes: Math.round(totalMinutes),
    tasksPerMonth: Math.round(totalRuns),
    status
  };
}
function getFrequencyBucket(hours) {
  if (!hours) {
    return {
      label: "—",
      bucket: "none",
      className: ""
    };
  }

  if (hours < 720) {
    return {
      label: "Bi-Weekly",
      bucket: "biweekly",
      className: "freq-biweekly"
    };
  }

  if (hours < 1440) {
    return {
      label: "Monthly",
      bucket: "monthly",
      className: "freq-monthly"
    };
  }

  if (hours < 2160) {
    return {
      label: "Bi-Monthly",
      bucket: "bimonthly",
      className: "freq-bimonthly"
    };
  }

  if (hours < 4320) {
    return {
      label: "Quarterly",
      bucket: "quarterly",
      className: "freq-quarterly"
    };
  }

  return {
    label: "Semi-Annual / Annual",
    bucket: "annual",
    className: "freq-annual"
  };
}
function getFrequencySortOrder(hours) {
  if (!hours) return 99;          // no frequency → last

  if (hours < 720) return 1;      // Bi-Weekly
  if (hours < 1440) return 2;     // Monthly
  if (hours < 2160) return 3;     // Bi-Monthly
  if (hours < 4320) return 4;     // Quarterly

  return 5;                       // Semi-Annual / Annual
}

/* =====================
   PREVENTIVE MODAL – CLOSE
===================== */
function closePreventiveModal() {
  const overlay = document.getElementById("addPreventiveOverlay");
  if (!overlay) return;

  overlay.style.display = "none";

  // Optional cleanup (safe)
  clearPreventiveErrors?.();
}

/* =====================
   SAVE PREVENTIVE (POST)
===================== */
document
  .getElementById("savePreventiveBtn")
  ?.addEventListener("click", async () => {

    clearPreventiveErrors();

    // =====================
    // FORM VALUES
    // =====================
    const assetId = getVal("pm-asset");
    const taskText = getVal("pm-task");
    const freqValue = Number(getVal("pm-frequency-value"));
    const freqUnit = getVal("pm-frequency-unit");
    const firstDue = getVal("pm-first-due");

    let hasError = false;

    // =====================
    // VALIDATION
    // =====================
    if (!assetId) {
      setPreventiveError("pm-asset", "Asset is required");
      hasError = true;
    }

    if (!taskText) {
      setPreventiveError("pm-task", "Task description is required");
      hasError = true;
    }

    if (!Number.isFinite(freqValue) || freqValue <= 0) {
      setPreventiveError(
        "pm-frequency-value",
        "Frequency must be greater than 0"
      );
      hasError = true;
    }

    if (!freqUnit) {
      setPreventiveError(
        "pm-frequency-unit",
        "Frequency unit is required"
      );
      hasError = true;
    }

    if (!firstDue) {
      setPreventiveError(
        "pm-first-due",
        "First due date is required"
      );
      hasError = true;
    }

    if (hasError) return;

    // =====================
    // FREQUENCY (NORMALIZED)
    // =====================
    const frequency_hours =
      freqUnit === "hours" ? freqValue : freqValue * 24;

    // =====================
    // MULTI-ASSET APPLY (ADD PREVENTIVE)
    // =====================
    const selectedAsset = assetsData.find(
      a => a.id === Number(assetId)
    );

    const model = selectedAsset?.model;

    const sameModelAssets = assetsData.filter(
      a => a.model === model
    );

    if (sameModelAssets.length > 1) {
      const msg =
        `This preventive rule will apply to:\n\n` +
        `• ${sameModelAssets.length} assets\n` +
        `• model: ${model}\n\n` +
        `Do you want to apply this rule to ALL assets of this model?\n\n` +
        `Only future work orders will be affected.`;

      const applyToAll = confirm(msg);

      if (applyToAll) {
        try {
          await applyPreventiveRule({
            section: getVal("pm-section") || null,
            task: taskText,
            frequency_hours,
            unit: getVal("pm-unit") || null,
            type: getVal("pm-type") || null,
            duration_min: Number(getVal("pm-duration")) || null,
            notes: getVal("pm-notes") || null
          });

          if (typeof loadTasks === "function") {
            await loadTasks();
          }

          if (typeof generateLibraryFromTasks === "function") {
            generateLibraryFromTasks();
          }

          closePreventiveModal();

          alert(
            `✔ Preventive rule created\n\n` +
            `Applied to ${sameModelAssets.length} assets (model ${model})`
          );

          return; // ⛔ STOP single-asset flow
        } catch (err) {
          console.error("APPLY PREVENTIVE RULE ERROR:", err);
          alert(err.message);
          return;
        }
      }
    }

    // =====================
    // SINGLE-ASSET PREVENTIVE (DEFAULT FLOW)
    // =====================
    const payload = {
      asset_id: assetId,
      section: getContextValue("pm-section", "pm-section-custom"),
      unit: getContextValue("pm-unit", "pm-unit-custom"),
      task: taskText,
      type: getVal("pm-type") || null,
      notes: getVal("pm-notes") || null,

      is_planned: true,
      status: "Planned",
      due_date: firstDue,
      duration_min: Number(getVal("pm-duration")) || null,
      frequency_hours
    };

    try {
      const res = await fetch(`${API}/preventives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create preventive");
      }

      if (typeof loadTasks === "function") {
        await loadTasks();
      }

      closePreventiveModal();

      document
        .querySelectorAll(
          "#addPreventiveOverlay input, #addPreventiveOverlay textarea, #addPreventiveOverlay select"
        )
        .forEach(el => (el.value = ""));

      if (typeof loadPreventiveLibrary === "function") {
        loadPreventiveLibrary();
      }

    } catch (err) {
      console.error("SAVE PREVENTIVE ERROR:", err);
      alert(err.message);
    }
  });


function setPreventiveError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  field.classList.add("field-error");

  let msg = field.parentElement.querySelector(".field-error-msg");
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "field-error-msg";
    field.parentElement.appendChild(msg);
  }

  msg.textContent = message;
}

function clearPreventiveErrors() {
  document
    .querySelectorAll(".field-error")
    .forEach(el => el.classList.remove("field-error"));

  document
    .querySelectorAll(".field-error-msg")
    .forEach(el => el.remove());
}
function populatePreventiveAssets() {
  const sel = document.getElementById("pm-asset");
  if (!sel) return;

  sel.innerHTML = `<option value="">Select Asset</option>`;

  if (!Array.isArray(assetsData)) return;

  assetsData.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.model} • SN ${a.serial_number}`;
    opt.dataset.line = a.line || "";
    opt.dataset.model = a.model || "";
    opt.dataset.serial = a.serial_number || "";
    sel.appendChild(opt);
  });
}
document.getElementById("pm-asset")?.addEventListener("change", e => {
  console.log("[PM ASSET CHANGE] fired");
  const sel = e.target;
  const opt = sel.options[sel.selectedIndex];
  console.log("[PM ASSET CHANGE] selected option =", opt);

  if (!opt || !opt.value) {
    console.warn("[PM ASSET CHANGE] no option or empty value");
    clearPreventiveAssetContext();
    return;
  }
  console.log("[PM ASSET CHANGE] dataset =", opt.dataset);

  // =====================
  // AUTO-FILL CONTEXT
  // =====================
  setVal("pm-line", opt.dataset.line);
  setVal("pm-machine", opt.dataset.model);
  setVal("pm-serial", opt.dataset.serial);
  lockPreventiveAssetFields(true);

  const model = opt.dataset.model;

  // =====================
  // POPULATE SECTION / UNIT
  // =====================
  populateContextDropdown({
    model,
    field: "section",
    selectId: "pm-section",
    allLabel: "All sections",
    newLabel: "➕ New section…"
  });

  populateContextDropdown({
    model,
    field: "unit",
    selectId: "pm-unit",
    allLabel: "All units",
    newLabel: "➕ New unit…"
  });
});

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

function lockPreventiveAssetFields(lock) {
  ["pm-line", "pm-machine", "pm-serial"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.disabled = lock;
    el.classList.toggle("locked", lock);
  });
}

function clearPreventiveAssetContext() {
  setVal("pm-line", "");
  setVal("pm-machine", "");
  setVal("pm-serial", "");
  lockPreventiveAssetFields(false);
}
/* =====================
   EDIT PREVENTIVE – CLICK HANDLER
===================== */

document.addEventListener("click", e => {
  const btn = e.target.closest(".edit-preventive-btn");
  if (!btn) return;

  e.stopPropagation();

  let preventive;
  try {
    preventive = JSON.parse(
      decodeURIComponent(btn.dataset.preventive)
    );
  } catch (err) {
    console.error("Failed to parse preventive data", err);
    alert("Cannot open preventive (invalid data)");
    return;
  }

  openEditPreventiveModal(preventive);
});
/* =====================
   OPEN + PREFILL EDIT PREVENTIVE MODAL
===================== */

function openEditPreventiveModal(preventive) {
  console.log("Preventive object:", preventive);
  if (!preventive) return;

  // Keep reference for save step later
  window.currentEditPreventive = preventive;

  // 🔍 Update affected assets info (requires model on preventive)
  updatePreventiveAffectedInfo(preventive);

  // =====================
  // CONTEXT (READ-ONLY)
  // =====================
  const assetModelEl = document.getElementById("ep-asset-model");
  const sectionLabelEl = document.getElementById("ep-section");
  const freqLabelEl = document.getElementById("ep-frequency-label");

  if (assetModelEl) {
    assetModelEl.textContent = preventive.model || "—";
  }

  if (sectionLabelEl) {
    sectionLabelEl.textContent = preventive.section || "—";
  }

  if (freqLabelEl) {
    freqLabelEl.textContent =
      preventive.frequency_hours
        ? `${preventive.frequency_hours} h`
        : "—";
  }

  // =====================
  // FORM FIELDS
  // =====================
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setVal("ep-task", preventive.task);
  setVal("ep-type", preventive.type);
  setVal("ep-unit", preventive.unit);
  setVal("ep-frequency", preventive.frequency_hours);
  setVal("ep-duration", preventive.duration_min);
  setVal("ep-notes", preventive.notes);

  // =====================
  // SHOW MODAL
  // =====================
  const overlay = document.getElementById("editPreventiveOverlay");
  if (overlay) {
    overlay.style.display = "flex";
  }

  // UX polish
  document.getElementById("ep-task")?.focus();
}

/* =====================
   CLOSE EDIT PREVENTIVE MODAL
===================== */
function closeEditPreventiveModal() {
  const overlay = document.getElementById("editPreventiveOverlay");
  if (overlay) overlay.style.display = "none";

  window.currentEditPreventive = null;
}
/* =====================
   VALIDATE EDIT PREVENTIVE
===================== */

function validateEditPreventive() {
  clearPreventiveErrors();

  let valid = true;

  const task = getVal("ep-task");
  const frequency = Number(getVal("ep-frequency"));
  const duration = Number(getVal("ep-duration"));

  // =====================
  // REQUIRED: TASK
  // =====================
  if (!task) {
    setPreventiveError("ep-task", "Task description is required");
    valid = false;
  }

  // =====================
  // REQUIRED: FREQUENCY
  // =====================
  if (!Number.isFinite(frequency) || frequency <= 0) {
    setPreventiveError(
      "ep-frequency",
      "Frequency must be a number greater than 0 (hours)"
    );
    valid = false;
  }

  // =====================
  // OPTIONAL BUT VALIDATED: DURATION
  // =====================
  if (getVal("ep-duration") && (!Number.isFinite(duration) || duration <= 0)) {
    setPreventiveError(
      "ep-duration",
      "Duration must be a positive number (minutes)"
    );
    valid = false;
  }

  return valid;
}
document
  .getElementById("saveEditPreventiveBtn")
  ?.addEventListener("click", saveEditPreventive);

/* =====================
   SAVE + APPLY EDIT PREVENTIVE
===================== */

async function saveEditPreventive() {
  if (!window.currentEditPreventive) {
    alert("No preventive selected");
    return;
  }

  if (!validateEditPreventive()) {
    return;
  }

  // 🔒 Update rule IN MEMORY only (no backend save here)
  window.currentEditPreventive = {
    ...window.currentEditPreventive,
    task: getVal("ep-task"),
    type: getVal("ep-type") || null,
    unit: getVal("ep-unit") || null,
    frequency_hours: Number(getVal("ep-frequency")),
    duration_min: getVal("ep-duration")
      ? Number(getVal("ep-duration"))
      : null,
    notes: getVal("ep-notes") || null
  };
}

document
  .getElementById("saveEditPreventiveBtn")
  ?.addEventListener("click", async () => {

    if (!window.currentEditPreventive) {
      alert("No preventive selected");
      return;
    }

    // 🔒 Basic validation
    const freq = Number(getVal("ep-frequency"));
    if (!freq || freq <= 0) {
      alert("Frequency must be greater than 0");
      return;
    }

    // Save edits locally
    saveEditPreventive();

    // 🔎 Affected assets confirmation
    const affectedCount =
      Number(document.getElementById("ep-affected-count")?.textContent) || 0;

    if (affectedCount > 0) {
      const ok = confirm(
        `This preventive rule applies to ${affectedCount} assets.\n\nApply changes to all future work orders?`
      );
      if (!ok) return;
    }

    try {
      // 🔥 APPLY RULE (single source of truth)
      await applyPreventiveRule(window.currentEditPreventive);

      // 🔄 Refresh data
      if (typeof loadTasks === "function") {
        await loadTasks();
      }

      if (typeof loadHistory === "function") {
        await loadHistory();
      }

      if (typeof generateLibraryFromTasks === "function") {
        generateLibraryFromTasks();
      }

      closeEditPreventiveModal();

      alert(
        "✔ New preventive rule created\n\n" +
        "Applied to 1 asset"
      );

    } catch (err) {
      console.error("APPLY PREVENTIVE ERROR:", err);
      alert(err.message);
    }
  });
document
  .getElementById("disablePreventiveBtn")
  ?.addEventListener("click", async () => {

    if (!window.currentEditPreventive) {
      alert("No preventive rule selected");
      return;
    }

    const rule = window.currentEditPreventive;

    const model =
      document.getElementById("libraryModelSelect")?.value;

    if (!model) {
      alert("Asset model is required");
      return;
    }

    // =====================
    // 1️⃣ PREVIEW AFFECTED ASSETS
    // =====================
    let affected = 0;

    try {
      const res = await fetch(
        `${API}/preventives/delete-rule/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cmms-role": window.currentUserRole
          },
          body: JSON.stringify({
            model,
            section: rule.section,
            task: rule.task,
            unit: rule.unit || null
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Preview failed");
      }

      const data = await res.json();
      affected = Number(data.affected_assets) || 0;

    } catch (err) {
      console.error("DELETE PREVIEW ERROR:", err);
      alert(err.message);
      return;
    }

    // =====================
    // 2️⃣ CONFIRM
    // =====================
    const msg =
      affected > 0
        ? `⚠️ This preventive rule will be removed from ${affected} assets.\n\nOnly future preventive work orders will be affected.\n\nProceed?`
        : `ℹ️ This preventive rule is not applied to any assets.\n\nDisabling it will prevent future use.\n\nProceed?`;

    if (!confirm(msg)) return;

    // =====================
    // 3️⃣ SOFT DELETE
    // =====================
    try {
      const res = await fetch(
        `${API}/preventives/delete-rule`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-cmms-role": window.currentUserRole
          },
          body: JSON.stringify({
            model,
            section: rule.section,
            task: rule.task,
            unit: rule.unit || null
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }

      // 🔄 Refresh
      if (typeof loadTasks === "function") {
        await loadTasks();
      }

      if (typeof generateLibraryFromTasks === "function") {
        generateLibraryFromTasks();
      }

      closeEditPreventiveModal();
      alert("✔ Preventive rule disabled");

    } catch (err) {
      console.error("DELETE RULE ERROR:", err);
      alert(err.message);
    }
  });


// =====================
// PREVENTIVE UI HELPERS
// =====================

function calculateAffectedAssetsForRule(rule) {
  if (!Array.isArray(tasksData)) return 0;

  const assets = new Set();

  tasksData.forEach(t => {
    if (
      t.machine_name === rule.model &&
      t.is_planned === true &&
      t.frequency_hours &&
      t.status === "Planned" &&
      t.section === rule.section &&
      t.unit === rule.unit &&
      t.task === rule.task &&
      t.type === rule.type
    ) {
      assets.add(t.asset_id);
    }
  });

  return assets.size;
}

function updatePreventiveAffectedInfo(rule) {
  console.log("updatePreventiveAffectedInfo called with:", rule);

  const box = document.getElementById("ep-affected-info");
  const label = document.getElementById("ep-affected-count");
  const muted = box?.querySelector(".muted");

  if (!box || !label || !Array.isArray(tasksData)) return;

  const model =
    rule.model ||
    document.getElementById("libraryModelSelect")?.value;

  if (!model) {
    box.style.display = "none";
    return;
  }

  const affectedAssetIds = new Set();

  tasksData.forEach(t => {
    if (
      t.is_planned === true &&
      Number(t.frequency_hours) === Number(rule.frequency_hours) &&
      t.section === rule.section &&
      t.machine_name === model
    ) {
      affectedAssetIds.add(t.asset_id);
    }
  });

  const count = affectedAssetIds.size;

  console.log("Affected assets count =", count);

  box.style.display = "block";
  label.textContent = count;

  if (muted) {
    muted.textContent =
      count > 0
        ? "Changes will affect future work orders only."
        : "This preventive rule is not yet applied to any assets.";
  }
}

// =====================
// CONFIRMATION FLOW
// =====================

function openPreventiveConfirm() {
  const overlay = document.getElementById("confirmPreventiveApplyOverlay");
  const label = document.getElementById("cp-asset-count");

  if (label) {
    label.textContent = window.currentPreventiveAffectedCount || 0;
  }

  overlay.style.display = "flex";
}

function closePreventiveConfirm() {
  document.getElementById("confirmPreventiveApplyOverlay").style.display = "none";
}
/* =====================
   APPLY PREVENTIVE RULE TO ASSETS
   - Creates or updates preventive tasks based on the rule's model + frequency
    - If a preventive with the same model + frequency exists, it updates the existing one
    - Otherwise, it creates a new preventive task
    - This allows for both one-off and reusable preventive rules
===================== */

async function applyPreventiveRule(rule) {
  // Fallback safety: allow call without arg
  const preventive = rule || window.currentEditPreventive;

  if (!preventive) {
    alert("No preventive rule selected");
    return;
  }

  const model =
    document.getElementById("libraryModelSelect")?.value;

  if (!model) {
    alert("Asset model is required");
    return;
  }

  const payload = {
    model,                               // 🔑 REQUIRED
    section: preventive.section,         // 🔑 REQUIRED
    task: preventive.task,               // 🔑 REQUIRED
    frequency_hours: Number(getVal("ep-frequency")), // 🔑 REQUIRED
    unit: preventive.unit || null,          // ✅ CORRECT

    // optional / editable
    duration_min: Number(getVal("ep-duration")) || null,
    type: getVal("ep-type") || null,
    notes: getVal("ep-notes") || null
  };

  const res = await fetch(`${API}/preventives/apply-rule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to apply preventive");
  }
  // 🔄 Refresh data after successful apply
await loadTasks();

// 🔁 Re-generate preventive library from updated tasks
generateLibraryFromTasks();
}
/* =====================
   UNIT DROPDOWN POPULATION
   - Populates the unit dropdown based on the selected model's existing units
   - Also includes options for "All units" and "New unit"
===================== */

function populateSectionDropdown(model) {
  const select = document.getElementById("pm-section");
  if (!select) return;

  // reset
  select.innerHTML = "";

  
  // ALL SECTIONS (DEFAULT)
  
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All sections";
  select.appendChild(optAll);

  if (!model || !Array.isArray(assetsData)) return;

  
  // COLLECT UNIQUE SECTIONS
  
  const sections = Array.from(
    new Set(
      assetsData
        .filter(a => a.model === model)
        .map(a => (a.section || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  
  // EXISTING SECTIONS
  
  sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec;
    opt.textContent = sec;
    select.appendChild(opt);
  });

  
  // SEPARATOR
  
  if (sections.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    select.appendChild(sep);
  }

  // =====================
  // NEW SECTION OPTION
  // =====================
  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = "➕ New section…";
  select.appendChild(optNew);
}
/* =====================
   POPULATE UNIT DROPDOWN BASED ON SELECTED MODEL
===================== */

function populateUnitDropdown(model) {
  const select = document.getElementById("pm-unit");
  if (!select) return;

  // reset
  select.innerHTML = "";

  // =====================
  // ALL UNITS (DEFAULT)
  // =====================
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All units";
  select.appendChild(optAll);

  if (!model || !Array.isArray(assetsData)) return;

  // =====================
  // COLLECT UNIQUE UNITS
  // =====================
  const units = Array.from(
    new Set(
      assetsData
        .filter(a => a.model === model)
        .map(a => (a.unit || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  // =====================
  // EXISTING UNITS
  // =====================
  units.forEach(unit => {
    const opt = document.createElement("option");
    opt.value = unit;
    opt.textContent = unit;
    select.appendChild(opt);
  });

  // =====================
  // SEPARATOR
  // =====================
  if (units.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    select.appendChild(sep);
  }

  // =====================
  // NEW UNIT OPTION
  // =====================
  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = "➕ New unit…";
  select.appendChild(optNew);
}
function populateContextDropdown({
  model,
  field,          // "section" | "unit"
  selectId,
  allLabel,
  newLabel
}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = "";

  // =====================
  // ALL (wildcard)
  // =====================
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  select.appendChild(optAll);

  if (!model || !Array.isArray(tasksData)) return;

  // =====================
  // COLLECT FROM TASKS
  // =====================
  const values = Array.from(
    new Set(
      tasksData
        .filter(t =>
          t.machine_name === model &&
          t.is_planned === true &&
          t[field]
        )
        .map(t => t[field].trim())
    )
  ).sort((a, b) => a.localeCompare(b));

  values.forEach(val => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    select.appendChild(opt);
  });

  if (values.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    select.appendChild(sep);
  }

  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = newLabel;
  select.appendChild(optNew);
}

function handleContextCustomInput({
  selectId,
  inputId
}) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);

  if (!select || !input) return;

  select.addEventListener("change", () => {
    if (select.value === "__new__") {
      input.style.display = "block";
      input.value = "";
      input.focus();
    } else {
      input.style.display = "none";
      input.value = "";
    }
  });
}


/* =====================
   PRINT PREVENTIVE PLAN (LIBRARY / MODEL)
===================== */
function printPreventivePlan() {
  console.log("PRINT CLICK HANDLER FIRED");

  const model = document.getElementById("libraryModelSelect")?.value;
  console.log("MODEL SELECTED:", model);

  if (!model) {
    alert("Select a model first");
    return;
  }

  const asset = assetsData.find(a => a.model === model);

  if (!asset) {
    alert("No asset found for selected model");
    return;
  }

  // ♻ reuse WORKING asset print
  printAssetPreventivePlan(asset.serial_number);
}
/* =====================
   BUILD PREVENTIVE PLAN REPORT
   - Aggregates rules for a model and calculates metrics
===================== */

function buildModelPreventivePlanReport(model, rules) {
  let executionsPerYear = 0;
  let workloadHoursPerYear = 0;

  const enriched = rules.map(r => {
    const perYear = 8760 / Number(r.frequency_hours);
    const workload = perYear * ((Number(r.duration_min) || 0) / 60);

    executionsPerYear += perYear;
    workloadHoursPerYear += workload;

    return {
      task: r.task,
      section: r.section,
      unit: r.unit,
      frequency_hours: r.frequency_hours,
      duration_min: r.duration_min
    };
  });

  return {
    model,
    rules: enriched,
    metrics: {
      totalRules: enriched.length,
      executionsPerYear: Math.round(executionsPerYear),
      workloadHoursPerYear: Math.round(workloadHoursPerYear)
    }
  };
}
console.log("📌 printPreventiveLibrary.js loaded");

const printBtn = document.getElementById("printLibraryBtn");
console.log("🖨 printLibraryBtn =", printBtn);

if (printBtn) {
  printBtn.addEventListener("click", printPreventivePlan);
  console.log("✅ Print button handler attached");
} else {
  console.error("❌ printLibraryBtn NOT FOUND in DOM");
}







