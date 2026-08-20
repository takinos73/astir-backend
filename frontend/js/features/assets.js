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