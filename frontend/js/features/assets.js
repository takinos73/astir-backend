/* =====================================================
   ASSETS INDEX / ASSET MANAGEMENT
===================================================== */

/* 🔹 LOAD ASSETS DATA */

async function loadAssets() {
  try {
    const res = await fetch(`${API}/assets`);
    state.assetsData = await res.json(); // ✅ μόνο αυτό

    console.log("ASSETS SAMPLE:", state.assetsData[0]);

    populateAssetLineFilter();

    const sel = document.getElementById("assetLineFilter");
    if (sel) {
      sel.onchange = renderAssetsCards;
    }

    renderAssetsCards();
  } catch (err) {
    console.error("Failed to load assets", err);
  }
}

/* =====================
    RENDER ASSETS CARDS VIEW
===================== */

function renderAssetsCards() {

  
  // Hide legacy table completely
  const tableWrap = document.querySelector(".table-card.assets-scroll");
  if (tableWrap) tableWrap.style.display = "none";

  const wrap = document.getElementById("assetsCardsView");
  if (!wrap) return;

  wrap.style.display = "grid";

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  wrap.innerHTML = "";

  if (!Array.isArray(state.assetsData) || state.assetsData.length === 0) {
    wrap.innerHTML = `<div class="empty">No assets</div>`;
    return;
  }

  const filteredAssets = state.assetsData.filter(a =>
    selectedLine === "all" || a.line === selectedLine
  );

  if (filteredAssets.length === 0) {
    wrap.innerHTML = `<div class="empty">No assets for this line</div>`;
    return;
  }

  filteredAssets.forEach(a => {

  const isIdle = !!a.idle_since; // ✅ FIX

  const card = document.createElement("div");
  card.className = "asset-card";
  card.dataset.serial = a.serial_number || "";

  // Card click → open asset view
  card.addEventListener("click", () => {
    const serial = card.dataset.serial;
    if (!serial) return;
    openAssetViewBySerial(serial);
  });

  const activity = getLastActivityForAsset(a.serial_number);

  let activityHtml = `
    <span class="activity muted">
      🕒 No activity
    </span>
  `;

  if (activity) {
    activityHtml = activity.is_breakdown
      ? `<span class="activity danger activity-badge">⚠ Breakdown · ${activity.when}</span>`
      : `<span class="activity ok activity-badge">🕒 ${activity.when}</span>`;
  }

  const stats = getAssetTaskStats(a.id);
  const hasOverdue = stats.overdue > 0;

  card.innerHTML = `
    <div class="asset-card-header">
      <div class="asset-card-title">
        ${a.model || "-"}
        ${hasOverdue ? `<span class="asset-risk-dot"></span>` : ""}
        ${isIdle ? `<span class="asset-status idle">Idle</span>` : ""}
      </div>

      <div class="asset-card-sn">SN: ${a.serial_number || "-"}</div>
    </div>

    <div class="asset-card-meta">
      Line: <strong>${a.line || "-"}</strong>
    </div>

    <div class="asset-card-preventive">
      <span class="pill">
        ⏱ ~${stats.workloadHours30d}h / next 30d
      </span>
    </div>

    <div class="asset-card-stats">
      <span class="stat">
        🛠 Active: <strong>${stats.active}</strong>
      </span>

      <span class="stat">
        ⏰ Overdue: <strong>${stats.overdue}</strong>
      </span>
    </div>

    <div class="asset-card-activity">
      ${activityHtml}
    </div>

    <div class="asset-card-actions">
      <button
        class="asset-card-more"
        type="button"
        title="More actions">
        ...more
      </button>

      <div class="asset-card-menu" style="display:none;">
        <button class="asset-card-menu-item add-task">➕ Add Task</button>
        <button class="asset-card-menu-item edit">✏️ Edit</button>
        <button type="button" class="asset-card-menu-item archive">🚫 Archive</button>
        <button type="button" class="asset-card-menu-item idle">⏸ Set Idle</button>
        <button type="button" class="asset-card-menu-item resume">▶ Resume</button>
      </div>
    </div>
  `;

  // ---- Activity click → Asset History tab ----
  const activityEl = card.querySelector(".activity-badge");
  if (activityEl) {
    activityEl.addEventListener("click", e => {
      e.stopPropagation();
      openAssetViewBySerial(a.serial_number);
      requestAnimationFrame(() => {
        activateAssetTab("history");
      });
    });
  }

  // ---- Assets Index Menu & actions ----
  const moreBtn = card.querySelector(".asset-card-more");
  const menu = card.querySelector(".asset-card-menu");
  const addTaskItem = card.querySelector(".asset-card-menu-item.add-task");
  const editItem = card.querySelector(".asset-card-menu-item.edit");
  const archiveItem = card.querySelector(".asset-card-menu-item.archive");
  const idleItem = card.querySelector(".asset-card-menu-item.idle");
  const resumeItem = card.querySelector(".asset-card-menu-item.resume");

  moreBtn?.addEventListener("click", e => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });

  // Add Task
  addTaskItem?.addEventListener("click", e => {
    e.stopPropagation();
    menu.style.display = "none";
    openAddTaskForAsset(a.model, a.serial_number, a.line);
  });

  // Edit
  editItem?.addEventListener("click", e => {
    e.stopPropagation();
    menu.style.display = "none";
    editAsset(a.id);
  });

  // Archive
  archiveItem?.addEventListener("click", e => {
    e.stopPropagation();
    console.warn("DEACTIVATE CALLED", a.id);
    menu.style.display = "none";

    const ok = confirm(
      "Archive this asset?\n\nThis will hide it from active views."
    );

    if (ok) {
      deactivateAsset(a.id);
    }
  });

  // 🟡 Set Idle
    idleItem?.addEventListener("click", async e => {
      e.stopPropagation();
      console.warn("IDLE CALLED", a.id);
      menu.style.display = "none";

      const currentLineFilter =
        document.getElementById("assetLineFilter")?.value || "all";

      const res = await fetch(`${API}/assets/${a.id}/idle`, {
        method: "POST"
      });

      if (!res.ok) {
        alert("Set Idle failed");
        return;
      }

      await loadAssets();
      await loadTasks();

      const lineFilter = document.getElementById("assetLineFilter");
      if (lineFilter) {
        lineFilter.value = currentLineFilter;
      }

      renderAssetsCards();
    });

  // 🟢 Resume
    resumeItem?.addEventListener("click", async e => {
      e.stopPropagation();
      menu.style.display = "none";

      const currentLineFilter =
        document.getElementById("assetLineFilter")?.value || "all";

      const res = await fetch(`${API}/assets/${a.id}/resume`, {
        method: "POST"
      });

      if (!res.ok) {
        alert("Resume failed");
        return;
      }

      await loadAssets();
      await loadTasks();

      const lineFilter = document.getElementById("assetLineFilter");
      if (lineFilter) {
        lineFilter.value = currentLineFilter;
      }

      renderAssetsCards();

      if (state.currentAssetSerial && typeof refreshAssetView === "function") {
        await refreshAssetView();
      }
    });
      wrap.appendChild(card);
    });

  // Apply role visibility on newly rendered action areas
  if (typeof applyRoleVisibility === "function") {
    applyRoleVisibility();
  }
  // 🔒 Apply admin restrictions (hide Edit / Archive for non-admin)
  if (typeof applyRolePermissions === "function") {
    applyRolePermissions();
  }
}

