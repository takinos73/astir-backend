import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL database successfully!"))
  .catch(err => console.error("Database connection failed:", err));

export default pool;
