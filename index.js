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

// --- RUN MIGRATION (create / fix tasks table) ---
async function runMigration() {
  console.log("🔄 Running DB migration...");

  try {
    // Αν δεν υπάρχει πίνακας tasks, τον δημιουργεί
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY
      );
    `);

    // Αν λείπουν οι στήλες, τις προσθέτει
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
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    console.log("✅ Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed!");
    console.error(err);
    process.exit(1); // σταματάει το deploy αν κάτι πάει στραβά
  }
}

await runMigration();


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
