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

const WORKING_HOURS_PER_WEEK = 120;

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
// =====================
// AUTH: LOGIN
// =====================
app.post("/auth/login", async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    const result = await pool.query(
      `SELECT admin_password, planner_password, technician_password
       FROM roles_config
       ORDER BY id DESC
       LIMIT 1`
    );

    if (!result.rows.length) {
      return res.status(500).json({ error: "Roles not configured" });
    }

    const cfg = result.rows[0];

    let role = null;

    if (password === cfg.admin_password) role = "admin";
    else if (password === cfg.planner_password) role = "planner";
    else if (password === cfg.technician_password) role = "technician";

    if (!role) {
      return res.status(401).json({ error: "Invalid access code" });
    }

    res.json({ role });

  } catch (err) {
    console.error("AUTH LOGIN ERROR:", err.message);
    res.status(500).json({ error: "Auth error" });
  }
});
// =====================
// MIDDLEWARE: REQUIRE ADMIN
// =====================

function requireAdmin(req, res, next) {
  const role = req.headers["x-cmms-role"];

  if (role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  next();
}

// =====================
// AUTH: UPDATE CREDENTIALS (ADMIN)
// =====================
app.post("/auth/update-credentials", requireAdmin, async (req, res) => {
  try {
    const { admin, planner, technician } = req.body || {};

    if (!admin || !planner || !technician) {
      return res.status(400).json({ error: "All passwords required" });
    }

    await pool.query(
      `
      UPDATE roles_config
      SET admin_password = $1,
          planner_password = $2,
          technician_password = $3,
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM roles_config ORDER BY id DESC LIMIT 1
      )
      `,
      [admin, planner, technician]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("UPDATE CREDENTIALS ERROR:", err.message);
    res.status(500).json({ error: "Update failed" });
  }
});
/* =====================
   GET TECHNICIANS
===================== */
app.get("/technicians", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        role,
        phone,
        email,
        active,
        is_user
      FROM technicians
      WHERE active = true
      ORDER BY name ASC
      `
    );

    res.json(result.rows);

  } catch (err) {
    console.error("GET TECHNICIANS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   CREATE TECHNICIAN
===================== */
app.post("/technicians", async (req, res) => {
  const {
    name,
    role,
    phone,
    email,
    is_user
  } = req.body;

  if (!name) {
    return res.status(400).json({
      error: "Name is required"
    });
  }

  const cleanName = name.trim();

  try {
    /* =====================
       CHECK EXISTING TECHNICIAN
    ====================== */
    const existing = await pool.query(
      `
      SELECT
        id,
        active
      FROM technicians
      WHERE LOWER(name) = LOWER($1)
      `,
      [cleanName]
    );

    if (existing.rowCount > 0) {
      const tech = existing.rows[0];

      if (!tech.active) {
        const reactivate = await pool.query(
          `
          UPDATE technicians
          SET
            active = true,
            role = $2,
            phone = $3,
            email = $4,
            is_user = $5
          WHERE id = $1
          RETURNING
            id,
            name,
            role,
            phone,
            email,
            active,
            is_user
          `,
          [
            tech.id,
            role || "Technician",
            phone || null,
            email || null,
            is_user === true
          ]
        );

        return res.json(reactivate.rows[0]);
      }

      return res.status(409).json({
        error: "Technician already exists"
      });
    }

    /* =====================
       INSERT NEW TECHNICIAN
    ====================== */
    const result = await pool.query(
      `
      INSERT INTO technicians
        (
          name,
          role,
          phone,
          email,
          active,
          is_user
        )
      VALUES
        (
          $1,
          $2,
          $3,
          $4,
          true,
          $5
        )
      RETURNING
        id,
        name,
        role,
        phone,
        email,
        active,
        is_user
      `,
      [
        cleanName,
        role || "Technician",
        phone || null,
        email || null,
        is_user === true
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("POST /technicians ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   UPDATE TECHNICIAN
===================== */
app.patch(
  "/technicians/:id",
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    const {
      name,
      role,
      phone,
      email,
      active,
      is_user
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Name is required"
      });
    }

    try {
      const result = await pool.query(
        `
        UPDATE technicians
        SET
          name = $1,
          role = $2,
          phone = $3,
          email = $4,
          active = $5,
          is_user = $6
        WHERE id = $7
        RETURNING
          id,
          name,
          role,
          phone,
          email,
          active,
          is_user
        `,
        [
          name.trim(),
          role || "Technician",
          phone || null,
          email || null,
          active !== false,
          is_user === true,
          id
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Technician not found"
        });
      }

      res.json(result.rows[0]);

    } catch (err) {
      console.error(
        "PATCH /technicians/:id ERROR:",
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);

/* =====================
   SOFT DELETE TECHNICIAN
===================== */
app.delete(
  "/technicians/:id",
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `
        UPDATE technicians
        SET
          active = false,
          is_user = false
        WHERE id = $1
        RETURNING id
        `,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Technician not found"
        });
      }

      res.json({ success: true });

    } catch (err) {
      console.error(
        "DELETE /technicians ERROR:",
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);

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

/* =========================================================
   BREAKDOWNS API
   New Breakdown Management System
   ---------------------------------------------------------
   IMPORTANT:
   - This module runs in parallel with the legacy breakdown flow.
   - Existing /tasks and /executions routes remain unchanged.
   - A Breakdown represents a failure INCIDENT.
   - Restoration work will later be linked through:
         maintenance_tasks.breakdown_id
   ========================================================= */


/* =========================================================
   CREATE BREAKDOWN
   POST /breakdowns

   Creates a new breakdown incident.

   This does NOT create:
   - maintenance task
   - task execution
   - restoration task

   Those will be handled separately.
========================================================= */

app.post("/breakdowns", async (req, res) => {

  try {

    const {
      asset_id,
      title,
      description,
      started_at,
      reported_by,
      reported_by_id
    } = req.body;


    /* =====================
       VALIDATION
    ===================== */

    if (!asset_id) {
      return res.status(400).json({
        error: "Asset is required"
      });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        error: "Breakdown title is required"
      });
    }


    /* =====================
       VERIFY ASSET
    ===================== */

    const assetResult = await pool.query(
      `
      SELECT id
      FROM assets
      WHERE id = $1
      LIMIT 1
      `,
      [asset_id]
    );

    if (assetResult.rows.length === 0) {
      return res.status(404).json({
        error: "Asset not found"
      });
    }


    /* =====================
       CREATE BREAKDOWN
    ===================== */

    const result = await pool.query(
      `
      INSERT INTO breakdowns (
        asset_id,
        title,
        description,
        status,
        started_at,
        reported_by,
        reported_by_id,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'OPEN',
        COALESCE($4::timestamptz, NOW()),
        $5,
        $6,
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        asset_id,
        String(title).trim(),
        description?.trim() || null,
        started_at || null,
        reported_by?.trim() || null,
        reported_by_id || null
      ]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.status(201).json({
      message: "Breakdown created successfully",
      breakdown: result.rows[0]
    });

  } catch (err) {

    console.error(
      "POST /breakdowns error:",
      err
    );

    return res.status(500).json({
      error: "Failed to create breakdown"
    });

  }

});

/* =========================================================
   GET BREAKDOWNS
   GET /breakdowns

   Returns the list of breakdown incidents together with
   basic Asset information.

   Notes:
   - Legacy breakdown tasks are NOT included here.
   - This endpoint reads only from the new breakdowns table.
   - Existing /tasks and /executions remain unchanged.
========================================================= */

