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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
   TASKS
   - maintenance_tasks is assumed to have:
     id, asset_id (FK), section, unit, task, type, qty, duration_min, frequency_hours,
     due_date, status, completed_by, completed_at, updated_at, is_planned, notes
===================================================== */

// GET active tasks (Planned + Overdue), sorted by due date
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mt.id,
        mt.task,
        mt.status,
        mt.due_date,
        mt.completed_at,
        mt.completed_by,
        mt.section,
        mt.unit,
        mt.type,
        mt.frequency_hours,

        a.model AS machine_name,
        a.serial_number,
        l.code AS line_code

      FROM maintenance_tasks mt
      JOIN assets a ON a.id = mt.asset_id
      JOIN lines l ON l.id = a.line_id

      WHERE mt.status IN ('Planned', 'Overdue')
      ORDER BY mt.due_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /tasks ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

  /*================================
   Create task (Planned or Unplanned)
  =================================*/

app.post("/tasks", async (req, res) => {
  const {
    asset_id,
    section,
    unit,
    task,
    type,
    due_date,
    notes,
    is_planned,
    status,
    executed_by
  } = req.body;

  if (!asset_id || !task) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Insert task
    const taskRes = await client.query(
      `
      INSERT INTO maintenance_tasks
        (asset_id, section, unit, task, type, due_date, status, is_planned, notes)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        asset_id,
        section || null,
        unit || null,
        task,
        type || null,
        due_date ? new Date(due_date) : null,
        status || "Planned",
        is_planned === true,
        notes || null
      ]
    );

    const newTask = taskRes.rows[0];

    // 2️⃣ 🔥 IF UNPLANNED → write directly to HISTORY
    if (is_planned === false) {
      await client.query(
        `
        INSERT INTO task_executions
          (task_id, asset_id, executed_by, executed_at)
        VALUES
          ($1, $2, $3, NOW())
        `,
        [
          newTask.id,
          asset_id,
          executed_by || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json(newTask);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /tasks ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


/* =====================
   COMPLETE TASK
   - Preventive (frequency_hours > 0): ROTATE
   - Planned without frequency: FINISH
===================== */
app.patch("/tasks/:id", async (req, res) => {
  const { completed_by, completed_at } = req.body;
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Normalize completed date
    const completedAt =
      completed_at ? new Date(completed_at) : new Date();

    // 1️⃣ Fetch task
    const taskRes = await client.query(
      `SELECT * FROM maintenance_tasks WHERE id = $1`,
      [id]
    );

    if (!taskRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Task not found" });
    }

    const task = taskRes.rows[0];

    const hasFrequency =
      task.frequency_hours &&
      Number(task.frequency_hours) > 0;

    // 2️⃣ Log execution (HISTORY) — ALWAYS
    await client.query(
      `
      INSERT INTO task_executions (
        task_id,
        asset_id,
        executed_by,
        prev_due_date,
        executed_at
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        task.id,
        task.asset_id,
        completed_by || null,
        task.due_date || null,
        completedAt
      ]
    );

    // 3️⃣ PREVENTIVE → ROTATE
    if (hasFrequency) {
      const nextDue = new Date(task.due_date);
      nextDue.setHours(
        nextDue.getHours() + Number(task.frequency_hours)
      );

      await client.query(
        `
        UPDATE maintenance_tasks
        SET
          status = 'Planned',
          due_date = $2,
          completed_by = $3,
          completed_at = $4,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          nextDue,
          completed_by || null,
          completedAt
        ]
      );

    } else {
      // 4️⃣ PLANNED (NO FREQUENCY) → FINISH
      await client.query(
        `
        UPDATE maintenance_tasks
        SET
          status = 'Done',
          completed_by = $2,
          completed_at = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          completed_by || null,
          completedAt
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, rotated: hasFrequency });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PATCH /tasks/:id ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* =====================
   UNDO TASK EXECUTION
   - Planned: restore schedule
   - Unplanned: delete entirely
===================== */

app.post("/executions/:id/undo", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Fetch execution + task info
    const execRes = await client.query(
      `
      SELECT
        e.id,
        e.task_id,
        e.prev_due_date,
        t.is_planned
      FROM task_executions e
      JOIN maintenance_tasks t ON t.id = e.task_id
      WHERE e.id = $1
      `,
      [id]
    );

    if (!execRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Execution not found" });
    }

    const exec = execRes.rows[0];

    // 🔴 CASE 1: UNPLANNED → DELETE EVERYTHING
    if (exec.is_planned === false) {

      // Delete execution
      await client.query(
        `DELETE FROM task_executions WHERE id = $1`,
        [exec.id]
      );

      // Delete task entirely
      await client.query(
        `DELETE FROM maintenance_tasks WHERE id = $1`,
        [exec.task_id]
      );

      await client.query("COMMIT");
      return res.json({ success: true, mode: "unplanned_deleted" });
    }

    // 🟢 CASE 2: PLANNED → RESTORE SCHEDULE
    if (!exec.prev_due_date) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Cannot undo planned task: missing prev_due_date"
      });
    }

    // Restore task
    await client.query(
      `
      UPDATE maintenance_tasks
      SET
        due_date = $2,
        status = 'Planned',
        completed_at = NULL,
        completed_by = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [exec.task_id, exec.prev_due_date]
    );

    // Delete execution (history)
    await client.query(
      `DELETE FROM task_executions WHERE id = $1`,
      [exec.id]
    );

    await client.query("COMMIT");
    res.json({ success: true, mode: "planned_restored" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("UNDO execution ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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

/* =====================
   TASK EXECUTION HISTORY
===================== */
app.get("/executions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.executed_at,
        e.executed_by,

        t.task,
        t.section,
        t.unit,
        t.type,
        t.is_planned,
        t.frequency_hours,   
        
        a.model AS machine,
        a.serial_number,
        l.code AS line

      FROM task_executions e
      JOIN maintenance_tasks t ON t.id = e.task_id
      JOIN assets a ON a.id = e.asset_id
      JOIN lines l ON l.id = a.line_id
      ORDER BY e.executed_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /executions ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/*================================================
 COMPLETED KPI
 ================================================*/

app.get("/executions/count", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS completed
      FROM task_executions
    `);

    res.json(rows[0]);
  } catch (err) {
    console.error("GET /executions/count ERROR:", err.message);
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
      WHERE a.active = true
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
    return res.status(400).json({ error: "Missing fields" });
  }

  const client = await pool.connect();

  try {
    const lineId = await findLineIdByCode(client, cleanUpper(line));
    if (!lineId) {
      return res.status(400).json({ error: `Line not found: ${line}` });
    }

    // 🔍 Check if asset already exists
    const existing = await client.query(
      `
      SELECT id, active
      FROM assets
      WHERE model = $1 AND serial_number = $2
      `,
      [cleanStr(model), cleanStr(serial_number)]
    );

    // ♻ Inactive → Reactivate
    if (existing.rows.length > 0 && existing.rows[0].active === false) {
      const reactivated = await client.query(
        `
        UPDATE assets
        SET active = true,
            line_id = $1,
            description = $2
        WHERE id = $3
        RETURNING *
        `,
        [lineId, description || null, existing.rows[0].id]
      );

      return res.json({
        reactivated: true,
        asset: reactivated.rows[0]
      });
    }

    // ❌ Already active
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Asset already exists and is active"
      });
    }

    // ➕ New asset
    const result = await client.query(
      `
      INSERT INTO assets (line_id, model, serial_number, description, active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
      `,
      [lineId, cleanStr(model), cleanStr(serial_number), description || null]
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

/* =====================
   DEACTIVATE ASSET
===================== */
app.patch("/assets/:id/deactivate", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE assets
      SET active = false
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("DEACTIVATE ASSET ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   IMPORT HELPERS
===================================================== */

function cleanStr(v) {
  if (v === undefined || v === null) return null;
  const s = v.toString().trim();
  return s === "" ? null : s;
}

function cleanUpper(v) {
  if (!v) return null;
  return v.toString().trim().toUpperCase();
}

function cleanNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function cleanDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function findLineIdByCode(client, code) {
  const r = await client.query(
    "SELECT id FROM lines WHERE code=$1",
    [code]
  );
  return r.rows[0]?.id || null;
}

async function findAssetId(client, lineCode, model, serial) {
  const r = await client.query(
    `
    SELECT a.id
    FROM assets a
    JOIN lines l ON l.id = a.line_id
    WHERE l.code = $1
      AND a.model = $2
      AND a.serial_number = $3
      AND a.active = true
    `,
    [lineCode, model, serial]
  );
  return r.rows[0]?.id || null;
}

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

// COMMIT
app.post("/importExcel/commit", uploadMem.single("file"), async (req, res) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    if (!sheet) {
      return res.status(400).json({ error: "Sheet 'MasterPlan' not found" });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const preview = await buildImportPreview(rows);
    if (preview.summary.errors > 0) {
      return res.status(400).json({
        error: "Import blocked – fix errors first",
        preview,
      });
    }

    await client.query("BEGIN");

    const assetIds = [...new Set(preview.rows.map(r => r.asset_id))];

    await client.query(
      `
      DELETE FROM maintenance_tasks 
        WHERE asset_id = ANY($1)
        AND is_planned = true
        AND frequency_hours IS NOT NULL
        AND status = 'Planned'
      `,
      [assetIds]
    );

    for (const row of preview.rows) {
      const c = row.cleaned;

      await client.query(
        `
        INSERT INTO maintenance_tasks (
          asset_id,
          section,
          unit,
          task,
          type,
          qty,
          duration_min,
          frequency_hours,
          due_date,
          status,
          is_planned,
          notes
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11
        )
        ON CONFLICT ON CONSTRAINT unique_preventive_task
        DO NOTHING
        `,
        [
          row.asset_id,
          c.section,
          c.unit,
          c.task,
          c.type,
          c.qty,
          c.duration_min,
          c.frequency_hours,
          c.due_date,
          c.status || "Planned",
          c.notes || null,
        ]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Import completed successfully",
      summary: preview.summary,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("IMPORT COMMIT ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Legacy endpoint
app.post("/importExcel", uploadMem.single("file"), async (req, res) => {
  req.url = "/importExcel/commit";
  return app._router.handle(req, res, () => {});
});

/* =====================================================
   SNAPSHOT EXPORT / RESTORE
   - EXPORT: lines, assets, ALL maintenance_tasks
   - RESTORE: exact operational state
   - DOES NOT touch task_executions (history)
===================================================== */

/* =====================
   EXPORT SNAPSHOT
===================== */
app.get("/snapshot/export", async (req, res) => {
  try {
    const lines = (
      await pool.query(`SELECT * FROM lines ORDER BY id ASC`)
    ).rows;

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

    const executions = (
  await pool.query(`
    SELECT *
    FROM task_executions
    ORDER BY id ASC
  `)
).rows;

res.json({
  version: 3,
  created_at: new Date().toISOString(),
  lines,
  assets,
  tasks,
  executions
});

  } catch (err) {
    console.error("SNAPSHOT EXPORT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   RESTORE SNAPSHOT
===================== */
app.post("/snapshot/restore", async (req, res) => {
  const client = await pool.connect();

  try {
    const { lines, assets, tasks, executions } = req.body || {};

    if (
      !Array.isArray(lines) ||
      !Array.isArray(assets) ||
      !Array.isArray(tasks) ||
      !Array.isArray(executions)
    ) {
      return res.status(400).json({ error: "Invalid snapshot format" });
    }

    await client.query("BEGIN");

    /* =====================
       1️⃣ RESTORE LINES
    ===================== */
    for (const l of lines) {
      if (!l.code) continue;

      await client.query(`
        INSERT INTO lines (code, name, description)
        VALUES ($1,$2,$3)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [
        l.code,
        l.name || l.code,
        l.description || null
      ]);
    }

    /* =====================
       2️⃣ RESTORE ASSETS
    ===================== */
    for (const a of assets) {
      if (!a.line_code || !a.model || !a.serial_number) continue;

      const lineRes = await client.query(
        `SELECT id FROM lines WHERE code = $1`,
        [a.line_code]
      );
      if (!lineRes.rows.length) continue;

      const lineId = lineRes.rows[0].id;

      await client.query(`
      INSERT INTO assets (line_id, model, serial_number, description, active)
      VALUES ($1,$2,$3,$4,$5)
      `, [
        lineId,
        a.model,
        a.serial_number,
        a.description || null,
        a.active !== false
      ]);
    }

    /* =====================
       3️⃣ FULL WIPE TASKS + HISTORY
    ===================== */
    await client.query(`TRUNCATE TABLE task_executions RESTART IDENTITY CASCADE`);
    await client.query(`TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE`);

    /* =====================
       4️⃣ RESTORE TASKS
    ===================== */
    for (const t of tasks) {
      const assetRes = await client.query(`
        SELECT a.id
        FROM assets a
        JOIN lines l ON l.id = a.line_id
        WHERE l.code = $1 AND a.model = $2 AND a.serial_number = $3
      `, [t.line, t.machine_name, t.serial_number]);

      if (!assetRes.rows.length) continue;
      const assetId = assetRes.rows[0].id;

      await client.query(`
        INSERT INTO maintenance_tasks (
          asset_id, section, unit, task, type, qty,
          duration_min, frequency_hours,
          due_date, status,
          completed_by, completed_at,
          is_planned, notes,
          created_at, updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,
          $9,$10,
          $11,$12,
          $13,$14,
          COALESCE($15,NOW()), COALESCE($16,NOW())
        )
      `, [
        assetId,
        t.section || null,
        t.unit || null,
        t.task,
        t.type || null,
        t.qty ?? null,
        t.duration_min ?? null,
        t.frequency_hours ?? null,
        t.due_date ? new Date(t.due_date) : null,
        t.status,
        t.completed_by || null,
        t.completed_at ? new Date(t.completed_at) : null,
        t.is_planned,
        t.notes || null,
        t.created_at ? new Date(t.created_at) : null,
        t.updated_at ? new Date(t.updated_at) : null
      ]);
    }

    /* =====================
       5️⃣ RESTORE HISTORY
    ===================== */
    for (const e of executions) {
      await client.query(`
        INSERT INTO task_executions (
          task_id,
          asset_id,
          executed_by,
          executed_at,
          prev_due_date
        )
        VALUES ($1,$2,$3,$4,$5)
      `, [
        e.task_id,
        e.asset_id,
        e.executed_by || null,
        e.executed_at ? new Date(e.executed_at) : null,
        e.prev_due_date ? new Date(e.prev_due_date) : null
      ]);
    }

    await client.query("COMMIT");
    res.json({ message: "Snapshot restored successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
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
  res.sendFile(path.join(frontendPath, "index_v2.html"));
});

/* =====================================================
   Listen
===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
