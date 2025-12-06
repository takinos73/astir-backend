import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Run DB migration on startup
async function runMigrations() {
  try {
    const migrationFile = path.join(__dirname, 'migrations', '001_init.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    await pool.query(sql);
    console.log("Database migration completed!");
  } catch (err) {
    console.error("Migration error:", err.message);
  }
}

runMigrations();

// TEST route
app.get('/', (req, res) => {
  res.send('ASTIR Backend API Running');
});

// GET tasks
app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tasks ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tasks:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
