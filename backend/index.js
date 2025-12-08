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

// Excel file path
const excelFilePath = path.join(process.cwd(), "Maint_web.xlsx");

// -------------------
// Test route
// -------------------
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// -------------------
// IMPORT Excel to DB
// -------------------
app.post("/import", async (req, res) => {
  try {
    if (!fs.existsSync(excelFilePath)) {
      return res.status(404).json({ error: "Excel file not found!" });
    }

    const workbook = XLSX.readFile(excelFilePath, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    await pool.query(
      "TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;"
    );

    for (const row of rows) {
      if (!row["Machine"] || !row["Task"]) continue;

      const machine = row["Machine"];

      const insertMachine = await pool.query(
        `INSERT INTO machines (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [machine]
      );

      let machineId = insertMachine.rows.length
        ? insertMachine.rows[0].id
        : (await pool.query("SELECT id FROM machines WHERE name=$1", [machine]))
            .rows[0].id;

      const due = row["DueDate"]
        ? new Date(row["DueDate"])
        : null;

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
          due,
          row["Status"] || "Planned",
        ]
      );
    }

    res.json({ message: "Import completed!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// GET Tasks
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
        mt.status
      FROM maintenance_tasks mt
      JOIN machines m ON m.id = mt.machine_id
      ORDER BY mt.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// UPDATE Task Status
// -------------------
app.patch("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status = 'Done'
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// SNAPSHOT Export
// -------------------
app.get("/snapshot/export", async (req, res) => {
  try {
    const machines = (await pool.query("SELECT * FROM machines")).rows;
    const tasks = (await pool.query(`
      SELECT 
        mt.*, m.name AS machine_name 
      FROM maintenance_tasks mt
      JOIN machines m ON m.id = mt.machine_id
    `)).rows;

    const snapshot = {
      version: 1,
      created_at: new Date().toISOString(),
      machines,
      tasks
    };

    const filename = `snapshot_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    res.status(500).json({ error: "Snapshot export failed" });
  }
});

// -------------------
// SNAPSHOT Restore
// -------------------
app.post("/snapshot/restore", async (req, res) => {
  try {
    const { machines, tasks } = req.body;

    if (!machines || !tasks) {
      return res.status(400).json({ error: "Invalid snapshot format" });
    }

    await pool.query("TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;");
    await pool.query("TRUNCATE TABLE machines RESTART IDENTITY CASCADE;");

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
          qty, duration_min, frequency_hours, due_date, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          t.machine_id, t.section, t.unit, t.task, t.type,
          t.qty, t.duration_min, t.frequency_hours, t.due_date, t.status
        ]
      );
    }

    res.json({ message: "Restore completed!" });
  } catch (err) {
    console.error("Restore ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
