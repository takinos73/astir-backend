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

/* =====================
   GET LINES
===================== */
app.get("/lines", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, code, name
      FROM lines
      ORDER BY code
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /lines ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


/* =====================================================
   TASKS
   - maintenance_tasks is assumed to have:
     id, asset_id (FK), section, unit, task, type, qty,
     duration_min, frequency_hours,
     due_date, status, completed_by, completed_at,
     updated_at, is_planned, notes, deleted_at
===================================================== */

// GET active tasks (Planned + Overdue), sorted by due date
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mt.id,
        mt.asset_id,              -- ✅ needed for UI logic
        mt.task,
        mt.status,
        mt.due_date,
        mt.completed_at,
        mt.completed_by,
        mt.section,
        mt.unit,
        mt.type,
        mt.frequency_hours,
        mt.duration_min,          -- ✅ duration now available
        mt.is_planned,            -- ✅ classification helper
        mt.notes,                 -- ✅ notes included

        a.model AS machine_name,
        a.serial_number,
        l.code AS line_code

      FROM maintenance_tasks mt
      JOIN assets a ON a.id = mt.asset_id
      JOIN lines l ON l.id = a.line_id

      WHERE mt.status IN ('Planned', 'Overdue')
        AND mt.deleted_at IS NULL
        AND a.active = true       -- ✅ FIX: hide tasks of inactive assets

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
    executed_by,

    // ⬇️ ΣΗΜΑΝΤΙΚΟ
    duration_min,              // 👉 ESTIMATED (PLANNED ONLY)
    execution_duration_min     // 👉 ACTUAL (BREAKDOWN ONLY)
  } = req.body;

  if (!asset_id || !task) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* =====================
       1️⃣ INSERT TASK
       (duration_min ONLY if planned)
    ===================== */

    const taskRes = await client.query(
      `
      INSERT INTO maintenance_tasks
        (
          asset_id,
          section,
          unit,
          task,
          type,
          due_date,
          status,
          is_planned,
          duration_min,
          notes
        )
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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

        // 🔑 ΜΟΝΟ PLANNED → estimated duration
        is_planned === true && Number.isFinite(Number(duration_min))
          ? Number(duration_min)
          : null,

        notes || null
      ]
    );

    const newTask = taskRes.rows[0];

    /* =====================
   2️⃣ BREAKDOWN → HISTORY
   (ACTUAL SERVICE TIME + EXECUTION DATE)
===================== */

if (is_planned === false) {
  await client.query(
    `
    INSERT INTO task_executions
      (
        task_id,
        asset_id,
        executed_by,
        executed_at,
        duration_minutes
      )
    VALUES
      ($1, $2, $3, $4, $5)
    `,
    [
      newTask.id,
      asset_id,
      executed_by || null,

      // 🗓️ Breakdown Date (from frontend or fallback NOW)
      req.body.execution_date
        ? new Date(req.body.execution_date)
        : new Date(),

      // 🔥 ACTUAL SERVICE TIME
      Number.isFinite(Number(execution_duration_min))
        ? Number(execution_duration_min)
        : null
    ]
  );
}

    await client.query("COMMIT");

    res.json(newTask);

    // 🧪 DEBUG (safe to remove later)
    console.log("POST /tasks:", {
      is_planned,
      duration_min,
      execution_duration_min
    });

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
  const { completed_by, completed_at, notes } = req.body; // 🔵 notes added
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
          executed_at,
          duration_minutes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          task.id,
          task.asset_id,
          completed_by || null,
          task.due_date || null,
          completedAt,

          // ⏱ planned / preventive → estimated duration (REAL → INTEGER)
          Number.isFinite(Number(task.duration_min))
            ? Math.round(Number(task.duration_min))
            : null
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
          notes = COALESCE($5, notes),   -- 🔵 preserve existing notes
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          nextDue,
          completed_by || null,
          completedAt,
          notes || null                  // 🔵
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
          notes = COALESCE($4, notes),   -- 🔵 preserve existing notes
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          completed_by || null,
          completedAt,
          notes || null                  // 🔵
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
   BULK COMPLETE TASKS (ASSET-SCOPED)
   - Planned & Preventive only
   - Single execution context
   - Preventive rotates
===================== */
app.post("/tasks/bulk-done", async (req, res) => {
  const client = await pool.connect();

  try {
    const { taskIds, completed_by, completed_at, notes } = req.body || {};

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: "No tasks selected" });
    }

    if (!completed_by) {
      return res.status(400).json({ error: "completed_by is required" });
    }

    const completedAt = completed_at
      ? new Date(completed_at)
      : new Date();

    await client.query("BEGIN");

    /* =====================
       1️⃣ FETCH TASKS (LOCK)
    ===================== */
    const { rows: tasks } = await client.query(
      `
      SELECT *
      FROM maintenance_tasks
      WHERE id = ANY($1)
        AND deleted_at IS NULL
      FOR UPDATE
      `,
      [taskIds]
    );

    if (tasks.length !== taskIds.length) {
      throw new Error("Some tasks not found or deleted");
    }

    /* =====================
       2️⃣ VALIDATION
    ===================== */
    const assetId = tasks[0].asset_id;

    for (const t of tasks) {
      if (t.asset_id !== assetId) {
        throw new Error("Tasks must belong to the same asset");
      }

      if (!["Planned"].includes(t.status)) {
        throw new Error(`Task ${t.id} is not in Planned state`);
      }

      if (t.is_planned !== true) {
        throw new Error(`Task ${t.id} is not planned`);
      }
    }

    /* =====================
       3️⃣ EXECUTE EACH TASK
    ===================== */
    for (const task of tasks) {
      const hasFrequency =
        task.frequency_hours &&
        Number(task.frequency_hours) > 0;

      // 3️⃣a HISTORY (always)
      await client.query(
        `
        INSERT INTO task_executions (
          task_id,
          asset_id,
          executed_by,
          prev_due_date,
          executed_at,
          duration_minutes
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          task.id,
          task.asset_id,
          completed_by,
          task.due_date,
          completedAt,

          // ⏱️ Planned / Preventive → estimated duration (REAL → INTEGER)
          Number.isFinite(Number(task.duration_min))
            ? Math.round(Number(task.duration_min))
            : null
        ]
      );
      // 3️⃣b PREVENTIVE → ROTATE
      if (hasFrequency) {
        const nextDue = new Date(task.due_date);
        nextDue.setHours(
          nextDue.getHours() + Number(task.frequency_hours)
        );

        await client.query(
          `
          UPDATE maintenance_tasks
          SET
            due_date = $2,
            completed_by = $3,
            completed_at = $4,
            notes = COALESCE($5, notes),
            updated_at = NOW()
          WHERE id = $1
          `,
          [
            task.id,
            nextDue,
            completed_by,
            completedAt,
            notes || null
          ]
        );

      } else {
        // 3️⃣c PLANNED → DONE
        await client.query(
          `
          UPDATE maintenance_tasks
          SET
            status = 'Done',
            completed_by = $2,
            completed_at = $3,
            notes = COALESCE($4, notes),
            updated_at = NOW()
          WHERE id = $1
          `,
          [
            task.id,
            completed_by,
            completedAt,
            notes || null
          ]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, count: tasks.length });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /tasks/bulk-done ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* =====================
   SOFT DELETE PLANNED MANUAL TASK
