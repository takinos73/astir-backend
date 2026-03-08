// frontend/js/core/state.js

window.state = {

  // DATA
  tasksData: [],
  assetsData: [],
  executionsData: [],
  mttrData: [],

  // TASK FILTERS
  taskDateFrom: null,
  taskDateTo: null,
  pendingTaskId : null,
  activeDateFilter: "all",
  activeAssetFilter: "all",
  activeTaskTypeFilter: "all",
  dueDateFrom: null,
  dueDateTo: null,

  // HISTORY FILTERS
  historyDateRange: 7,
  historyMachineQuery: "",
  historyTechnicianQuery: "",
  historyTypeFilter: "all",
  historyDateFrom: null,
  historyDateTo: null,
  historyTypeFilters: new Set(["preventive", "planned", "breakdown"]),

  // SNAPSHOT / IMPORT
  pendingSnapshotJson: null,
  loadedSnapshotName: null,
  importExcelFile: null,

  // BREAKDOWN EDIT
  editingBreakdownId: null,

  // ASSET VIEW
  currentAssetSerial: null,
  assetScopedTasks: [],
  assetAllTasks: [],
  assetActiveTasks: [],
  assetHistoryTasks: [],
  currentViewedTask: null,

  assetSelectedTaskIds: new Set(),
  bulkDoneMode: false,

// =====================
// ASSET HISTORY FILTER STATE
// =====================
 assetHistoryTypeFilter : "all", // all | breakdown | preventive | planned
 lockSectionOnce : false,
 followUpSectionValue : null,

 // TECHNICIANS
 techniciansData: [],
 currentEditingTechnician: null,
  
};