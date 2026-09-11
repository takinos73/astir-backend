//----------------------
// TASK TYPE HELPER
//----------------------

function getStatusFilterLabel() {
  if (state.activeTaskTypeFilter === "planned") return "Planned (Manual)";
  if (state.activeTaskTypeFilter === "preventive") return "Preventive";
  return "ALL";
}

function getAssetFilterLabel() {
  if (state.activeAssetFilter === "all" || !state.activeAssetFilter) {
    return "ALL MACHINES";
  }

  // expected format: "PMC250||437063"
  const [machine, serial] = state.activeAssetFilter.split("||");

  if (!machine) return "ALL MACHINES";

  return serial
    ? `${machine} (${serial})`
    : machine;
}


function getCurrentPeriodLabel() {
  // 🟢 αν υπάρχει custom date range
  if (state.taskDateFrom || state.taskDateTo) {
    const from = state.taskDateFrom ? formatDate(state.taskDateFrom) : "—";
    const to = state.taskDateTo ? formatDate(state.taskDateTo) : "—";
    return `${from} → ${to}`;
  }

  // 🟢 αλλιώς quick filter
  if (state.activeDateFilter && state.activeDateFilter !== "all") {
    return state.activeDateFilter.toUpperCase();
  }

  return "ALL";
}

// =====================
// TASK TYPE FILTER
// =====================
function filterByTaskType(tasks) {
  

  if (!Array.isArray(tasks)) return [];

  if (state.activeTaskTypeFilter === "planned") {
    return tasks.filter(t => isPlannedManual(t));
  }

  if (state.activeTaskTypeFilter === "preventive") {
    return tasks.filter(t => isPreventive(t));
  }
console.log("filterByTaskType():", state.activeTaskTypeFilter, "sample:", tasks?.[0]);
  // implicit ALL
  return tasks;
}

//======================
// FILTERED TASKS FOR PRINTING
//======================

function getFilteredTasksForPrint() {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return filterByTaskType(state.tasksData)   // 🟢 ← ΜΟΝΗ ΑΛΛΑΓΗ

    // ASSET FILTER (CUSTOM DROPDOWN)
    .filter(t => {
      if (state.activeAssetFilter === "all") return true;
      return `${t.machine_name}||${t.serial_number}` === state.activeAssetFilter;
    })

    // QUICK DATE FILTER (Today / Week / Overdue)
    .filter(t => {
      if (state.activeDateFilter === "all") return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);

      if (state.activeDateFilter === "today") {
        return due.getTime() === today.getTime();
      }

      if (state.activeDateFilter === "week") {
        return due >= today && due <= weekEnd;
      }

      if (state.activeDateFilter === "overdue") {
        return due < today;
      }

      return true;
    })

    // TASK DATE RANGE FILTER (From – To)
    .filter(t => {
      if (!state.taskDateFrom && !state.taskDateTo) return true;
      if (!t.due_date) return false;

      const due = new Date(t.due_date);

      if (state.taskDateFrom && due < state.taskDateFrom) return false;
      if (state.taskDateTo && due > state.taskDateTo) return false;

      return true;
    });
}