import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import path from "path";
import fs from "fs";
import xlsx from "xlsx";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Root check
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running with Machines + Tasks Import!");
});

// GET machines
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM machines ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET maintenance tasks
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mt.id,
        m.name AS machine,
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
      JOIN machines m ON mt.machine_id = m.id
      ORDER BY mt.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// IMPORT Excel
app.post("/import", async (req, res) => {
  try {
    const excelPath = path.resolve("./backend/Maint_web.xlsx");
    console.log("📄 Reading Excel:", excelPath);

    if (!fs.existsSync(excelPath)) {
      return res.status(404).json({ error: "Excel file not found!" });
    }

    const workbook = xlsx.readFile(excelPath);
    const sheet = workbook.Sheets["MasterPlan"];

    if (!sheet) return res.status(400).json({ error: "MasterPlan sheet missing!" });

    const rows = xlsx.utils.sheet_to_json(sheet);
    console.log(`📊 Rows loaded: ${rows.length}`);

    let importedMachines = 0;
    let importedTasks = 0;

    for (const row of rows) {
      const machineName = row.Machine?.trim();
      if (!machineName) continue;

      const machineResult = await pool.query(
        `INSERT INTO machines (name)
         VALUES ($1) ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [machineName]
      );

      let machineId;
      if (machineResult.rows.length > 0) {
        importedMachines++;
        machineId = machineResult.rows[0].id;
      } else {
        const exist = await pool.query(
          "SELECT id FROM machines WHERE name = $1",
          [machineName]
        );
        machineId = exist.rows[0].id;
      }

      await pool.query(
        `INSERT INTO maintenance_tasks
        (machine_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          machineId,
          row.Section || null,
          row.Unit || null,
          row.Task || null,
          row.Type || null,
          row.Qty || null,
          row["Duration(min)"] || null,
          row["Frequency(hours)"] || null,
          row.DueDate ? new Date(row.DueDate) : null,
          row.Status || "Planned"
        ]
      );

      importedTasks++;
    }

    console.log(`✅ Imported: ${importedMachines} machines, ${importedTasks} tasks`);

    return res.json({
      success: true,
      importedMachines,
      importedTasks,
    });

  } catch (err) {
    console.error("❌ Import failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// MIGRATION — Database setup
async function runMigration() {
  console.log("🔄 Running DB migration...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS machines (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_tasks (
      id SERIAL PRIMARY KEY,
      machine_id INT REFERENCES machines(id),
      section TEXT,
      unit TEXT,
      task TEXT,
      type TEXT,
      qty TEXT,
      duration_min TEXT,
      frequency_hours TEXT,
      due_date TIMESTAMPTZ,
      status TEXT DEFAULT 'Planned'
    );
  `);

  console.log("📌 Migration OK");
}

await runMigration();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
