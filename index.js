import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from './db.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// TEST route
app.get("/", (req, res) => {
  res.send("ASTIR Backend API Running");
});

// Get all tasks
app.get("/tasks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tasks ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
