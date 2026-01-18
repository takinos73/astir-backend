/* =====================
   SNAPSHOT EXPORT
===================== */
document.getElementById("exportSnapshot")?.addEventListener("click", async (e) => {
  e.preventDefault();   // 🔥 ΚΡΙΣΙΜΟ
  e.stopPropagation();

  const res = await fetch(`${API}/snapshot/export`);
  const data = await res.json();

  const name = `CMMS_snapshot_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
// =====================
// SNAPSHOT FILE LOAD LABEL
// =====================
document.getElementById("snapshotFile")?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  const statusEl = document.getElementById("snapshotStatus");

  if (!statusEl) return;

  if (!file) {
    statusEl.textContent = "No snapshot loaded";
    statusEl.classList.remove("loaded");
    return;
  }

  statusEl.textContent = `Loaded: ${file.name}`;
  statusEl.classList.add("loaded");
});

/* =====================
   SNAPSHOT RESTORE
===================== */
document.getElementById("restoreSnapshot")?.addEventListener("click", async () => {
  const file = document.getElementById("snapshotFile")?.files[0];
  if (!file) return alert("Select snapshot file");

  const text = await file.text();
  const json = JSON.parse(text);

  if (!confirm("⚠️ This will fully restore the system. Continue?")) return;
  localStorage.setItem(
  "lastRestoredSnapshot",
  file.name
);

  const res = await fetch(`${API}/snapshot/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });

  if (!res.ok) {
    const err = await res.json();
    return alert(err.error || "Restore failed");
  }

  alert("Snapshot restored successfully");
  location.reload();
});