app.get("/breakdowns", async (req, res) => {

  try {

    const result = await pool.query(
      `
      SELECT
        b.id,
        b.asset_id,
        b.title,
        b.description,
        b.status,
        b.started_at,
        b.closed_at,
        b.reported_by,
        b.reported_by_id,
        b.failure_cause,
        b.root_cause,
        b.corrective_action,
        b.created_at,
        b.updated_at,

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name

      FROM breakdowns b

      JOIN assets a
        ON a.id = b.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      ORDER BY
        CASE b.status
          WHEN 'OPEN' THEN 1
          WHEN 'IN_PROGRESS' THEN 2
          WHEN 'CLOSED' THEN 3
          ELSE 4
        END,
        b.started_at DESC
      `
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.json(result.rows);

  } catch (err) {

    console.error(
      "GET /breakdowns error:",
      err
    );

    return res.status(500).json({
      error: "Failed to load breakdowns"
    });

  }

});

/* =========================================================
   GET BREAKDOWN BY ID
   GET /breakdowns/:id

   Returns one breakdown incident together with
   Asset and Line information.

   This endpoint will be used by the future
   Breakdown Detail View.
========================================================= */

app.get("/breakdowns/:id", async (req, res) => {

  try {

    const breakdownId = Number(req.params.id);

    /* =====================
       VALIDATION
    ===================== */

    if (!Number.isInteger(breakdownId) || breakdownId <= 0) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }


    /* =====================
       LOAD BREAKDOWN
    ===================== */

    const result = await pool.query(
      `
      SELECT
        b.id,
        b.asset_id,
        b.title,
        b.description,
        b.status,
        b.started_at,
        b.closed_at,
        b.reported_by,
        b.reported_by_id,
        b.failure_cause,
        b.root_cause,
        b.corrective_action,
        b.created_at,
        b.updated_at,

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name

      FROM breakdowns b

      JOIN assets a
        ON a.id = b.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      WHERE b.id = $1
      LIMIT 1
      `,
      [breakdownId]
    );


    /* =====================
       NOT FOUND
    ===================== */

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Breakdown not found"
      });
    }


    /* =====================
       RESPONSE
    ===================== */

    return res.json(result.rows[0]);

  } catch (err) {

    console.error(
      "GET /breakdowns/:id error:",
      err
    );

    return res.status(500).json({
      error: "Failed to load breakdown"
    });

  }

});

/* =========================================================
   UPDATE BREAKDOWN
   PATCH /breakdowns/:id

   Updates the editable information of an existing
   breakdown incident.

   IMPORTANT:
   - Does NOT close the breakdown.
   - Does NOT change breakdown status.
   - Does NOT create or modify maintenance tasks.
   - Does NOT create task executions.

   Breakdown lifecycle actions are handled separately.
========================================================= */

app.patch("/breakdowns/:id", async (req, res) => {

  try {

    const breakdownId = Number(req.params.id);

    const {
      title,
      description,
      started_at,
      reported_by,
      reported_by_id
    } = req.body;


    /* =====================
       VALIDATE ID
    ===================== */

    if (!Number.isInteger(breakdownId) || breakdownId <= 0) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }


    /* =====================
       LOAD EXISTING BREAKDOWN
    ===================== */

    const existingResult = await pool.query(
      `
      SELECT *
      FROM breakdowns
      WHERE id = $1
      LIMIT 1
      `,
      [breakdownId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: "Breakdown not found"
      });
    }

    const existing = existingResult.rows[0];


    /* =====================
       VALIDATE TITLE
    ===================== */

    if (
      title !== undefined &&
      !String(title).trim()
    ) {
      return res.status(400).json({
        error: "Breakdown title cannot be empty"
      });
    }


    /* =====================
       UPDATE BREAKDOWN

       Only explicitly editable fields are updated.
       Missing fields keep their existing values.
    ===================== */

    const result = await pool.query(
      `
      UPDATE breakdowns

      SET
        title = $1,
        description = $2,
        started_at = $3,
        reported_by = $4,
        reported_by_id = $5,
        updated_at = NOW()

      WHERE id = $6

      RETURNING *
      `,
      [
        title !== undefined
          ? String(title).trim()
          : existing.title,

        description !== undefined
          ? String(description || "").trim() || null
          : existing.description,

        started_at !== undefined
          ? started_at
          : existing.started_at,

        reported_by !== undefined
          ? String(reported_by || "").trim() || null
          : existing.reported_by,

        reported_by_id !== undefined
          ? reported_by_id || null
          : existing.reported_by_id,

        breakdownId
      ]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.json({
      message: "Breakdown updated successfully",
      breakdown: result.rows[0]
    });

  } catch (err) {

    console.error(
      "PATCH /breakdowns/:id error:",
      err
    );

    return res.status(500).json({
      error: "Failed to update breakdown"
    });

  }

});

/* =========================================================
   START BREAKDOWN
   PATCH /breakdowns/:id/start

   Moves a breakdown from:
       OPEN -> IN_PROGRESS

   IMPORTANT:
   - Does NOT change started_at
   - Does NOT create maintenance tasks
   - Does NOT create task executions
   - CLOSED breakdowns cannot be started again
========================================================= */

app.patch("/breakdowns/:id/start", async (req, res) => {

  try {

    const breakdownId = Number(req.params.id);


    /* =====================
       VALIDATE ID
    ===================== */

    if (!Number.isInteger(breakdownId) || breakdownId <= 0) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }


    /* =====================
       LOAD BREAKDOWN
    ===================== */

    const existingResult = await pool.query(
      `
      SELECT
        id,
        status
      FROM breakdowns
      WHERE id = $1
      LIMIT 1
      `,
      [breakdownId]
    );


    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: "Breakdown not found"
      });
    }


    const breakdown = existingResult.rows[0];


    /* =====================
       LIFECYCLE VALIDATION
    ===================== */

    if (breakdown.status === "CLOSED") {
      return res.status(400).json({
        error: "Closed breakdown cannot be started"
      });
    }


    if (breakdown.status === "IN_PROGRESS") {
      return res.status(400).json({
        error: "Breakdown is already in progress"
      });
    }


    if (breakdown.status !== "OPEN") {
      return res.status(400).json({
        error: "Breakdown cannot be started from its current status"
      });
    }


    /* =====================
       START BREAKDOWN
    ===================== */

    const result = await pool.query(
      `
      UPDATE breakdowns

      SET
        status = 'IN_PROGRESS',
        updated_at = NOW()

      WHERE id = $1

      RETURNING *
      `,
      [breakdownId]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.json({
      message: "Breakdown started successfully",
      breakdown: result.rows[0]
    });

  } catch (err) {

    console.error(
      "PATCH /breakdowns/:id/start error:",
      err
    );

    return res.status(500).json({
      error: "Failed to start breakdown"
    });

  }

});

/* =========================================================
   CHANGE MACHINE STATE
   PATCH /breakdowns/:id/machine-state

   Changes the operational state of the machine
   during an active Breakdown.

   Valid states:
   - DOWN
   - TRIAL
   - DEGRADED
   - RUNNING

   IMPORTANT:
   - Breakdown lifecycle remains independent.
   - Does NOT change OPEN / IN_PROGRESS / CLOSED.
   - Does NOT create maintenance tasks.
   - Does NOT create task executions.
   - CLOSED Breakdowns cannot change Machine State.
   - Only one Machine State may be active at a time.
========================================================= */

