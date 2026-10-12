/*================================
   IMPORT EXCEL (PREVIEW + COMMIT)
 =================================*/

async function importExcel() {
  if (!hasRole("planner", "admin")) {
    alert("Not allowed");
    return;
  }

  const file = getEl("excelFile").files[0];
  if (!file) return alert("Select Excel");

  importExcelFile = file;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API}/importExcel/preview`, {
    method: "POST",
    body: fd
  });

  const data = await res.json();

  const tbody = getEl("importPreviewTable").querySelector("tbody");
  tbody.innerHTML = "";

  data.rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.row}</td>
      <td>${r.key?.line}</td>
      <td>${r.key?.machine}</td>
      <td>${r.key?.serial_number}</td>
      <td>${r.cleaned?.task}</td>
      <td>${r.status}</td>
      <td>${r.error || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  getEl("importSummary").textContent =
    data.summary.errors > 0
      ? `❌ Errors: ${data.summary.errors}`
      : `✅ Ready: ${data.summary.ok}`;

  getEl("confirmImportBtn").disabled = data.summary.errors > 0;
  getEl("importPreviewOverlay").style.display = "flex";
}

/* 🔥 STEP 2 — STORE IMPORT METADATA */
async function confirmImport() {
  const fd = new FormData();
  fd.append("file", importExcelFile);

  await fetch(`${API}/importExcel/commit`, {
    method: "POST",
    body: fd
  });

  // 🔥 SAVE LAST IMPORT INFO (PERSISTENT)
  const info = {
    file: importExcelFile?.name || "Unknown file",
    at: new Date().toISOString()
  };
  localStorage.setItem("lastExcelImport", JSON.stringify(info));

  // 🔥 UPDATE HEADER UI
  updateImportStatusUI();

  getEl("importPreviewOverlay").style.display = "none";
  loadTasks();
}

/* 🔥 UI HELPER — HEADER STATUS */
function updateImportStatusUI() {
  const el = getEl("importStatus");
  if (!el) return;

  const raw = localStorage.getItem("lastExcelImport");
  if (!raw) {
    el.textContent = "No Excel imported yet";
    return;
  }

  const info = JSON.parse(raw);
  el.textContent =
    `📄 ${info.file} · ${new Date(info.at).toLocaleString("el-GR")}`;
}

/* 🔥 CALL ON APP LOAD */
document.addEventListener("DOMContentLoaded", updateImportStatusUI);

getEl("importExcelBtn")?.addEventListener("click", importExcel);
getEl("confirmImportBtn")?.addEventListener("click", confirmImport);
getEl("closeImportPreviewBtn")?.addEventListener("click", () => {
getEl("importPreviewOverlay").style.display = "none";
});