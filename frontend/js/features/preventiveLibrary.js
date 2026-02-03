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
   RENDERING
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

  const load = calculatePreventiveMonthlyLoad(entry.plans);

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
        ${entry.plans.map(r => {
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
        }).join("")}
      </tbody>
    </table>
  `;
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






