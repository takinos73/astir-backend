import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

// GET all tasks
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tasks ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET task by ID
app.get("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tasks WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// CREATE a task
app.post("/tasks", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    const result = await pool.query(
      "INSERT INTO tasks (title, description) VALUES ($1, $2) RETURNING *",
      [title, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// UPDATE task status (mark as done)
app.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE tasks SET status = 'Done' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DELETE task
app.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM tasks WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted" });

  } catch (err) {
    res.status(500).send(err.message);
  }
});


// UPDATE a task
app.put("/tasks/:id", async (req, res) => {
  try {
    const { title, description, status } = req.body;

    const result = await pool.query(
      `UPDATE tasks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING *`,
      [title, description, status, req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DELETE a task
app.delete("/tasks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Task not found" });

    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- RUN MIGRATION (create / fix tasks table) ---
async function runMigration() {
  console.log("🔄 Running DB migration...");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY
      );
    `);

    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS title TEXT;
    `);

    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
    `);

    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    console.log("✅ Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed!");
    console.error(err);
    process.exit(1);
  }
}

await runMigration();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

