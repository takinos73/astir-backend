// index.js — ASTIR CMMS Backend (Render) ✅
// Supports: Tasks, Assets (line_id + serial), Import Excel (Preview + Commit overwrite), Snapshots, Documentation PDF, Frontend SPA

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import path from "path";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// -------------------
// Static Frontend
// -------------------
const frontendPath = path.join(process.cwd(), "..", "frontend");
app.use(express.static(frontendPath));

// -------------------
// Uploads (memory for Excel, disk for PDF)
/// -------------------
const uploadMem = multer({ storage: multer.memoryStorage() });

// PDF is stored on disk (Render ephemeral; OK for your demo workflow)
// If you later want DB storage or object storage, we’ll change this.
const pdfDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, pdfDir),
    filename: (req, file, cb) => cb(null, "masterplan.pdf"),
  }),
});

// -------------------
// Health
// -------------------
app.get("/api", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

/* =====================================================
   HELPERS
===================================================== */

function cleanStr(v) {
  return (v ?? "").toString().trim();
}
function cleanUpper(v) {
  return cleanStr(v).toUpperCase();
}
function cleanNumber(v) {
  const s = cleanStr(v);
  if (!s || s === "-") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function cleanDate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

async function findLineIdByCode(client, codeUpper) {
  // assumes lines table has column "code" with values L1..L7
  const r = await client.query(
    `SELECT id FROM lines WHERE UPPER(code) = $1 LIMIT 1`,
    [codeUpper]
  );
  return r.rows[0]?.id ?? null;
}

async function findAssetId(client, lineCode, model, serial) {
  // Your schema: assets(line_id FK), model, serial_number UNIQUE
  const r = await client.query(
    `
    SELECT a.id
    FROM assets a
    JOIN lines l ON l.id = a.line_id
    WHERE UPPER(l.code) = $1
      AND UPPER(a.model) = $2
      AND UPPER(a.serial_number) = $3
    LIMIT 1
    `,
    [cleanUpper(lineCode), cleanUpper(model), cleanUpper(serial)]
  );
  return r.rows[0]?.id ?? null;
}

/* =====================================================
   TASKS
   - maintenance_tasks is assumed to have:
     id, asset_id (FK), section, unit, task, type, qty, duration_min, frequency_hours,
     due_date, status, completed_by, completed_at, updated_at, is_planned, notes
===================================================== */

// GET tasks (includes line code + asset serial)
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mt.id,
        mt.section,
        mt.unit,
        mt.task,
        mt.type,
        mt.qty,
        mt.duration_min,
        mt.frequency_hours,
        mt.due_date,
        mt.status,
        mt.completed_by,
        mt.completed_at,
        mt.is_planned,
        mt.notes,

        a.id AS asset_id,
        a.model AS machine_name,
        a.serial_number,
        l.code AS line
      FROM maintenance_tasks mt
      JOIN assets a ON a.id = mt.asset_id
      JOIN lines  l ON l.id = a.line_id
      ORDER BY mt.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /tasks ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create NON-planned task from UI (STEP 2A)
app.post("/tasks", async (req, res) => {
  const { line, machine_name, serial_number, section, unit, task, type, due_date, notes } = req.body;

  if (!line || !machine_name || !serial_number || !task) {
    return res.status(400).json({ error: "Missing fields: line, machine_name, serial_number, task" });
  }

  const client = await pool.connect();
  try {
    const assetId = await findAssetId(client, line, machine_name, serial_number);
    if (!assetId) {
      return res.status(400).json({ error: `Asset not found: ${line}/${machine_name}/${serial_number}` });
    }

    const ins = await client.query(
      `
      INSERT INTO maintenance_tasks
        (asset_id, section, unit, task, type, due_date, status, is_planned, notes)
      VALUES
        ($1, $2, $3, $4, $5, $6, 'Planned', false, $7)
      RETURNING *
      `,
      [
        assetId,
        section || null,
        unit || null,
        task,
        type || null,
        due_date ? new Date(due_date) : null,
        notes || null,
      ]
    );

    res.json(ins.rows[0]);
  } catch (err) {
    console.error("POST /tasks ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Mark done + technician + timestamp
app.patch("/tasks/:id", async (req, res) => {
  const { completed_by } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE maintenance_tasks
      SET status='Done',
          completed_by=$2,
          completed_at=NOW(),
          updated_at=NOW()
      WHERE id=$1
      RETURNING *
      `,
      [req.params.id, completed_by || null]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /tasks/:id ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Undo to planned
app.patch("/tasks/:id/undo", async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE maintenance_tasks
      SET status='Planned',
          completed_by=NULL,
          completed_at=NULL,
          updated_at=NOW()
      WHERE id=$1
      RETURNING *
      `,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /tasks/:id/undo ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   ASSETS
   Your schema:
   assets(id, line_id FK -> lines(id), model, serial_number UNIQUE, description, active)
===================================================== */

app.get("/assets", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        l.code AS line,
        a.line_id,
        a.model,
        a.serial_number,
        a.description,
        a.active
      FROM assets a
      JOIN lines l ON l.id = a.line_id
      ORDER BY l.code, a.model, a.serial_number
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /assets ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/assets", async (req, res) => {
  const { line, model, serial_number, description, active } = req.body;

  if (!line || !model || !serial_number) {
    return res.status(400).json({ error: "Missing fields: line, model, serial_number" });
  }

  const client = await pool.connect();
  try {
    const lineId = await findLineIdByCode(client, cleanUpper(line));
    if (!lineId) return res.status(400).json({ error: `Line not found: ${line}` });

    // serial_number UNIQUE -> upsert style
    const result = await client.query(
      `
      INSERT INTO assets (line_id, model, serial_number, description, active)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (serial_number)
      DO UPDATE SET
        line_id = EXCLUDED.line_id,
        model = EXCLUDED.model,
        description = EXCLUDED.description,
        active = EXCLUDED.active
      RETURNING *
      `,
      [
        lineId,
        cleanStr(model),
        cleanStr(serial_number),
        description || null,
        typeof active === "boolean" ? active : true,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST /assets ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete("/assets/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM assets WHERE id=$1`, [req.params.id]);
    res.json({ message: "Asset deleted" });
  } catch (err) {
    console.error("DELETE /assets/:id ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   IMPORT EXCEL — Preview + Commit (Overwrite planned tasks per asset)
   Excel headers expected:
   Line, Machine, Serial_number, Section, Unit, Task, Type, Qty, Duration(min), Frequency(hours), DueDate, Status
===================================================== */

async function buildImportPreview(rows) {
  const out = [];
  let ok = 0,
    errors = 0;

  const client = await pool.connect();
  try {
    for (let i = 0; i < rows.length; i++) {
      const excelRowNumber = i + 2; // header row is 1

      const line = cleanUpper(rows[i]["Line"]);
      const machine = cleanUpper(rows[i]["Machine"]);
      const sn = cleanUpper(rows[i]["Serial_number"]);
      const section = cleanStr(rows[i]["Section"]) || null;
      const unit = cleanStr(rows[i]["Unit"]) || null;
      const task = cleanStr(rows[i]["Task"]);
      const type = cleanStr(rows[i]["Type"]) || null;
      const qty = cleanNumber(rows[i]["Qty"]);
      const duration_min = cleanNumber(rows[i]["Duration(min)"]);
      const frequency_hours = cleanNumber(rows[i]["Frequency(hours)"]);
      const due_date = cleanDate(rows[i]["DueDate"]);
      const status = cleanStr(rows[i]["Status"]) || "Planned";

      if (!line || !machine || !sn || !task) {
        errors++;
        out.push({
          row: excelRowNumber,
          status: "error",
          error: "Missing required fields (Line / Machine / Serial_number / Task)",
        });
        continue;
      }

      // Validate that line exists
      const lineId = await findLineIdByCode(client, line);
      if (!lineId) {
        errors++;
        out.push({
          row: excelRowNumber,
          status: "error",
          error: `Line not found: ${line}`,
        });
        continue;
      }

      // Find asset (line+model+sn)
      const assetId = await findAssetId(client, line, machine, sn);
      if (!assetId) {
        errors++;
        out.push({
          row: excelRowNumber,
          status: "error",
          error: `Asset not found: ${line} / ${machine} / ${sn}`,
        });
        continue;
      }

      ok++;
      out.push({
        row: excelRowNumber,
        status: "ok",
        asset_id: assetId,
        key: { line, machine, serial_number: sn },
        cleaned: {
          section,
          unit,
          task,
          type,
          qty,
          duration_min,
          frequency_hours,
          due_date,
          status,
          notes: null,
        },
      });
    }
  } finally {
    client.release();
  }

  return {
    summary: { total: rows.length, ok, errors },
    rows: out,
  };
}

// PREVIEW (no DB writes)
app.post("/importExcel/preview", uploadMem.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(req.file.buffer, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    if (!sheet) return res.status(400).json({ error: "Sheet 'MasterPlan' not found" });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const preview = await buildImportPreview(rows);
    res.json(preview);
  } catch (err) {
    console.error("IMPORT PREVIEW ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// COMMIT (overwrite planned tasks per asset)
app.post("/importExcel/commit", uploadMem.single("file"), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(req.file.buffer, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    if (!sheet) return res.status(400).json({ error: "Sheet 'MasterPlan' not found" });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // validate first
    const preview = await buildImportPreview(rows);
    if (preview.summary.errors > 0) {
      return res.status(400).json({
        error: "Import blocked: fix errors first",
        preview,
      });
    }

    // group ok rows by asset_id
    const groups = new Map(); // assetId -> cleaned tasks[]
    for (const r of preview.rows) {
      if (r.status !== "ok") continue;
      if (!groups.has(r.asset_id)) groups.set(r.asset_id, []);
      groups.get(r.asset_id).push(r.cleaned);
    }

    await client.query("BEGIN");

    for (const [assetId, tasks] of groups.entries()) {
      // Overwrite strategy B: delete planned tasks for this asset
      await client.query(
        `DELETE FROM maintenance_tasks WHERE asset_id=$1 AND is_planned=true`,
        [assetId]
      );

      for (const t of tasks) {
        await client.query(
          `
          INSERT INTO maintenance_tasks
            (asset_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status, is_planned, notes)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
          `,
          [
            assetId,
            t.section,
            t.unit,
            t.task,
            t.type,
            t.qty,
            t.duration_min,
            t.frequency_hours,
            t.due_date,
            t.status,
            t.notes,
          ]
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      message: "Excel import committed (overwrite planned tasks per asset)",
      summary: preview.summary,
      overwritten_assets: groups.size,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("IMPORT COMMIT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Keep legacy endpoint name for your UI button (calls COMMIT)
app.post("/importExcel", uploadMem.single("file"), async (req, res) => {
  // For backward compatibility: treat /importExcel as commit
  req.url = "/importExcel/commit";
  return app._router.handle(req, res, () => {});
});

/* =====================================================
   SNAPSHOT (includes lines, assets, tasks)
===================================================== */

app.get("/snapshot/export", async (req, res) => {
  try {
    const lines = (await pool.query(`SELECT * FROM lines ORDER BY id ASC`)).rows;
    const assets = (
      await pool.query(`
        SELECT a.*, l.code AS line_code
        FROM assets a
        JOIN lines l ON l.id = a.line_id
        ORDER BY l.code, a.model, a.serial_number
      `)
    ).rows;

    const tasks = (
      await pool.query(`
        SELECT
          mt.*,
          a.model AS machine_name,
          a.serial_number,
          l.code AS line
        FROM maintenance_tasks mt
        JOIN assets a ON a.id = mt.asset_id
        JOIN lines  l ON l.id = a.line_id
        ORDER BY mt.id ASC
      `)
    ).rows;

    res.json({
      version: 2,
      created_at: new Date().toISOString(),
      lines,
      assets,
      tasks,
    });
  } catch (err) {
    console.error("SNAPSHOT EXPORT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/snapshot/restore", async (req, res) => {
  const client = await pool.connect();
  try {
    const { lines, assets, tasks } = req.body || {};

    if (!Array.isArray(lines) || !Array.isArray(assets) || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid snapshot format (expected lines/assets/tasks arrays)" });
    }

    await client.query("BEGIN");

    // We restore by natural keys, not raw ids
    // 1) restore lines (by code)
    for (const l of lines) {
      const code = cleanStr(l.code || l.line || l.name);
      if (!code) continue;
      await client.query(
        `
        INSERT INTO lines (code, name, description)
        VALUES ($1,$2,$3)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
        `,
        [code, l.name || code, l.description || null]
      );
    }

    // 2) restore assets (by serial_number unique)
    for (const a of assets) {
      const lineCode = cleanStr(a.line_code || a.line || "");
      const model = cleanStr(a.model || a.machine || a.machine_name || "");
      const sn = cleanStr(a.serial_number || a.Serial_number || a.SerialNumber || "");
      if (!lineCode || !model || !sn) continue;

      const lineId = await findLineIdByCode(client, cleanUpper(lineCode));
      if (!lineId) continue;

      await client.query(
        `
        INSERT INTO assets (line_id, model, serial_number, description, active)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (serial_number) DO UPDATE SET
          line_id = EXCLUDED.line_id,
          model = EXCLUDED.model,
          description = EXCLUDED.description,
          active = EXCLUDED.active
        `,
        [lineId, model, sn, a.description || null, typeof a.active === "boolean" ? a.active : true]
      );
    }

    // 3) wipe tasks, then restore tasks by matching asset via (line+model+sn)
    await client.query(`TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;`);

    for (const t of tasks) {
      const lineCode = cleanStr(t.line || t.line_code || "");
      const model = cleanStr(t.machine_name || t.model || "");
      const sn = cleanStr(t.serial_number || t.Serial_number || "");

      const assetId = await findAssetId(client, lineCode, model, sn);
      if (!assetId) continue; // skip tasks that can't map (snapshot may be inconsistent)

      await client.query(
        `
        INSERT INTO maintenance_tasks
          (asset_id, section, unit, task, type, qty, duration_min, frequency_hours,
           due_date, status, completed_by, completed_at, updated_at, is_planned, notes)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,NOW()),COALESCE($14,true),$15)
        `,
        [
          assetId,
          t.section || null,
          t.unit || null,
          t.task,
          t.type || null,
          t.qty ?? null,
          t.duration_min ?? null,
          t.frequency_hours ?? null,
          t.due_date ? new Date(t.due_date) : null,
          t.status || "Planned",
          t.completed_by || null,
          t.completed_at ? new Date(t.completed_at) : null,
          t.updated_at ? new Date(t.updated_at) : null,
          typeof t.is_planned === "boolean" ? t.is_planned : true,
          t.notes || null,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ message: "Restore completed!" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("SNAPSHOT RESTORE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* =====================================================
   DOCUMENTATION (MasterPlan PDF)
===================================================== */

app.post("/documentation/upload", uploadDisk.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
    res.json({ message: "PDF uploaded", file: "masterplan.pdf" });
  } catch (err) {
    console.error("PDF UPLOAD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/documentation/masterplan", async (req, res) => {
  try {
    const pdfPath = path.join(pdfDir, "masterplan.pdf");
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send("MasterPlan PDF not found. Upload it first.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(pdfPath);
  } catch (err) {
    console.error("PDF SERVE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   SPA fallback
===================================================== */

app.get("*", (req, res) => {
  // change this if your entry file name differs
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =====================================================
   Listen
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