app.patch("/breakdowns/:id/machine-state", async (req, res) => {

    const client =
      await pool.connect();

    try {

      const breakdownId =
        Number(req.params.id);

      const {
        state,
        changed_by,
        changed_by_id
      } = req.body;


      /* =====================
         VALIDATE ID
      ===================== */

      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0
      ) {

        return res.status(400).json({
          error: "Invalid breakdown id"
        });

      }


      /* =====================
         VALIDATE STATE
      ===================== */

      const machineState =
        String(state || "")
          .trim()
          .toUpperCase();


      const validStates = [
        "DOWN",
        "TRIAL",
        "DEGRADED",
        "RUNNING"
      ];


      if (
        !validStates.includes(
          machineState
        )
      ) {

        return res.status(400).json({
          error: "Invalid Machine State"
        });

      }


      /* =====================
         TRANSACTION

         State transition must be atomic.

         Example:
         DOWN    10:00 -> 10:30
         TRIAL   10:30 -> NULL

         Both timestamps use the SAME
         database transaction timestamp.
      ===================== */

      await client.query("BEGIN");


      /* =====================
         LOCK BREAKDOWN

         Prevent simultaneous state
         changes for the same Breakdown.
      ===================== */

      const breakdownResult =
        await client.query(
          `
          SELECT
            id,
            status,
            started_at,
            closed_at

          FROM breakdowns

          WHERE id = $1

          FOR UPDATE
          `,
          [breakdownId]
        );


      if (
        breakdownResult.rows.length === 0
      ) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Breakdown not found"
        });

      }


      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         CLOSED GUARD
      ===================== */

      if (
        breakdown.status === "CLOSED"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Machine State cannot be changed on a closed Breakdown."
        });

      }


      /* =====================
         TRANSITION TIMESTAMP

         PostgreSQL transaction timestamp
         ensures old state ends exactly
         when new state starts.
      ===================== */

      const timestampResult =
        await client.query(
          `
          SELECT NOW() AS transition_at
          `
        );


      const transitionAt =
        timestampResult.rows[0]
          .transition_at;


      /* =====================
         LOAD CURRENT STATE
      ===================== */

      const currentResult =
        await client.query(
          `
          SELECT
            id,
            state,
            started_at

          FROM breakdown_state_history

          WHERE
            breakdown_id = $1
            AND ended_at IS NULL

          LIMIT 1

          FOR UPDATE
          `,
          [breakdownId]
        );


      const currentState =
        currentResult.rows[0] || null;


      /* =====================
         SAME STATE GUARD

         Avoid creating meaningless:

         DOWN -> DOWN
         RUNNING -> RUNNING
      ===================== */

      if (
        currentState &&
        currentState.state === machineState
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            `Machine is already in ${machineState} state.`
        });

      }


      /* =====================
         CLOSE CURRENT STATE
      ===================== */

      if (currentState) {

        await client.query(
          `
          UPDATE breakdown_state_history

          SET ended_at = $1

          WHERE id = $2
          `,
          [
            transitionAt,
            currentState.id
          ]
        );

      }


      /* =====================
         CREATE NEW STATE
      ===================== */

      const result =
        await client.query(
          `
          INSERT INTO breakdown_state_history (
            breakdown_id,
            state,
            started_at,
            ended_at,
            changed_by,
            changed_by_id,
            created_at
          )

          VALUES (
            $1,
            $2,
            $3,
            NULL,
            $4,
            $5,
            NOW()
          )

          RETURNING *
          `,
          [
            breakdownId,
            machineState,
            transitionAt,

            changed_by !== undefined
              ? String(
                  changed_by || ""
                ).trim() || null
              : null,

            changed_by_id || null
          ]
        );


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        message:
          `Machine State changed to ${machineState}`,

        machine_state:
          result.rows[0]

      });


    } catch (err) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {
        // Ignore rollback errors
      }


      console.error(
        "PATCH /breakdowns/:id/machine-state error:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to change Machine State"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   GET MACHINE STATE HISTORY
   GET /breakdowns/:id/machine-state

   Returns:
   - Current Machine State
   - Complete Machine State history
   - Duration of every state interval
   - Total duration per Machine State

   IMPORTANT:
   - Read only
   - Does NOT change Breakdown status
   - Does NOT change Machine State
   - Active state duration is calculated up to NOW()
========================================================= */

app.get("/breakdowns/:id/machine-state", async (req, res) => {

    try {

      const breakdownId =
        Number(req.params.id);


      /* =====================
         VALIDATE ID
      ===================== */

      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0
      ) {

        return res.status(400).json({
          error: "Invalid breakdown id"
        });

      }


      /* =====================
         VERIFY BREAKDOWN
      ===================== */

      const breakdownResult =
        await pool.query(
          `
          SELECT
            id,
            status,
            started_at,
            closed_at

          FROM breakdowns

          WHERE id = $1

          LIMIT 1
          `,
          [breakdownId]
        );


      if (
        breakdownResult.rows.length === 0
      ) {

        return res.status(404).json({
          error: "Breakdown not found"
        });

      }


      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         LOAD STATE HISTORY

         Active interval:
         ended_at = NULL

         For duration calculation:
         - active Breakdown -> NOW()
         - closed Breakdown -> closed_at
      ===================== */

      const historyResult =
        await pool.query(
          `
          SELECT
            id,
            breakdown_id,
            state,
            started_at,
            ended_at,
            changed_by,
            changed_by_id,
            created_at,

            EXTRACT(
              EPOCH FROM (
                COALESCE(
                  ended_at,
                  $2::timestamptz,
                  NOW()
                )
                - started_at
              )
            )::bigint AS duration_seconds

          FROM breakdown_state_history

          WHERE breakdown_id = $1

          ORDER BY
            started_at ASC,
            id ASC
          `,
          [
            breakdownId,
            breakdown.closed_at || null
          ]
        );


      const history =
        historyResult.rows;


      /* =====================
         CURRENT STATE
      ===================== */

      const currentState =
        history.find(
          item =>
            item.ended_at === null
        ) || null;


      /* =====================
         TOTALS

         Keep all four states in the
         response even when duration = 0.
      ===================== */

      const totals = {

        DOWN: 0,
        TRIAL: 0,
        DEGRADED: 0,
        RUNNING: 0

      };


      for (const item of history) {

        const seconds =
          Number(
            item.duration_seconds
          ) || 0;


        if (
          Object.prototype.hasOwnProperty.call(
            totals,
            item.state
          )
        ) {

          totals[item.state] +=
            seconds;

        }

      }


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        breakdown_id:
          breakdownId,

        breakdown_status:
          breakdown.status,

        current_state:
          currentState
            ? currentState.state
            : null,

        current_state_started_at:
          currentState
            ? currentState.started_at
            : null,

        totals_seconds:
          totals,

        history

      });


    } catch (err) {

      console.error(
        "GET /breakdowns/:id/machine-state error:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to load Machine State history"
      });

    }

  }
);

/* =========================================================
   CLOSE BREAKDOWN
   PATCH /breakdowns/:id/close

   Closes the Breakdown incident.

   MACHINE STATE INTEGRATION:
   - If an active Machine State exists, it is closed
     at exactly the same timestamp as breakdown.closed_at.
   - Breakdown + Machine State are updated in the
     same database transaction.
========================================================= */