/* =====================
   GET LAST ACTIVITY FOR ASSET
===================== */

function getLastActivityForAsset(serial) {
  if (!Array.isArray(state.executionsData) || !serial) return null;

  const list = state.executionsData
    .filter(e => String(e.serial_number || "").trim() === String(serial).trim())
    .sort((a, b) => new Date(b.executed_at || 0) - new Date(a.executed_at || 0));

  if (!list.length) return null;

  const last = list[0];

  const when = typeof formatRelativeDate === "function"
    ? formatRelativeDate(last.executed_at)
    : new Date(last.executed_at).toLocaleDateString("el-GR");

  return {
    is_breakdown: last.is_planned === false,
    when
  };
}

/*============================
    POPULATE ASSET LINE FILTER
 ============================*/

function populateAssetLineFilter() {
  const sel = document.getElementById("assetLineFilter");
  if (!sel) return;

  sel.innerHTML = `<option value="all">All</option>`;

  const lines = [...new Set(
    state.assetsData.map(a => a.line).filter(Boolean)
  )];

  lines.sort().forEach(line => {
    const opt = document.createElement("option");
    opt.value = line;
    opt.textContent = line;
    sel.appendChild(opt);
  });
}

// =====================
  // EDIT ASSET MODAL
  // =====================

let editingAssetId = null;

