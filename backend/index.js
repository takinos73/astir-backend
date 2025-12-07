import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import xlsx from "xlsx";
import path from "path";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Root Test
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

/****************************************
 * GET ALL MAINTENANCE TASKS
 ****************************************/
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
      LEFT JOIN machines m ON mt.machine_id = m.id
      ORDER BY mt.id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/****************************************
 * GET MACHINES
 ****************************************/
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name FROM machines ORDER BY id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/****************************************
 * IMPORT Excel → Database
 ****************************************/
app.post("/import", async (req, res) => {
  try {
    const filePath = path.resolve("./Maint_web.xlsx");
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let machineCache = new Map();
    let insertedMachines = 0;
    let insertedTasks = 0;

    for (const row of rows) {
      const machineName = row["Machine"];
      if (!machineName) continue;

      // MACHINE INSERT if not exists
      let machineId;
      if (machineCache.has(machineName)) {
        machineId = machineCache.get(machineName);
      } else {
        const result = await pool.query(
          `INSERT INTO machines (name)
           VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [machineName]
        );
        machineId = result.rows[0].id;
        machineCache.set(machineName, machineId);
        insertedMachines++;
      }

      // Parse dd/mm/yy to ISO
      let dueDate = null;
      if (row["DueDate"]) {
        const parts = row["DueDate"].split("/");
        const day = parts[0];
        const month = parts[1];
        const year = "20" + parts[2];
        dueDate = `${year}-${month}-${day}`;
      }

      await pool.query(
        `INSERT INTO maintenance_tasks
        (machine_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          machineId,
          row["Section"] || null,
          row["Unit"] || null,
          row["Task"] || null,
          row["Type"] || null,
          row["Qty"] || null,
          row["Duration(min)"] || null,
          row["Frequency(hours)"] || null,
          dueDate,
          row["Status"] || "Planned",
        ]
      );

      insertedTasks++;
    }

    res.json({
      message: "Import completed!",
      machines: insertedMachines,
      tasks: insertedTasks,
    });

  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).send(err.message);
  }
});

/****************************************
 * MIGRATION
 ****************************************/
async function runMigration() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS machines (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE
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
      qty REAL,
      duration_min REAL,
      frequency_hours REAL,
      due_date DATE,
      status TEXT DEFAULT 'Planned'
    );
  `);
  console.log("Migration OK");
}

await runMigration();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