app.patch("/breakdowns/:id/close", async (req, res) => {

  const client = await pool.connect();

  try {

    const breakdownId = Number(req.params.id);

    const {
      closed_at,
      failure_cause,
      root_cause,
      corrective_action
    } = req.body;


    /* =====================
       VALIDATE ID
    ===================== */

    if (!Number.isInteger(breakdownId) || breakdownId <= 0) {

      return res.status(400).json({
        error: "Invalid breakdown id"
      });

    }


    /* =====================
       START TRANSACTION
    ===================== */

    await client.query("BEGIN");


    /* =====================
       LOAD + LOCK BREAKDOWN
    ===================== */

    const existingResult = await client.query(
      `
      SELECT
        id,
        status,
        started_at,
        closed_at

      FROM breakdowns

      WHERE id = $1

      LIMIT 1

      FOR UPDATE
      `,
      [breakdownId]
    );


    if (existingResult.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Breakdown not found"
      });

    }


    const breakdown = existingResult.rows[0];


    /* =====================
       LIFECYCLE VALIDATION
    ===================== */

    if (breakdown.status === "CLOSED") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Breakdown is already closed"
      });

    }


    if (
      breakdown.status !== "OPEN" &&
      breakdown.status !== "IN_PROGRESS"
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Breakdown cannot be closed from its current status"
      });

    }


    /* =====================
       RESOLVE CLOSED DATE
    ===================== */

    const resolvedClosedAt =
      closed_at || new Date().toISOString();


    const startedAtDate =
      new Date(breakdown.started_at);

    const closedAtDate =
      new Date(resolvedClosedAt);


    if (Number.isNaN(closedAtDate.getTime())) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Invalid closed_at date"
      });

    }


    if (closedAtDate < startedAtDate) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Closed date cannot be earlier than breakdown start"
      });

    }


    /* =====================================================
       LOAD + LOCK ACTIVE MACHINE STATE

       There can be maximum one active Machine State
       because of uq_breakdown_active_machine_state.
    ===================================================== */

    const activeMachineStateResult =
      await client.query(
        `
        SELECT
          id,
          state,
          started_at

        FROM breakdown_state_history

        WHERE breakdown_id = $1
          AND ended_at IS NULL

        LIMIT 1

        FOR UPDATE
        `,
        [breakdownId]
      );


    const activeMachineState =
      activeMachineStateResult.rows[0] || null;


    /* =====================================================
       VALIDATE MACHINE STATE DATE

       Example we must reject:

       Machine State started : 20:10
       Breakdown Restored At : 20:05

       A Machine State cannot end before it started.
    ===================================================== */

    if (activeMachineState) {

      const machineStateStartedAt =
        new Date(activeMachineState.started_at);


      if (closedAtDate < machineStateStartedAt) {

        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Restored At cannot be earlier than the current Machine State start time."
        });

      }

    }


    /* =====================================================
       CLOSE ACTIVE MACHINE STATE

       IMPORTANT:
       Machine State ended_at receives EXACTLY the same
       timestamp as breakdown.closed_at.

       If no Machine State exists, nothing happens.
    ===================================================== */

    if (activeMachineState) {

      await client.query(
        `
        UPDATE breakdown_state_history

        SET ended_at = $1

        WHERE id = $2
        `,
        [
          resolvedClosedAt,
          activeMachineState.id
        ]
      );

    }


    /* =====================
       CLOSE BREAKDOWN
    ===================== */

    const result = await client.query(
      `
      UPDATE breakdowns

      SET
        status = 'CLOSED',
        closed_at = $1,
        failure_cause = $2,
        root_cause = $3,
        corrective_action = $4,
        updated_at = NOW()

      WHERE id = $5

      RETURNING *
      `,
      [
        resolvedClosedAt,

        failure_cause !== undefined
          ? String(failure_cause || "").trim() || null
          : null,

        root_cause !== undefined
          ? String(root_cause || "").trim() || null
          : null,

        corrective_action !== undefined
          ? String(corrective_action || "").trim() || null
          : null,

        breakdownId
      ]
    );


    /* =====================
       COMMIT TRANSACTION
    ===================== */

    await client.query("COMMIT");


    /* =====================
       RESPONSE
    ===================== */

    return res.json({

      message:
        "Breakdown closed successfully",

      breakdown:
        result.rows[0],

      machine_state_closed:
        activeMachineState
          ? activeMachineState.state
          : null

    });


  } catch (err) {

    /* =====================
       ROLLBACK ON ERROR
    ===================== */

    try {
      await client.query("ROLLBACK");
    } catch (_) {}


    console.error(
      "PATCH /breakdowns/:id/close error:",
      err
    );


    return res.status(500).json({
      error: "Failed to close breakdown"
    });


  } finally {

    /* =====================
       RELEASE DB CLIENT
    ===================== */

    client.release();

  }

});

/* =========================================================
   CREATE RESTORATION TASK
   POST /breakdowns/:id/tasks

   Creates a maintenance task linked to a Breakdown.

   RESTORATION TASK SEMANTICS:
   - breakdown_id      = Breakdown ID
   - type              = 'Restoration'
   - is_planned        = true
   - status            = 'Planned'
   - frequency_hours   = 0
   - NO task_execution is created here

   IMPORTANT:
   - Uses the existing maintenance_tasks table
   - Does NOT modify the Breakdown status
   - Does NOT close the Breakdown
   - Does NOT use the legacy unplanned/breakdown flow
========================================================= */

app.post("/breakdowns/:id/tasks", async (req, res) => {

  try {

    const breakdownId = Number(req.params.id);

    const {
      task,
      section,
      unit,
      due_date,
      duration_min,
      notes,
      impact
    } = req.body;


    /* =====================
       VALIDATE BREAKDOWN ID
    ===================== */

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }


    /* =====================
       VALIDATE TASK
    ===================== */

    if (!task || !String(task).trim()) {
      return res.status(400).json({
        error: "Restoration task is required"
      });
    }


    /* =====================
       LOAD BREAKDOWN

       Asset ID is taken directly from the Breakdown.

       The frontend is NOT allowed to choose another
       asset for a Restoration Task.
    ===================== */

    const breakdownResult = await pool.query(
      `
      SELECT
        id,
        asset_id,
        status
      FROM breakdowns
      WHERE id = $1
      LIMIT 1
      `,
      [breakdownId]
    );


    if (breakdownResult.rows.length === 0) {
      return res.status(404).json({
        error: "Breakdown not found"
      });
    }


    const breakdown =
      breakdownResult.rows[0];


    /* =====================
       VALIDATE DURATION
    ===================== */

    let estimatedDuration = null;

    if (
      duration_min !== undefined &&
      duration_min !== null &&
      duration_min !== ""
    ) {

      estimatedDuration =
        Number(duration_min);

      if (
        !Number.isFinite(estimatedDuration) ||
        estimatedDuration < 0
      ) {
        return res.status(400).json({
          error: "Invalid estimated duration"
        });
      }

    }


    /* =====================
       CREATE RESTORATION TASK

       IMPORTANT:

       is_planned = true
       -----------------
       This allows the task to use the normal existing
       task completion -> task_executions flow.

       frequency_hours = 0
       -------------------
       Restoration Tasks are NOT preventive tasks.

       breakdown_id
       ------------
       This is the relationship between the work item
       and the Breakdown incident.
    ===================== */

    const result = await pool.query(
      `
      INSERT INTO maintenance_tasks (
        asset_id,
        task,
        section,
        unit,
        type,
        impact,
        status,
        due_date,
        frequency_hours,
        duration_min,
        notes,
        is_planned,
        breakdown_id
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Restoration',
        $5,
        'Planned',
        $6,
        0,
        $7,
        $8,
        true,
        $9
      )

      RETURNING *
      `,
      [
        breakdown.asset_id,
        String(task).trim(),

        section !== undefined
          ? String(section || "").trim() || null
          : null,

        unit !== undefined
          ? String(unit || "").trim() || null
          : null,

        impact !== undefined
          ? String(impact || "").trim() || "normal"
          : "normal",

        due_date || null,

        estimatedDuration,

        notes !== undefined
          ? String(notes || "").trim() || null
          : null,

        breakdownId
      ]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.status(201).json({
      message: "Restoration task created successfully",
      task: result.rows[0]
    });


  } catch (err) {

    console.error(
      "POST /breakdowns/:id/tasks error:",
      err
    );

    return res.status(500).json({
      error: "Failed to create restoration task"
    });

  }

});

