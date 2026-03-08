// =====================
// LOAD TECHNICIANS
// =====================
async function loadTechnicians() {

  const res = await fetch(`${API}/technicians`);
  state.techniciansData = await res.json();

  renderTechniciansTable();
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

        <button
          class="btn-icon"
          onclick="editTechnician(${t.id})">
          ✏️
        </button>

        <button
          class="btn-icon"
          onclick="deleteTechnician(${t.id})">
          🗑
        </button>

      </td>
    `;

    tbody.appendChild(tr);

  });

}
