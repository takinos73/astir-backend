import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Root test
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
        m.sn,
        mt.section,
        mt.unit,
        mt.task,
        mt.type,
        mt.qty,
        mt.duration_min,
        mt.frequency_hours,
        mt.due_date,
        mt.status,
        mt.created_at
      FROM maintenance_tasks mt
      LEFT JOIN machines m ON mt.machine_id = m.id
      ORDER BY mt.id ASC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /tasks error:", err);
    res.status(500).send(err.message);
  }
});

/****************************************
 * GET A SPECIFIC TASK
 ****************************************/
app.get("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM maintenance_tasks WHERE id = $1",
      [req.params.id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/****************************************
 * UPDATE STATUS
 ****************************************/
app.patch("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_tasks
       SET status = 'Done'
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/****************************************
 * DELETE TASK
 ****************************************/
app.delete("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM maintenance_tasks WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Task not found" });

    res.json({ message: "Task deleted" });
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
      SELECT id, name, sn
      FROM machines
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/****************************************
 * MIGRATION
 ****************************************/
// --- RUN MIGRATION (fix maintenance table) ---
async function runMigration() {
  console.log("🔄 Running DB migration for maintenance_tasks...");

  try {
    // Create table if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_tasks (
        id SERIAL PRIMARY KEY
      );
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS machine_id INTEGER;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS section TEXT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS unit TEXT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS task TEXT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS type TEXT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS qty TEXT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS duration_min FLOAT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS frequency_hours FLOAT;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS due_date DATE;
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planned';
    `);

    await pool.query(`
      ALTER TABLE maintenance_tasks
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    console.log("✅ maintenance_tasks migration OK!");
  } catch (err) {
    console.error("❌ Migration failed!");
    console.error(err);
    process.exit(1);
  }
}

await runMigration();


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