/* =========================================================
   GET RESTORATION TASKS
   GET /breakdowns/:id/tasks

   Returns all Restoration Tasks linked to one Breakdown.

   IMPORTANT:
   - Reads from maintenance_tasks
   - Uses breakdown_id as the relationship
   - Does NOT read legacy breakdown tasks
   - Does NOT create executions
   - Does NOT change Breakdown status
========================================================= */

app.get("/breakdowns/:id/tasks", async (req, res) => {

  try {

    const breakdownId = Number(req.params.id);


    /* =====================
       VALIDATE BREAKDOWN ID
    ===================== */

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }


    /* =====================
       VERIFY BREAKDOWN EXISTS
    ===================== */

    const breakdownResult = await pool.query(
      `
      SELECT
        id,
        asset_id,
        status
      FROM breakdowns
      WHERE id = $1
      LIMIT 1
      `,
      [breakdownId]
    );


    if (breakdownResult.rows.length === 0) {
      return res.status(404).json({
        error: "Breakdown not found"
      });
    }


    /* =====================
       LOAD RESTORATION TASKS
    ===================== */

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.asset_id,
        t.task,
        t.section,
        t.unit,
        t.type,
        t.impact,
        t.status,
        t.due_date,
        t.frequency_hours,
        t.duration_min,
        t.notes,
        t.is_planned,
        t.breakdown_id,

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name

      FROM maintenance_tasks t

      JOIN assets a
        ON a.id = t.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      WHERE t.breakdown_id = $1

      ORDER BY
        CASE t.status
          WHEN 'Overdue' THEN 1
          WHEN 'Planned' THEN 2
          WHEN 'Done' THEN 3
          ELSE 4
        END,
        t.due_date ASC NULLS LAST,
        t.id ASC
      `,
      [breakdownId]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.json({
      breakdown_id: breakdownId,
      tasks: result.rows
    });

  } catch (err) {

    console.error(
      "GET /breakdowns/:id/tasks error:",
      err
    );

    return res.status(500).json({
      error: "Failed to load restoration tasks"
    });

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
        mt.asset_id,
        mt.task,
        mt.status,
        mt.due_date,
        mt.completed_at,
        mt.completed_by,
        mt.section,
        mt.unit,
        mt.type,
        mt.frequency_hours,
        mt.duration_min,
        mt.is_planned,
        mt.notes,
        mt.impact,

        a.model AS machine_name,
        a.serial_number,
        a.idle_since AS asset_idle_since,
        l.code AS line_code

      FROM maintenance_tasks mt
      JOIN assets a ON a.id = mt.asset_id
      JOIN lines l ON l.id = a.line_id

      WHERE mt.status IN ('Planned', 'Overdue')
        AND mt.deleted_at IS NULL
        AND a.active = true

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
    impact,
    due_date,
    notes,
    is_planned,
    status,// executed_by,
    technician_id,          // 🔥 NEW

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
        impact,
        due_date,
        status,
        is_planned,
        duration_min,
        notes
      )
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      asset_id,                                      // $1
      section || null,                              // $2
      unit || null,                                 // $3
      task,                                         // $4
      type || null,                                 // $5
      impact || "normal",                           // $6
      due_date ? new Date(due_date) : null,         // $7
      status || "Planned",                          // $8
      is_planned === true,                          // $9

      // 🔑 ΜΟΝΟ PLANNED → estimated duration
      is_planned === true && Number.isFinite(Number(duration_min))
        ? Number(duration_min)
        : null,                                     // $10

      notes || null                                 // $11
    ]
  );

    const newTask = taskRes.rows[0];

    /* =====================
   2️⃣ BREAKDOWN → HISTORY
   (ACTUAL SERVICE TIME + EXECUTION DATE)
    ===================== */

  if (is_planned === false) {

      // 🔎 Fetch technician name safely
      let technicianName = null;

      if (technician_id) {
        const techRes = await client.query(
          `SELECT name FROM technicians WHERE id = $1 AND active = true`,
          [technician_id]
        );

        if (techRes.rows.length) {
          technicianName = techRes.rows[0].name;
        }
      }

      await client.query(
        `
        INSERT INTO task_executions
          (
            task_id,
            asset_id,
            technician_id,
            executed_by,
            executed_at,
            duration_minutes,
            notes
          )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          newTask.id,
          asset_id,
          technician_id || null,
          technicianName,
          req.body.execution_date
            ? new Date(req.body.execution_date)
            : new Date(),
          Number.isFinite(Number(execution_duration_min))
            ? Number(execution_duration_min)
            : null,
          notes || null
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
   CREATE PREVENTIVE (MANUAL)
===================== */
app.post("/preventives", async (req, res) => {

  const client = await pool.connect();

  try {

    const {
      asset_id,
      section,
      unit,
      task,
      type,
      duration_min,
      frequency_hours,
      due_date,
      impact,
      notes
    } = req.body;


    // =====================
    // VALIDATION
    // =====================

    if (!asset_id) {
      return res.status(400).json({
        error: "asset_id is required"
      });
    }

    if (!task || !task.trim()) {
      return res.status(400).json({
        error: "task is required"
      });
    }

    if (
      !frequency_hours ||
      Number(frequency_hours) <= 0
    ) {
      return res.status(400).json({
        error: "frequency_hours must be > 0"
      });
    }

    if (!due_date) {
      return res.status(400).json({
        error: "due_date is required"
      });
    }


    // =====================
    // IMPACT
    // =====================

    const cleanImpact =
      String(impact || "normal")
        .toLowerCase();

    const validImpacts = [
      "normal",
      "safety",
      "quality",
      "safety_quality"
    ];

    if (!validImpacts.includes(cleanImpact)) {
      return res.status(400).json({
        error: "Invalid preventive impact"
      });
    }


    await client.query("BEGIN");


    const result = await client.query(
      `
      INSERT INTO maintenance_tasks (
        asset_id,
        section,
        unit,
        task,
        type,
        duration_min,
        frequency_hours,
        due_date,
        status,
        is_planned,
        impact,
        notes
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'Planned',
        true,
        $9,
        $10
      )

      ON CONFLICT ON CONSTRAINT unique_preventive_task
      DO NOTHING

      RETURNING *
      `,
      [
        asset_id,
        section || null,
        unit || null,
        task.trim(),
        type || null,
        duration_min || null,
        frequency_hours,
        due_date,
        cleanImpact,
        notes || null
      ]
    );


    await client.query("COMMIT");


    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Preventive already exists for this asset"
      });
    }


    res.json({
      message: "Preventive created successfully",
      preventive: result.rows[0]
    });


  } catch (err) {

    await client.query("ROLLBACK");

    console.error(
      "CREATE PREVENTIVE ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  } finally {

    client.release();

  }
});

/* =====================
   APPLY PREVENTIVE RULE
   - Creates or updates planned preventive tasks
   - Applies to all assets of the given model
===================== */

