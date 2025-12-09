import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import multer from "multer";
const upload = multer();

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 📌 Serve Frontend static files
const frontendPath = path.join(process.cwd(), "..", "frontend");
app.use(express.static(frontendPath));

// Excel file path
const excelFilePath = path.join(process.cwd(), "Maint_web.xlsx");

// -------------------
// Test route
// -------------------
app.get("/api", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// -------------------
// IMPORT Excel from UI Upload (multipart/form-data)
// -------------------

function toNumber(val) {
  if (!val || val === "-" || val === "—") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

app.post("/importExcel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const buffer = req.file.buffer;
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // Reset tables
    await pool.query("TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;");
    await pool.query("TRUNCATE TABLE machines RESTART IDENTITY CASCADE;");
    await pool.query("TRUNCATE TABLE lines RESTART IDENTITY CASCADE;");

    for (const row of rows) {
      if (!row["Machine"] || !row["Task"]) continue;

      // Handle Line (default OTHER)
      let lineCode = row["Line"]?.trim() || "OTHER";

      const lineRes = await pool.query(
        `INSERT INTO lines (code, name)
         VALUES ($1, $1)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [lineCode]
      );
      const lineId = lineRes.rows[0].id;

      // Handle Machine
      const machineRes = await pool.query(
        `INSERT INTO machines (name, line_id)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET line_id = EXCLUDED.line_id
         RETURNING id`,
        [row["Machine"], lineId]
      );
      const machineId = machineRes.rows[0].id;

      // Insert Task
      await pool.query(
        `INSERT INTO maintenance_tasks
          (machine_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          machineId,
          row["Section"] || null,
          row["Unit"] || null,
          row["Task"],
          row["Type"] || null,
          toNumber(row["Qty"]),
          toNumber(row["Duration(min)"]),
          toNumber(row["Frequency(hours)"]),
          row["DueDate"] ? new Date(row["DueDate"]) : null,
          row["Status"]?.trim() || "Planned",
        ]
      );
    }

    res.json({ message: "Excel imported successfully!" });

  } catch (err) {
    console.error("IMPORT from UI ERROR:", err.message);
    res.status(500).json({ error: "Import failed!", details: err.message });
  }
});


