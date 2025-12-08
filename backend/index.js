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
const frontendPath = path.join(process.cwd(), "frontend");
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

    res.json({ message: "Import

