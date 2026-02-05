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
        <td colspan="4">
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
        </tr>
      `;
    }).join("");

    return groupHeader + rowsHtml;
  }).join("");

  container.innerHTML = `
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
      p.task === t.task &&
      Number(p.frequency_hours) === Number(t.frequency_hours)
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

  alert("Preventive Library generated from live tasks ✅");
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
document.getElementById("savePreventiveBtn")?.addEventListener("click", async () => {
  clearPreventiveErrors();

  const assetId = getVal("pm-asset");
  const task = getVal("pm-task");
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

  if (!task) {
    setPreventiveError("pm-task", "Task description is required");
    hasError = true;
  }

  if (!Number.isFinite(freqValue) || freqValue <= 0) {
    setPreventiveError("pm-frequency-value", "Frequency must be greater than 0");
    hasError = true;
  }

  if (!freqUnit) {
    setPreventiveError("pm-frequency-unit", "Frequency unit is required");
    hasError = true;
  }

  if (!firstDue) {
    setPreventiveError("pm-first-due", "First due date is required");
    hasError = true;
  }

  if (hasError) return;

  // =====================
  // PAYLOAD (MATCHES EXISTING MODEL)
  // Preventive = Planned + Frequency
  // =====================
  const payload = {
    asset_id: assetId,
    section: getVal("pm-section") || null,
    unit: getVal("pm-unit") || null,
    task: task,
    type: getVal("pm-type") || null,
    notes: getVal("pm-notes") || null,

    is_planned: true,
    status: "Planned",

    due_date: firstDue,

    duration_min: Number(getVal("pm-duration")) || null,

    // 👇 this is what makes it preventive
    frequency_hours: freqUnit === "hours" ? freqValue : freqValue * 24
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
    // ✅ NEW
    if (typeof loadTasks === "function") {
      await loadTasks();
    }

    // Close modal
    closePreventiveModal();

    // =====================
    // SUCCESS UX
    // =====================
    document.getElementById("addPreventiveOverlay").style.display = "none";

    // Reset form
    document
      .querySelectorAll(
        "#addPreventiveOverlay input, #addPreventiveOverlay textarea, #addPreventiveOverlay select"
      )
      .forEach(el => (el.value = ""));

    // Refresh Library
    if (typeof loadPreventiveLibrary === "function") {
      loadPreventiveLibrary();
    }

    console.log("Preventive created successfully");

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
  const sel = e.target;
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) {
    clearPreventiveAssetContext();
    return;
  }

  // Auto-fill
  setVal("pm-line", opt.dataset.line);
  setVal("pm-machine", opt.dataset.model);
  setVal("pm-serial", opt.dataset.serial);

  // Lock fields
  lockPreventiveAssetFields(true);
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







