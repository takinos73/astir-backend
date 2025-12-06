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
    console.error("❌ GET /tasks error:", err.message);
    res.status(500).send(err.message);
  }
});

// ADD new task
app.post("/tasks", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      "INSERT INTO tasks (title, description) VALUES ($1, $2) RETURNING *",
      [title, description || null]
    );
    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ POST /tasks error:", err.message);
    res.status(500).send(err.message);
  }
});


// --- RUN MIGRATION ---
const initSqlPath = path.resolve("./init.sql");

async function runMigration() {
  console.log("🔄 Checking for database init script...");

  if (!fs.existsSync(initSqlPath)) {
    console.log("⚠️ No init.sql found — skipping migration.");
    return;
  }

  try {
    console.log("🔄 Running DB migration from init.sql...");
    const initSql = fs.readFileSync(initSqlPath, "utf8");
    await pool.query(initSql);
    console.log("✅ Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed!");
    console.error(err);
    process.exit(1); // Stop deployment to show error clearly in Render
  }
}

await runMigration();
// -------------------------------------

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
