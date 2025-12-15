import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import crypto from "crypto";
import multer from "multer";
const upload = multer();

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const frontendPath = path.join(process.cwd(), "..", "frontend");
app.use(express.static(frontendPath));

function asText(v) {
  return (v ?? "").toString().trim();
}

function asUpper(v) {
  return asText(v).toUpperCase();
}

function parseMaybeNumber(v) {
  if (v === null || v === undefined) return null;
  const s = asText(v);
  if (!s) return null;
  // επιτρέπουμε decimal με τελεία ή κόμμα
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function parseMaybeDate(v) {
  if (!v) return null;
  // XLSX μπορεί να δώσει Date object ή string
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = asText(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? NaN : d;
}


// TEST
app.get("/api", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// TEMP MIGRATION: Add 'line' column to maintenance_tasks
app.get("/migrate/addLineToTasks", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS line TEXT;
    `);
    res.json({ message: "Migration OK — line column added to tasks!" });
  } catch (err) {
    console.error("Migration ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// 📥 IMPORT Excel (PREVIEW + COMMIT) με Asset SN
// ----------------------------------------------
app.post("/importExcel/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(req.file.buffer, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    if (!sheet) return res.status(400).json({ error: "Sheet 'MasterPlan' not found" });

    // defval: "" ώστε να μην γυρνάει undefined keys
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const preview = await buildImportPreview(rows);
    return res.json(preview);
  } catch (err) {
    console.error("IMPORT PREVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/importExcel/commit", upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(req.file.buffer, { cellDates: true });
    const sheet = workbook.Sheets["MasterPlan"];
    if (!sheet) return res.status(400).json({ error: "Sheet 'MasterPlan' not found" });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // 1) Preview validation first (αν έχει errors -> STOP)
    const preview = await buildImportPreview(rows);
    if (preview.summary.errors > 0) {
      return res.status(400).json({
        error: "Import blocked: fix errors first",
        preview
      });
    }

    // 2) COMMIT (overwrite per asset_id)
    await client.query("BEGIN");

    // Group rows by asset_id ώστε να κάνουμε overwrite ανά asset
    const groups = new Map(); // asset_id -> [row]
    for (const r of preview.rows) {
      if (r.status !== "ok") continue;
      if (!groups.has(r.asset_id)) groups.set(r.asset_id, []);
      groups.get(r.asset_id).push(r.cleaned); // cleaned row data
    }

    // Overwrite strategy B:
    // Για κάθε asset: delete planned tasks (ή όλα) και insert τα νέα
    for (const [assetId, tasks] of groups.entries()) {
      await client.query(
        `DELETE FROM maintenance_tasks
         WHERE asset_id = $1 AND is_planned = true`,
        [assetId]
      );

      for (const t of tasks) {
        await client.query(
          `INSERT INTO maintenance_tasks
            (asset_id, section, unit, task, type, qty, duration_min, frequency_hours, due_date, status, is_planned, notes)
           VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
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
            t.notes
          ]
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      message: "Excel import committed (overwrite planned tasks per asset)",
      summary: preview.summary
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("IMPORT COMMIT ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// -----------------------------
// Helpers για import preview
// -----------------------------
function cleanStr(v) {
  return (v ?? "").toString().trim();
}

function cleanUpper(v) {
  return cleanStr(v).toUpperCase();
}

// δέχεται "", "-", null -> null
function cleanNumber(v) {
  const s = cleanStr(v);
  if (!s || s === "-") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cleanDate(v) {
  if (!v) return null;
  // όταν είναι Excel Date θα έρθει ως Date (cellDates: true)
  if (v instanceof Date && !isNaN(v)) return v;
  // fallback: αν έρθει string
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

async function buildImportPreview(rows) {
  const out = [];
  let ok = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const excelRowNumber = i + 2; // header = 1, data starts row 2 (όπως screenshot)

    const line = cleanUpper(rows[i]["Line"]);
    const machine = cleanUpper(rows[i]["Machine"]);
    // Εσύ το έχεις σαν Serial_number
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

    // Basic required validation
    if (!line || !machine || !sn || !task) {
      errors++;
      out.push({
        row: excelRowNumber,
        status: "error",
        error: "Missing required fields (Line / Machine / Serial_number / Task)"
      });
      continue;
    }

    // Asset lookup
    const assetRes = await pool.query(
      `SELECT id
       FROM assets
       WHERE UPPER(line) = $1
         AND UPPER(model) = $2
         AND UPPER(serial_number) = $3
       LIMIT 1`,
      [line, machine, sn]
    );

    if (!assetRes.rows.length) {
      errors++;
      out.push({
        row: excelRowNumber,
        status: "error",
        error: `Asset not found: ${line} / ${machine} / ${sn}`
      });
      continue;
    }

    const asset_id = assetRes.rows[0].id;

    // numeric validation (αν θες να είναι υποχρεωτικά, πες μου)
    // εδώ απλά τα καθαρίζουμε και αφήνουμε null αν άκυρα
    ok++;
    out.push({
      row: excelRowNumber,
      status: "ok",
      asset_id,
      line,
      machine,
      serial_number: sn,
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
        notes: null
      }
    });
  }

  return {
    summary: {
      total: rows.length,
      ok,
      errors
    },
    rows: out
  };
}



// ----------------------------------------------
// GET Machines
// ----------------------------------------------
app.get("/machines", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM machines ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// GET Tasks with line field
// ----------------------------------------------
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
  SELECT 
    mt.id,
    m.name AS machine_name,
    mt.line,
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
    mt.completed_at
  FROM maintenance_tasks mt
  JOIN machines m ON m.id = mt.machine_id
  ORDER BY mt.id ASC
`);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// ✔ Mark Done
// ----------------------------------------------
app.patch("/tasks/:id", async (req, res) => {
  const { completed_by } = req.body;

  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status='Done',
           completed_by=$2,
           completed_at=NOW(),
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [req.params.id, completed_by]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);

  } catch (err) {
    console.error("PATCH ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// ↩ Undo Task
// ----------------------------------------------
app.patch("/tasks/:id/undo", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status='Planned',
           completed_by=NULL,
           completed_at=NULL,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);

  } catch (err) {
    console.error("UNDO ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//----------------------------------------------
// ASSETS
//----------------------------------------------

app.get("/assets", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM assets
      ORDER BY line, model, serial_number
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/assets", async (req, res) => {
  const { line, model, serial_number } = req.body;

  if (!line || !model || !serial_number) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO assets (line, model, serial_number)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [line, model, serial_number]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/assets/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM assets WHERE id=$1", [req.params.id]);
    res.json({ message: "Asset deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// Snapshot Export
// ----------------------------------------------
app.get("/snapshot/export", async (req, res) => {
  try {
    const machines = (await pool.query("SELECT * FROM machines")).rows;
    const tasks = (
      await pool.query(`
        SELECT 
          mt.*,              -- περιλαμβάνει mt.line
          m.name AS machine_name
        FROM maintenance_tasks mt
        JOIN machines m ON m.id = mt.machine_id
      `)
    ).rows;

    res.json({
      version: 2,
      created_at: new Date().toISOString(),
      machines,
      tasks,
    });
  } catch (err) {
    console.error("Snapshot export failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// ➕ Create NON-PLANNED task
// ----------------------------
app.post("/tasks", async (req, res) => {
  try {
    const {
      line,
      machine_name,
      section,
      unit,
      task,
      type,
      due_date,
      notes
    } = req.body;

    if (!machine_name || !task) {
      return res.status(400).json({ error: "Machine & task required" });
    }

    // ensure machine exists
    const m = await pool.query(
      `INSERT INTO machines (name)
       VALUES ($1)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [machine_name]
    );

    const machineId =
      m.rows[0]?.id ||
      (await pool.query(`SELECT id FROM machines WHERE name=$1`, [machine_name]))
        .rows[0].id;

    const result = await pool.query(
      `INSERT INTO maintenance_tasks
        (machine_id, line, section, unit, task, type, due_date, status, is_planned, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Planned',false,$8)
       RETURNING *`,
      [
        machineId,
        line,
        section,
        unit,
        task,
        type,
        due_date || null,
        notes || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("CREATE TASK ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ----------------------------------------------
// Snapshot Restore
// ----------------------------------------------
app.post("/snapshot/restore", async (req, res) => {
  try {
    const { machines, tasks } = req.body;

    if (!machines || !tasks) {
      return res.status(400).json({ error: "Invalid snapshot format" });
    }

    // Καθαρίζουμε τους πίνακες
    await pool.query(
      "TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE;"
    );
    await pool.query(
      "TRUNCATE TABLE machines RESTART IDENTITY CASCADE;"
    );

    // Εισάγουμε μηχανές και κρατάμε map name -> id
    const machineIdMap = new Map();

    for (const m of machines) {
      const result = await pool.query(
        `INSERT INTO machines (name, line, sn)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [m.name, m.line || null, m.sn || null]
      );
      machineIdMap.set(m.name, result.rows[0].id);
    }

    // Εισάγουμε tasks με σωστό machine_id + line
    for (const t of tasks) {
      const machineId = machineIdMap.get(t.machine_name);

      if (!machineId) {
        console.warn(
          "Snapshot restore: no machine for task",
          t.machine_name,
          t.id
        );
        continue; // ή throw, ανάλογα πόσο αυστηρά το θες
      }

      await pool.query(
        `INSERT INTO maintenance_tasks (
          machine_id,
          line,
          section,
          unit,
          task,
          type,
          qty,
          duration_min,
          frequency_hours,
          due_date,
          status,
          completed_by,
          completed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          machineId,
          t.line || null,
          t.section,
          t.unit,
          t.task,
          t.type,
          t.qty,
          t.duration_min,
          t.frequency_hours,
          t.due_date,
          t.status,
          t.completed_by || null,
          t.completed_at || null,
        ]
      );
    }

    res.json({ message: "Restore completed!" });
  } catch (err) {
    console.error("Restore ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// ----------------------------------------------
// Documentation: Upload MasterPlan PDF
// ----------------------------------------------
app.post("/documentation/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Αποθήκευση PDF σε τοπικό φάκελο "docs"
    const docsPath = path.join(process.cwd(), "docs");
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath);
    }

    const filePath = path.join(docsPath, "MasterPlan.pdf");
    fs.writeFileSync(filePath, req.file.buffer);

    res.json({ message: "PDF uploaded successfully" });
  } catch (err) {
    console.error("DOCUMENT UPLOAD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------
// Documentation: Serve MasterPlan PDF
// ----------------------------------------------
app.get("/documentation/masterplan", (req, res) => {
  const filePath = path.join(process.cwd(), "docs", "MasterPlan.pdf");

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("MasterPlan PDF not found");
  }

  res.sendFile(filePath);
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index_v2.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);


