import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Correct Excel path (same folder as index.js)
const excelFilePath = path.join(process.cwd(), "Maint_web.xlsx");

// Test route
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// Import Excel to database
app.post("/import", async (req, res) => {
  try {
    if (!fs.existsSync(excelFilePath)) {
      return res.status(404).json({ error: "Excel file not found!" });
    }

    const workbook = XLSX.readFile(excelFilePath);
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    for (const row of rows) {
      if (!row["Machine"] || !row["Task"]) continue;

      const machine = row["Machine"];
      const section = row["Section"] || null;
      const unit = row["Unit"] || null;
      const task = row["Task"] || null;
      const type = row["Type"] || null;
      const qty = row["Qty"] || null;
      const duration = row["Duration(min)"] || null;
      const freq = row["Frequency(hours)"] || null;
      const due = row["DueDate"] ? new Date(row["DueDate"]) : null;
      const status = row["Status"] || "Planned";

      const machineRes = await pool.query(
        `INSERT INTO machines (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [machine]
      );

      const machineId = machineRes.rows[0].id;

      await pool.query(
        `INSERT INTO maintenance_tasks
        (machine_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [machineId, section, unit, task, type, qty, duration, freq, due, status]
      );
    }

    res.json({ message: "Data imported successfully!" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET endpoints
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM machines ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM maintenance_tasks ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
