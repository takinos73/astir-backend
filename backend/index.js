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

// Excel file path 
const excelFilePath = path.join(process.cwd(), "Maint_web.xlsx");

// Test route
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// IMPORT Excel to DB
app.post("/import", async (req, res) => {
  try {
    console.log("📄 Excel path:", excelFilePath);
    console.log("📌 Working directory:", process.cwd());

try {
  console.log("📂 Root files:", fs.readdirSync(process.cwd()));
} catch(e) {
  console.log("⚠ Cannot list root directory", e.message);
}

try {
  console.log("📂 Backend folder:", fs.readdirSync(path.join(process.cwd(), "backend")));
} catch(e) {
  console.log("⚠ Backend folder missing:", e.message);
}

console.log("🔍 Checking Excel path:", excelFilePath);
console.log("📄 Exists?", fs.existsSync(excelFilePath));


    if (!fs.existsSync(excelFilePath)) {
      console.error("❌ Excel not found!");
      return res.status(404).json({ error: "Excel file not found!" });
    }

    const workbook = XLSX.readFile(excelFilePath);
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`📥 Rows detected: ${rows.length}`);

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

    console.log("✅ Import completed!");
    res.json({ message: "Data imported successfully!" });

  } catch (err) {
    console.error("❌ Import ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET machines
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM machines ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET maintenance tasks
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