===================== */
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE maintenance_tasks
      SET deleted_at = NOW()
      WHERE id = $1
        AND status = 'Planned'
        AND frequency_hours IS NULL
      RETURNING id
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(400).json({
        error: "Task cannot be deleted"
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE TASK ERROR:", err.message);
    res.status(500).json({ error: err.message });
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
        e.updated_at,
        e.duration_minutes,
        
        t.task,
        t.section,
        t.unit,
        t.type,
        t.notes, 
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


/* =====================
   UPDATE BREAKDOWN
   - Update task description & notes
   - Update execution technician
===================== */
app.patch("/executions/:id", async (req, res) => {
  const { id } = req.params;
  const { task, executed_by, notes } = req.body;

  if (!task || !executed_by) {
    return res.status(400).json({
      error: "task and executed_by are required"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Find related task_id
    const execRes = await client.query(
      `SELECT task_id FROM task_executions WHERE id = $1`,
      [id]
    );

    if (execRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Execution not found" });
    }

    const taskId = execRes.rows[0].task_id;

    // 2️⃣ Update task (description + notes)
    await client.query(
      `
      UPDATE maintenance_tasks
      SET
        task = $1,
        notes = $2,
        updated_at = NOW()
      WHERE id = $3
      `,
      [
        task,
        notes || null,
        taskId
      ]
    );

    // 3️⃣ Update execution metadata (technician + audit)
    await client.query(
      `
      UPDATE task_executions
      SET
        executed_by = $1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [
        executed_by,
        id
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PATCH /executions/:id ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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

/*================================================
 KPI – ESTIMATED WORKLOAD (NEXT 7 DAYS)
=================================================*/
app.get("/kpis/workload/next-7-days", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(duration_min), 0)::int AS total_minutes
      FROM maintenance_tasks
      WHERE
        duration_min IS NOT NULL
        AND status != 'Done'
        AND deleted_at IS NULL
        AND due_date >= CURRENT_DATE
        AND due_date < CURRENT_DATE + INTERVAL '7 days'
    `);

    res.json(rows[0]); // { total_minutes: 123 }
  } catch (err) {
    console.error("GET /kpis/workload/next-7-days ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/*================================================
 KPI – OVERDUE WORKLOAD
=================================================*/
app.get("/kpis/workload/overdue", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(duration_min), 0)::int AS total_minutes
      FROM maintenance_tasks
      WHERE
        duration_min IS NOT NULL
        AND status != 'Done'
        AND due_date < CURRENT_DATE
        AND deleted_at IS NULL
    `);

    res.json(rows[0]); // { total_minutes: xxx }
  } catch (err) {
    console.error("GET /kpis/workload/overdue ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/*================================================
 KPI – PLANNING MIX (PLANNED vs UNPLANNED WORKLOAD)
=================================================*/
app.get("/kpis/planning-mix", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN is_planned = true  THEN duration_min END), 0)::int AS planned_minutes,
        COALESCE(SUM(CASE WHEN is_planned = false THEN duration_min END), 0)::int AS unplanned_minutes
      FROM maintenance_tasks
      WHERE
        duration_min IS NOT NULL
        AND status != 'Done'
        AND deleted_at IS NULL
    `);

    res.json(rows[0]);
    // { planned_minutes: xxx, unplanned_minutes: yyy }
  } catch (err) {
    console.error("GET /kpis/planning-mix ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/*================================================
 KPI – TOP ASSETS BY OVERDUE WORKLOAD (WITH COUNT)
=================================================*/
app.get("/kpis/overdue/top-assets", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.model AS machine_name,
        a.serial_number,
        l.code AS line_code,
        COUNT(mt.id)::int AS pending_tasks,
        SUM(mt.duration_min)::int AS total_minutes
      FROM maintenance_tasks mt
      JOIN assets a ON a.id = mt.asset_id
      JOIN lines l ON l.id = a.line_id
      WHERE
        mt.duration_min IS NOT NULL
        AND mt.status != 'Done'
        AND mt.due_date < CURRENT_DATE
        AND mt.deleted_at IS NULL
      GROUP BY a.model, a.serial_number, l.code
      ORDER BY total_minutes DESC
      LIMIT 5
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET /kpis/overdue/top-assets ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   EDIT TASK (PLANNED / UNPLANNED – METADATA ONLY)
===================== */
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const {
    task,
    type,
    section,
    unit,
    due_date,
    notes
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE maintenance_tasks
      SET
        task = COALESCE($2, task),
        type = COALESCE($3, type),
        section = COALESCE($4, section),
        unit = COALESCE($5, unit),
        due_date = COALESCE($6, due_date),
        notes = COALESCE($7, notes),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'Planned'
      RETURNING *
      `,
      [
        id,
        task || null,
        type || null,
        section || null,
        unit || null,
        due_date ? new Date(due_date) : null,
        notes || null
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Task not found or not editable"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("PUT /tasks/:id ERROR:", err.message);
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

/* =====================
   ADD ASSET
   - Supports existing line
   - Supports NEW line (auto-create)
   - Reactivates inactive assets
===================== */
app.post("/assets", async (req, res) => {
  const { line, model, serial_number, description, active } = req.body;

  if (!line || !model || !serial_number) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cleanLine = cleanUpper(line);
    const cleanModel = cleanStr(model);
    const cleanSerial = cleanStr(serial_number);

    // =====================
    // 1️⃣ FIND OR CREATE LINE
    // =====================
    let lineId = await findLineIdByCode(client, cleanLine);

    if (!lineId) {
      const createdLine = await client.query(
        `
        INSERT INTO lines (code, name)
        VALUES ($1, $2)
        RETURNING id
        `,
        [cleanLine, cleanLine]
      );

      lineId = createdLine.rows[0].id;
    }

    // =====================
    // 2️⃣ CHECK EXISTING ASSET
    // =====================
    const existing = await client.query(
      `
      SELECT id, active
      FROM assets
      WHERE model = $1 AND serial_number = $2
      `,
      [cleanModel, cleanSerial]
    );

    // ♻ Reactivate inactive asset
    if (existing.rows.length > 0 && existing.rows[0].active === false) {
      const reactivated = await client.query(
        `
        UPDATE assets
        SET
          active = true,
          line_id = $1,
          description = $2
        WHERE id = $3
        RETURNING *
        `,
        [
          lineId,
          description || null,
          existing.rows[0].id
        ]
      );

      await client.query("COMMIT");
      return res.json({
        reactivated: true,
        asset: reactivated.rows[0]
      });
    }

    // ❌ Already active → conflict
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Asset already exists and is active"
      });
    }

    // =====================
    // 3️⃣ CREATE NEW ASSET
    // =====================
    const result = await client.query(
      `
      INSERT INTO assets (
        line_id,
        model,
        serial_number,
        description,
        active
      )
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
      `,
      [
        lineId,
        cleanModel,
        cleanSerial,
        description || null
      ]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);

  } catch (err) {
    await client.query("ROLLBACK");
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
/* =====================
   EDIT ASSET
===================== */
app.patch("/assets/:id", async (req, res) => {
  const {
    line_id,
    model,
    serial_number,
    description
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE assets
      SET
        line_id = $1,
        model = $2,
        serial_number = $3,
        description = $4
      WHERE id = $5
      RETURNING *
      `,
      [
        Number.isFinite(Number(line_id)) ? Number(line_id) : null,
        model || null,
        serial_number || null,
        description || null,
        req.params.id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("PATCH /assets ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   GET ASSET MODELS
   - Used in Add Asset modal
===================== */
app.get("/asset-models", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT model
      FROM assets
      WHERE active = true
        AND model IS NOT NULL
        AND model <> ''
      ORDER BY model ASC
    `);

    // επιστρέφουμε απλό array strings
    const models = result.rows.map(r => r.model);

    res.json(models);

  } catch (err) {
    console.error("GET /asset-models ERROR:", err.message);
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
    const sheet = workbook.Sheets["MasterPlan_GR"];
    if (!sheet) return res.status(400).json({ error: "Sheet 'MasterPlan_GR' not found" });

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
    const sheet = workbook.Sheets["MasterPlan_GR"];
    if (!sheet) {
      return res.status(400).json({ error: "Sheet 'MasterPlan_GR' not found" });
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
       0️⃣ FULL WIPE
    ===================== */
    await client.query(`TRUNCATE TABLE task_executions RESTART IDENTITY CASCADE`);
    await client.query(`TRUNCATE TABLE maintenance_tasks RESTART IDENTITY CASCADE`);
    await client.query(`TRUNCATE TABLE assets RESTART IDENTITY CASCADE`);
    await client.query(`TRUNCATE TABLE lines RESTART IDENTITY CASCADE`);

    /* =====================
       1️⃣ RESTORE LINES
    ===================== */
    for (const l of lines) {
      const code = (l.code || l.line || l.name || "").toString().trim();
      if (!code) continue;

      await client.query(
        `INSERT INTO lines (code, name, description)
         VALUES ($1,$2,$3)`,
        [code, l.name || code, l.description || null]
      );
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

      await client.query(
        `INSERT INTO assets (line_id, model, serial_number, description, active)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          lineRes.rows[0].id,
          a.model,
          a.serial_number,
          a.description || null,
          a.active !== false
        ]
      );
    }

    /* =====================
       3️⃣ PREP: TASK IDS USED IN HISTORY
    ===================== */
    const historyTaskIds = new Set(executions.map(e => e.task_id));

    /* =====================
       4️⃣ RESTORE TASKS
       - tasks WITH history → preserve ID
       - tasks WITHOUT history → new ID
    ===================== */
    for (const t of tasks) {
      const assetRes = await client.query(
        `
        SELECT a.id
        FROM assets a
        JOIN lines l ON l.id = a.line_id
        WHERE l.code = $1
          AND a.model = $2
          AND a.serial_number = $3
        `,
        [t.line, t.machine_name, t.serial_number]
      );
      if (!assetRes.rows.length) continue;

      const assetId = assetRes.rows[0].id;
      const hasHistory = historyTaskIds.has(t.id);

      if (hasHistory) {
        // 🔒 PRESERVE ID
        await client.query(
          `
          INSERT INTO maintenance_tasks (
            id,
            asset_id, section, unit, task, type, qty,
            duration_min, frequency_hours,
            due_date, status,
            completed_by, completed_at,
            is_planned, notes,
            created_at, updated_at,
            deleted_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,$10,$11,$12,$13,
            $14,$15,$16,$17,$18
          )
          `,
          [
            t.id,
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
            t.updated_at ? new Date(t.updated_at) : null,
            t.deleted_at ? new Date(t.deleted_at) : null
          ]
        );
      } else {
        // 🆕 NEW ID (preventive rollover etc)
        await client.query(
          `
          INSERT INTO maintenance_tasks (
            asset_id, section, unit, task, type, qty,
            duration_min, frequency_hours,
            due_date, status,
            completed_by, completed_at,
            is_planned, notes,
            created_at, updated_at,
            deleted_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,
            $9,$10,
            $11,$12,
            $13,$14,
            COALESCE($15,NOW()), COALESCE($16,NOW()),
            $17
          )
          `,
          [
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
            t.updated_at ? new Date(t.updated_at) : null,
            t.deleted_at ? new Date(t.deleted_at) : null
          ]
        );
      }
    }

    /* =====================
       5️⃣ FIX SEQUENCE (CRITICAL)
    ===================== */
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('maintenance_tasks','id'),
        (SELECT MAX(id) FROM maintenance_tasks)
      )
    `);

    /* =====================
       6️⃣ RESTORE HISTORY (SAFE)
    ===================== */
    for (const e of executions) {
      await client.query(
        `
        INSERT INTO task_executions (
          task_id,
          asset_id,
          executed_by,
          executed_at,
          prev_due_date
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          e.task_id,
          e.asset_id,
          e.executed_by || null,
          e.executed_at ? new Date(e.executed_at) : null,
          e.prev_due_date ? new Date(e.prev_due_date) : null
        ]
      );
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


/* =====================
   PRINT WORK ORDER (HTML → Browser Print)
===================== */
app.get("/api/tasks/:id/print", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Fetch task + asset + line
    const result = await pool.query(`
      SELECT
        t.*,
        a.model AS machine_name,
        a.serial_number,
        l.code AS line_code
      FROM maintenance_tasks t
      JOIN assets a ON a.id = t.asset_id
      JOIN lines l ON l.id = a.line_id
      WHERE t.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send("Task not found");
    }

    const task = result.rows[0];

    // 2️⃣ Generate printable HTML
    const html = buildWorkOrderHTML(task);

    // 3️⃣ Send HTML (browser handles print → PDF)
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);

  } catch (err) {
    console.error("PRINT WORK ORDER ERROR:", err);
    res.status(500).send("Failed to generate work order");
  }
});


function buildWorkOrderHTML(task) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Work Order #${task.id}</title>

<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #111;
  }

  h1 {
    font-size: 18px;
    margin-bottom: 4px;
  }

  .muted {
    color: #555;
  }

  .section {
    margin-top: 18px;
  }

  .section-title {
    font-weight: bold;
    border-bottom: 1px solid #ccc;
    margin-bottom: 6px;
    padding-bottom: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 4px 6px;
    vertical-align: top;
  }

  .label {
    width: 160px;
    color: #555;
  }

  .footer {
    margin-top: 40px;
  }

  .signature {
    margin-top: 24px;
  }
</style>
</head>

<body>

<h1>WORK ORDER</h1>
<div class="muted">
  ID: #${task.id}<br/>
  Type: ${task.frequency_hours ? "Preventive" : task.is_planned ? "Planned" : "Breakdown"}<br/>
  Status: ${task.status}<br/>
  Printed: ${new Date().toLocaleDateString()}
</div>

<div class="section">
  <div class="section-title">ASSET</div>
  <table>
    <tr><td class="label">Machine</td><td>${task.machine_name || "-"}</td></tr>
    <tr><td class="label">Serial No</td><td>${task.serial_number || "-"}</td></tr>
    <tr><td class="label">Line</td><td>${task.line_code || "-"}</td></tr>
    <tr><td class="label">Section</td><td>${task.section || "-"}</td></tr>
    <tr><td class="label">Unit</td><td>${task.unit || "-"}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">TASK DETAILS</div>
  <table>
    <tr><td class="label">Description</td><td>${task.task}</td></tr>
    <tr><td class="label">Due Date</td><td>${task.due_date || "-"}</td></tr>
    <tr><td class="label">Frequency</td><td>${task.frequency_hours ? task.frequency_hours + " h" : "-"}</td></tr>
    <tr><td class="label">Estimated Duration</td><td>${task.duration_min ? task.duration_min + " min" : "-"}</td></tr>
    <tr><td class="label">Notes</td><td>${task.notes || "-"}</td></tr>
  </table>
</div>

${task.completed_at ? `
<div class="section">
  <div class="section-title">EXECUTION</div>
  <table>
    <tr><td class="label">Executed By</td><td>${task.completed_by || "-"}</td></tr>
    <tr><td class="label">Date</td><td>${task.completed_at}</td></tr>
  </table>
</div>
` : ""}

<div class="footer">
  <div class="signature">Technician Signature: __________________________</div>
  <div class="signature">Supervisor Signature: __________________________</div>
</div>

<script>
  window.onload = () => window.print();
</script>

</body>
</html>
`;
}
/* =====================
   PRINT History task REPORT (HTML)
===================== */
app.get("/api/executions/:id/print", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        e.id AS execution_id,
        e.executed_at,
        e.executed_by,

        t.task,
        t.section,
        t.unit,
        t.notes,
        t.type,

        a.model AS machine_name,
        a.serial_number,
        l.code AS line_code

      FROM task_executions e
      JOIN maintenance_tasks t ON t.id = e.task_id
      JOIN assets a ON a.id = e.asset_id
      JOIN lines l ON l.id = a.line_id
      WHERE e.id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).send("Execution not found");
    }

    const execution = result.rows[0];
    const html = buildExecutionReportHTML(execution);

    res.setHeader("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    console.error("PRINT EXECUTION ERROR:", err);
    res.status(500).send("Failed to generate execution report");
  }
});
function buildExecutionReportHTML(e) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Job Report #${e.execution_id}</title>

<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #111;
  }

  h1 {
    font-size: 18px;
    margin-bottom: 4px;
  }

  .muted {
    color: #555;
  }

  .section {
    margin-top: 18px;
  }

  .section-title {
    font-weight: bold;
    border-bottom: 1px solid #ccc;
    margin-bottom: 6px;
    padding-bottom: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 4px 6px;
    vertical-align: top;
  }

  .label {
    width: 160px;
    color: #555;
  }

  .footer {
    margin-top: 40px;
  }

  .signature {
    margin-top: 24px;
  }
</style>
</head>

<body>

<h1>JOB REPORT</h1>
<div class="muted">
  Execution ID: #${e.execution_id}<br/>
  Status: Completed<br/>
  Printed: ${new Date().toLocaleDateString()}
</div>

<div class="section">
  <div class="section-title">ASSET</div>
  <table>
    <tr><td class="label">Machine</td><td>${e.machine_name}</td></tr>
    <tr><td class="label">Serial No</td><td>${e.serial_number}</td></tr>
    <tr><td class="label">Line</td><td>${e.line_code}</td></tr>
    <tr><td class="label">Section</td><td>${e.section || "-"}</td></tr>
    <tr><td class="label">Unit</td><td>${e.unit || "-"}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">EXECUTION DETAILS</div>
  <table>
    <tr><td class="label">Task</td><td>${e.task}</td></tr>
    <tr><td class="label">Type</td><td>${e.type || "-"}</td></tr>
    <tr><td class="label">Executed By</td><td>${e.executed_by || "-"}</td></tr>
    <tr><td class="label">Execution Date</td><td>${new Date(e.executed_at).toLocaleString()}</td></tr>
    <tr><td class="label">Notes</td><td>${e.notes || "-"}</td></tr>
  </table>
</div>

<div class="footer">
  <div class="signature">Technician Signature: __________________________</div>
  <div class="signature">Supervisor Signature: __________________________</div>
</div>

<script>
  window.onload = () => window.print();
</script>

</body>
</html>
`;
}
/* =====================================================
    KPIs - MTTR (Mean Time To Repair) per Asset
===================================================== */

app.get("/kpis/mttr", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id AS asset_id,
        a.serial_number,
        a.model,
        l.code AS line,
        ROUND(AVG(e.duration_minutes)) AS mttr_minutes,
        COUNT(*) AS breakdown_count
      FROM task_executions e
      JOIN maintenance_tasks t ON t.id = e.task_id
      JOIN assets a ON a.id = e.asset_id
      JOIN lines l ON l.id = a.line_id
      WHERE t.is_planned = false
        AND e.duration_minutes IS NOT NULL
      GROUP BY a.id, a.serial_number, a.model, l.code
      ORDER BY mttr_minutes DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /kpis/mttr ERROR:", err.message);
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
