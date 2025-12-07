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

// 🔹 Το Excel είναι στο root του project (όπως φαίνεται από το GitHub)
const excelFilePath = path.join(process.cwd(), "Maint_web.xlsx");

// Test route
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// 🔁 IMPORT Excel → DB
app.post("/import", async (req, res) => {
  try {
    console.log("📄 Excel path:", excelFilePath);
    console.log("📌 Working directory:", process.cwd());

    if (!fs.existsSync(excelFilePath)) {
      console.error("❌ Excel not found!");
      return res.status(404).json({ error: "Excel file not found!" });
    }

    // Διαβάζουμε με cellDates:true ώστε, όπου μπορεί, να δίνει ήδη Date objects
    const workbook = XLSX.readFile(excelFilePath, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`📥 Rows detected: ${rows.length}`);

    // ⚠️ ΠΡΟΑΙΡΕΤΙΚΟ:
    // Αν ΘΕΛΕΙΣ κάθε import να ξεκινά σε καθαρό πίνακα:
    await pool.query(
      "TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;"
    );

    for (const row of rows) {
      if (!row["Machine"] || !row["Task"]) continue;

      const machine = row["Machine"];
      const section = row["Section"] || null;
      const unit = row["Unit"] || null;
      const task = row["Task"] || null;
      const type = row["Type"] || null;

      // 🔹 Ασφαλής μετατροπή αριθμητικών πεδίων
      const toNumberOrNull = (value) => {
        if (value === undefined || value === null) return null;
        if (typeof value === "string" && value.trim() === "-") return null;
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
      };

      const qty = toNumberOrNull(row["Qty"]);
      const duration = toNumberOrNull(row["Duration(min)"]);
      const freq = toNumberOrNull(row["Frequency(hours)"]);

      // 🔹 Σωστό parsing DueDate
      let due = null;
      const rawDue = row["DueDate"];

      if (rawDue) {
        if (rawDue instanceof Date) {
          // Ήδη σωστό Date από XLSX (λόγω cellDates:true)
          due = rawDue;
        } else if (typeof rawDue === "number") {
          // Excel serial number → days since 1899-12-30
          const excelEpoch = Date.UTC(1899, 11, 30); // 30/12/1899
          const ms = excelEpoch + rawDue * 24 * 60 * 60 * 1000;
          due = new Date(ms);
        } else if (typeof rawDue === "string") {
          // Αν ποτέ έρθει σαν "dd/mm/yy"
          const parts = rawDue.split(/[\/\-\.]/).map((p) => p.trim());
          if (parts.length === 3) {
            let [d, m, y] = parts.map(Number);
            if (y < 100) y += 2000; // π.χ. 25 → 2025
            due = new Date(Date.UTC(y, m - 1, d));
          }
        }
      }

      const status = row["Status"] || "Planned";

      // 🔹 Insert / get machine_id με ασφαλή τρόπο
      const insertMachineRes = await pool.query(
        `INSERT INTO machines (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [machine]
      );

      let machineId;
      if (insertMachineRes.rows.length > 0) {
        machineId = insertMachineRes.rows[0].id;
      } else {
        const existing = await pool.query(
          "SELECT id FROM machines WHERE name = $1",
          [machine]
        );
        machineId = existing.rows[0].id;
      }

      // 🔹 Insert task
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
// UPDATE task (Mark as Done)
app.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE maintenance_tasks 
       SET status = 'Done', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ PATCH /tasks error:", err.message);
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

