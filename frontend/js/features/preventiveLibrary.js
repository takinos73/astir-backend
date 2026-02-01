/* =====================
   PREVENTIVE LIBRARY (FRONTEND)
   Scope: Asset Model (PTC027, PMC250, PMC300, PMC500)
===================== */

const LIBRARY_STORAGE_KEY = "cmmsPreventiveLibrary";

/* =====================
   DEFAULT SEED (FIRST LOAD)
===================== */
const DEFAULT_LIBRARY = [
  {
    id: crypto.randomUUID(),
    model: "PMC250",
    task: "Λίπανση κύριων αξόνων",
    type: "Preventive",
    frequency_hours: 168, // weekly
    duration_min: 30
  },
  {
    id: crypto.randomUUID(),
    model: "PMC250",
    task: "Έλεγχος ιμάντων",
    type: "Inspection",
    frequency_hours: 720, // monthly
    duration_min: 20
  },
  {
    id: crypto.randomUUID(),
    model: "PTC027",
    task: "Καθαρισμός αισθητήρων",
    type: "Preventive",
    frequency_hours: 336,
    duration_min: 25
  }
];

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
/* =====================
   RENDER LIBRARY TABLE
===================== */
function renderLibraryTable() {
  const tbody = document.querySelector("#libraryTable tbody");
  if (!tbody) return;

  const modelFilter =
    document.getElementById("libraryModelSelect")?.value || "all";

  const rows = libraryData.filter(r =>
    modelFilter === "all" ? true : r.model === modelFilter
  );

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding:12px; color:#777;">
          No preventive plan for this model
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.model}</strong></td>
      <td>${r.task}</td>
      <td>${r.type}</td>
      <td>${formatFrequency(r.frequency_hours)}</td>
      <td>${r.duration_min} min</td>
      <td>
        <button class="btn-secondary btn-small" disabled>
          ✏️
        </button>
      </td>
    </tr>
  `).join("");
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
document.getElementById("libraryModelSelect")
  ?.addEventListener("change", renderLibraryTable);

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLibrary();
  renderLibraryTable();
});