async function editAsset(assetId) {
  try {
    const asset = state.assetsData.find(a => a.id === assetId);
    if (!asset) return alert("Asset not found");

    editingAssetId = assetId;

    // ⬇️ LOAD LINES SAFELY
    const lines = await loadLinesOnce();

    // Populate fields
    getEl("edit-asset-model").value = asset.model || "";
    getEl("edit-asset-serial").value = asset.serial_number || "";
    getEl("edit-asset-description").value = asset.description || "";

    // Populate line dropdown
    const lineSel = getEl("edit-asset-line");
    lineSel.innerHTML = "";

    lines.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.code;
      if (l.id === asset.line_id) opt.selected = true;
      lineSel.appendChild(opt);
    });

    getEl("editAssetOverlay").style.display = "flex";
  } catch (err) {
    console.error("editAsset ERROR:", err);
    alert("Failed to open edit asset");
  }
}

  /* =====================
      SAVE EDIT ASSET (PATCH)
  ===================== */

getEl("saveEditAssetBtn")?.addEventListener("click", async () => {
  if (!editingAssetId) return;

  const payload = {
    model: getEl("edit-asset-model").value.trim(),
    serial_number: getEl("edit-asset-serial").value.trim(),
    description: getEl("edit-asset-description").value.trim(),
    line_id: Number(getEl("edit-asset-line").value)
  };

  if (!payload.model || !payload.serial_number || !payload.line_id) {
    return alert("Line, Machine and Serial are required");
  }

  try {
    const res = await fetch(`${API}/assets/${editingAssetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json",
    "x-cmms-role": window.currentUserRole },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    closeEditAsset();
    await loadAssets(); // 🔄 refresh table    
  } catch (err) {
    alert(err.message);
  }
});

  function closeEditAsset() {
    editingAssetId = null;
    document.getElementById("editAssetOverlay").style.display = "none";
  }

/* =====================
   DEACTIVATE ASSET
===================== */
async function deactivateAsset(id) {
  const res = await fetch(`${API}/assets/${id}/deactivate`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-cmms-role": window.currentUserRole  // 👈 ΚΡΙΣΙΜΟ
    }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Deactivate failed");
  }

  await loadAssets();
}

// =====================
// SET VISIBLE ASSETS IDLE
// =====================
async function setAllAssetsIdle() {

  const assets = Array.isArray(state.assetsData)
    ? state.assetsData
    : [];

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  // Assets που βλέπει αυτή τη στιγμή ο χρήστης
  const visibleAssets = assets.filter(asset =>
    selectedLine === "all" ||
    String(asset.line || "") === String(selectedLine)
  );

  // Από αυτά, μόνο όσα δεν είναι ήδη idle
  const assetsToIdle = visibleAssets.filter(
    asset => !asset.idle_since
  );

  if (assetsToIdle.length === 0) {
    alert(
      selectedLine === "all"
        ? "All assets are already idle."
        : `All visible assets in Line ${selectedLine} are already idle.`
    );
    return;
  }

  const scopeLabel =
    selectedLine === "all"
      ? "ALL visible assets"
      : `assets in Line ${selectedLine}`;

  const ok = confirm(
    `Set ${scopeLabel} to IDLE?\n\n` +
    `${assetsToIdle.length} asset(s) will be set to idle.\n\n` +
    `Assets already idle will not be changed.`
  );

  if (!ok) return;

  const button =
    document.getElementById("setAllAssetsIdleBtn");

  try {

    if (button) {
      button.disabled = true;
      button.textContent = "⏳ Setting Idle...";
    }

    const res = await fetch(
      `${API}/assets/idle-all`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          asset_ids: assetsToIdle.map(asset => asset.id)
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));

      throw new Error(
        err.error || "Set assets idle failed"
      );
    }

    const result = await res.json();

    await loadAssets();
    await loadTasks();

    // Κρατάμε το υπάρχον Line filter
    const lineFilter =
      document.getElementById("assetLineFilter");

    if (lineFilter) {
      lineFilter.value = selectedLine;
    }

    renderAssetsCards();

    alert(
      `${result.updated || 0} asset(s) set to idle successfully.`
    );

  } catch (err) {

    console.error(
      "SET FILTERED ASSETS IDLE ERROR:",
      err
    );

    alert(err.message);

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "⏸ Set All Idle";
    }

  }
}
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("setAllAssetsIdleBtn");

  if (btn) {
    btn.onclick = setAllAssetsIdle;
  }
});

const resumeAllBtn =
  document.getElementById("resumeAllAssetsBtn");

if (resumeAllBtn) {
  resumeAllBtn.onclick = resumeAllAssets;
}

// =====================
// RESUME VISIBLE ASSETS
// =====================
async function resumeAllAssets() {

  const assets = Array.isArray(state.assetsData)
    ? state.assetsData
    : [];

  const selectedLine =
    document.getElementById("assetLineFilter")?.value || "all";

  // Assets που βλέπει ο χρήστης
  const visibleAssets = assets.filter(asset =>
    selectedLine === "all" ||
    String(asset.line || "") === String(selectedLine)
  );

  // Μόνο όσα είναι πραγματικά IDLE
  const assetsToResume = visibleAssets.filter(
    asset => !!asset.idle_since
  );

  if (assetsToResume.length === 0) {
    alert(
      selectedLine === "all"
        ? "No idle assets to resume."
        : `No idle assets in Line ${selectedLine}.`
    );

    return;
  }

  const scopeLabel =
    selectedLine === "all"
      ? "ALL visible idle assets"
      : `idle assets in Line ${selectedLine}`;

  const ok = confirm(
    `Resume ${scopeLabel}?\n\n` +
    `${assetsToResume.length} asset(s) will be resumed.\n\n` +
    `Open task due dates will be shifted by each asset's idle time.`
  );

  if (!ok) return;

  const button =
    document.getElementById("resumeAllAssetsBtn");

  try {

    if (button) {
      button.disabled = true;
      button.textContent = "⏳ Resuming...";
    }

    const res = await fetch(
      `${API}/assets/resume-all`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          asset_ids: assetsToResume.map(asset => asset.id)
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));

      throw new Error(
        err.error || "Resume assets failed"
      );
    }

    const result = await res.json();

    await loadAssets();
    await loadTasks();

    // Κρατάμε το υπάρχον line filter
    const lineFilter =
      document.getElementById("assetLineFilter");

    if (lineFilter) {
      lineFilter.value = selectedLine;
    }

    renderAssetsCards();

    if (
      state.currentAssetSerial &&
      typeof refreshAssetView === "function"
    ) {
      await refreshAssetView();
    }

    alert(
      `${result.updated || 0} asset(s) resumed successfully.`
    );

  } catch (err) {

    console.error(
      "RESUME FILTERED ASSETS ERROR:",
      err
    );

    alert(err.message);

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "▶ Resume All";
    }

  }
}