app.patch("/preventives/apply-rule", async (req, res) => {

  const {
    model,
    section,
    unit,
    task,
    frequency_hours,
    duration_min,
    type,
    impact,
    notes
  } = req.body;


  if (
    !model ||
    !section ||
    !task ||
    !frequency_hours
  ) {
    return res.status(400).json({
      error: "Missing required fields"
    });
  }


  // =====================
  // IMPACT
  // =====================

  const cleanImpact =
    String(impact || "normal")
      .toLowerCase();

  const validImpacts = [
    "normal",
    "safety",
    "quality",
    "safety_quality"
  ];

  if (!validImpacts.includes(cleanImpact)) {
    return res.status(400).json({
      error: "Invalid preventive impact"
    });
  }


  const client = await pool.connect();


  try {

    // Real transaction
    await client.query("BEGIN");


    // =====================
    // UPDATE EXISTING
    // =====================

    await client.query(
      `
      UPDATE maintenance_tasks t

      SET
        frequency_hours = $1::integer,
        duration_min = $2,
        type = $3,
        notes = $4,
        impact = $5,

        due_date =
          NOW() +
          ($1::integer * INTERVAL '1 hour')

      FROM assets a

      WHERE
        t.asset_id = a.id
        AND a.model = $6
        AND t.is_planned = true
        AND t.status = 'Planned'
        AND t.section = $7
        AND t.task = $8
      `,
      [
        frequency_hours, // $1
        duration_min,    // $2
        type,            // $3
        notes || null,   // $4
        cleanImpact,     // $5
        model,           // $6
        section,         // $7
        task             // $8
      ]
    );


    // =====================
    // INSERT MISSING
    // =====================

    await client.query(
      `
      INSERT INTO maintenance_tasks (
        asset_id,
        section,
        unit,
        task,
        type,
        frequency_hours,
        duration_min,
        due_date,
        status,
        is_planned,
        impact,
        notes
      )

      SELECT
        a.id,
        $2,
        $8,
        $3,
        $4,
        $1::integer,
        $5,
        NOW() + ($1::integer * INTERVAL '1 hour'),
        'Planned',
        true,
        $9,
        $6

      FROM assets a

      WHERE
        a.model = $7

        AND NOT EXISTS (
          SELECT 1
          FROM maintenance_tasks t

          WHERE
            t.asset_id = a.id
            AND t.is_planned = true
            AND t.status = 'Planned'
            AND t.section = $2
            AND t.task = $3
        )
      `,
      [
        frequency_hours, // $1
        section,         // $2
        task,            // $3
        type,            // $4
        duration_min,    // $5
        notes || null,   // $6
        model,           // $7
        unit,            // $8
        cleanImpact      // $9
      ]
    );


    await client.query("COMMIT");


    res.json({
      message: "Preventive rule applied successfully"
    });


  } catch (err) {

    await client.query("ROLLBACK");

    console.error(
      "APPLY PREVENTIVE ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  } finally {

    client.release();

  }
});

/* =====================
   PREVIEW DELETE PREVENTIVE RULE
   - Counts affected assets
   - READ ONLY
   - Admin only
===================== */
app.post("/preventives/delete-rule/preview", async (req, res) => {
  const role = req.headers["x-cmms-role"];
  if (role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  const { model, section, task, unit } = req.body || {};

  if (!model || !section || !task) {
    return res.status(400).json({
      error: "model, section and task are required"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT COUNT(DISTINCT t.asset_id)::int AS affected_assets
      FROM maintenance_tasks t
      JOIN assets a ON a.id = t.asset_id
      WHERE
        a.model = $1
        AND t.is_planned = true
        AND t.frequency_hours > 0
        AND t.status IN ('Planned', 'Overdue')
        AND t.deleted_at IS NULL
        AND t.section = $2
        AND t.task = $3
        AND ($4::text IS NULL OR t.unit = $4)
      `,
      [model, section, task, unit || null]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("PREVIEW DELETE RULE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   SOFT DELETE PREVENTIVE RULE
   - Disables preventive rule
   - Soft delete only
   - Admin only
===================== */
app.patch("/preventives/delete-rule",requireAdmin, async (req, res) => {
  const role = req.headers["x-cmms-role"];
  if (role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  const { model, section, task, unit } = req.body || {};

  if (!model || !section || !task) {
    return res.status(400).json({
      error: "model, section and task are required"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE maintenance_tasks t
      SET deleted_at = NOW()
      FROM assets a
      WHERE
        t.asset_id = a.id
        AND a.model = $1
        AND t.is_planned = true
        AND t.frequency_hours > 0
        AND t.status IN ('Planned', 'Overdue')
        AND t.deleted_at IS NULL
        AND t.section = $2
        AND t.task = $3
        AND ($4::text IS NULL OR t.unit = $4)
      `,
      [model, section, task, unit || null]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      affected_tasks: result.rowCount
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE RULE ERROR:", err.message);
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
  const { completed_by, completed_at, notes, technician_id } = req.body; // 🔵 notes added
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
          technician_id,
          prev_due_date,
          executed_at,
          duration_minutes,
          notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          task.id,
          task.asset_id,
          completed_by,
          technician_id || null,
          task.due_date,
          completedAt,
          Number.isFinite(Number(task.duration_min))
            ? Math.round(Number(task.duration_min))
            : null,
          notes || task.notes || null
        ]
      );    

    // 3️⃣ PREVENTIVE → ROTATE
    if (hasFrequency) {
    const freqHours = Number(task.frequency_hours);
    const calendarDays =
      Math.round(freqHours * 7 / WORKING_HOURS_PER_WEEK);

    const nextDue = new Date(completedAt);
    nextDue.setDate(nextDue.getDate() + calendarDays);

    await client.query(
      `
      UPDATE maintenance_tasks
      SET
        status = 'Planned',
        due_date = $2,
        completed_by = $3,
        completed_at = $4,
        notes = null,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        id,
        nextDue,
        completed_by || null,
        completedAt,
      ]
    );
  }
 else {
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
    const { taskIds, completed_by, completed_at, notes, technician_id } = req.body || {};

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
          technician_id,
          prev_due_date,
          executed_at,
          duration_minutes,
          notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          task.id,
          task.asset_id,
          completed_by,
          technician_id || null,
          task.due_date,
          completedAt,
          Number.isFinite(Number(task.duration_min))
            ? Math.round(Number(task.duration_min))
            : null,
          notes || task.notes || null
        ]
      );
      // 3️⃣b PREVENTIVE → ROTATE
      if (hasFrequency) {
        const freqHours = Number(task.frequency_hours);
        const calendarDays =
          Math.round(freqHours * 7 / WORKING_HOURS_PER_WEEK);

        const nextDue = new Date(completedAt);
        nextDue.setDate(nextDue.getDate() + calendarDays);

        await client.query(
          `
          UPDATE maintenance_tasks
          SET
            due_date = $2,
            completed_by = $3,
            completed_at = $4,
            notes = null,
            updated_at = NOW()
          WHERE id = $1
          `,
          [
            task.id,
            nextDue,
            completed_by,
            completedAt,
          ]
        );
    }
      else {
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

   LEGACY BEHAVIOR:
   - Unplanned: delete execution + task
   - Planned: restore previous due date

   RESTORATION TASK:
   - Restore task to Planned
   - Delete execution
   - due_date may legitimately be NULL
   - Breakdown itself is NOT modified
===================== */

app.post("/executions/:id/undo", async (req, res) => {

  const { id } = req.params;
  const client = await pool.connect();

  try {

    await client.query("BEGIN");


    /* =====================
       1. FETCH EXECUTION
          + TASK INFORMATION
    ===================== */

    const execRes = await client.query(
      `
      SELECT
        e.id,
        e.task_id,
        e.prev_due_date,

        t.is_planned,
        t.type,
        t.breakdown_id

      FROM task_executions e

      JOIN maintenance_tasks t
        ON t.id = e.task_id

      WHERE e.id = $1
      `,
      [id]
    );


    if (!execRes.rows.length) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Execution not found"
      });

    }


    const exec = execRes.rows[0];


    /* =====================
       DETECT RESTORATION TASK
    ===================== */

    const isRestorationTask =
      exec.type === "Restoration" &&
      exec.breakdown_id !== null;


    /* =====================
       CASE 1
       LEGACY UNPLANNED TASK

       Keep existing behavior
       completely unchanged.
    ===================== */

    if (exec.is_planned === false) {

      await client.query(
        `
        DELETE FROM task_executions
        WHERE id = $1
        `,
        [exec.id]
      );


      await client.query(
        `
        DELETE FROM maintenance_tasks
        WHERE id = $1
        `,
        [exec.task_id]
      );


      await client.query("COMMIT");

      return res.json({
        success: true,
        mode: "unplanned_deleted"
      });

    }


    /* =====================
       CASE 2
       NORMAL PLANNED TASK

       Existing planned tasks still
       require prev_due_date.

       Restoration Tasks are allowed
       to have NULL due_date.
    ===================== */

    if (
      !exec.prev_due_date &&
      !isRestorationTask
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Cannot undo planned task: missing prev_due_date"
      });

    }


    /* =====================
       3. RESTORE TASK

       For Restoration Tasks:
       prev_due_date may be NULL.

       Therefore due_date simply
       becomes NULL again.
    ===================== */

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
      [
        exec.task_id,
        exec.prev_due_date || null
      ]
    );


    /* =====================
       4. DELETE EXECUTION
          FROM HISTORY
    ===================== */

    await client.query(
      `
      DELETE FROM task_executions
      WHERE id = $1
      `,
      [exec.id]
    );


    await client.query("COMMIT");


    return res.json({

      success: true,

      mode: isRestorationTask
        ? "restoration_restored"
        : "planned_restored"

    });


  } catch (err) {

    await client.query("ROLLBACK");

    console.error(
      "UNDO execution ERROR:",
      err.message
    );

    return res.status(500).json({
      error: err.message
    });

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
        e.technician_id,
        e.notes as notes,
        e.updated_at,
        e.duration_minutes AS duration_min,
        e.prev_due_date,

        t.task,
        t.section,
        t.unit,
        t.type,
        t.impact,
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
   - Update execution technician (FK safe)
===================== */
app.patch("/executions/:id", async (req, res) => {
  const { id } = req.params;
  const { task, technician_id, notes } = req.body;

  if (!task || !technician_id) {
    return res.status(400).json({
      error: "task and technician_id are required"
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

    // 2️⃣ Get technician name safely from FK
    const techRes = await client.query(
      `SELECT name FROM technicians WHERE id = $1 AND active = true`,
      [technician_id]
    );

    if (techRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid technician" });
    }

    const technicianName = techRes.rows[0].name;

    // 3️⃣ Update task description only
      await client.query(
        `
        UPDATE maintenance_tasks
        SET
          task = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          task,
          taskId
        ]
      );

    // 4️⃣ Update execution (FK + synced name + notes)
      await client.query(
        `
        UPDATE task_executions
        SET
          technician_id = $1,
          executed_by = $2,
          notes = $3,
          updated_at = NOW()
        WHERE id = $4
        `,
        [
          technician_id,
          technicianName,
          notes || null,
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
    impact,
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
        impact = COALESCE($4, impact),
        section = COALESCE($5, section),
        unit = COALESCE($6, unit),
        due_date = COALESCE($7, due_date),
        notes = COALESCE($8, notes),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'Planned'
      RETURNING *
      `,
      [
        id,                                      // $1
        task || null,                            // $2
        type || null,                            // $3
        impact || "normal",                      // $4
        section || null,                         // $5
        unit || null,                            // $6
        due_date ? new Date(due_date) : null,    // $7
        notes || null                            // $8
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
        a.active,
        a.idle_since   -- ✅ ADD THIS
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

/* =====================
   DELETE ASSET
   - Hard delete (admin only)
   - Only if no tasks exist for this asset
===================== */

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
app.patch("/assets/:id/deactivate",requireAdmin, async (req, res) => {
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
app.patch("/assets/:id", requireAdmin, async (req, res) => {

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

/* IDLE ASSET */
app.post("/assets/:id/idle", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`
      UPDATE assets
      SET idle_since = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ success: true });

  } catch (err) {
    console.error("SET IDLE ERROR:", err.message);
    res.status(500).json({ error: "Idle failed" });
  }
});

/*RESUME ASSET FROM IDLE*/
app.post("/assets/:id/resume", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const assetRes = await client.query(
      `SELECT idle_since FROM assets WHERE id = $1`,
      [id]
    );

    const idleSince = assetRes.rows[0]?.idle_since;
    if (!idleSince) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Asset not idle" });
    }

    const idleMs = Date.now() - new Date(idleSince).getTime();

    // 🔁 SHIFT ONLY OPEN TASKS
    await client.query(`
      UPDATE maintenance_tasks
      SET due_date = due_date + ($1 || ' milliseconds')::interval
      WHERE asset_id = $2
        AND status != 'Done'
        AND due_date IS NOT NULL
    `, [idleMs, id]);

    // 🔄 Reactivate
    await client.query(`
      UPDATE assets
      SET idle_since = NULL
      WHERE id = $1
    `, [id]);

    await client.query("COMMIT");

    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("RESUME ERROR:", err.message);
    res.status(500).json({ error: "Resume failed" });
  } finally {
    client.release();
  }
});
/* =====================
   SET FILTERED ASSETS IDLE
===================== */
app.post("/assets/idle-all", async (req, res) => {
  try {

    const { asset_ids } = req.body;

    if (
      !Array.isArray(asset_ids) ||
      asset_ids.length === 0
    ) {
      return res.status(400).json({
        error: "No assets selected"
      });
    }

    const result = await pool.query(
      `
      UPDATE assets
      SET idle_since = NOW()
      WHERE id = ANY($1::int[])
        AND idle_since IS NULL
      RETURNING
        id,
        model,
        serial_number,
        idle_since
      `,
      [asset_ids]
    );

    res.json({
      success: true,
      updated: result.rowCount,
      assets: result.rows
    });

  } catch (err) {

    console.error(
      "SET FILTERED ASSETS IDLE ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  }
});

/* =====================
   RESUME FILTERED ASSETS
===================== */
app.post("/assets/resume-all", async (req, res) => {

  const client = await pool.connect();

  try {

    const { asset_ids } = req.body;

    if (
      !Array.isArray(asset_ids) ||
      asset_ids.length === 0
    ) {
      return res.status(400).json({
        error: "No assets selected"
      });
    }

    await client.query("BEGIN");

    // Get ONLY requested assets that are currently idle
    const assetsRes = await client.query(
      `
      SELECT id, idle_since
      FROM assets
      WHERE id = ANY($1::int[])
        AND idle_since IS NOT NULL
      `,
      [asset_ids]
    );

    const idleAssets = assetsRes.rows;

    // Resume each asset using its OWN idle duration
    for (const asset of idleAssets) {

      const idleMs =
        Date.now() -
        new Date(asset.idle_since).getTime();

      // Shift ONLY open tasks for this asset
      await client.query(
        `
        UPDATE maintenance_tasks
        SET due_date =
          due_date + ($1 || ' milliseconds')::interval
        WHERE asset_id = $2
          AND status != 'Done'
          AND due_date IS NOT NULL
        `,
        [idleMs, asset.id]
      );

      // Reactivate asset
      await client.query(
        `
        UPDATE assets
        SET idle_since = NULL
        WHERE id = $1
        `,
        [asset.id]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      updated: idleAssets.length
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error(
      "RESUME FILTERED ASSETS ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  } finally {

    client.release();

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

/* =====================
   RESTORE SNAPSHOT (TEST MODE = ROLLBACK)
   - FULL WIPE in transaction
   - Rebuild lines/assets/tasks/executions
   - ID-safe: always creates fresh task IDs
   - Maps old asset/task IDs -> new ones
===================== */
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
       - Map oldAssetId -> newAssetId (CRITICAL)
    ===================== */
    const assetIdMap = new Map(); // oldId -> newId

    for (const a of assets) {
      if (!a.line_code || !a.model || !a.serial_number) continue;

      const lineRes = await client.query(
        `SELECT id FROM lines WHERE code = $1`,
        [a.line_code]
      );
      if (!lineRes.rows.length) continue;

      const result = await client.query(
        `INSERT INTO assets (line_id, model, serial_number, description, active)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [
          lineRes.rows[0].id,
          a.model,
          a.serial_number,
          a.description || null,
          a.active !== false
        ]
      );

      // 👇 old snapshot asset id -> new inserted id
      assetIdMap.set(a.id, result.rows[0].id);
    }

    /* =====================
      4️⃣ RESTORE TASKS (ID SAFE MODE)
      - Always insert fresh
      - Map oldTaskId -> newTaskId
    ===================== */
    const taskIdMap = new Map(); // oldId -> newId

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

      const result = await client.query(
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
          COALESCE($15,NOW()),
          COALESCE($16,NOW()),
          $17
        )
        RETURNING id
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

      taskIdMap.set(t.id, result.rows[0].id);
    }

    /* =====================
       5️⃣ RESTORE EXECUTIONS (WITH MAPPED IDS)
       - task_id MUST be mapped
       - asset_id MUST be mapped (CRITICAL)
    ===================== */
    for (const e of executions) {
      const newTaskId = taskIdMap.get(e.task_id);
      if (!newTaskId) continue;

      const newAssetId = assetIdMap.get(e.asset_id);
      if (!newAssetId) continue;

      await client.query(
        `
        INSERT INTO task_executions (
          task_id,
          asset_id,
          executed_by,
          executed_at,
          duration_minutes,
          notes
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          newTaskId,
          newAssetId,
          e.executed_by || null,
          e.executed_at ? new Date(e.executed_at) : null,
          e.duration_minutes ?? null,
          e.notes || null
        ]
      );
    }

    /* =====================
       6️⃣ FIX ALL SEQUENCES (FINAL)
    ===================== */
    await client.query(`
      SELECT setval(
        'task_executions_id_seq',
        COALESCE((SELECT MAX(id) FROM task_executions), 1),
        true
      )
    `);

    await client.query(`
      SELECT setval(
        'maintenance_tasks_id_seq',
        COALESCE((SELECT MAX(id) FROM maintenance_tasks), 1),
        true
      )
    `);

    await client.query(`
      SELECT setval(
        'assets_id_seq',
        COALESCE((SELECT MAX(id) FROM assets), 1),
        true
      )
    `);

    await client.query(`
      SELECT setval(
        'lines_id_seq',
        COALESCE((SELECT MAX(id) FROM lines), 1),
        true
      )
    `);

    // ✅ TEST MODE
    await client.query("COMMIT");
    res.json({
      message: "Snapshot restore Normal Mode",
      stats: {
        lines_in: lines.length,
        assets_in: assets.length,
        tasks_in: tasks.length,
        executions_in: executions.length,
        assets_mapped: assetIdMap.size,
        tasks_mapped: taskIdMap.size
      }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("SNAPSHOT RESTORE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* =====================
   SNAPSHOT VERIFY (ADVANCED DIFF MODE)
   - Compares DB state with snapshot
   - Ignores ID differences
   - Returns detailed differences
===================== */
app.post("/snapshot/verify", async (req, res) => {
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

    /* =====================
       LOAD CURRENT DB STATE
    ===================== */

    const dbLines = (
      await pool.query(`SELECT code FROM lines ORDER BY code`)
    ).rows.map(r => r.code).sort();

    const dbAssets = (
      await pool.query(`
        SELECT l.code AS line, a.model, a.serial_number
        FROM assets a
        JOIN lines l ON l.id = a.line_id
        ORDER BY l.code, a.model, a.serial_number
      `)
    ).rows.map(r => `${r.line}|${r.model}|${r.serial_number}`).sort();

    const dbTasks = (
      await pool.query(`
        SELECT l.code AS line, a.model, a.serial_number, mt.task
        FROM maintenance_tasks mt
        JOIN assets a ON a.id = mt.asset_id
        JOIN lines l ON l.id = a.line_id
        ORDER BY l.code, a.model, a.serial_number, mt.task
      `)
    ).rows.map(r => `${r.line}|${r.model}|${r.serial_number}|${r.task}`).sort();

    const dbExec = (
      await pool.query(`
        SELECT executed_by, executed_at, duration_minutes
        FROM task_executions
        ORDER BY executed_at
      `)
    ).rows.map(r =>
      `${r.executed_by || ""}|${new Date(r.executed_at).toISOString()}|${r.duration_minutes || 0}`
    ).sort();

    /* =====================
       NORMALIZE SNAPSHOT DATA
    ===================== */

    const snapLines = lines
      .map(l => (l.code || l.line || "").toString().trim())
      .sort();

    const snapAssets = assets
      .map(a => `${a.line_code}|${a.model}|${a.serial_number}`)
      .sort();

    const snapTasks = tasks
      .map(t => `${t.line}|${t.machine_name}|${t.serial_number}|${t.task}`)
      .sort();

    const snapExec = executions
      .map(e =>
        `${e.executed_by || ""}|${new Date(e.executed_at).toISOString()}|${e.duration_minutes || 0}`
      )
      .sort();

    /* =====================
       DIFF HELPER
    ===================== */

    function diffArrays(dbArr, snapArr) {
      const dbSet = new Set(dbArr);
      const snapSet = new Set(snapArr);

      const missingInDb = snapArr.filter(x => !dbSet.has(x));
      const extraInDb = dbArr.filter(x => !snapSet.has(x));

      return { missingInDb, extraInDb };
    }

    const linesDiff = diffArrays(dbLines, snapLines);
    const assetsDiff = diffArrays(dbAssets, snapAssets);
    const tasksDiff = diffArrays(dbTasks, snapTasks);
    const execDiff = diffArrays(dbExec, snapExec);

    const identical =
      linesDiff.missingInDb.length === 0 &&
      linesDiff.extraInDb.length === 0 &&
      assetsDiff.missingInDb.length === 0 &&
      assetsDiff.extraInDb.length === 0 &&
      tasksDiff.missingInDb.length === 0 &&
      tasksDiff.extraInDb.length === 0 &&
      execDiff.missingInDb.length === 0 &&
      execDiff.extraInDb.length === 0;

    res.json({
      identical,
      dbCounts: {
        lines: dbLines.length,
        assets: dbAssets.length,
        tasks: dbTasks.length,
        executions: dbExec.length
      },
      snapshotCounts: {
        lines: snapLines.length,
        assets: snapAssets.length,
        tasks: snapTasks.length,
        executions: snapExec.length
      },
      differences: {
        lines: linesDiff,
        assets: assetsDiff,
        tasks: tasksDiff,
        executions: execDiff
      }
    });

  } catch (err) {
    console.error("SNAPSHOT VERIFY ERROR:", err.message);
    res.status(500).json({ error: err.message });
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