// -------------------
// GET Machines
// -------------------
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM machines ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("GET /machines ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// -------------------
// GET Lines (for UI tabs)
// -------------------
app.get("/lines", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, code, name, description
      FROM lines
      ORDER BY code ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /lines ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------
// TEMP MIGRATIONS FOR DATABASE UPDATE (SAFE TO LEAVE)
// ---------------------------------------------------

// Add completed_by column
app.get("/migrate/addCompletedBy", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS completed_by TEXT;
    `);
    res.json({ message: "Migration completed: completed_by added" });
  } catch (err) {
    console.error("MIGRATION ERROR (completed_by):", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add completed_at column
app.get("/migrate/addCompletedAt", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    `);
    res.json({ message: "Migration completed: completed_at added" });
  } catch (err) {
    console.error("MIGRATION ERROR (completed_at):", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add updated_at column
app.get("/migrate/addUpdatedAt", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    res.json({ message: "Migration completed: updated_at added" });
  } catch (err) {
    console.error("MIGRATION ERROR (updated_at):", err.message);
    res.status(500).json({ error: err.message });
  }
});
// ---------------------------------------------------
// MIGRATION: Init lines table + line_id on machines
// ---------------------------------------------------
app.get("/migrate/initLines", async (req, res) => {
  try {
    // 1) Δημιουργία πίνακα lines (αν δεν υπάρχει)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lines (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT,
        description TEXT
      );
    `);

    // 2) Προσθήκη line_id στα machines
    await pool.query(`
      ALTER TABLE machines
      ADD COLUMN IF NOT EXISTS line_id INTEGER REFERENCES lines(id) ON DELETE SET NULL;
    `);

    // 3) Seed default γραμμών L1..L7 + OTHER
    await pool.query(`
      INSERT INTO lines (code, name)
      VALUES 
        ('L1', 'L1'),
        ('L2', 'L2'),
        ('L3', 'L3'),
        ('L4', 'L4'),
        ('L5', 'L5'),
        ('L6', 'L6'),
        ('L7', 'L7'),
        ('OTHER', 'Other')
      ON CONFLICT (code) DO NOTHING;
    `);

    res.json({ message: "Lines & line_id migration completed" });
  } catch (err) {
    console.error("MIGRATION initLines ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// -------------------
// IMPORT Excel from UI Upload (multipart/form-data)
// -------------------
app.post("/importExcel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const buffer = req.file.buffer;
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    await pool.query("TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;");

    for (const row of rows) {
      if (!row["Machine"] || !row["Task"]) continue;

      // Line Handling
      let lineCode = row["Line"]?.trim() || "OTHER";

      const lineResult = await pool.query(
        `INSERT INTO lines (code, name)
         VALUES ($1, $1)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [lineCode]
      );
      const lineId = lineResult.rows[0].id;

      // Machine handling
      const machineResult = await pool.query(
        `INSERT INTO machines (name, line_id)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET line_id = EXCLUDED.line_id
         RETURNING id`,
        [row["Machine"], lineId]
      );
      const machineId = machineResult.rows[0].id;

      // Task create
      await pool.query(
        `INSERT INTO maintenance_tasks
        (machine_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          machineId,
          row["Section"] || null,
          row["Unit"] || null,
          row["Task"],
          row["Type"] || null,
          row["Qty"] || null,
          row["Duration(min)"] || null,
          row["Frequency(hours)"] || null,
          row["DueDate"] ? new Date(row["DueDate"]) : null,
          row["Status"] || "Planned",
        ]
      );
    }

    res.json({ message: "Excel imported successfully!" });
  } catch (err) {
    console.error("IMPORT from UI ERROR:", err);
    res.status(500).json({ error: "Import failed!" });
  }
});


// -------------------
// GET Tasks (with line info)
// -------------------
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mt.id,
        m.name AS machine_name,
        mt.section,
        mt.unit,
        mt.task,
        mt.type,
        mt.qty,
        mt.duration_min,
        mt.frequency_hours,
        mt.due_date,
        mt.status,
        mt.completed_at,
        mt.completed_by,
        l.code AS line_code,
        l.name AS line_name
      FROM maintenance_tasks mt
      JOIN machines m ON m.id = mt.machine_id
      LEFT JOIN lines l ON m.line_id = l.id
      ORDER BY mt.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /tasks ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// -------------------
// UPDATE Task Status + Technician + Timestamp
// -------------------
app.patch("/tasks/:id", async (req, res) => {
  const { completed_by } = req.body;

  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status = 'Done',
           completed_at = NOW(),
           completed_by = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, completed_by]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /tasks/:id ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// UNDO Task (back to Planned, clear audit)
// -------------------
app.patch("/tasks/:id/undo", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status = 'Planned',
           completed_at = NULL,
           completed_by = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /tasks/:id/undo ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// SNAPSHOT Export (full audit)
// -------------------
app.get("/snapshot/export", async (req, res) => {
  try {
    const machines = (await pool.query("SELECT * FROM machines")).rows;
    const tasks = (
      await pool.query(`
      SELECT 
        mt.*,
        m.name AS machine_name
      FROM maintenance_tasks mt
      JOIN machines m ON m.id = mt.machine_id
    `)
    ).rows;

    const snapshot = {
      version: 2,
      created_at: new Date().toISOString(),
      machines,
      tasks,
    };

    const filename = `snapshot_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error("SNAPSHOT EXPORT ERROR:", err);
    res.status(500).json({ error: "Snapshot export failed" });
  }
});

// -------------------
// SNAPSHOT Restore (keep audit)
// -------------------
app.post("/snapshot/restore", async (req, res) => {
  try {
    const { machines, tasks } = req.body;

    if (!machines || !tasks) {
      return res.status(400).json({ error: "Invalid snapshot format" });
    }

    await pool.query(
      "TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;"
    );
    await pool.query(
      "TRUNCATE TABLE machines RESTART IDENTITY CASCADE;"
    );

    for (const m of machines) {
      await pool.query(
        `INSERT INTO machines (name, sn) VALUES ($1, $2)`,
        [m.name, m.sn || null]
      );
    }

    for (const t of tasks) {
      await pool.query(
        `INSERT INTO maintenance_tasks (
          machine_id, section, unit, task, type,
          qty, duration_min, frequency_hours, due_date, status,
          completed_at, completed_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          t.machine_id,
          t.section,
          t.unit,
          t.task,
          t.type,
          t.qty,
          t.duration_min,
          t.frequency_hours,
          t.due_date,
          t.status,
          t.completed_at,
          t.completed_by
        ]
      );
    }

    res.json({ message: "Restore completed!" });
  } catch (err) {
    console.error("SNAPSHOT RESTORE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// Serve frontend for ANY unknown route (last)
// -------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);


