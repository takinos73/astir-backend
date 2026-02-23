// frontend/js/core/state.js

export const state = {

  // =====================
  // DATA
  // =====================
  tasksData: [],
  assetsData: [],
  executionsData: [],
  mttrData: [],

  // =====================
  // TASKS FILTERS
  // =====================
  taskDateFrom: null,
  taskDateTo: null,
  activeDateFilter: "all",
  activeAssetFilter: "all",
  activeTaskTypeFilter: "all",

  dueDateFrom: null,
  dueDateTo: null,

  // =====================
  // HISTORY FILTERS
  // =====================
  historyDateRange: 7,
  historyMachineQuery: "",
  historyTechnicianQuery: "",
  historyTypeFilter: "all",
  historyDateFrom: null,
  historyDateTo: null,
  historyTypeFilters: new Set(["preventive", "planned", "breakdown"]),

  // =====================
  // SNAPSHOT / IMPORT
  // =====================
  pendingSnapshotJson: null,
  loadedSnapshotName: null,
  importExcelFile: null,

  // =====================
  // BREAKDOWN EDIT
  // =====================
  editingBreakdownId: null,

  // =====================
  // ASSET VIEW
  // =====================
  currentAssetSerial: null,
  assetScopedTasks: [],
  assetAllTasks: [],
  assetActiveTasks: [],
  assetHistoryTasks: [],
  currentViewedTask: null,

  assetSelectedTaskIds: new Set(),
  bulkDoneMode: false,

  // =====================
  // TASK DONE FLOW
  // =====================
  pendingTaskId: null
};

// 🔥 CRITICAL: expose globally για να μη σπάσει τίποτα
window.state = state;