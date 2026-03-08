// =====================
// LOAD TECHNICIANS
// =====================
async function loadTechnicians() {

  const res = await fetch(`${API}/technicians`);
  const data = await res.json();

  console.log("TECHNICIANS RESPONSE:", data);

  state.techniciansData = data;

  renderTechniciansTable();
  refreshTechnicianDropdowns();
}

/**
 * Refreshes all technician-related dropdowns across the app.
 * Call this after adding/editing/deleting a technician to ensure
 * all dropdowns show the latest data.
 */

function refreshTechnicianDropdowns() {

  if (typeof populateTechnicianDropdown === "function") {
    populateTechnicianDropdown();
  }

  if (typeof populateBreakdownTechnicians === "function") {
    populateBreakdownTechnicians();
  }

  if (typeof populateEditTechnicianDropdown === "function") {
    populateEditTechnicianDropdown();
  }

  if (typeof populateHistoryTechnicianFilter === "function") {
    populateHistoryTechnicianFilter();
  }

}


// =====================
// RENDER TABLE
// =====================
function renderTechniciansTable() {

  const tbody = document.querySelector("#techniciansTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  state.techniciansData.forEach(t => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.role || "-"}</td>
      <td>${t.status || "Active"}</td>

      <td>
        <button class="btn-icon" onclick="editTechnician(${t.id})">✏️</button>
        <button class="btn-icon" onclick="deleteTechnician(${t.id})">🗑</button>
      </td>
    `;

    tbody.appendChild(tr);

  });

}


// =====================
// OPEN ADD MODAL
// =====================
function openAddTechnician() {

  state.currentEditingTechnician = null;

  document.getElementById("technicianModalTitle").textContent =
    "Add Technician";

  document.getElementById("tech-name").value = "";
  document.getElementById("tech-role").value = "technician";
  document.getElementById("tech-status").value = "active";

  document.getElementById("technicianModalOverlay").style.display = "flex";
}


// =====================
// OPEN EDIT MODAL
// =====================
function editTechnician(id) {

  const tech = state.techniciansData.find(t => t.id === id);

  if (!tech) {
    alert("Technician not found");
    return;
  }

  state.currentEditingTechnician = id;

  document.getElementById("technicianModalTitle").textContent =
    "Edit Technician";

  document.getElementById("tech-name").value = tech.name || "";
  document.getElementById("tech-role").value = tech.role || "technician";
  document.getElementById("tech-status").value = tech.status || "active";
  document.getElementById("technicianModalOverlay").style.display = "flex";
}


// =====================
// CLOSE MODAL
// =====================
function closeTechnicianModal() {

  document.getElementById("technicianModalOverlay").style.display = "none";

}

// =====================
// SAVE TECHNICIAN
// =====================
async function saveTechnician() {

  const saveBtn = document.getElementById("saveTechnicianBtn");

  if (saveBtn.disabled) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const name = document.getElementById("tech-name").value.trim();
  const role = document.getElementById("tech-role").value;
  const status = document.getElementById("tech-status").value;

  if (!name) {
    alert("Name is required");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
    return;
  }

  const editingId = state.currentEditingTechnician;

  const url = editingId
    ? `${API}/technicians/${editingId}`
    : `${API}/technicians`;

  const method = editingId ? "PATCH" : "POST";

  try {

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        role,
        active: status === "active"
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Save failed");
    }

    const savedTech = await res.json();

    closeTechnicianModal();

    // ADD
    if (!editingId) {
      state.techniciansData.push(savedTech);
    }

    // EDIT
    else {
      const index = state.techniciansData.findIndex(t => t.id === editingId);
      if (index !== -1) {
        state.techniciansData[index] = savedTech;
      }
    }

    renderTechniciansTable();
    refreshTechnicianDropdowns();

    saveBtn.disabled = false;
    saveBtn.textContent = "Save";

  } catch (err) {

    saveBtn.disabled = false;
    saveBtn.textContent = "Save";

    console.error("SAVE TECHNICIAN ERROR:", err);
    alert(err.message);

  }

}
// =====================
// DELETE TECHNICIAN
// =====================
async function deleteTechnician(id) {

  if (!confirm("Delete this technician?")) return;

  try {

    const res = await fetch(`${API}/technicians/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Delete failed");
    }

    // 🔹 remove from state
    state.techniciansData =
      state.techniciansData.filter(t => t.id !== id);

    // 🔹 re-render table
    renderTechniciansTable();
    refreshTechnicianDropdowns();

  } catch (err) {

    console.error("DELETE TECHNICIAN ERROR:", err);
    alert(err.message);

  }

}

// =====================
// BUTTON EVENTS
// =====================

document
  .getElementById("addTechnicianBtn")
  ?.addEventListener("click", openAddTechnician);

document
  .getElementById("cancelTechnicianBtn")
  ?.addEventListener("click", closeTechnicianModal);

document
  .getElementById("saveTechnicianBtn")
  ?.addEventListener("click", saveTechnician);

document
  .querySelector('[data-tab="technicians"]')
  ?.addEventListener("click", loadTechnicians);