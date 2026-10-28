// index.js — ASTIR CMMS Backend (Render) ✅
// Supports: Tasks, Assets, Breakdowns, Scheduled Maintenance,
// Production Reporting, Attachments, Documentation PDF, Frontend SPA

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import path from "path";
import multer from "multer";
import fs from "fs";
import { randomUUID } from "crypto";

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";

import {
  getSignedUrl
} from "@aws-sdk/s3-request-presigner";

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

/* =====================================================
   CLOUDFLARE R2 CLIENT
===================================================== */

const r2Client =
  new S3Client({
    region:
      process.env.R2_REGION || "auto",

    endpoint:
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId:
        process.env.R2_ACCESS_KEY_ID,

      secretAccessKey:
        process.env.R2_SECRET_ACCESS_KEY
    }
  });


/* =====================================================
   CMMS ATTACHMENTS — CONFIG
===================================================== */

const ATTACHMENT_MAX_FILES = 3;


const ATTACHMENT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;


const ATTACHMENT_ALLOWED_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ]);


const ATTACHMENT_ENTITY_CONFIG = {

  TASK: {
    table:
      "maintenance_tasks",

    folder:
      "tasks"
  },


  BREAKDOWN: {
    table:
      "breakdowns",

    folder:
      "breakdowns"
  },


  SCHEDULED_MAINTENANCE: {
    table:
      "scheduled_maintenance",

    folder:
      "scheduled-maintenance"
  },


  MAINTENANCE_REPORT: {
    table:
      "maintenance_reports",

    folder:
      "maintenance-reports"
  }

};


/* =====================================================
   CMMS ATTACHMENTS — MULTER
===================================================== */

const attachmentUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files:
        ATTACHMENT_MAX_FILES,

      /*
        Individual safety ceiling.

        The real rule is:
        MAX 10 MB TOTAL per entity.
      */
      fileSize:
        ATTACHMENT_MAX_TOTAL_BYTES
    },

    fileFilter: (
      req,
      file,
      cb
    ) => {

      if (
        !ATTACHMENT_ALLOWED_MIME_TYPES.has(
          file.mimetype
        )
      ) {

        return cb(
          new Error(
            "Only JPG, PNG, WEBP and PDF files are allowed"
          )
        );

      }


      cb(
        null,
        true
      );

    }
  });


/* =====================================================
   CMMS ATTACHMENTS — GENERIC HELPERS
===================================================== */


/* =====================
   NORMALIZE ENTITY TYPE
===================== */

function normalizeAttachmentEntityType(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .toUpperCase()
    .replace(
      /[\s-]+/g,
      "_"
    );

}


/* =====================
   GET ENTITY CONFIG

   Only entity types defined in
   ATTACHMENT_ENTITY_CONFIG are accepted.
===================== */

function getAttachmentEntityConfig(
  entityType
) {

  const normalizedType =
    normalizeAttachmentEntityType(
      entityType
    );


  const config =
    ATTACHMENT_ENTITY_CONFIG[
      normalizedType
    ];


  if (!config) {

    throw new Error(
      "Unsupported attachment entity type"
    );

  }


  return {
    entityType:
      normalizedType,

    ...config
  };

}


/* =====================
   VALIDATE ENTITY ID
===================== */

function normalizeAttachmentEntityId(
  value
) {

  const entityId =
    Number(value);


  if (
    !Number.isInteger(entityId) ||
    entityId <= 0
  ) {

    throw new Error(
      "Invalid attachment entity ID"
    );

  }


  return entityId;

}


/* =====================
   CHECK ENTITY EXISTS

   db can be:
   - pool
   - transaction client
===================== */

async function assertAttachmentEntityExists(
  db,
  entityType,
  entityId
) {

  const config =
    getAttachmentEntityConfig(
      entityType
    );


  const normalizedId =
    normalizeAttachmentEntityId(
      entityId
    );


  /*
    Table name is safe here because it
    comes ONLY from our internal config,
    never directly from user input.
  */

  const result =
    await db.query(
      `
      SELECT id

      FROM ${config.table}

      WHERE id = $1

      LIMIT 1
      `,
      [
        normalizedId
      ]
    );


  if (
    result.rows.length === 0
  ) {

    throw new Error(
      `${config.entityType} not found`
    );

  }


  return {
    entityType:
      config.entityType,

    entityId:
      normalizedId,

    table:
      config.table,

    folder:
      config.folder
  };

}


/* =====================
   LOAD CURRENT USAGE

   Returns:
   - file count
   - total bytes already stored
===================== */

async function getAttachmentUsage(
  db,
  entityType,
  entityId
) {

  const normalizedType =
    normalizeAttachmentEntityType(
      entityType
    );


  const normalizedId =
    normalizeAttachmentEntityId(
      entityId
    );


  const result =
    await db.query(
      `
      SELECT
        COUNT(*)::int
          AS file_count,

        COALESCE(
          SUM(file_size),
          0
        )::bigint
          AS total_bytes

      FROM attachments

      WHERE entity_type = $1
        AND entity_id = $2
      `,
      [
        normalizedType,
        normalizedId
      ]
    );


  return {
    fileCount:
      Number(
        result.rows[0]
          ?.file_count || 0
      ),

    totalBytes:
      Number(
        result.rows[0]
          ?.total_bytes || 0
      )
  };

}


/* =====================
   VALIDATE ATTACHMENT LIMITS

   Business rules:
   - Max 3 files per entity
   - Max 10 MB TOTAL per entity
===================== */

function validateAttachmentCapacity(
  existingUsage,
  files
) {

  const incomingFiles =
    Array.isArray(files)
      ? files
      : [];


  if (
    incomingFiles.length === 0
  ) {

    throw new Error(
      "No attachment files provided"
    );

  }


  const incomingBytes =
    incomingFiles.reduce(
      (
        total,
        file
      ) =>
        total +
        Number(
          file.size || 0
        ),
      0
    );


  const finalFileCount =
    Number(
      existingUsage.fileCount || 0
    ) +
    incomingFiles.length;


  const finalTotalBytes =
    Number(
      existingUsage.totalBytes || 0
    ) +
    incomingBytes;


  if (
    finalFileCount >
    ATTACHMENT_MAX_FILES
  ) {

    throw new Error(
      `Maximum ${ATTACHMENT_MAX_FILES} attachments allowed`
    );

  }


  if (
    finalTotalBytes >
    ATTACHMENT_MAX_TOTAL_BYTES
  ) {

    throw new Error(
      "Maximum total attachment size is 8 MB"
    );

  }


  return {
    incomingFiles:
      incomingFiles.length,

    incomingBytes,

    finalFileCount,

    finalTotalBytes
  };

}


/* =====================
   SAFE FILE EXTENSION

   Extension is used only for
   R2 object naming.
===================== */

function getAttachmentExtension(
  fileName
) {

  const extension =
    path
      .extname(
        String(
          fileName || ""
        )
      )
      .toLowerCase();


  const allowedExtensions =
    new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".pdf"
    ]);


  if (
    !allowedExtensions.has(
      extension
    )
  ) {

    return "";
  }


  return extension;

}


/* =====================
   BUILD R2 OBJECT KEY

   Examples:

   tasks/2014/<uuid>.jpg
   breakdowns/317/<uuid>.pdf
===================== */

function buildAttachmentFileKey(
  entityType,
  entityId,
  originalFileName
) {

  const config =
    getAttachmentEntityConfig(
      entityType
    );


  const normalizedId =
    normalizeAttachmentEntityId(
      entityId
    );


  const extension =
    getAttachmentExtension(
      originalFileName
    );


  const fileId =
    randomUUID();


  return (
    `${config.folder}/` +
    `${normalizedId}/` +
    `${fileId}${extension}`
  );

}

/* =====================
   CLEAN ORIGINAL FILE NAME

   Used for display only.
   The original name is NOT
   used as the R2 object key.
===================== */

function cleanAttachmentFileName(
  fileName
) {

  const baseName =
    path.basename(
      String(
        fileName ||
        "attachment"
      )
    );


  return baseName
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ""
    )
    .trim()
    .slice(
      0,
      255
    );

}
/* =====================================================
   CMMS ATTACHMENTS — GENERIC UPLOAD

   POST:
   /attachments/:entityType/:entityId

   Multipart field:
   files

   Optional:
   uploaded_by_id

   Rules:
   - Maximum 3 files per entity
   - Maximum 10 MB TOTAL per entity
   - JPG / JPEG / PNG / WEBP / PDF
===================================================== */

app.post( "/attachments/:entityType/:entityId",

  attachmentUpload.array(
    "files",
    ATTACHMENT_MAX_FILES
  ),

  async (req, res) => {

    const client =
      await pool.connect();


    /*
      R2 objects successfully uploaded
      during this request.

      If something fails later,
      these objects will be deleted.
    */
    const uploadedR2Keys =
      [];


    try {

      /* =====================
         NORMALIZE ENTITY
      ===================== */

      const entityType =
        normalizeAttachmentEntityType(
          req.params.entityType
        );


      const entityId =
        normalizeAttachmentEntityId(
          req.params.entityId
        );


      const files =
        Array.isArray(req.files)
          ? req.files
          : [];


      /* =====================
         FILES REQUIRED
      ===================== */

      if (
        files.length === 0
      ) {

        return res.status(400).json({
          error:
            "No attachment files provided"
        });

      }


      /* =====================
         START TRANSACTION
      ===================== */

      await client.query(
        "BEGIN"
      );


      /* =====================
         VERIFY PARENT ENTITY
      ===================== */

      const entity =
        await assertAttachmentEntityExists(
          client,
          entityType,
          entityId
        );


      /* =====================
         CURRENT ATTACHMENT USAGE
      ===================== */

      const currentUsage =
        await getAttachmentUsage(
          client,
          entity.entityType,
          entity.entityId
        );


      /* =====================
         VALIDATE LIMITS

         Existing files
         +
         incoming files
      ===================== */

      const capacity =
        validateAttachmentCapacity(
          currentUsage,
          files
        );


      /* =====================
         RESOLVE UPLOADER
      ===================== */

      let uploadedById =
        null;


      let uploadedBy =
        null;


      const requestedUploaderId =
        Number(
          req.body
            ?.uploaded_by_id
        );


      if (
        Number.isInteger(
          requestedUploaderId
        ) &&
        requestedUploaderId > 0
      ) {

        const technicianResult =
          await client.query(
            `
            SELECT
              id,
              name

            FROM technicians

            WHERE id = $1
              AND active = true

            LIMIT 1
            `,
            [
              requestedUploaderId
            ]
          );


        if (
          technicianResult.rows.length === 0
        ) {

          throw new Error(
            "Uploader not found or inactive"
          );

        }


        uploadedById =
          technicianResult.rows[0].id;


        uploadedBy =
          technicianResult.rows[0].name;

      }


      /* =====================
         UPLOAD FILES
      ===================== */

      const insertedAttachments =
        [];


      for (
        const file
        of files
      ) {

        /* =====================
           BUILD SAFE R2 KEY
        ===================== */

        const fileKey =
          buildAttachmentFileKey(
            entity.entityType,
            entity.entityId,
            file.originalname
          );


        const cleanFileName =
          cleanAttachmentFileName(
            file.originalname
          );


        /* =====================
           UPLOAD TO R2
        ===================== */

        await r2Client.send(
          new PutObjectCommand({
            Bucket:
              process.env.R2_BUCKET,

            Key:
              fileKey,

            Body:
              file.buffer,

            ContentType:
              file.mimetype
          })
        );


        /*
          Remember this immediately.

          If DB insert or another upload
          fails later, we remove it.
        */
        uploadedR2Keys.push(
          fileKey
        );


        /* =====================
           SAVE METADATA TO DB
        ===================== */

        const insertResult =
          await client.query(
            `
            INSERT INTO attachments
              (
                entity_type,
                entity_id,
                file_key,
                file_name,
                mime_type,
                file_size,
                uploaded_by_id,
                uploaded_by
              )

            VALUES
              (
                $1,$2,$3,$4,
                $5,$6,$7,$8
              )

            RETURNING
              id,
              entity_type,
              entity_id,
              file_key,
              file_name,
              mime_type,
              file_size,
              uploaded_by_id,
              uploaded_by,
              uploaded_at
            `,
            [
              entity.entityType,     // $1
              entity.entityId,       // $2
              fileKey,               // $3
              cleanFileName,         // $4
              file.mimetype,         // $5
              Number(file.size),     // $6
              uploadedById,          // $7
              uploadedBy             // $8
            ]
          );


        insertedAttachments.push(
          insertResult.rows[0]
        );

      }


      /* =====================
         COMMIT DB
      ===================== */

      await client.query(
        "COMMIT"
      );


      /* =====================
         SUCCESS
      ===================== */

      return res.status(201).json({

        message:
          "Attachments uploaded successfully",

        entity: {
          type:
            entity.entityType,

          id:
            entity.entityId
        },

        uploaded:
          insertedAttachments,

        usage: {
          fileCount:
            capacity.finalFileCount,

          totalBytes:
            capacity.finalTotalBytes,

          maxFiles:
            ATTACHMENT_MAX_FILES,

          maxTotalBytes:
            ATTACHMENT_MAX_TOTAL_BYTES
        }

      });


    } catch (err) {

      /* =====================
         ROLLBACK DB
      ===================== */

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (rollbackErr) {

        console.error(
          "ATTACHMENT DB ROLLBACK ERROR:",
          rollbackErr
        );

      }


      /* =====================
         CLEAN R2 ORPHANS

         Anything uploaded during this
         failed request is removed.
      ===================== */

      for (
        const fileKey
        of uploadedR2Keys
      ) {

        try {

          await r2Client.send(
            new DeleteObjectCommand({
              Bucket:
                process.env.R2_BUCKET,

              Key:
                fileKey
            })
          );

        } catch (deleteErr) {

          console.error(
            "ATTACHMENT R2 CLEANUP ERROR:",
            fileKey,
            deleteErr
          );

        }

      }


      console.error(
        "POST /attachments ERROR:",
        err
      );


      /* =====================
         FRIENDLY ERRORS
      ===================== */

      if (
        err instanceof
        multer.MulterError
      ) {

        return res.status(400).json({
          error:
            err.message
        });

      }


      const message =
        err.message ||
        "Attachment upload failed";


      const isValidationError =
        message.includes("Maximum") ||
        message.includes("not found") ||
        message.includes("Invalid") ||
        message.includes("Unsupported") ||
        message.includes("Only JPG") ||
        message.includes("No attachment");


      return res
        .status(
          isValidationError
            ? 400
            : 500
        )
        .json({
          error:
            message
        });


    } finally {

      client.release();

    }

  }
);

/* =====================================================
   CMMS ATTACHMENTS — SECURE OPEN

   GET:
   /attachments/:attachmentId/open

   Returns a temporary signed URL
   for the private R2 object.
===================================================== */

app.get( "/attachments/:attachmentId/open",
  async (req, res) => {

    try {

      /* =====================
         VALIDATE ATTACHMENT ID
      ===================== */

      const attachmentId =
        Number(
          req.params.attachmentId
        );


      if (
        !Number.isInteger(
          attachmentId
        ) ||
        attachmentId <= 0
      ) {

        return res.status(400).json({
          error:
            "Invalid attachment ID"
        });

      }


      /* =====================
         LOAD ATTACHMENT
      ===================== */

      const result =
        await pool.query(
          `
          SELECT
            id,
            entity_type,
            entity_id,
            file_key,
            file_name,
            mime_type,
            file_size

          FROM attachments

          WHERE id = $1

          LIMIT 1
          `,
          [
            attachmentId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            "Attachment not found"
        });

      }


      const attachment =
        result.rows[0];


      /* =====================
         CREATE SIGNED URL

         Valid for 5 minutes.
      ===================== */

      const command =
        new GetObjectCommand({
          Bucket:
            process.env.R2_BUCKET,

          Key:
            attachment.file_key,

          ResponseContentType:
            attachment.mime_type,

          ResponseContentDisposition:
            `inline; filename="${String(
              attachment.file_name || "attachment"
            ).replace(/"/g, "")}"`
        });


      const signedUrl =
        await getSignedUrl(
          r2Client,
          command,
          {
            expiresIn:
              300
          }
        );


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        attachment: {
          id:
            attachment.id,

          fileName:
            attachment.file_name,

          mimeType:
            attachment.mime_type,

          fileSize:
            attachment.file_size
        },

        url:
          signedUrl,

        expiresIn:
          300

      });


    } catch (err) {

      console.error(
        "GET /attachments/:attachmentId/open ERROR:",
        err
      );


      return res.status(500).json({
        error:
          err.message ||
          "Failed to open attachment"
      });

    }

  }
);

/* =====================================================
   CMMS ATTACHMENTS — GET ENTITY ATTACHMENTS

   GET:
   /attachments/:entityType/:entityId

   Supports:
   - TASK
   - BREAKDOWN
   - SCHEDULED_MAINTENANCE
   - MAINTENANCE_REPORT
===================================================== */

app.get( "/attachments/:entityType/:entityId",

  async (req, res) => {

    try {

      /* =====================
         NORMALIZE ENTITY
      ===================== */

      const entityType =
        normalizeAttachmentEntityType(
          req.params.entityType
        );


      const entityId =
        normalizeAttachmentEntityId(
          req.params.entityId
        );


      /* =====================
         VERIFY ENTITY EXISTS
      ===================== */

      const entity =
        await assertAttachmentEntityExists(
          pool,
          entityType,
          entityId
        );


      /* =====================
         LOAD ATTACHMENTS
      ===================== */

      const result =
        await pool.query(
          `
          SELECT
            id,
            entity_type,
            entity_id,
            file_key,
            file_name,
            mime_type,
            file_size,
            uploaded_by_id,
            uploaded_by,
            uploaded_at

          FROM attachments

          WHERE entity_type = $1
            AND entity_id = $2

          ORDER BY
            uploaded_at ASC,
            id ASC
          `,
          [
            entity.entityType,
            entity.entityId
          ]
        );


      /* =====================
         CALCULATE USAGE
      ===================== */

      const totalBytes =
        result.rows.reduce(
          (
            total,
            attachment
          ) =>
            total +
            Number(
              attachment.file_size || 0
            ),
          0
        );


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        entity: {
          type:
            entity.entityType,

          id:
            entity.entityId
        },

        attachments:
          result.rows,

        usage: {
          fileCount:
            result.rows.length,

          totalBytes,

          maxFiles:
            ATTACHMENT_MAX_FILES,

          maxTotalBytes:
            ATTACHMENT_MAX_TOTAL_BYTES
        }

      });


    } catch (err) {

      console.error(
        "GET /attachments ERROR:",
        err
      );


      const message =
        err.message ||
        "Failed to load attachments";


      const isValidationError =
        message.includes("not found") ||
        message.includes("Invalid") ||
        message.includes("Unsupported");


      return res
        .status(
          isValidationError
            ? 400
            : 500
        )
        .json({
          error:
            message
        });

    }

  }
);



// -------------------
// ALLOWED ROLES
// -------------------

const ALLOWED_TECHNICIAN_ROLES = [
  "Technician",
  "Planner",
  "Admin",
  "Manager",
  "Shift Foreman"
];

// -------------------
// Health
// -------------------
app.get("/api", (req, res) => {
  res.send("ASTIR Backend API Running!");
});

/* =====================================================
   R2 CONNECTION TEST
===================================================== */

app.get("/r2-test", async (req, res) => {

    try {

      const result =
        await r2Client.send(
          new ListObjectsV2Command({
            Bucket:
              process.env.R2_BUCKET,

            MaxKeys:
              5
          })
        );


      res.json({
        ok: true,

        bucket:
          process.env.R2_BUCKET,

        objectCount:
          result.KeyCount || 0,

        objects:
          (result.Contents || [])
            .map(
              item => ({
                key:
                  item.Key,

                size:
                  item.Size
              })
            )
      });


    } catch (error) {

      console.error(
        "R2 TEST ERROR:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);

// =====================
// AUTH: LOGIN
// =====================

app.post("/auth/login", async (req, res) => {

  try {

    const { password } =
      req.body || {};


    if (!password) {

      return res.status(400).json({
        error: "Password required"
      });

    }


    const result =
      await pool.query(
        `
        SELECT
          admin_password,
          planner_password,
          technician_password,
          manager_password

        FROM roles_config

        ORDER BY id DESC

        LIMIT 1
        `
      );


    if (!result.rows.length) {

      return res.status(500).json({
        error: "Roles not configured"
      });

    }


    const cfg =
      result.rows[0];


    let role = null;


    if (
      password === cfg.admin_password
    ) {

      role = "admin";

    }

    else if (
      password === cfg.planner_password
    ) {

      role = "planner";

    }

    else if (
      password === cfg.technician_password
    ) {

      role = "technician";

    }

    else if (
      password === cfg.manager_password
    ) {

      role = "manager";

    }


    if (!role) {

      return res.status(401).json({
        error: "Invalid access code"
      });

    }


    res.json({
      role
    });


  } catch (err) {

    console.error(
      "AUTH LOGIN ERROR:",
      err.message
    );


    res.status(500).json({
      error: "Auth error"
    });

  }

});

// =====================
// AUTH: LOGIN V2
// Technician + Role validation
// =====================

app.post("/auth/login-v2", async (req, res) => {

  try {

    const {
      technician_id,
      password
    } = req.body || {};


    /* =====================
       BASIC VALIDATION
    ===================== */

    const technicianId =
      Number(technician_id);


    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error: "Technician required"
      });

    }


    if (!password) {

      return res.status(400).json({
        error: "Password required"
      });

    }


    /* =====================
       GET LOGIN USER
    ===================== */

    const technicianResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          role,
          active,
          is_user

        FROM technicians

        WHERE id = $1

        LIMIT 1
        `,
        [technicianId]
      );


    if (!technicianResult.rows.length) {

      return res.status(401).json({
        error: "Invalid credentials"
      });

    }


    const technician =
      technicianResult.rows[0];


    /* =====================
       USER MUST BE ACTIVE
       AND CMMS USER
    ===================== */

    if (
      technician.active !== true ||
      technician.is_user !== true
    ) {

      return res.status(401).json({
        error: "Invalid credentials"
      });

    }


    /* =====================
       NORMALIZE ROLE
    ===================== */

    const dbRole =
      String(
        technician.role || ""
      )
        .trim()
        .toLowerCase();


    const roleMap = {

      technician:
        "technician",

      supervisor:
        "planner",

      planner:
        "planner",

      admin:
        "admin",

      manager:
        "manager",

      shift_foreman:
        "shift_foreman",

      "shift foreman":
        "shift_foreman"

    };


    const role =
      roleMap[dbRole];


    if (!role) {

      return res.status(401).json({
        error: "Invalid user role"
      });

    }


    /* =====================
       GET ROLE PASSWORDS
    ===================== */

    const configResult =
      await pool.query(
        `
        SELECT
          admin_password,
          planner_password,
          technician_password,
          manager_password,
          shift_foreman_password

        FROM roles_config

        ORDER BY id DESC

        LIMIT 1
        `
      );


    if (!configResult.rows.length) {

      return res.status(500).json({
        error: "Roles not configured"
      });

    }


    const cfg =
      configResult.rows[0];


    /* =====================
       PASSWORD FOR USER ROLE
    ===================== */

    const rolePasswords = {

      technician:
        cfg.technician_password,

      planner:
        cfg.planner_password,

      admin:
        cfg.admin_password,

      manager:
        cfg.manager_password,

      shift_foreman:
        cfg.shift_foreman_password

    };


    const validPassword =
      rolePasswords[role];


    if (
      !validPassword ||
      password !== validPassword
    ) {

      return res.status(401).json({
        error: "Invalid credentials"
      });

    }


    /* =====================
       SUCCESS
    ===================== */

    return res.json({

      success: true,

      technician_id:
        technician.id,

      technician_name:
        technician.name,

      role

    });


  } catch (err) {

    console.error(
      "AUTH LOGIN V2 ERROR:",
      err
    );


    return res.status(500).json({
      error: "Auth error"
    });

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

    const includeManagers =
      String(
        req.query.include_managers || ""
      )
        .trim()
        .toLowerCase() === "true";


    const conditions = [
      "active = true"
    ];


    if (!includeManagers) {

      conditions.push(
        "LOWER(TRIM(role)) <> 'manager'"
      );

    }


    const result =
      await pool.query(
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

        WHERE ${conditions.join(" AND ")}

        ORDER BY name ASC
        `
      );


    res.json(
      result.rows
    );


  } catch (err) {

    console.error(
      "GET TECHNICIANS ERROR:",
      err
    );


    res.status(500).json({
      error: err.message
    });

  }

});

/* =====================
   CREATE TECHNICIAN
===================== */

app.post("/technicians", requireAdmin, async (req, res) => {

    const {
      name,
      role,
      phone,
      email,
      is_user
    } = req.body;


    /* =====================
       VALIDATE NAME
    ===================== */

    if (!name) {

      return res.status(400).json({
        error:
          "Name is required"
      });

    }


    const cleanName =
      String(name)
        .trim();


    if (!cleanName) {

      return res.status(400).json({
        error:
          "Name is required"
      });

    }


    /* =====================
       VALIDATE ROLE
    ===================== */

    const cleanRole =
      String(
        role || "Technician"
      ).trim();


    if (
      !ALLOWED_TECHNICIAN_ROLES.includes(
        cleanRole
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid technician role"
      });

    }


    try {

      /* =====================
         CHECK EXISTING TECHNICIAN
      ===================== */

      const existing =
        await pool.query(
          `
          SELECT
            id,
            active

          FROM technicians

          WHERE LOWER(name) =
                LOWER($1)
          `,
          [cleanName]
        );


      if (
        existing.rowCount > 0
      ) {

        const tech =
          existing.rows[0];


        /* =====================
           REACTIVATE INACTIVE
        ===================== */

        if (!tech.active) {

          const reactivate =
            await pool.query(
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
                cleanRole,
                phone || null,
                email || null,
                is_user === true
              ]
            );


          return res.json(
            reactivate.rows[0]
          );

        }


        return res.status(409).json({
          error:
            "Technician already exists"
        });

      }


      /* =====================
         INSERT NEW TECHNICIAN
      ===================== */

      const result =
        await pool.query(
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
            cleanRole,
            phone || null,
            email || null,
            is_user === true
          ]
        );


      return res.json(
        result.rows[0]
      );


    } catch (err) {

      console.error(
        "POST /technicians ERROR:",
        err
      );


      return res.status(500).json({
        error:
          err.message
      });

    }

  }
);

/* =====================
   UPDATE TECHNICIAN
===================== */

app.patch("/technicians/:id", requireAdmin, async (req, res) => {

    const technicianId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        technicianId
      ) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Technician ID"
      });

    }


    const {
      name,
      role,
      phone,
      email,
      active,
      is_user
    } = req.body;


    /* =====================
       VALIDATE NAME
    ===================== */

    if (!name) {

      return res.status(400).json({
        error:
          "Name is required"
      });

    }


    const cleanName =
      String(name)
        .trim();


    if (!cleanName) {

      return res.status(400).json({
        error:
          "Name is required"
      });

    }


    /* =====================
       VALIDATE ROLE
    ===================== */

    const cleanRole =
      String(
        role || "Technician"
      ).trim();


    if (
      !ALLOWED_TECHNICIAN_ROLES.includes(
        cleanRole
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid technician role"
      });

    }


    try {

      const result =
        await pool.query(
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
            cleanName,
            cleanRole,
            phone || null,
            email || null,
            active !== false,
            is_user === true,
            technicianId
          ]
        );


      if (
        result.rowCount === 0
      ) {

        return res.status(404).json({
          error:
            "Technician not found"
        });

      }


      return res.json(
        result.rows[0]
      );


    } catch (err) {

      console.error(
        "PATCH /technicians/:id ERROR:",
        err
      );


      return res.status(500).json({
        error:
          err.message
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

   DEFAULT MACHINE STATE:
   - Every new Breakdown starts with Machine State = DOWN
   - Machine State started_at is EXACTLY the same as
     Breakdown started_at

   This does NOT create:
   - maintenance task
   - task execution
   - restoration task

   Breakdown + initial Machine State are created
   in the same database transaction.
========================================================= */

app.post("/breakdowns", async (req, res) => {

  const client = await pool.connect();

  try {

const {
  asset_id,
  title,
  description,
  started_at,
  reported_by,
  reported_by_id,
  restoration_task
} = req.body || {};


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

    /* =========================================================
   OPTIONAL INITIAL RESTORATION TASK

   LIVE Breakdown supports:

   PLANNED
   - Creates one open Restoration Task.
   - due_date cannot be earlier than Breakdown start.

   DONE
   - Creates one completed Restoration Task.
   - Creates one actual task execution.
   - executed_at must be between Breakdown start and NOW.

   No restoration_task:
   - Existing Breakdown-only behavior remains unchanged.
========================================================= */

let initialRestorationTask =
  null;


if (
  restoration_task &&
  typeof restoration_task === "object"
) {

  const mode =
    String(
      restoration_task.mode || ""
    )
      .trim()
      .toUpperCase();


  if (
    mode !== "PLANNED" &&
    mode !== "DONE"
  ) {

    return res.status(400).json({
      error:
        "Restoration Task mode must be PLANNED or DONE"
    });

  }


  const taskName =
    String(
      restoration_task.task || ""
    ).trim();


  if (!taskName) {

    return res.status(400).json({
      error:
        "Restoration Task is required"
    });

  }


  /* =====================
     BREAKDOWN START
  ===================== */

  const breakdownStartedAt =
    started_at
      ? new Date(started_at)
      : new Date();


  if (
    Number.isNaN(
      breakdownStartedAt.getTime()
    )
  ) {

    return res.status(400).json({
      error:
        "Invalid Breakdown start time"
    });

  }


  /* =====================
     IMPACT
  ===================== */

  const resolvedImpact =
    String(
      restoration_task.impact ||
      "normal"
    )
      .trim()
      .toLowerCase();


  const validImpacts = [
    "normal",
    "safety",
    "quality",
    "safety_quality"
  ];


  if (
    !validImpacts.includes(
      resolvedImpact
    )
  ) {

    return res.status(400).json({
      error:
        "Invalid Restoration Task Impact"
    });

  }


  /* =====================================================
     PLANNED
  ===================================================== */

  if (
    mode === "PLANNED"
  ) {

    let dueDate =
      null;


    if (
      restoration_task.due_date
    ) {

      dueDate =
        new Date(
          restoration_task.due_date
        );


      if (
        Number.isNaN(
          dueDate.getTime()
        )
      ) {

        return res.status(400).json({
          error:
            "Invalid Restoration Task Due Date"
        });

      }


      if (
        dueDate <
        breakdownStartedAt
      ) {

        return res.status(409).json({
          error:
            "Restoration Task Due Date cannot be earlier than Breakdown Start"
        });

      }

    }


    let estimatedDuration =
      null;


    if (
      restoration_task.duration_min !== undefined &&
      restoration_task.duration_min !== null &&
      restoration_task.duration_min !== ""
    ) {

      estimatedDuration =
        Number(
          restoration_task.duration_min
        );


      if (
        !Number.isFinite(
          estimatedDuration
        ) ||
        estimatedDuration < 0
      ) {

        return res.status(400).json({
          error:
            "Invalid estimated duration"
        });

      }

    }


    initialRestorationTask = {

      mode:
        "PLANNED",

      task:
        taskName,

      section:
        String(
          restoration_task.section || ""
        ).trim() || null,

      unit:
        String(
          restoration_task.unit || ""
        ).trim() || null,

      impact:
        resolvedImpact,

      due_date:
        dueDate
          ? dueDate.toISOString()
          : null,

      duration_min:
        estimatedDuration,

      notes:
        String(
          restoration_task.notes || ""
        ).trim() || null

    };

  }


  /* =====================================================
     DONE
  ===================================================== */

  if (
    mode === "DONE"
  ) {

    const technicianId =
      Number(
        restoration_task.technician_id
      );


    if (
      !Number.isInteger(
        technicianId
      ) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Technician is required"
      });

    }


    if (
      !restoration_task.executed_at
    ) {

      return res.status(400).json({
        error:
          "Actual completion time is required"
      });

    }


    const executedAt =
      new Date(
        restoration_task.executed_at
      );


    if (
      Number.isNaN(
        executedAt.getTime()
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid actual completion time"
      });

    }


    if (
      executedAt <
      breakdownStartedAt
    ) {

      return res.status(409).json({
        error:
          "Actual completion time cannot be earlier than Breakdown start"
      });

    }


    if (
      executedAt.getTime() >
      Date.now()
    ) {

      return res.status(400).json({
        error:
          "Actual completion time cannot be in the future"
      });

    }


    if (
      restoration_task.actual_duration_min === null ||
      restoration_task.actual_duration_min === undefined ||
      restoration_task.actual_duration_min === ""
    ) {

      return res.status(400).json({
        error:
          "Actual Duration is required"
      });

    }


    const actualDuration =
      Number(
        restoration_task.actual_duration_min
      );


    if (
      !Number.isInteger(
        actualDuration
      ) ||
      actualDuration < 0
    ) {

      return res.status(400).json({
        error:
          "Actual Duration must be a non-negative integer"
      });

    }


    initialRestorationTask = {

      mode:
        "DONE",

      task:
        taskName,

      section:
        String(
          restoration_task.section || ""
        ).trim() || null,

      unit:
        String(
          restoration_task.unit || ""
        ).trim() || null,

      impact:
        resolvedImpact,

      technician_id:
        technicianId,

      executed_at:
        executedAt,

      actual_duration_min:
        actualDuration,

      notes:
        String(
          restoration_task.notes || ""
        ).trim() || null

    };

  }

}

    /* =====================
       VERIFY ASSET
    ===================== */

    const assetResult = await client.query(
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
       START TRANSACTION
    ===================== */

    await client.query("BEGIN");


    /* =====================
       CREATE BREAKDOWN

       IMPORTANT:
       A new Breakdown does NOT automatically
       define the Machine State.

       The technician will explicitly select:
       DOWN / TRIAL / DEGRADED / RUNNING
       after the Breakdown has been created.
    ===================== */

    const result = await client.query(
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


    const breakdown =
      result.rows[0];

    /* =========================================================
   CREATE OPTIONAL INITIAL RESTORATION TASK

   PLANNED:
   - Creates one Planned Restoration Task.
   - No execution is created.

   DONE:
   - Creates one completed Restoration Task.
   - Creates its actual execution.

   IMPORTANT:
   - Breakdown remains OPEN.
   - All records are inside the same transaction.
========================================================= */

let createdRestorationTask =
  null;


let createdRestorationExecution =
  null;


if (initialRestorationTask) {

  /* =====================================================
     PLANNED RESTORATION TASK
  ===================================================== */

  if (
    initialRestorationTask.mode ===
    "PLANNED"
  ) {

    const taskResult =
      await client.query(
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

          initialRestorationTask.task,

          initialRestorationTask.section,

          initialRestorationTask.unit,

          initialRestorationTask.impact,

          initialRestorationTask.due_date,

          initialRestorationTask.duration_min,

          initialRestorationTask.notes,

          breakdown.id
        ]
      );


    createdRestorationTask =
      taskResult.rows[0];

  }


  /* =====================================================
     COMPLETED RESTORATION TASK
  ===================================================== */

  if (
    initialRestorationTask.mode ===
    "DONE"
  ) {

    /* =====================
       VERIFY TECHNICIAN
    ===================== */

    const technicianResult =
      await client.query(
        `
          SELECT
            id,
            name

          FROM technicians

          WHERE
            id = $1
            AND active = true

          LIMIT 1
        `,
        [
          initialRestorationTask
            .technician_id
        ]
      );


    if (
      !technicianResult.rows.length
    ) {

      throw new Error(
        "Active Technician not found"
      );

    }


    const technician =
      technicianResult.rows[0];


    /* =====================
       CREATE DONE TASK
    ===================== */

    const taskResult =
      await client.query(
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
            breakdown_id,
            scheduled_maintenance_id,
            completed_by,
            completed_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'Restoration',
            $5,
            'Done',
            NULL,
            0,
            NULL,
            $6,
            true,
            $7,
            NULL,
            $8,
            $9
          )
          RETURNING *
        `,
        [
          breakdown.asset_id,

          initialRestorationTask.task,

          initialRestorationTask.section,

          initialRestorationTask.unit,

          initialRestorationTask.impact,

          initialRestorationTask.notes,

          breakdown.id,

          technician.name,

          initialRestorationTask.executed_at
        ]
      );


    createdRestorationTask =
      taskResult.rows[0];


    /* =====================
       CREATE EXECUTION
    ===================== */

    const executionResult =
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
          VALUES (
            $1,
            $2,
            $3,
            $4,
            NULL,
            $5,
            $6,
            $7
          )
          RETURNING *
        `,
        [
          createdRestorationTask.id,

          breakdown.asset_id,

          technician.name,

          technician.id,

          initialRestorationTask.executed_at,

          initialRestorationTask
            .actual_duration_min,

          initialRestorationTask.notes
        ]
      );


    createdRestorationExecution =
      executionResult.rows[0];

  }

}

    /* =====================
       COMMIT TRANSACTION
    ===================== */

    await client.query("COMMIT");


    /* =====================
       RESPONSE

       machine_state = null
       until explicitly selected
       by the technician.
    ===================== */

  return res.status(201).json({

    message:
      "Breakdown created successfully",

    breakdown,

    machine_state:
      null,

    restoration_task:
      createdRestorationTask,

    restoration_execution:
      createdRestorationExecution

  });


  } catch (err) {

    /* =====================
       ROLLBACK ON ERROR
    ===================== */

    try {
      await client.query("ROLLBACK");
    } catch (_) {}


    console.error(
      "POST /breakdowns error:",
      err
    );


    return res.status(500).json({
      error: "Failed to create breakdown"
    });


  } finally {

    /* =====================
       RELEASE DB CLIENT
    ===================== */

    client.release();

  }

});

// ============================================================
// POST /breakdowns/historical
//
// Creates a Breakdown that has ALREADY been restored.
//
// Use case:
// - Failure happened earlier (e.g. during night shift)
// - Technician restored the machine
// - Breakdown was not entered into CMMS at that time
// - It is entered later with the REAL failure/restoration times
//
// Result:
//
// Breakdown:
//   status     = CLOSED
//   started_at = actual failure time
//   closed_at  = actual restoration time
//
// Machine State:
//   DOWN
//   started_at = breakdown.started_at
//   ended_at   = breakdown.closed_at
//
// IMPORTANT:
// No active Machine State is ever created.
// Therefore a historical 35-minute Breakdown will NEVER
// temporarily appear as a 9-hour active Breakdown.
// ============================================================

app.post( "/breakdowns/historical", async (req, res) => {

    const client =
      await pool.connect();


    try {

    const {
      asset_id,
      title,
      description,
      started_at,
      restored_at,
      reported_by,
      reported_by_id,
      failure_cause,
      root_cause,
      corrective_action,
      restoration_task
    } = req.body || {};


      /* =====================
         BASIC VALIDATION
      ===================== */

      if (!asset_id) {

        return res.status(400).json({
          error: "Asset is required"
        });

      }


      if (
        !title ||
        !String(title).trim()
      ) {

        return res.status(400).json({
          error:
            "Breakdown title is required"
        });

      }


      if (!started_at) {

        return res.status(400).json({
          error:
            "Breakdown start time is required"
        });

      }


      if (!restored_at) {

        return res.status(400).json({
          error:
            "Restored time is required"
        });

      }


      /* =====================
         VALIDATE DATES
      ===================== */

      const startedDate =
        new Date(started_at);

      const restoredDate =
        new Date(restored_at);


      if (
        Number.isNaN(
          startedDate.getTime()
        )
      ) {

        return res.status(400).json({
          error:
            "Invalid Breakdown start time"
        });

      }


      if (
        Number.isNaN(
          restoredDate.getTime()
        )
      ) {

        return res.status(400).json({
          error:
            "Invalid restored time"
        });

      }


      if (
        restoredDate.getTime() <
        startedDate.getTime()
      ) {

        return res.status(400).json({
          error:
            "Restored time cannot be earlier than Breakdown start time"
        });

      }


      /*
        Historical Breakdown should not
        contain future timestamps.
      */

      const now =
        Date.now();


      if (
        startedDate.getTime() >
        now
      ) {

        return res.status(400).json({
          error:
            "Breakdown start time cannot be in the future"
        });

      }


      if (
        restoredDate.getTime() >
        now
      ) {

        return res.status(400).json({
          error:
            "Restored time cannot be in the future"
        });

      }

      /* =========================================================
        OPTIONAL INITIAL HISTORICAL RESTORATION TASK

        Historical Breakdown supports only a DONE task.

        The actual completion must be inside:
        Breakdown started_at -> restored_at
      ========================================================= */

      let initialRestorationTask =
        null;


      if (
        restoration_task &&
        typeof restoration_task === "object"
      ) {

        const mode =
          String(
            restoration_task.mode || ""
          )
            .trim()
            .toUpperCase();


        /* =====================
          HISTORICAL = DONE ONLY
        ===================== */

        if (
          mode !== "DONE"
        ) {

          return res.status(400).json({
            error:
              "Historical Breakdown Restoration Task must be DONE"
          });

        }


        /* =====================
          TASK NAME
        ===================== */

        const taskName =
          String(
            restoration_task.task || ""
          ).trim();


        if (!taskName) {

          return res.status(400).json({
            error:
              "Restoration Task is required"
          });

        }

        /* =====================
          IMPACT
        ===================== */

        const resolvedImpact =
          String(
            restoration_task.impact ||
            "normal"
          )
            .trim()
            .toLowerCase();


        const validImpacts = [
          "normal",
          "safety",
          "quality",
          "safety_quality"
        ];


        if (
          !validImpacts.includes(
            resolvedImpact
          )
        ) {

          return res.status(400).json({
            error:
              "Invalid Restoration Task Impact"
          });

        }

        /* =====================
          TECHNICIAN
        ===================== */

        const technicianId =
          Number(
            restoration_task.technician_id
          );


        if (
          !Number.isInteger(
            technicianId
          ) ||
          technicianId <= 0
        ) {

          return res.status(400).json({
            error:
              "Technician is required"
          });

        }


        /* =====================
          ACTUAL COMPLETION TIME
        ===================== */

        if (
          !restoration_task.executed_at
        ) {

          return res.status(400).json({
            error:
              "Actual completion time is required"
          });

        }


        const executedAt =
          new Date(
            restoration_task.executed_at
          );


        if (
          Number.isNaN(
            executedAt.getTime()
          )
        ) {

          return res.status(400).json({
            error:
              "Invalid actual completion time"
          });

        }


        /* =====================
          BREAKDOWN TIME WINDOW
        ===================== */

        if (
          executedAt <
            startedDate ||
          executedAt >
            restoredDate
        ) {

          return res.status(409).json({
            error:
              "Actual completion time must be within the Breakdown period"
          });

        }


        /* =====================
          ACTUAL DURATION
        ===================== */

        if (
          restoration_task.actual_duration_min === null ||
          restoration_task.actual_duration_min === undefined ||
          restoration_task.actual_duration_min === ""
        ) {

          return res.status(400).json({
            error:
              "Actual Duration is required"
          });

        }


        const actualDuration =
          Number(
            restoration_task.actual_duration_min
          );


        if (
          !Number.isInteger(
            actualDuration
          ) ||
          actualDuration < 0
        ) {

          return res.status(400).json({
            error:
              "Actual Duration must be a non-negative integer"
          });

        }


        initialRestorationTask = {

          mode:
            "DONE",

          task:
            taskName,

          section:
            String(
              restoration_task.section || ""
            ).trim() || null,

          unit:
            String(
              restoration_task.unit || ""
            ).trim() || null,

          impact:
            resolvedImpact,

          technician_id:
            technicianId,

          executed_at:
            executedAt,

          actual_duration_min:
            actualDuration,

          notes:
            String(
              restoration_task.notes || ""
            ).trim() || null

        };

      }


      /* =====================
         VERIFY ASSET
      ===================== */

      const assetResult =
        await client.query(
          `
          SELECT id
          FROM assets
          WHERE id = $1
          LIMIT 1
          `,
          [asset_id]
        );


      if (
        assetResult.rows.length === 0
      ) {

        return res.status(404).json({
          error: "Asset not found"
        });

      }


      /* =====================
         START TRANSACTION
      ===================== */

      await client.query("BEGIN");


      /* =====================
         CREATE CLOSED BREAKDOWN
      ===================== */

      const breakdownResult =
        await client.query(
          `
          INSERT INTO breakdowns (
            asset_id,
            title,
            description,
            status,
            started_at,
            closed_at,
            reported_by,
            reported_by_id,
            failure_cause,
            root_cause,
            corrective_action,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            'CLOSED',
            $4::timestamptz,
            $5::timestamptz,
            $6,
            $7,
            $8,
            $9,
            $10,
            NOW(),
            NOW()
          )
          RETURNING *
          `,
          [
            asset_id,

            String(title).trim(),

            description?.trim() ||
              null,

            started_at,

            restored_at,

            reported_by?.trim() ||
              null,

            reported_by_id ||
              null,

            failure_cause?.trim() ||
              null,

            root_cause?.trim() ||
              null,

            corrective_action?.trim() ||
              null
          ]
        );


      const breakdown =
        breakdownResult.rows[0];

      /* =========================================================
        CREATE OPTIONAL COMPLETED RESTORATION TASK

        Historical Breakdown:
        - Task = DONE
        - due_date = NULL
        - frequency_hours = 0
        - prev_due_date = NULL
        - Actual execution is recorded
      ========================================================= */

      let createdRestorationTask =
        null;

      let createdRestorationExecution =
        null;


      if (initialRestorationTask) {

        /* =====================
          VERIFY TECHNICIAN

          Historical work may belong to a
          technician who is no longer active.
        ===================== */

        const technicianResult =
          await client.query(
            `
              SELECT
                id,
                name

              FROM technicians

              WHERE id = $1

              LIMIT 1
            `,
            [
              initialRestorationTask
                .technician_id
            ]
          );


        if (
          !technicianResult.rows.length
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(404).json({
            error:
              "Technician not found"
          });

        }


        const technician =
          technicianResult.rows[0];


        /* =====================
          CREATE DONE TASK
        ===================== */

        const taskResult =
          await client.query(
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
                breakdown_id,
                completed_by,
                completed_at
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                'Restoration',
                $5,
                'Done',
                NULL,
                0,
                NULL,
                $6,
                true,
                $7,
                $8,
                $9
              )
              RETURNING *
            `,
            [
              breakdown.asset_id,

              initialRestorationTask.task,

              initialRestorationTask.section,

              initialRestorationTask.unit,

              initialRestorationTask.impact,

              initialRestorationTask.notes,

              breakdown.id,

              technician.name,

              initialRestorationTask.executed_at
            ]
          );


        createdRestorationTask =
          taskResult.rows[0];

        /* =====================
          CREATE ACTUAL EXECUTION
        ===================== */

        const executionResult =
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
              VALUES (
                $1,
                $2,
                $3,
                $4,
                NULL,
                $5,
                $6,
                $7
              )
              RETURNING *
            `,
            [
              createdRestorationTask.id,

              breakdown.asset_id,

              technician.name,

              technician.id,

              initialRestorationTask.executed_at,

              initialRestorationTask
                .actual_duration_min,

              initialRestorationTask.notes
            ]
          );


        createdRestorationExecution =
          executionResult.rows[0];

      }


      /* =====================================================
         CREATE HISTORICAL MACHINE STATE

         Historical Breakdown gets exactly ONE state:

         DOWN
         actual failure → actual restoration

         No open/current Machine State exists.
      ===================================================== */

      const machineStateResult =
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
            'DOWN',
            $2,
            $3,
            $4,
            $5,
            NOW()
          )
          RETURNING *
          `,
          [
            breakdown.id,

            breakdown.started_at,

            breakdown.closed_at,

            reported_by?.trim() ||
              null,

            reported_by_id ||
              null
          ]
        );


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res
        .status(201)
        .json({

          message:
            "Historical Breakdown created successfully",

          breakdown,

          machine_state:
            machineStateResult.rows[0],

          restoration_task:
            createdRestorationTask,

          restoration_execution:
            createdRestorationExecution

        });

    } catch (err) {

      /* =====================
         ROLLBACK
      ===================== */

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "POST /breakdowns/historical error:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to create historical Breakdown"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   GET BREAKDOWNS

   Returns Breakdown incidents for the main Breakdown list.

   IMPORTANT:
   - incident duration = started_at → closed_at / now
   - down_seconds = actual Machine State DOWN time
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

        /* ===============================================
           VERIFIED / CORRECTED DOWNTIME
        =============================================== */

        b.verified_down_seconds,
        b.downtime_correction_reason,
        b.downtime_corrected_by,
        b.downtime_corrected_by_id,
        b.downtime_corrected_at,

        /* ===============================================
           ASSET
        =============================================== */

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name,

        /* ===============================================
           DOWNTIME MODEL v1

           recorded_down_seconds
             = raw Machine State DOWN intervals

           verified_down_seconds
             = optional Admin correction

           effective_down_seconds
             = verified value when available
               otherwise recorded value

           down_seconds
             = legacy compatibility alias for frontend
               until frontend cutover is completed
        =============================================== */

        dt.recorded_down_seconds
          AS down_seconds,

        dt.recorded_down_seconds,

        COALESCE(
          b.verified_down_seconds,
          dt.recorded_down_seconds
        ) AS effective_down_seconds,
          CASE
            WHEN b.verified_down_seconds IS NOT NULL
              THEN 'VERIFIED'
            ELSE 'RECORDED'
          END AS downtime_mode

      FROM breakdowns b

      JOIN assets a
        ON a.id = b.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id


      /* ===============================================
         CALCULATE RECORDED MACHINE DOWN TIME ONCE
      =============================================== */

      LEFT JOIN LATERAL (

        SELECT
          COALESCE(
            SUM(
              GREATEST(
                EXTRACT(
                  EPOCH FROM (
                    LEAST(
                      COALESCE(
                        bsh.ended_at,
                        NOW()
                      ),
                      COALESCE(
                        b.closed_at,
                        NOW()
                      )
                    )
                    -
                    bsh.started_at
                  )
                ),
                0
              )
            ),
            0
          ) AS recorded_down_seconds

        FROM breakdown_state_history bsh

        WHERE
          bsh.breakdown_id = b.id
          AND bsh.state = 'DOWN'

      ) dt ON TRUE


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

    return res.json(
      result.rows
    );


  } catch (err) {

    console.error(
      "GET /breakdowns error:",
      err
    );


    return res.status(500).json({
      error:
        "Failed to load breakdowns"
    });

  }

});

/* =========================================================
   GET BREAKDOWN BY ID
   GET /breakdowns/:id

   Returns one Breakdown incident together with:
   - Asset / Line information
   - DT Model v1 downtime fields
========================================================= */

app.get("/breakdowns/:id", async (req, res) => {

  try {

    const breakdownId =
      Number(req.params.id);


    /* =====================
       VALIDATION
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

        /* ===============================================
           VERIFIED / CORRECTION DATA
        =============================================== */

        b.verified_down_seconds,
        b.downtime_correction_reason,
        b.downtime_corrected_by,
        b.downtime_corrected_by_id,
        b.downtime_corrected_at,

        /* ===============================================
           ASSET / LINE
        =============================================== */

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name,

        /* ===============================================
           DT MODEL v1

           recorded_down_seconds:
             raw Machine State DOWN intervals

           effective_down_seconds:
             verified value when available,
             otherwise recorded value

           downtime_mode:
             VERIFIED or RECORDED
        =============================================== */

        dt.recorded_down_seconds,

        COALESCE(
          b.verified_down_seconds,
          dt.recorded_down_seconds
        ) AS effective_down_seconds,

        CASE
          WHEN b.verified_down_seconds IS NOT NULL
            THEN 'VERIFIED'
          ELSE 'RECORDED'
        END AS downtime_mode

      FROM breakdowns b

      JOIN assets a
        ON a.id = b.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id


      /* ===============================================
         RECORDED MACHINE DOWN TIME

         Closed interval:
           started_at → ended_at

         Active interval:
           started_at → NOW()

         CLOSED Breakdown safety:
           never count beyond closed_at
      =============================================== */

      LEFT JOIN LATERAL (

        SELECT
          COALESCE(
            SUM(
              GREATEST(
                EXTRACT(
                  EPOCH FROM (
                    LEAST(
                      COALESCE(
                        bsh.ended_at,
                        NOW()
                      ),
                      COALESCE(
                        b.closed_at,
                        NOW()
                      )
                    )
                    -
                    bsh.started_at
                  )
                ),
                0
              )
            ),
            0
          ) AS recorded_down_seconds

        FROM breakdown_state_history bsh

        WHERE
          bsh.breakdown_id = b.id
          AND bsh.state = 'DOWN'

      ) dt ON TRUE


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

    return res.json(
      result.rows[0]
    );


  } catch (err) {

    console.error(
      "GET /breakdowns/:id error:",
      err
    );

    return res.status(500).json({
      error:
        "Failed to load breakdown"
    });

  }

});

/* =========================================================
   UPDATE BREAKDOWN
   PATCH /breakdowns/:id

   Editable incident information only.

   IMPORTANT:
   - Does NOT change Breakdown status.
   - Does NOT change closed_at.
   - Does NOT modify Machine State history.
   - Does NOT create / modify Restoration Tasks.
   - Does NOT create Task Executions.

   Lifecycle actions remain separate:
   START / CLOSE / REOPEN.
========================================================= */

app.patch("/breakdowns/:id", async (req, res) => {

  /* =====================
    AUTHORIZATION

    Edit Breakdown:
    Admin + Planner only
  ===================== */

  const role =
    String(
      req.headers["x-cmms-role"] || ""
    ).toLowerCase();

  const canEditBreakdown =
    role === "admin" ||
    role === "planner";

  if (!canEditBreakdown) {
    return res.status(403).json({
      error:
        "Admin or Planner access required"
    });
  }

    const client = await pool.connect();

  try {

    const breakdownId =
      Number(req.params.id);


    const {
      title,
      description,
      started_at,
      reported_by,
      reported_by_id,
      failure_cause,
      root_cause,
      corrective_action
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


    await client.query("BEGIN");


    /* =====================
       LOAD + LOCK BREAKDOWN
    ===================== */

    const existingResult =
      await client.query(
        `
        SELECT *
        FROM breakdowns
        WHERE id = $1
        FOR UPDATE
        `,
        [breakdownId]
      );


    if (!existingResult.rows.length) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Breakdown not found"
      });

    }


    const existing =
      existingResult.rows[0];


    /* =====================
       VALIDATE TITLE
    ===================== */

    if (
      title !== undefined &&
      !String(title).trim()
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Breakdown title cannot be empty"
      });

    }


    /* =====================
       RESOLVE STARTED AT
    ===================== */

    const resolvedStartedAt =
      started_at !== undefined
        ? new Date(started_at)
        : new Date(existing.started_at);


    if (
      Number.isNaN(
        resolvedStartedAt.getTime()
      )
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Invalid Started At"
      });

    }


    /* =====================
       CLOSED DATE VALIDATION

       A Breakdown cannot start after
       the time at which it was restored.
    ===================== */

    if (existing.closed_at) {

      const closedAt =
        new Date(existing.closed_at);


      if (
        resolvedStartedAt.getTime() >
        closedAt.getTime()
      ) {

        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Started At cannot be later than Restored At"
        });

      }

    }

    /* =====================
    VERIFIED DOWNTIME VALIDATION

    If a CLOSED Breakdown has an Admin
    verified downtime correction, editing
    Started At must not make:

    Verified DOWN Time
    >
    Incident Duration
  ===================== */

  if (
    existing.closed_at &&
    existing.verified_down_seconds !== null &&
    existing.verified_down_seconds !== undefined
  ) {

    const closedAt =
      new Date(existing.closed_at);

    const incidentSeconds =
      Math.floor(
        (
          closedAt.getTime() -
          resolvedStartedAt.getTime()
        ) / 1000
      );

    const verifiedDownSeconds =
      Number(
        existing.verified_down_seconds
      );


    if (
      Number.isFinite(verifiedDownSeconds) &&
      verifiedDownSeconds > incidentSeconds
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Started At cannot make Incident Duration shorter than Verified DOWN Time"
      });

    }

  }

    /* =====================
       MACHINE STATE VALIDATION

       We do NOT automatically rewrite existing
       Machine State history when Started At changes.

       Therefore the Breakdown cannot be moved
       after its earliest recorded Machine State.
    ===================== */

    const stateResult =
      await client.query(
        `
        SELECT MIN(started_at) AS first_state_started_at
        FROM breakdown_state_history
        WHERE breakdown_id = $1
        `,
        [breakdownId]
      );


    const firstStateStartedAt =
      stateResult.rows[0]
        ?.first_state_started_at;


    if (firstStateStartedAt) {

      const firstStateDate =
        new Date(firstStateStartedAt);


      if (
        resolvedStartedAt.getTime() >
        firstStateDate.getTime()
      ) {

        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Started At cannot be later than the first recorded Machine State"
        });

      }

    }


    /* =====================
       UPDATE BREAKDOWN
    ===================== */

    const result =
      await client.query(
        `
        UPDATE breakdowns

        SET
          title = $1,
          description = $2,
          started_at = $3,
          reported_by = $4,
          reported_by_id = $5,
          failure_cause = $6,
          root_cause = $7,
          corrective_action = $8,
          updated_at = NOW()

        WHERE id = $9

        RETURNING *
        `,
        [

          title !== undefined
            ? String(title).trim()
            : existing.title,

          description !== undefined
            ? String(description || "").trim() || null
            : existing.description,

          resolvedStartedAt,

          reported_by !== undefined
            ? String(reported_by || "").trim() || null
            : existing.reported_by,

          reported_by_id !== undefined
            ? reported_by_id || null
            : existing.reported_by_id,

          failure_cause !== undefined
            ? String(failure_cause || "").trim() || null
            : existing.failure_cause,

          root_cause !== undefined
            ? String(root_cause || "").trim() || null
            : existing.root_cause,

          corrective_action !== undefined
            ? String(corrective_action || "").trim() || null
            : existing.corrective_action,

          breakdownId
        ]
      );


    await client.query("COMMIT");


    /* =====================
       RESPONSE
    ===================== */

    return res.json({

      message:
        "Breakdown updated successfully",

      breakdown:
        result.rows[0]

    });


  } catch (err) {

    try {
      await client.query("ROLLBACK");
    } catch (_) {}


    console.error(
      "PATCH /breakdowns/:id error:",
      err
    );


    return res.status(500).json({
      error: "Failed to update breakdown"
    });


  } finally {

    client.release();

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
   REOPEN BREAKDOWN

   CLOSED → IN_PROGRESS
   Admin only

   IMPORTANT:
   - closed_at becomes NULL
   - verified downtime correction is cleared
   - correction audit fields are cleared
   - no Machine State is created automatically
   - previous Machine State history remains unchanged
   - Restoration Tasks / Executions remain unchanged
   - diagnosis fields remain unchanged
   - technician must manually select the current Machine State
========================================================= */

app.patch("/breakdowns/:id/reopen", async (req, res) => {
   /* =====================
       ADMIN ONLY
    ===================== */

    const role =
      req.headers["x-cmms-role"];

    if (role !== "admin") {

      return res.status(403).json({
        error: "Admin only"
      });

    }

    const breakdownId =
      Number(req.params.id);


    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {

      return res.status(400).json({
        error: "Invalid Breakdown ID"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         LOCK BREAKDOWN
      ===================== */

      const breakdownResult =
        await client.query(
          `
          SELECT *
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
         ONLY CLOSED CAN REOPEN
      ===================== */

      if (
        String(
          breakdown.status
        ).toUpperCase() !== "CLOSED"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Only CLOSED Breakdowns can be reopened"
        });

      }


      /* =====================
         SAFETY CHECK

         There should be no active Machine State
         on a CLOSED Breakdown.

         We do not create a new state here.
      ===================== */

      const activeStateResult =
        await client.query(
          `
          SELECT id, state
          FROM breakdown_state_history
          WHERE breakdown_id = $1
            AND ended_at IS NULL
          LIMIT 1
          `,
          [breakdownId]
        );


      if (
        activeStateResult.rows.length > 0
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Cannot reopen Breakdown while an active Machine State exists"
        });

      }


      /* =====================
         REOPEN BREAKDOWN
      ===================== */

      const updateResult =
        await client.query(
          `
          UPDATE breakdowns
          SET
            status = 'IN_PROGRESS',
            closed_at = NULL,

            /* Previous verification belongs
              to the previous closed incident window */
            verified_down_seconds = NULL,
            downtime_correction_reason = NULL,
            downtime_corrected_by = NULL,
            downtime_corrected_by_id = NULL,
            downtime_corrected_at = NULL,

            updated_at = NOW()

          WHERE id = $1

          RETURNING *
          `,
          [breakdownId]
        );

      await client.query("COMMIT");


      return res.json({
        message:
          "Breakdown reopened successfully",
        breakdown:
          updateResult.rows[0],
        machine_state:
          null
      });


    } catch (err) {

      await client.query("ROLLBACK");


      console.error(
        "REOPEN BREAKDOWN ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to reopen Breakdown"
      });


    } finally {

      client.release();

    }

  
});

// ============================================================
// PATCH /breakdowns/:id/verified-downtime
// Admin-only correction / verification of effective DOWN time
// ============================================================
app.patch("/breakdowns/:id/verified-downtime", async (req, res) => {
  const client = await pool.connect();

  try {
    const breakdownId = Number(req.params.id);

    if (!Number.isInteger(breakdownId) || breakdownId <= 0) {
      return res.status(400).json({
        error: "Invalid breakdown id"
      });
    }

    // --------------------------------------------------------
    // ADMIN ONLY
    // --------------------------------------------------------
    const role = req.headers["x-cmms-role"];

    if (role !== "admin") {
      return res.status(403).json({
        error: "Admin only"
      });
    }

    const {
      verified_down_seconds,
      downtime_correction_reason,
      downtime_corrected_by,
      downtime_corrected_by_id
    } = req.body;

    // --------------------------------------------------------
    // Validation
    //
    // null means: remove correction and return to recorded DOWN
    // --------------------------------------------------------
    const isClearing =
      verified_down_seconds === null ||
      verified_down_seconds === undefined ||
      verified_down_seconds === "";

    let verifiedSeconds = null;

    if (!isClearing) {
      verifiedSeconds = Number(verified_down_seconds);

      if (
        !Number.isFinite(verifiedSeconds) ||
        verifiedSeconds < 0
      ) {
        return res.status(400).json({
          error: "Verified DOWN time must be zero or greater"
        });
      }

      verifiedSeconds = Math.round(verifiedSeconds);
    }

    await client.query("BEGIN");

    // --------------------------------------------------------
    // Lock Breakdown row
    // --------------------------------------------------------
    const breakdownResult = await client.query(
      `
      SELECT *
      FROM breakdowns
      WHERE id = $1
      FOR UPDATE
      `,
      [breakdownId]
    );

    if (breakdownResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Breakdown not found"
      });
    }

    // --------------------------------------------------------
    // Optional safety rule:
    // verified downtime should not exceed incident duration
    // for CLOSED breakdowns.
    //
    // We do not apply this to OPEN / IN_PROGRESS because
    // incident duration is still increasing.
    // --------------------------------------------------------
    const breakdown = breakdownResult.rows[0];

    if (
      breakdown.status === "CLOSED" &&
      breakdown.closed_at &&
      verifiedSeconds !== null
    ) {
      const startedAt = new Date(breakdown.started_at);
      const closedAt = new Date(breakdown.closed_at);

      const incidentSeconds = Math.floor(
        (closedAt.getTime() - startedAt.getTime()) / 1000
      );

      if (verifiedSeconds > incidentSeconds) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Verified DOWN time cannot exceed incident duration"
        });
      }
    }

    // --------------------------------------------------------
    // CLEAR correction
    // --------------------------------------------------------
    if (verifiedSeconds === null) {
      const result = await client.query(
        `
        UPDATE breakdowns
        SET
          verified_down_seconds = NULL,
          downtime_correction_reason = NULL,
          downtime_corrected_by = NULL,
          downtime_corrected_by_id = NULL,
          downtime_corrected_at = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [breakdownId]
      );

      await client.query("COMMIT");

      return res.json({
        ...result.rows[0],
        downtime_mode: "RECORDED"
      });
    }

    // --------------------------------------------------------
    // SET / UPDATE verified downtime
    // --------------------------------------------------------
    const result = await client.query(
      `
      UPDATE breakdowns
      SET
        verified_down_seconds = $1,
        downtime_correction_reason = $2,
        downtime_corrected_by = $3,
        downtime_corrected_by_id = $4,
        downtime_corrected_at = NOW(),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [
        verifiedSeconds,
        downtime_correction_reason || null,
        downtime_corrected_by || null,
        downtime_corrected_by_id
          ? Number(downtime_corrected_by_id)
          : null,
        breakdownId
      ]
    );

    await client.query("COMMIT");

    return res.json({
      ...result.rows[0],
      downtime_mode: "VERIFIED"
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error(
      "PATCH /breakdowns/:id/verified-downtime error:",
      err
    );

    return res.status(500).json({
      error: "Failed to update verified downtime"
    });
  } finally {
    client.release();
  }
});

// ============================================================
// PATCH /breakdowns/:breakdownId/tasks/:taskId
//
// Edit an OPEN Restoration Task.
//
// Allowed:
// - task
// - section
// - unit
// - due_date
// - duration_min (estimated duration)
// - notes
//
// Rules:
// - Task must belong to this Breakdown
// - Task must be a Restoration Task
// - Task must not be soft-deleted
// - Completed / Done tasks cannot be edited
// - Existing open follow-up tasks CAN be edited even when
//   the parent Breakdown is already CLOSED
// ============================================================

app.patch('/breakdowns/:breakdownId/tasks/:taskId', async (req, res) => {

    try {

      const breakdownId =
        Number(req.params.breakdownId);

      const taskId =
        Number(req.params.taskId);


      /* =====================
         VALIDATE IDs
      ===================== */

      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0 ||
        !Number.isInteger(taskId) ||
        taskId <= 0
      ) {

        return res.status(400).json({
          error: 'Invalid Breakdown or Task id'
        });

      }


      /* =====================
         INPUT
      ===================== */

      const {
        task,
        section,
        unit,
        due_date,
        duration_min,
        notes
      } = req.body;


      const resolvedTask =
        String(task || '').trim();

      const resolvedSection =
        String(section || '').trim();

      const resolvedUnit =
        String(unit || '').trim();


      /* =====================
         REQUIRED FIELDS
      ===================== */

      if (!resolvedTask) {

        return res.status(400).json({
          error: 'Task is required'
        });

      }


      if (!resolvedSection) {

        return res.status(400).json({
          error: 'Section is required'
        });

      }


      if (!resolvedUnit) {

        return res.status(400).json({
          error: 'Unit is required'
        });

      }


      /* =====================
         ESTIMATED DURATION
      ===================== */

      let resolvedDuration = null;


      if (
        duration_min !== undefined &&
        duration_min !== null &&
        duration_min !== ''
      ) {

        resolvedDuration =
          Number(duration_min);


        if (
          !Number.isFinite(resolvedDuration) ||
          resolvedDuration < 0
        ) {

          return res.status(400).json({
            error: 'Invalid estimated duration'
          });

        }

      }


      /* =====================
         FIND RESTORATION TASK
      ===================== */

      const taskResult =
        await pool.query(
          `
          SELECT
              id,
              breakdown_id,
              type,
              status,
              deleted_at
          FROM maintenance_tasks
          WHERE id = $1
            AND breakdown_id = $2
          LIMIT 1
          `,
          [
            taskId,
            breakdownId
          ]
        );


      if (taskResult.rows.length === 0) {

        return res.status(404).json({
          error: 'Restoration Task not found'
        });

      }


      const existingTask =
        taskResult.rows[0];


      /* =====================
         SOFT-DELETED GUARD
      ===================== */

      if (existingTask.deleted_at) {

        return res.status(409).json({
          error: 'Deleted Restoration Task cannot be edited'
        });

      }


      /* =====================
         RESTORATION TYPE GUARD
      ===================== */

      if (
        String(existingTask.type || '')
          .toLowerCase() !== 'restoration'
      ) {

        return res.status(409).json({
          error: 'Task is not a Restoration Task'
        });

      }


      /* =====================
         COMPLETED TASK GUARD
      ===================== */

      if (
        String(existingTask.status || '')
          .toUpperCase() === 'DONE'
      ) {

        return res.status(409).json({
          error: 'Completed Restoration Task cannot be edited'
        });

      }


      /* =====================
         EXECUTION GUARD

         Extra protection:
         even if status is inconsistent,
         a Task with an execution record
         must not be edited.
      ===================== */

      const executionResult =
        await pool.query(
          `
          SELECT id
          FROM task_executions
          WHERE task_id = $1
          LIMIT 1
          `,
          [taskId]
        );


      if (executionResult.rows.length > 0) {

        return res.status(409).json({
          error: 'Executed Restoration Task cannot be edited. Undo the execution first.'
        });

      }


      /* =====================
         UPDATE TASK
      ===================== */

      const updateResult =
        await pool.query(
          `
          UPDATE maintenance_tasks
          SET
              task = $1,
              section = $2,
              unit = $3,
              due_date = $4,
              duration_min = $5,
              notes = $6,
              updated_at = NOW()
          WHERE id = $7
            AND breakdown_id = $8
            AND deleted_at IS NULL
          RETURNING *
          `,
          [
            resolvedTask,
            resolvedSection,
            resolvedUnit,
            due_date || null,
            resolvedDuration,
            notes !== undefined
              ? String(notes || '').trim()
              : null,
            taskId,
            breakdownId
          ]
        );


      return res.json({
        message: 'Restoration Task updated successfully',
        task: updateResult.rows[0]
      });

    }

    catch (err) {

      console.error(
        'PATCH /breakdowns/:breakdownId/tasks/:taskId error:',
        err
      );


      return res.status(500).json({
        error: 'Failed to update Restoration Task'
      });

    }

  }
);

// ============================================================
// DELETE /breakdowns/:breakdownId/tasks/:taskId
//
// Soft-delete an OPEN Restoration Task.
//
// Rules:
// - Task must belong to this Breakdown
// - Task must be a Restoration Task
// - Task must not already be deleted
// - Completed / executed tasks cannot be deleted
// - Open follow-up tasks CAN be deleted even if
//   the parent Breakdown is already CLOSED
// ============================================================

app.delete('/breakdowns/:breakdownId/tasks/:taskId', async (req, res) => {

    try {

      const breakdownId =
        Number(req.params.breakdownId);

      const taskId =
        Number(req.params.taskId);


      /* =====================
         VALIDATE IDs
      ===================== */

      if (
        !Number.isInteger(breakdownId) ||
        breakdownId <= 0 ||
        !Number.isInteger(taskId) ||
        taskId <= 0
      ) {

        return res.status(400).json({
          error: 'Invalid Breakdown or Task id'
        });

      }


      /* =====================
         FIND TASK
      ===================== */

      const taskResult =
        await pool.query(
          `
          SELECT
              id,
              breakdown_id,
              type,
              status,
              deleted_at
          FROM maintenance_tasks
          WHERE id = $1
            AND breakdown_id = $2
          LIMIT 1
          `,
          [
            taskId,
            breakdownId
          ]
        );


      if (taskResult.rows.length === 0) {

        return res.status(404).json({
          error: 'Restoration Task not found'
        });

      }


      const existingTask =
        taskResult.rows[0];


      /* =====================
         ALREADY DELETED
      ===================== */

      if (existingTask.deleted_at) {

        return res.status(409).json({
          error: 'Restoration Task is already deleted'
        });

      }


      /* =====================
         RESTORATION TYPE GUARD
      ===================== */

      if (
        String(existingTask.type || '')
          .toLowerCase() !== 'restoration'
      ) {

        return res.status(409).json({
          error: 'Task is not a Restoration Task'
        });

      }


      /* =====================
         COMPLETED TASK GUARD
      ===================== */

      if (
        String(existingTask.status || '')
          .toUpperCase() === 'DONE'
      ) {

        return res.status(409).json({
          error: 'Completed Restoration Task cannot be deleted'
        });

      }


      /* =====================
         EXECUTION GUARD
      ===================== */

      const executionResult =
        await pool.query(
          `
          SELECT id
          FROM task_executions
          WHERE task_id = $1
          LIMIT 1
          `,
          [taskId]
        );


      if (executionResult.rows.length > 0) {

        return res.status(409).json({
          error: 'Executed Restoration Task cannot be deleted. Undo the execution first.'
        });

      }


      /* =====================
         SOFT DELETE
      ===================== */

      const deleteResult =
        await pool.query(
          `
          UPDATE maintenance_tasks
          SET
              deleted_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND breakdown_id = $2
            AND deleted_at IS NULL
          RETURNING *
          `,
          [
            taskId,
            breakdownId
          ]
        );


      if (deleteResult.rows.length === 0) {

        return res.status(409).json({
          error: 'Restoration Task could not be deleted'
        });

      }


      return res.json({
        message: 'Restoration Task deleted successfully',
        task: deleteResult.rows[0]
      });

    }

    catch (err) {

      console.error(
        'DELETE /breakdowns/:breakdownId/tasks/:taskId error:',
        err
      );


      return res.status(500).json({
        error: 'Failed to delete Restoration Task'
      });

    }

  }
);

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
   CREATE + COMPLETE CORRECTIVE TASK
   POST /breakdowns/:id/completed-task

   Creates a new completed corrective / Restoration task
   directly inside an IN_PROGRESS Breakdown.

   Available to ALL users.

   RULES:
   - Breakdown must be IN_PROGRESS.
   - Task belongs to Breakdown asset.
   - type = Restoration
   - status = Done
   - frequency_hours = 0
   - due_date = NULL
   - prev_due_date = NULL
   - Actual completion >= Breakdown started_at
   - Actual completion <= NOW
   - Creates task + execution in one transaction.

   IMPORTANT:
   - Does NOT close the Breakdown.
   - Does NOT modify machine state.
   - Does NOT modify diagnosis fields.
========================================================= */

app.post("/breakdowns/:id/completed-task", async (req, res) => {

    const breakdownId =
      Number(req.params.id);

    const {
      task,
      section,
      unit,
      technician_id,
      executed_at,
      actual_duration_min,
      notes,
      impact
    } = req.body || {};


    /* =====================
       VALIDATE BREAKDOWN ID
    ===================== */

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid Breakdown ID"
      });
    }


    /* =====================
       VALIDATE TASK
    ===================== */

    const taskName =
      String(task || "").trim();

    if (!taskName) {
      return res.status(400).json({
        error: "Corrective Task is required"
      });
    }


    /* =====================
       VALIDATE IMPACT
    ===================== */

    const resolvedImpact =
      String(impact || "normal")
        .trim()
        .toLowerCase();

    const validImpacts = [
      "normal",
      "safety",
      "quality",
      "safety_quality"
    ];

    if (
      !validImpacts.includes(
        resolvedImpact
      )
    ) {
      return res.status(400).json({
        error: "Invalid Task Impact"
      });
    }


    /* =====================
       VALIDATE TECHNICIAN
    ===================== */

    const technicianId =
      Number(technician_id);

    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {
      return res.status(400).json({
        error: "Technician is required"
      });
    }


    /* =====================
       VALIDATE EXECUTION TIME
    ===================== */

    if (!executed_at) {
      return res.status(400).json({
        error:
          "Actual completion time is required"
      });
    }

    const executedAt =
      new Date(executed_at);

    if (
      Number.isNaN(
        executedAt.getTime()
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid actual completion time"
      });
    }

    if (
      executedAt.getTime() >
      Date.now()
    ) {
      return res.status(400).json({
        error:
          "Actual completion time cannot be in the future"
      });
    }


    /* =====================
       VALIDATE ACTUAL DURATION
    ===================== */

    if (
      actual_duration_min === null ||
      actual_duration_min === undefined ||
      actual_duration_min === ""
    ) {
      return res.status(400).json({
        error:
          "Actual Duration is required"
      });
    }

    const actualDuration =
      Number(actual_duration_min);

    if (
      !Number.isInteger(actualDuration) ||
      actualDuration < 0
    ) {
      return res.status(400).json({
        error:
          "Actual Duration must be a non-negative integer"
      });
    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         LOAD + LOCK BREAKDOWN
      ===================== */

      const breakdownResult =
        await client.query(
          `
            SELECT
              id,
              asset_id,
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
        !breakdownResult.rows.length
      ) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Breakdown not found"
        });
      }


      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         IN_PROGRESS BREAKDOWN GUARD
      ===================== */

      if (
        String(
          breakdown.status || ""
        )
          .trim()
          .toUpperCase() !==
        "IN_PROGRESS"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Completed Corrective Task can only be added to an IN_PROGRESS Breakdown"
        });
      }


      /* =====================
         BREAKDOWN START GUARD
      ===================== */

      if (!breakdown.started_at) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Breakdown has no start time"
        });
      }


      const startedAt =
        new Date(
          breakdown.started_at
        );


      if (
        executedAt < startedAt
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Actual completion time cannot be earlier than Breakdown start"
        });
      }


      /* =====================
         VERIFY TECHNICIAN
      ===================== */

      const technicianResult =
        await client.query(
          `
            SELECT
              id,
              name
            FROM technicians
            WHERE id = $1
              AND active = true
            LIMIT 1
          `,
          [technicianId]
        );


      if (
        !technicianResult.rows.length
      ) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Active Technician not found"
        });
      }


      const technician =
        technicianResult.rows[0];


      /* =====================
         CREATE COMPLETED TASK
      ===================== */

      const taskResult =
        await client.query(
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
              breakdown_id,
              scheduled_maintenance_id,
              completed_by,
              completed_at
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              'Restoration',
              $5,
              'Done',
              NULL,
              0,
              NULL,
              $6,
              true,
              $7,
              NULL,
              $8,
              $9
            )

            RETURNING *
          `,
          [
            breakdown.asset_id,
            taskName,

            String(
              section || ""
            ).trim() || null,

            String(
              unit || ""
            ).trim() || null,

            resolvedImpact,

            String(
              notes || ""
            ).trim() || null,

            breakdownId,

            technician.name,

            executedAt
          ]
        );


      const completedTask =
        taskResult.rows[0];


      /* =====================
         CREATE EXECUTION
      ===================== */

      const executionResult =
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

            VALUES (
              $1,
              $2,
              $3,
              $4,
              NULL,
              $5,
              $6,
              $7
            )

            RETURNING *
          `,
          [
            completedTask.id,
            breakdown.asset_id,
            technician.name,
            technician.id,
            executedAt,
            actualDuration,

            String(
              notes || ""
            ).trim() || null
          ]
        );


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      return res.status(201).json({

        success: true,

        message:
          "Completed Corrective Task recorded successfully",

        breakdown_id:
          breakdownId,

        task:
          completedTask,

        execution:
          executionResult.rows[0]

      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}


      console.error(
        "COMPLETED BREAKDOWN TASK ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to record completed Corrective Task"
      });


    } finally {

      client.release();

    }

  }
);

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

      e.executed_at AS completed_at,
      e.executed_by AS completed_by,
      e.duration_minutes AS actual_duration_min,

      COALESCE(
        att.attachment_count,
        0
      ) AS attachment_count,

      a.model AS asset_model,
      a.serial_number AS asset_serial,
      a.line_id,

      l.name AS line_name

    FROM maintenance_tasks t

    JOIN assets a
      ON a.id = t.asset_id

    LEFT JOIN lines l
      ON l.id = a.line_id

    LEFT JOIN LATERAL (

      SELECT
        te.executed_at,
        te.executed_by,
        te.duration_minutes

      FROM task_executions te

      WHERE te.task_id = t.id

      ORDER BY
        te.executed_at DESC,
        te.id DESC

      LIMIT 1

    ) e ON TRUE

    LEFT JOIN LATERAL (

      SELECT
        COUNT(*)::int AS attachment_count

      FROM attachments

      WHERE
        entity_type = 'TASK'
        AND entity_id = t.id

    ) att ON TRUE

      WHERE t.breakdown_id = $1
      AND t.deleted_at IS NULL

      ORDER BY
        CASE
          WHEN UPPER(TRIM(COALESCE(t.status, ''))) = 'OVERDUE'
            THEN 1

          WHEN UPPER(TRIM(COALESCE(t.status, ''))) = 'PLANNED'
            THEN 2

          WHEN UPPER(TRIM(COALESCE(t.status, ''))) = 'DONE'
            THEN 3

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

/* =========================================================
   LINK EXISTING COMPLETED TASK
   POST /breakdowns/:id/link-existing-task

   Admin-only retrospective assignment of an existing
   completed maintenance task to a CLOSED Breakdown.

   The selected task must:
   - Belong to the same asset as the Breakdown.
   - Not be linked to another Breakdown.
   - Not be soft-deleted.
   - Be completed and belong to the planned-task model.
   - Not be Preventive or recurring.
   - Have exactly ONE execution.
   - Have its actual execution completion time within
     the Breakdown started_at → closed_at window.

   IMPORTANT:
   - Validates eligibility again at the time of linking.
   - Updates only the task's breakdown_id and updated_at.
   - Does NOT create another task or execution.
   - Does NOT modify task completion details or duration.
   - Does NOT reopen the Breakdown.
   - Does NOT modify Breakdown status, diagnosis or downtime.
   - Does NOT modify Machine State history.
   - Existing task completion and Undo routes remain unchanged.
========================================================= */

app.post("/breakdowns/:id/link-existing-task", async (req, res) => {

    /* =====================
       ADMIN CHECK
    ===================== */

    const role =
      String(
        req.headers["x-cmms-role"] || ""
      ).trim().toLowerCase();

    if (role !== "admin") {
      return res.status(403).json({
        error: "Admin only"
      });
    }


    /* =====================
       VALIDATE IDs
    ===================== */

    const breakdownId =
      Number(req.params.id);

    const taskId =
      Number(req.body?.task_id);

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0 ||
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid Breakdown or Task ID"
      });
    }


    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");


      /* =====================
         LOAD + LOCK BREAKDOWN
      ===================== */

      const breakdownResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            status,
            started_at,
            closed_at
          FROM breakdowns
          WHERE id = $1
          FOR UPDATE
          `,
          [breakdownId]
        );

      if (!breakdownResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Breakdown not found"
        });
      }

      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         CLOSED BREAKDOWN GUARD
      ===================== */

      if (
        String(
          breakdown.status || ""
        ).toUpperCase() !== "CLOSED" ||
        !breakdown.closed_at
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Task assignment requires a CLOSED Breakdown"
        });
      }


      /* =====================
         LOAD + LOCK TASK
      ===================== */

      const taskResult =
        await client.query(
          `
          SELECT *
          FROM maintenance_tasks
          WHERE id = $1
          FOR UPDATE
          `,
          [taskId]
        );

      if (!taskResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Task not found"
        });
      }

      const task =
        taskResult.rows[0];


      /* =====================
         TASK ELIGIBILITY

         Match the rules used by the
         assignable-tasks candidate endpoint.
      ===================== */

      const isEligibleTask =
        Number(task.asset_id) ===
          Number(breakdown.asset_id) &&

        task.breakdown_id == null &&

        task.deleted_at == null &&

        String(
          task.status || ""
        ).toLowerCase() === "done" &&

        task.is_planned === true &&

        Number(
          task.frequency_hours ?? 0
        ) === 0 &&

        !String(
          task.type || ""
        ).toLowerCase().startsWith(
          "preventive"
        );

      if (!isEligibleTask) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Task is not eligible for this Breakdown"
        });
      }


      /* =====================
         VERIFY EXECUTION

         Exactly ONE execution is required.

         Use the actual execution timestamp,
         not task.created_at or task.due_date.
      ===================== */

      const executionResult =
        await client.query(
          `
          SELECT
            id,
            executed_at
          FROM task_executions
          WHERE task_id = $1
          ORDER BY id
          `,
          [taskId]
        );

      if (executionResult.rows.length !== 1) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Task must have exactly one execution"
        });
      }

      const executedAt =
        new Date(
          executionResult.rows[0].executed_at
        ).getTime();

      const startedAt =
        new Date(
          breakdown.started_at
        ).getTime();

      const closedAt =
        new Date(
          breakdown.closed_at
        ).getTime();


      /* =====================
         INCIDENT WINDOW VALIDATION

         Actual execution completion must
         belong to the Breakdown period.

         Historical data entry may happen
         later; created_at is not restricted.
      ===================== */

      if (
        !Number.isFinite(executedAt) ||
        !Number.isFinite(startedAt) ||
        !Number.isFinite(closedAt) ||
        executedAt < startedAt ||
        executedAt > closedAt
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Task execution time is outside the Breakdown period"
        });
      }

      /* =====================
        LINK EXISTING TASK

        The selected completed task becomes
        Restoration work for this Breakdown.

        Update:
        - breakdown_id = selected Breakdown
        - type = Restoration

        Preserve:
        - Original task description
        - Completed status
        - Technician
        - Completion date/time
        - Actual execution duration
        - Existing execution history

        IMPORTANT:
        - Does NOT reopen the Breakdown.
        - Does NOT modify Breakdown downtime.
        - Does NOT create another execution.
      ===================== */

      const linkResult =
        await client.query(
          `
          UPDATE maintenance_tasks
          SET
            breakdown_id = $1,
            type = 'Restoration',
            updated_at = NOW()
          WHERE id = $2
            AND breakdown_id IS NULL
          RETURNING *
          `,
          [
            breakdownId,
            taskId
          ]
        );

      if (!linkResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Task is no longer available for assignment"
        });
      }


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        success: true,

        message:
          "Existing task linked to Breakdown successfully",

        breakdown_id:
          breakdownId,

        task:
          linkResult.rows[0]

      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      console.error(
        "LINK EXISTING TASK ERROR:",
        err
      );

      return res.status(500).json({
        error:
          "Failed to link existing task"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   GET ASSIGNABLE EXISTING TASKS
   GET /breakdowns/:id/assignable-tasks

   Admin-only candidate list for linking existing
   completed maintenance work to a CLOSED Breakdown.

   A candidate task must:
   - Belong to the same asset as the Breakdown.
   - Be completed and not soft-deleted.
   - Have no existing breakdown_id.
   - Not be Preventive or recurring.
   - Belong to the planned-task completion model.
   - Have exactly ONE execution.
   - Have its REAL execution completion time within
     the Breakdown started_at → closed_at window.

   IMPORTANT:
   - Task created_at is NOT used for time validation.
   - The task may have been entered into CMMS later.
   - The Breakdown is NOT reopened or modified.
   - This endpoint only RETURNS eligible candidates.
   - All conditions must be checked again by the
     future assignment endpoint before linking.
========================================================= */

app.get("/breakdowns/:id/assignable-tasks", async (req, res) => {

    /* =====================
       ADMIN CHECK
    ===================== */

    const role =
      String(
        req.headers["x-cmms-role"] || ""
      )
        .trim()
        .toLowerCase();

    if (role !== "admin") {

      return res.status(403).json({
        error: "Admin only"
      });

    }


    /* =====================
       VALIDATE BREAKDOWN ID
    ===================== */

    const breakdownId =
      Number(req.params.id);

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {

      return res.status(400).json({
        error: "Invalid Breakdown ID"
      });

    }


    try {

      /* =====================
         LOAD BREAKDOWN
      ===================== */

      const breakdownResult =
        await pool.query(
          `
          SELECT
            id,
            asset_id,
            status,
            started_at,
            closed_at
          FROM breakdowns
          WHERE id = $1
          LIMIT 1
          `,
          [breakdownId]
        );

      if (!breakdownResult.rows.length) {

        return res.status(404).json({
          error: "Breakdown not found"
        });

      }

      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         CLOSED BREAKDOWN GUARD
      ===================== */

      if (
        String(
          breakdown.status || ""
        ).toUpperCase() !== "CLOSED" ||
        !breakdown.closed_at
      ) {

        return res.status(409).json({
          error:
            "Task assignment requires a CLOSED Breakdown"
        });

      }


      /* =====================================================
         LOAD ELIGIBLE EXISTING TASKS

         The execution timestamp, NOT the task creation
         timestamp, determines whether the actual work
         belongs to the Breakdown incident window.

         Exactly one execution is required to avoid
         linking an entire recurring execution history
         to a single Breakdown.
      ===================================================== */

      const result =
        await pool.query(
          `
          SELECT
            t.id,
            t.asset_id,
            t.task,
            t.section,
            t.unit,
            t.type,
            t.status,
            t.completed_by,
            t.completed_at,

            e.id AS execution_id,
            e.executed_by,
            e.technician_id,
            e.executed_at,
            e.duration_minutes

          FROM maintenance_tasks t

          JOIN task_executions e
            ON e.task_id = t.id

          WHERE t.asset_id = $1

            AND t.breakdown_id IS NULL

            AND t.deleted_at IS NULL

            AND LOWER(t.status) = 'done'

            AND t.is_planned IS TRUE

            AND COALESCE(
              t.frequency_hours,
              0
            ) = 0

            AND COALESCE(
              LOWER(t.type),
              ''
            ) NOT LIKE 'preventive%'

            AND e.executed_at >= $2::timestamptz

            AND e.executed_at <= $3::timestamptz

            AND NOT EXISTS (
              SELECT 1
              FROM task_executions e2
              WHERE e2.task_id = t.id
                AND e2.id <> e.id
            )

          ORDER BY
            e.executed_at DESC,
            t.id DESC
          `,
          [
            breakdown.asset_id,
            breakdown.started_at,
            breakdown.closed_at
          ]
        );


      /* =====================
         RESPONSE

         No database changes.
      ===================== */

      return res.json({

        breakdown_id:
          breakdown.id,

        asset_id:
          breakdown.asset_id,

        started_at:
          breakdown.started_at,

        closed_at:
          breakdown.closed_at,

        tasks:
          result.rows

      });


    } catch (err) {

      console.error(
        "GET /breakdowns/:id/assignable-tasks ERROR:",
        err
      );

      return res.status(500).json({
        error:
          "Failed to load assignable tasks"
      });

    }

  }
);

/* =========================================================
   CREATE NEW & COMPLETE HISTORICAL RESTORATION
   POST /breakdowns/:id/historical-restoration

   Admin-only retrospective recording of maintenance
   work that was performed during a CLOSED Breakdown
   but was not previously entered into CMMS.

   Creates, in ONE database transaction:
   - A completed maintenance task linked to the Breakdown.
   - Its actual historical task execution.

   RULES:
   - Breakdown must be CLOSED.
   - Task belongs to the Breakdown asset.
   - Task type = Restoration.
   - Task status = Done.
   - Actual completion time must be within the
     Breakdown started_at → closed_at interval.
   - Actual duration is stored in task_executions.

   IMPORTANT:
   - Does NOT reopen or update the Breakdown.
   - Does NOT change Machine State or downtime.
   - Does NOT modify existing tasks or executions.
   - Does NOT change normal Restoration or Undo flows.
========================================================= */

app.post("/breakdowns/:id/historical-restoration", async (req, res) => {

    /* =====================
       ADMIN CHECK
    ===================== */

    const role =
      String(
        req.headers["x-cmms-role"] || ""
      ).trim().toLowerCase();

    if (role !== "admin") {
      return res.status(403).json({
        error: "Admin only"
      });
    }


    /* =====================
       READ INPUT
    ===================== */

    const breakdownId =
      Number(req.params.id);

    const {
      task,
      section,
      unit,
      technician_id,
      executed_at,
      actual_duration_min,
      notes
    } = req.body || {};


    /* =====================
       VALIDATE REQUIRED VALUES
    ===================== */

    if (
      !Number.isInteger(breakdownId) ||
      breakdownId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid Breakdown ID"
      });
    }

    const taskName =
      String(task || "").trim();

    if (!taskName) {
      return res.status(400).json({
        error: "Restoration Task is required"
      });
    }

    const technicianId =
      Number(technician_id);

    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {
      return res.status(400).json({
        error: "Technician is required"
      });
    }


    /* =====================
       VALIDATE ACTUAL COMPLETION TIME

       The frontend sends an ISO timestamp
       representing the real local completion time.
    ===================== */

    if (!executed_at) {
      return res.status(400).json({
        error: "Actual completion time is required"
      });
    }

    const executedAt =
      new Date(executed_at);

    if (
      Number.isNaN(executedAt.getTime()) ||
      executedAt.getTime() > Date.now()
    ) {
      return res.status(400).json({
        error: "Invalid actual completion time"
      });
    }


    /* =====================
       VALIDATE ACTUAL DURATION
    ===================== */

    if (
      actual_duration_min === null ||
      actual_duration_min === undefined ||
      actual_duration_min === ""
    ) {
      return res.status(400).json({
        error: "Actual Duration is required"
      });
    }

    const actualDuration =
      Number(actual_duration_min);

    if (
      !Number.isInteger(actualDuration) ||
      actualDuration < 0
    ) {
      return res.status(400).json({
        error: "Actual Duration must be a non-negative integer"
      });
    }


    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");


      /* =====================
         LOAD + LOCK BREAKDOWN
      ===================== */

      const breakdownResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            status,
            started_at,
            closed_at
          FROM breakdowns
          WHERE id = $1
          FOR UPDATE
          `,
          [breakdownId]
        );

      if (!breakdownResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Breakdown not found"
        });
      }

      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         CLOSED BREAKDOWN GUARD
      ===================== */

      if (
        String(breakdown.status).toUpperCase() !== "CLOSED" ||
        !breakdown.closed_at
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error: "Historical Restoration requires a CLOSED Breakdown"
        });
      }


      /* =====================
         INCIDENT TIME WINDOW

         The actual completion time must fall
         within the original Breakdown period.

         The date when the Admin enters the
         record is NOT restricted.
      ===================== */

      const startedAt =
        new Date(breakdown.started_at);

      const closedAt =
        new Date(breakdown.closed_at);

      if (
        executedAt < startedAt ||
        executedAt > closedAt
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Actual completion time is outside the Breakdown period"
        });
      }


      /* =====================
         VERIFY TECHNICIAN

         Historical work may belong to a
         technician who is no longer active.
      ===================== */

      const technicianResult =
        await client.query(
          `
          SELECT id, name
          FROM technicians
          WHERE id = $1
          LIMIT 1
          `,
          [technicianId]
        );

      if (!technicianResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Technician not found"
        });
      }

      const technician =
        technicianResult.rows[0];


      /* =====================
         CREATE COMPLETED RESTORATION TASK

         The work has already been performed.

         No Planned task is left behind.
         No estimated duration is invented.
      ===================== */

      const taskResult =
        await client.query(
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
            breakdown_id,
            completed_by,
            completed_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'Restoration',
            'normal',
            'Done',
            NULL,
            0,
            NULL,
            $5,
            true,
            $6,
            $7,
            $8
          )
          RETURNING *
          `,
          [
            breakdown.asset_id,
            taskName,
            String(section || "").trim() || null,
            String(unit || "").trim() || null,
            String(notes || "").trim() || null,
            breakdownId,
            technician.name,
            executedAt
          ]
        );

      const restorationTask =
        taskResult.rows[0];


      /* =====================
         RECORD ACTUAL EXECUTION

         Preserve the real historical
         completion time and service duration.
      ===================== */

      const executionResult =
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
          VALUES (
            $1, $2, $3, $4,
            NULL, $5, $6, $7
          )
          RETURNING *
          `,
          [
            restorationTask.id,
            breakdown.asset_id,
            technician.name,
            technician.id,
            executedAt,
            actualDuration,
            String(notes || "").trim() || null
          ]
        );


      /* =====================
         COMMIT BOTH RECORDS
      ===================== */

      await client.query("COMMIT");

      return res.status(201).json({

        success: true,

        message:
          "Historical Restoration recorded successfully",

        breakdown_id:
          breakdownId,

        task:
          restorationTask,

        execution:
          executionResult.rows[0]

      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      console.error(
        "HISTORICAL RESTORATION ERROR:",
        err
      );

      return res.status(500).json({
        error: "Failed to record Historical Restoration"
      });

    } finally {

      client.release();

    }

  }
);

/* =========================================================
   DELETE BREAKDOWN — ADMIN ONLY
   DELETE /breakdowns/:id

   HARD DELETE for WRONG / ACCIDENTAL BD ENTRY ONLY.

   Deletes:
   1. task_executions linked to Breakdown tasks
   2. ALL maintenance_tasks linked to Breakdown
   3. Breakdown itself

   breakdown_state_history is removed automatically
   by FK ON DELETE CASCADE.

   IMPORTANT:
   - Historical data is permanently changed
   - Open AND completed Restoration Tasks are deleted
   - This action cannot be undone
========================================================= */

app.delete("/breakdowns/:id", requireAdmin, async (req, res) => {

    const client =
      await pool.connect();


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
          error:
            "Invalid breakdown id"
        });

      }


      await client.query("BEGIN");


      /* =====================
         LOCK + VERIFY BD
      ===================== */

      const breakdownResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            status,
            started_at
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
          error:
            "Breakdown not found"
        });

      }


      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         DELETE EXECUTIONS

         Only executions belonging
         to tasks linked to this BD.
      ===================== */

      const executionsResult =
        await client.query(
          `
          DELETE FROM task_executions

          WHERE task_id IN (

            SELECT id

            FROM maintenance_tasks

            WHERE breakdown_id = $1

          )

          RETURNING id
          `,
          [breakdownId]
        );


      /* =====================
         DELETE ALL BD TASKS

         Includes:
         - Planned/open
         - Done
         - Deleted/soft-deleted

         Relationship is strictly:
         breakdown_id = requested BD
      ===================== */

      const tasksResult =
        await client.query(
          `
          DELETE FROM maintenance_tasks

          WHERE breakdown_id = $1

          RETURNING id
          `,
          [breakdownId]
        );


      /* =====================
         DELETE BREAKDOWN

         breakdown_state_history
         will CASCADE automatically.
      ===================== */

      const deleteBreakdownResult =
        await client.query(
          `
          DELETE FROM breakdowns

          WHERE id = $1

          RETURNING id
          `,
          [breakdownId]
        );


      if (
        deleteBreakdownResult.rowCount !== 1
      ) {

        throw new Error(
          "Breakdown could not be deleted"
        );

      }


      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        success: true,

        breakdown_id:
          breakdownId,

        deleted: {

          breakdowns: 1,

          tasks:
            tasksResult.rowCount,

          executions:
            executionsResult.rowCount

        },

        breakdown: {

          id:
            breakdown.id,

          asset_id:
            breakdown.asset_id,

          status:
            breakdown.status

        }

      });


    } catch (err) {

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "DELETE /breakdowns/:id error:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to permanently delete Breakdown"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   GET SCHEDULED MAINTENANCE

   Returns Scheduled Maintenance incidents.

   READ-ONLY:
   - Uses the independent scheduled_maintenance table.
   - Includes Asset and Line information.
   - Does NOT read or modify Breakdown records.
   - Does NOT calculate Breakdown downtime.
   - Does NOT create or modify Tasks.
========================================================= */

app.get("/scheduled-maintenance", async (req, res) => {

  try {

    const result = await pool.query(
      `
      SELECT
        sm.id,
        sm.asset_id,
        sm.title,
        sm.description,
        sm.status,

        sm.scheduled_start_at,
        sm.scheduled_end_at,

        sm.actual_started_at,
        sm.actual_closed_at,

        sm.created_at,
        sm.updated_at,

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name

      FROM scheduled_maintenance sm

      JOIN assets a
        ON a.id = sm.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      ORDER BY
        CASE sm.status
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'PLANNED' THEN 2
          WHEN 'CLOSED' THEN 3
          ELSE 4
        END,

        sm.scheduled_start_at ASC NULLS LAST,

        sm.id DESC
      `
    );

    return res.json(
      result.rows
    );

  } catch (err) {

    console.error(
      "GET /scheduled-maintenance error:",
      err
    );

    return res.status(500).json({
      error:
        "Failed to load Scheduled Maintenance"
    });

  }

});

/* =========================================================
   GET SCHEDULED MAINTENANCE DETAIL
   GET /scheduled-maintenance/:id

   READ-ONLY:
   - Loads one Scheduled Maintenance incident.
   - Includes its Asset and Line information.
   - Does NOT load or modify Breakdown records.
   - Does NOT create or modify Tasks.
   - Does NOT calculate downtime.
========================================================= */

app.get("/scheduled-maintenance/:id", async (req, res) => {

  try {

    /* =====================
       VALIDATE SM ID
    ===================== */

    const smId = Number(req.params.id);

    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid Scheduled Maintenance ID"
      });
    }


    /* =====================
       LOAD SM DETAIL
    ===================== */

    const result = await pool.query(
      `
      SELECT
        sm.id,
        sm.asset_id,
        sm.title,
        sm.description,
        sm.status,

        sm.scheduled_start_at,
        sm.scheduled_end_at,

        sm.actual_started_at,
        sm.actual_closed_at,

        sm.created_at,
        sm.updated_at,

        a.model AS asset_model,
        a.serial_number AS asset_serial,
        a.line_id,

        l.name AS line_name

      FROM scheduled_maintenance sm

      JOIN assets a
        ON a.id = sm.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      WHERE sm.id = $1

      LIMIT 1
      `,
      [smId]
    );


    /* =====================
       NOT FOUND
    ===================== */

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Scheduled Maintenance not found"
      });
    }


    /* =====================
       RESPONSE
    ===================== */

    return res.json({
      scheduled_maintenance: result.rows[0]
    });


  } catch (err) {

    console.error(
      "GET /scheduled-maintenance/:id error:",
      err
    );

    return res.status(500).json({
      error: "Failed to load Scheduled Maintenance detail"
    });

  }

});

/* =========================================================
   CREATE SCHEDULED MAINTENANCE
   POST /scheduled-maintenance

   Creates the central Scheduled Maintenance incident.

   IMPORTANT:
   - Independent from Breakdown incidents.
   - Asset is required.
   - Title is required.
   - Scheduled dates are optional because the maintenance
     window may not have been agreed with Production yet.
   - Status starts as PLANNED.

   This route does NOT:
   - Create maintenance tasks or task executions.
   - Create Machine State or downtime records.
   - Modify existing Breakdowns or Tasks.
   - Start or close the maintenance incident.
========================================================= */

app.post("/scheduled-maintenance", async (req, res) => {

  try {

    const {
      asset_id,
      title,
      description,
      scheduled_start_at,
      scheduled_end_at
    } = req.body || {};


    /* =====================
       VALIDATE ASSET ID
    ===================== */

    const assetId = Number(asset_id);

    if (
      !Number.isInteger(assetId) ||
      assetId <= 0
    ) {
      return res.status(400).json({
        error: "Asset is required"
      });
    }


    /* =====================
       VALIDATE TITLE
    ===================== */

    const resolvedTitle =
      String(title ?? "").trim();

    if (!resolvedTitle) {
      return res.status(400).json({
        error: "Scheduled Maintenance title is required"
      });
    }


    /* =====================
       VALIDATE SCHEDULED DATES

       Dates are optional.

       When provided, they must be valid ISO 8601
       date/time values with an explicit timezone.

       Scheduled dates do NOT represent actual
       machine shutdown or maintenance start.
    ===================== */

    const parseScheduledDate = value => {

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return null;
      }

      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      ) {
        return "INVALID";
      }

      const date = new Date(value);

      return Number.isNaN(date.getTime())
        ? "INVALID"
        : date;
    };


    const scheduledStart =
      parseScheduledDate(scheduled_start_at);

    const scheduledEnd =
      parseScheduledDate(scheduled_end_at);


    if (
      scheduledStart === "INVALID" ||
      scheduledEnd === "INVALID"
    ) {
      return res.status(400).json({
        error: "Invalid scheduled date/time"
      });
    }


    if (
      scheduledStart &&
      scheduledEnd &&
      scheduledEnd < scheduledStart
    ) {
      return res.status(400).json({
        error:
          "Scheduled end cannot be earlier than scheduled start"
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
      [assetId]
    );

    if (assetResult.rows.length === 0) {
      return res.status(404).json({
        error: "Asset not found"
      });
    }


    /* =====================
       CREATE SM INCIDENT

       Single INSERT:
       - status = PLANNED
       - actual start/end remain NULL
       - no Breakdown or Task is created
    ===================== */

    const result = await pool.query(
      `
      INSERT INTO scheduled_maintenance (
        asset_id,
        title,
        description,
        status,
        scheduled_start_at,
        scheduled_end_at
      )

      VALUES (
        $1,
        $2,
        $3,
        'PLANNED',
        $4,
        $5
      )

      RETURNING *
      `,
      [
        assetId,
        resolvedTitle,
        String(description ?? "").trim() || null,
        scheduledStart,
        scheduledEnd
      ]
    );


    /* =====================
       RESPONSE
    ===================== */

    return res.status(201).json({

      message:
        "Scheduled Maintenance created successfully",

      scheduled_maintenance:
        result.rows[0]

    });


  } catch (err) {

    console.error(
      "POST /scheduled-maintenance error:",
      err
    );

    return res.status(500).json({
      error: "Failed to create Scheduled Maintenance"
    });

  }

});

/* =========================================================
   CREATE SCHEDULED MAINTENANCE FROM SET

   POST /scheduled-maintenance/from-set

   Creates, in ONE database transaction:

   1. New Scheduled Maintenance incident
   2. All selected Planned Tasks
   3. Planned timeline for every Task

   TASK TIMELINE:
   - planned_start_at = planned Task start
   - due_date         = planned Task end
   - duration_min     = estimated duration

   SAFETY:
   - Target Asset must exist.
   - Source SM must exist.
   - Source SM Asset model must match Target Asset model.
   - At least one Task is required.
   - Duplicate Tasks inside the submitted Set are rejected.
   - Any error rolls back the ENTIRE creation.

   IMPORTANT:
   - Existing Empty SM flow is NOT modified.
   - Existing Breakdown flow is NOT modified.
   - No Task execution is created.
   - New SM starts as PLANNED.
========================================================= */

app.post( "/scheduled-maintenance/from-set", async (req, res) => {

    /* =====================
       READ INPUT
    ===================== */

    const {
      asset_id,
      source_sm_id,
      title,
      description,
      scheduled_start_at,
      scheduled_end_at,
      tasks
    } = req.body || {};


    /* =====================
       VALIDATE IDS
    ===================== */

    const assetId =
      Number(asset_id);


    const sourceSmId =
      Number(source_sm_id);


    if (
      !Number.isInteger(assetId) ||
      assetId <= 0
    ) {

      return res.status(400).json({
        error:
          "Target Asset is required."
      });

    }


    if (
      !Number.isInteger(sourceSmId) ||
      sourceSmId <= 0
    ) {

      return res.status(400).json({
        error:
          "Source Scheduled Maintenance is required."
      });

    }


    /* =====================
       VALIDATE TITLE
    ===================== */

    const resolvedTitle =
      String(
        title ?? ""
      ).trim();


    if (!resolvedTitle) {

      return res.status(400).json({
        error:
          "Scheduled Maintenance title is required."
      });

    }


    /* =====================
       DATE PARSER

       Require explicit timezone because
       PostgreSQL stores TIMESTAMPTZ values.
    ===================== */

    const parseDateWithTimezone =
      value => {

        if (
          typeof value !== "string" ||
          !value.trim()
        ) {
          return null;
        }


        const cleanValue =
          value.trim();


        if (
          !/(Z|[+-]\d{2}:\d{2})$/i.test(
            cleanValue
          )
        ) {
          return "INVALID";
        }


        const date =
          new Date(
            cleanValue
          );


        return Number.isNaN(
          date.getTime()
        )
          ? "INVALID"
          : date;

      };


    /* =====================
       VALIDATE SM DATES
    ===================== */

    const scheduledStart =
      parseDateWithTimezone(
        scheduled_start_at
      );


    const scheduledEnd =
      parseDateWithTimezone(
        scheduled_end_at
      );


    if (
      scheduledStart === "INVALID" ||
      scheduledEnd === "INVALID" ||
      !scheduledStart ||
      !scheduledEnd
    ) {

      return res.status(400).json({
        error:
          "Valid Scheduled Start and Scheduled End are required."
      });

    }


    if (
      scheduledEnd <=
      scheduledStart
    ) {

      return res.status(400).json({
        error:
          "Scheduled End must be later than Scheduled Start."
      });

    }


    /* =====================
       VALIDATE TASK ARRAY
    ===================== */

    if (
      !Array.isArray(tasks) ||
      tasks.length === 0
    ) {

      return res.status(400).json({
        error:
          "At least one Maintenance Task is required."
      });

    }


    /* =====================================================
       NORMALIZE + VALIDATE TASKS
    ===================================================== */

    const normalizedTasks =
      [];


    const duplicateKeys =
      new Set();


    for (
      let index = 0;
      index < tasks.length;
      index += 1
    ) {

      const task =
        tasks[index] || {};


      /* =====================
         TASK NAME
      ===================== */

      const taskName =
        String(
          task.task ?? ""
        ).trim();


      if (!taskName) {

        return res.status(400).json({
          error:
            `Task ${index + 1} has no Task description.`
        });

      }


      /* =====================
         ESTIMATED DURATION
      ===================== */

      const durationMin =
        Number(
          task.duration_min
        );


      if (
        !Number.isFinite(
          durationMin
        ) ||
        durationMin < 0
      ) {

        return res.status(400).json({
          error:
            `Invalid estimated duration for Task: ${taskName}`
        });

      }


      /* =====================
         PLANNED START / END
      ===================== */

      const plannedStart =
        parseDateWithTimezone(
          task.planned_start_at
        );


      const plannedEnd =
        parseDateWithTimezone(
          task.planned_end_at
        );


      if (
        plannedStart === "INVALID" ||
        plannedEnd === "INVALID" ||
        !plannedStart ||
        !plannedEnd
      ) {

        return res.status(400).json({
          error:
            `Invalid planned timeline for Task: ${taskName}`
        });

      }


      if (
        plannedEnd <
        plannedStart
      ) {

        return res.status(400).json({
          error:
            `Planned End cannot be earlier than Planned Start for Task: ${taskName}`
        });

      }


      /* =====================
         TASK MUST REMAIN
         INSIDE SM WINDOW
      ===================== */

      if (
        plannedStart <
          scheduledStart ||
        plannedEnd >
          scheduledEnd
      ) {

        return res.status(400).json({
          error:
            `Task "${taskName}" is outside the Scheduled Maintenance window.`
        });

      }


      /* =====================
         IMPACT
      ===================== */

      const resolvedImpact =
        String(
          task.impact ||
          "normal"
        )
          .trim()
          .toLowerCase();


      const validImpacts = [
        "normal",
        "safety",
        "quality",
        "safety_quality"
      ];


      if (
        !validImpacts.includes(
          resolvedImpact
        )
      ) {

        return res.status(400).json({
          error:
            `Invalid impact for Task: ${taskName}`
        });

      }


      /* =================================================
         DUPLICATE INSIDE SET

         Identity:
         section + unit + task + type

         Type is always Planned for SM Tasks.

         This does NOT prevent the same real Task
         from appearing in another SM incident.
      ================================================= */

      const section =
        String(
          task.section ?? ""
        ).trim();


      const unit =
        String(
          task.unit ?? ""
        ).trim();


      const duplicateKey =
        [
          section.toLowerCase(),
          unit.toLowerCase(),
          taskName.toLowerCase(),
          "planned"
        ].join("||");


      if (
        duplicateKeys.has(
          duplicateKey
        )
      ) {

        return res.status(409).json({
          error:
            `Duplicate Task inside Maintenance Set: ${taskName}`
        });

      }


      duplicateKeys.add(
        duplicateKey
      );


      /* =====================
         NORMALIZED TASK
      ===================== */

      normalizedTasks.push({

        task:
          taskName,

        section:
          section || null,

        unit:
          unit || null,

        impact:
          resolvedImpact,

        duration_min:
          Math.round(
            durationMin
          ),

        notes:
          String(
            task.notes ?? ""
          ).trim() || null,

        planned_start_at:
          plannedStart,

        planned_end_at:
          plannedEnd

      });

    }


    /* =====================================================
       VERIFY ORDER / OVERLAP

       Tasks must be submitted in timeline order.

       V1 is a single sequential work stream,
       therefore Tasks must NOT overlap.
    ===================================================== */

    for (
      let index = 1;
      index < normalizedTasks.length;
      index += 1
    ) {

      const previousTask =
        normalizedTasks[
          index - 1
        ];


      const currentTask =
        normalizedTasks[
          index
        ];


      if (
        currentTask.planned_start_at <
        previousTask.planned_start_at
      ) {

        return res.status(400).json({
          error:
            "Maintenance Set Tasks are not in chronological order."
        });

      }


      if (
        currentTask.planned_start_at <
        previousTask.planned_end_at
      ) {

        return res.status(409).json({
          error:
            `Task "${currentTask.task}" overlaps the previous Task.`
        });

      }

    }


    /* =====================
       DATABASE TRANSACTION
    ===================== */

    const client =
      await pool.connect();


    try {

      await client.query(
        "BEGIN"
      );


      /* =================================================
         1. LOAD TARGET ASSET

         Model is required for compatibility validation.
      ================================================= */

      const targetAssetResult =
        await client.query(
          `
          SELECT
            id,
            model,
            serial_number
          FROM assets
          WHERE id = $1
          LIMIT 1
          FOR SHARE
          `,
          [
            assetId
          ]
        );


      if (
        targetAssetResult.rows.length === 0
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(404).json({
          error:
            "Target Asset not found."
        });

      }


      const targetAsset =
        targetAssetResult.rows[0];


      const targetModel =
        String(
          targetAsset.model || ""
        ).trim();


      if (!targetModel) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(409).json({
          error:
            "Target Asset has no Model information."
        });

      }


      /* =================================================
         2. LOAD SOURCE SM + SOURCE ASSET MODEL
      ================================================= */

      const sourceSmResult =
        await client.query(
          `
          SELECT
            sm.id,
            sm.asset_id,
            sm.title,
            sm.status,

            a.model
              AS asset_model

          FROM scheduled_maintenance sm

          JOIN assets a
            ON a.id = sm.asset_id

          WHERE sm.id = $1

          LIMIT 1
          FOR SHARE OF sm, a
          `,
          [
            sourceSmId
          ]
        );


      if (
        sourceSmResult.rows.length === 0
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(404).json({
          error:
            "Source Scheduled Maintenance not found."
        });

      }


      const sourceSm =
        sourceSmResult.rows[0];


      const sourceModel =
        String(
          sourceSm.asset_model || ""
        ).trim();


      /* =================================================
         3. BACKEND MODEL COMPATIBILITY

         This is the authoritative safety check.

         Frontend filtering alone is NOT trusted.
      ================================================= */

      if (
        !sourceModel ||
        sourceModel !== targetModel
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(409).json({
          error:
            "Source Maintenance Set is not compatible with the selected Asset model."
        });

      }


      /* =================================================
         4. CREATE NEW SM INCIDENT

         Existing SM semantics are preserved:
         - status = PLANNED
         - actual dates = NULL
      ================================================= */

      const smInsertResult =
        await client.query(
          `
          INSERT INTO scheduled_maintenance (
            asset_id,
            title,
            description,
            status,
            scheduled_start_at,
            scheduled_end_at
          )

          VALUES (
            $1,
            $2,
            $3,
            'PLANNED',
            $4,
            $5
          )

          RETURNING *
          `,
          [
            assetId,
            resolvedTitle,
            String(
              description ?? ""
            ).trim() || null,
            scheduledStart,
            scheduledEnd
          ]
        );


      const createdSm =
        smInsertResult.rows[0];


      /* =================================================
         5. CREATE PLANNED TASKS

         Same semantics as normal SM Tasks:

         - asset_id = Target SM Asset
         - type = Planned
         - status = Planned
         - frequency_hours = 0
         - is_planned = true
         - breakdown_id = NULL
         - scheduled_maintenance_id = new SM ID

         Timeline:
         - planned_start_at = planned start
         - due_date         = planned end
      ================================================= */

      const createdTasks =
        [];


      for (
        const task
        of normalizedTasks
      ) {

        const taskResult =
          await client.query(
            `
            INSERT INTO maintenance_tasks (
              asset_id,
              task,
              section,
              unit,
              type,
              impact,
              status,
              planned_start_at,
              due_date,
              frequency_hours,
              duration_min,
              notes,
              is_planned,
              breakdown_id,
              scheduled_maintenance_id
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              'Planned',
              $5,
              'Planned',
              $6,
              $7,
              0,
              $8,
              $9,
              true,
              NULL,
              $10
            )

            RETURNING *
            `,
            [
              assetId,
              task.task,
              task.section,
              task.unit,
              task.impact,
              task.planned_start_at,
              task.planned_end_at,
              task.duration_min,
              task.notes,
              createdSm.id
            ]
          );


        createdTasks.push(
          taskResult.rows[0]
        );

      }


      /* =====================
         6. COMMIT
      ===================== */

      await client.query(
        "COMMIT"
      );


      /* =====================
         SUCCESS RESPONSE
      ===================== */

      return res.status(201).json({

        success:
          true,

        message:
          "Scheduled Maintenance Set created successfully.",

        source_scheduled_maintenance_id:
          sourceSmId,

        scheduled_maintenance:
          createdSm,

        task_count:
          createdTasks.length,

        tasks:
          createdTasks

      });


    } catch (err) {

      /* =====================
         ROLLBACK EVERYTHING
      ===================== */

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "CREATE SM FROM SET ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to create Scheduled Maintenance from Set."
      });


    } finally {

      /* =====================
         RELEASE DB CLIENT
      ===================== */

      client.release();

    }

  }
);

/* =========================================================
   GET SCHEDULED MAINTENANCE TASKS

   GET /scheduled-maintenance/:id/tasks

   READ-ONLY:
   - Loads tasks linked to one Scheduled Maintenance.
   - Excludes soft-deleted tasks.
   - Includes latest execution information when available.
   - Does NOT modify task status or execution history.
========================================================= */

app.get("/scheduled-maintenance/:id/tasks", async (req, res) => {

  try {

    /* =====================
       VALIDATE SM ID
    ===================== */

    const smId =
      Number(req.params.id);


    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid Scheduled Maintenance ID"
      });
    }


    /* =====================
       LOAD TASKS

       OPEN TASK:
       - duration_min = estimated duration
       - actual_duration_min = NULL

       DONE TASK:
       - duration_min = estimated duration
       - actual_duration_min =
         latest task execution duration
    ===================== */

    const result =
      await pool.query(
        `
          SELECT

            t.*,

            te.duration_minutes
              AS actual_duration_min,

            te.executed_at
              AS execution_executed_at,

            te.executed_by
              AS execution_executed_by,

            te.technician_id
              AS execution_technician_id,

            COALESCE(
              att.attachment_count,
              0
            )
              AS attachment_count

          FROM maintenance_tasks t


          LEFT JOIN LATERAL (

            SELECT

              duration_minutes,
              executed_at,
              executed_by,
              technician_id

            FROM task_executions

            WHERE task_id = t.id

            ORDER BY
              executed_at DESC,
              id DESC

            LIMIT 1

          ) te ON true


          LEFT JOIN LATERAL (

            SELECT
              COUNT(*)::int
                AS attachment_count

            FROM attachments

            WHERE
              entity_type = 'TASK'
              AND entity_id = t.id

          ) att ON true


          WHERE
            t.scheduled_maintenance_id = $1

            AND t.deleted_at IS NULL

        ORDER BY

          /* =====================
            1. OPEN TASKS FIRST
          ===================== */

          CASE
            WHEN UPPER(TRIM(COALESCE(t.status, ''))) = 'DONE'
              THEN 1
            ELSE 0
          END ASC,


          /* =====================
            2. OPEN TASKS

            Earliest due first
          ===================== */

          CASE
            WHEN UPPER(TRIM(COALESCE(t.status, ''))) <> 'DONE'
              THEN t.due_date
            ELSE NULL
          END ASC NULLS LAST,


          /* =====================
            3. DONE TASKS

            Latest executed first
          ===================== */

          CASE
            WHEN UPPER(TRIM(COALESCE(t.status, ''))) = 'DONE'
              THEN COALESCE(
                te.executed_at,
                t.completed_at
              )
            ELSE NULL
          END DESC NULLS LAST,


          /* =====================
            4. STABLE FALLBACK
          ===================== */

          t.id ASC
        `,
        [smId]
      );


    /* =====================
      RESPONSE
    ===================== */

    return res.json({

      scheduled_maintenance_id:
        smId,

      tasks:
        result.rows

    });


  } catch (err) {

    console.error(
      "GET SCHEDULED MAINTENANCE TASKS ERROR:",
      err
    );


    return res.status(500).json({
      error:
        "Failed to load Scheduled Maintenance Tasks"
    });

  }

});

/* =========================================================
   CREATE SCHEDULED MAINTENANCE TASK
   POST /scheduled-maintenance/:id/tasks

   Creates one Planned Task linked to an SM incident.

   TASK SEMANTICS:
   - scheduled_maintenance_id = selected SM ID
   - breakdown_id             = NULL
   - type                     = 'Planned'
   - is_planned               = true
   - status                   = 'Planned'
   - frequency_hours          = 0

   IMPORTANT:
   - Asset is taken from the SM incident.
   - Tasks can be added only while SM is not CLOSED.
   - Does NOT create a task execution.
   - Does NOT modify SM status or dates.
   - Does NOT modify Breakdowns or Machine States.
========================================================= */

app.post("/scheduled-maintenance/:id/tasks", async (req, res) => {

  const smId = Number(req.params.id);

  const {
    task,
    section,
    unit,
    due_date,
    duration_min,
    notes,
    impact
  } = req.body || {};


  /* =====================
     VALIDATE INPUT
  ===================== */

  if (
    !Number.isInteger(smId) ||
    smId <= 0
  ) {
    return res.status(400).json({
      error: "Invalid Scheduled Maintenance ID"
    });
  }

  const taskTitle = String(task ?? "").trim();

  if (!taskTitle) {
    return res.status(400).json({
      error: "Maintenance task is required"
    });
  }


  /* =====================
     VALIDATE DURATION
  ===================== */

  let estimatedDuration = null;

  if (
    duration_min !== undefined &&
    duration_min !== null &&
    duration_min !== ""
  ) {

    estimatedDuration = Number(duration_min);

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
     VALIDATE DUE DATE
  ===================== */

  let resolvedDueDate = null;

  if (
    due_date !== undefined &&
    due_date !== null &&
    due_date !== ""
  ) {

    resolvedDueDate = new Date(due_date);

    if (
      Number.isNaN(resolvedDueDate.getTime())
    ) {
      return res.status(400).json({
        error: "Invalid Due Date"
      });
    }
  }


  const client = await pool.connect();

  try {

    await client.query("BEGIN");


    /* =====================
       LOAD + LOCK SM

       The Asset is determined by the SM incident.
       No other Asset can be selected for this Task.
    ===================== */

    const smResult = await client.query(
      `
      SELECT
        id,
        asset_id,
        status
      FROM scheduled_maintenance
      WHERE id = $1
      FOR UPDATE
      `,
      [smId]
    );

    if (!smResult.rows.length) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Scheduled Maintenance not found"
      });
    }

    const sm = smResult.rows[0];


    /* =====================
       CLOSED SM GUARD
    ===================== */

    if (sm.status === "CLOSED") {

      await client.query("ROLLBACK");

      return res.status(409).json({
        error:
          "Cannot add Tasks to a CLOSED Scheduled Maintenance"
      });
    }


    /* =====================
       CREATE PLANNED TASK

       Uses the existing maintenance_tasks table
       and normal CMMS completion flow.

       No task execution is created here.
    ===================== */

    const result = await client.query(
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
        breakdown_id,
        scheduled_maintenance_id
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Planned',
        $5,
        'Planned',
        $6,
        0,
        $7,
        $8,
        true,
        NULL,
        $9
      )

      RETURNING *
      `,
      [
        sm.asset_id,
        taskTitle,

        String(section ?? "").trim() || null,
        String(unit ?? "").trim() || null,

        String(impact ?? "").trim() || "normal",

        resolvedDueDate,

        estimatedDuration,

        String(notes ?? "").trim() || null,

        smId
      ]
    );


    /* =====================
       COMMIT
    ===================== */

    await client.query("COMMIT");


    /* =====================
       RESPONSE
    ===================== */

    return res.status(201).json({
      message:
        "Scheduled Maintenance Task created successfully",

      task: result.rows[0]
    });


  } catch (err) {

    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "POST /scheduled-maintenance/:id/tasks error:",
      err
    );

    return res.status(500).json({
      error: "Failed to create Scheduled Maintenance Task"
    });


  } finally {

    client.release();

  }

});

/* =========================================================
   PATCH /scheduled-maintenance/:id/start

   START SCHEDULED MAINTENANCE
   ---------------------------------------------------------
   - Only a PLANNED SM can be started.
   - Records the user-selected actual start time.
   - Changes status to IN_PROGRESS.
   - Does not modify Tasks, Breakdowns or downtime.
   - Does not close the maintenance.
========================================================= */

app.patch("/scheduled-maintenance/:id/start", async (req, res) => {

  try {

    const smId =
      Number(req.params.id);

    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid Scheduled Maintenance ID."
      });
    }


    /* =====================
       VALIDATE ACTUAL START
    ===================== */

    const actualStartValue =
      req.body?.actual_start_at;

    if (
      typeof actualStartValue !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(actualStartValue)
    ) {
      return res.status(400).json({
        error: "Actual Start must include timezone information."
      });
    }

    const actualStart =
      new Date(actualStartValue);

    if (
      Number.isNaN(actualStart.getTime())
    ) {
      return res.status(400).json({
        error: "Invalid Actual Start date."
      });
    }

    if (
      actualStart.getTime() > Date.now() + 60000
    ) {
      return res.status(400).json({
        error: "Actual Start cannot be in the future."
      });
    }


    /* =====================
       START — ATOMIC UPDATE

       PLANNED → IN_PROGRESS

       The status condition prevents
       accidentally starting an SM twice.
    ===================== */

    const result = await pool.query(
      `
        UPDATE public.scheduled_maintenance
        SET
          status = 'IN_PROGRESS',
          actual_started_at = $2,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'PLANNED'
          AND actual_started_at IS NULL
        RETURNING *
      `,
      [
        smId,
        actualStart.toISOString()
      ]
    );


    if (result.rowCount === 0) {

      const existing = await pool.query(
        `
          SELECT id, status
          FROM public.scheduled_maintenance
          WHERE id = $1
        `,
        [smId]
      );

      if (existing.rowCount === 0) {
        return res.status(404).json({
          error: "Scheduled Maintenance not found."
        });
      }

      return res.status(409).json({
        error: "This Scheduled Maintenance is not in PLANNED status."
      });

    }


    res.json(result.rows[0]);

  } catch (err) {

    console.error(
      "START SCHEDULED MAINTENANCE ERROR:",
      err
    );

    res.status(500).json({
      error: "Could not start Scheduled Maintenance."
    });

  }

});

/* =========================================================
   PATCH /scheduled-maintenance/:id/close

   CLOSE SCHEDULED MAINTENANCE
   ---------------------------------------------------------
   - Only an IN_PROGRESS SM can be closed.
   - All linked Tasks must already be Done.
   - Records the user-selected actual close time.
   - Does not modify Tasks or Breakdowns.
========================================================= */

app.patch("/scheduled-maintenance/:id/close", async (req, res) => {

  const client = await pool.connect();

  try {

    const smId =
      Number(req.params.id);


    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {

      return res.status(400).json({
        error: "Invalid Scheduled Maintenance ID."
      });

    }


    /* =====================
       VALIDATE ACTUAL CLOSE
    ===================== */

    const actualCloseValue =
      req.body?.actual_close_at;


    if (
      typeof actualCloseValue !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(actualCloseValue)
    ) {

      return res.status(400).json({
        error:
          "Actual Close must include timezone information."
      });

    }


    const actualClose =
      new Date(actualCloseValue);


    if (
      Number.isNaN(
        actualClose.getTime()
      )
    ) {

      return res.status(400).json({
        error: "Invalid Actual Close date."
      });

    }


    if (
      actualClose.getTime() >
      Date.now() + 60000
    ) {

      return res.status(400).json({
        error:
          "Actual Close cannot be in the future."
      });

    }


    await client.query("BEGIN");


    /* =====================
       1. LOAD + LOCK SM
    ===================== */

    const smResult =
      await client.query(
        `
          SELECT
            id,
            status,
            actual_started_at,
            actual_closed_at
          FROM scheduled_maintenance
          WHERE id = $1
          FOR UPDATE
        `,
        [smId]
      );


    if (!smResult.rows.length) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error:
          "Scheduled Maintenance not found."
      });

    }


    const sm =
      smResult.rows[0];


    /* =====================
       2. STATUS GUARD
    ===================== */

    if (
      String(sm.status || "").toUpperCase() !==
      "IN_PROGRESS"
    ) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        error:
          "Only IN_PROGRESS Scheduled Maintenance can be closed."
      });

    }


    /* =====================
       3. CLOSE DATE GUARD
    ===================== */

    if (
      sm.actual_started_at &&
      actualClose <
        new Date(sm.actual_started_at)
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Actual Close cannot be earlier than Actual Start."
      });

    }


    /* =====================
       4. CHECK LINKED TASKS

       All active linked tasks
       must already be Done.
    ===================== */

    const openTasksResult =
      await client.query(
        `
          SELECT
            COUNT(*)::int AS open_count
          FROM maintenance_tasks
          WHERE scheduled_maintenance_id = $1
            AND deleted_at IS NULL
            AND status <> 'Done'
        `,
        [smId]
      );


    const openCount =
      Number(
        openTasksResult.rows[0]?.open_count || 0
      );


    if (openCount > 0) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        error:
          "Scheduled Maintenance still has open Tasks.",
        open_tasks: openCount
      });

    }


    /* =====================
       5. CLOSE SM
    ===================== */

    const closeResult =
      await client.query(
        `
          UPDATE scheduled_maintenance
          SET
            status = 'CLOSED',
            actual_closed_at = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          smId,
          actualClose.toISOString()
        ]
      );


    await client.query("COMMIT");


    return res.json({
      success: true,
      scheduled_maintenance:
        closeResult.rows[0]
    });


  } catch (err) {

    try {
      await client.query("ROLLBACK");
    } catch (_) {}


    console.error(
      "CLOSE SCHEDULED MAINTENANCE ERROR:",
      err
    );


    return res.status(500).json({
      error:
        "Could not close Scheduled Maintenance."
    });


  } finally {

    client.release();

  }

});

/* =========================================================
   DELETE SCHEDULED MAINTENANCE — ADMIN ONLY
   DELETE /scheduled-maintenance/:id

   HARD DELETE for WRONG / ACCIDENTAL SM ENTRY ONLY.

   Deletes:
   1. task_executions linked to SM tasks
   2. ALL maintenance_tasks linked to SM
   3. Scheduled Maintenance itself

   IMPORTANT:
   - Historical data is permanently changed
   - Open AND completed SM Tasks are deleted
   - Soft-deleted linked Tasks are also removed
   - This action cannot be undone
========================================================= */

app.delete("/scheduled-maintenance/:id", requireAdmin,async (req, res) => {

    const client =
      await pool.connect();


    try {

      const smId =
        Number(req.params.id);


      /* =====================
         VALIDATE ID
      ===================== */

      if (
        !Number.isInteger(smId) ||
        smId <= 0
      ) {

        return res.status(400).json({
          error:
            "Invalid Scheduled Maintenance ID"
        });

      }


      await client.query("BEGIN");


      /* =====================
         LOCK + VERIFY SM
      ===================== */

      const smResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            title,
            status,
            scheduled_start_at,
            actual_started_at,
            actual_closed_at
          FROM scheduled_maintenance
          WHERE id = $1
          FOR UPDATE
          `,
          [smId]
        );


      if (
        smResult.rows.length === 0
      ) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Scheduled Maintenance not found"
        });

      }


      const sm =
        smResult.rows[0];


      /* =====================
         DELETE EXECUTIONS

         Only executions belonging
         to tasks linked to this SM.
      ===================== */

      const executionsResult =
        await client.query(
          `
          DELETE FROM task_executions

          WHERE task_id IN (

            SELECT id

            FROM maintenance_tasks

            WHERE scheduled_maintenance_id = $1

          )

          RETURNING id
          `,
          [smId]
        );


      /* =====================
         DELETE ALL SM TASKS

         Includes:
         - Planned/open
         - Done
         - Soft-deleted

         Relationship is strictly:
         scheduled_maintenance_id = requested SM
      ===================== */

      const tasksResult =
        await client.query(
          `
          DELETE FROM maintenance_tasks

          WHERE scheduled_maintenance_id = $1

          RETURNING id
          `,
          [smId]
        );


      /* =====================
         DELETE SM
      ===================== */

      const deleteSmResult =
        await client.query(
          `
          DELETE FROM scheduled_maintenance

          WHERE id = $1

          RETURNING id
          `,
          [smId]
        );


      if (
        deleteSmResult.rowCount !== 1
      ) {

        throw new Error(
          "Scheduled Maintenance could not be deleted"
        );

      }


      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res.json({

        success: true,

        scheduled_maintenance_id:
          smId,

        deleted: {

          scheduled_maintenance: 1,

          tasks:
            tasksResult.rowCount,

          executions:
            executionsResult.rowCount

        },

        scheduled_maintenance: {

          id:
            sm.id,

          asset_id:
            sm.asset_id,

          title:
            sm.title,

          status:
            sm.status

        }

      });


    } catch (err) {

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "DELETE /scheduled-maintenance/:id error:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to permanently delete Scheduled Maintenance"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   CREATE NEW & COMPLETE SCHEDULED MAINTENANCE TASK
   POST /scheduled-maintenance/:id/completed-task

   Retrospective / immediate recording of maintenance
   work already performed during an IN_PROGRESS
   Scheduled Maintenance.

   Creates, in ONE database transaction:
   - A completed Planned maintenance task linked to the SM.
   - Its actual task execution.

   RULES:
   - Scheduled Maintenance must be IN_PROGRESS.
   - Task belongs to the SM asset.
   - Task type = Planned.
   - Task status = Done.
   - Due Date is required for Schedule Delivery history.
   - Actual completion time must be after Actual Start.
   - Actual completion time cannot be in the future.
   - Actual duration is stored in task_executions.
   - Impact uses the standard CMMS classification.

   IMPORTANT:
   - Does NOT close the Scheduled Maintenance.
   - Does NOT modify existing tasks or executions.
   - Does NOT affect Breakdown flows.
========================================================= */

app.post("/scheduled-maintenance/:id/completed-task", async (req, res) => {

    /* =====================
       READ INPUT
    ===================== */

    const smId =
      Number(
        req.params.id
      );


    const {
      task,
      section,
      unit,
      technician_id,
      executed_at,
      due_at,
      actual_duration_min,
      notes,
      impact
    } = req.body || {};


    /* =====================
       VALIDATE SM ID
    ===================== */

    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Scheduled Maintenance ID"
      });

    }


    /* =====================
       VALIDATE TASK
    ===================== */

    const taskName =
      String(
        task || ""
      ).trim();


    if (!taskName) {

      return res.status(400).json({
        error:
          "Maintenance Task is required"
      });

    }


    /* =====================
       VALIDATE IMPACT
    ===================== */

    const resolvedImpact =
      String(
        impact || "normal"
      )
        .trim()
        .toLowerCase();


    const validImpacts = [
      "normal",
      "safety",
      "quality",
      "safety_quality"
    ];


    if (
      !validImpacts.includes(
        resolvedImpact
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid Task Impact"
      });

    }


    /* =====================
       VALIDATE TECHNICIAN
    ===================== */

    const technicianId =
      Number(
        technician_id
      );


    if (
      !Number.isInteger(
        technicianId
      ) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Technician is required"
      });

    }


    /* =====================
       VALIDATE ACTUAL COMPLETION TIME
    ===================== */

    if (!executed_at) {

      return res.status(400).json({
        error:
          "Actual completion time is required"
      });

    }


    const executedAt =
      new Date(
        executed_at
      );


    if (
      Number.isNaN(
        executedAt.getTime()
      ) ||
      executedAt.getTime() >
        Date.now()
    ) {

      return res.status(400).json({
        error:
          "Invalid actual completion time"
      });

    }


    /* =====================
       VALIDATE DUE DATE
    ===================== */

    if (!due_at) {

      return res.status(400).json({
        error:
          "Due Date is required"
      });

    }


    const dueAt =
      new Date(
        due_at
      );


    if (
      Number.isNaN(
        dueAt.getTime()
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid Due Date"
      });

    }


    /* =====================
       VALIDATE ACTUAL DURATION
    ===================== */

    if (
      actual_duration_min === null ||
      actual_duration_min === undefined ||
      actual_duration_min === ""
    ) {

      return res.status(400).json({
        error:
          "Actual Duration is required"
      });

    }


    const actualDuration =
      Number(
        actual_duration_min
      );


    if (
      !Number.isInteger(
        actualDuration
      ) ||
      actualDuration < 0
    ) {

      return res.status(400).json({
        error:
          "Actual Duration must be a non-negative integer"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query(
        "BEGIN"
      );


      /* =====================
         LOAD + LOCK SM
      ===================== */

      const smResult =
        await client.query(
          `
            SELECT
              id,
              asset_id,
              status,
              actual_started_at,
              actual_closed_at
            FROM scheduled_maintenance
            WHERE id = $1
            FOR UPDATE
          `,
          [
            smId
          ]
        );


      if (
        !smResult.rows.length
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res
          .status(404)
          .json({
            error:
              "Scheduled Maintenance not found"
          });

      }


      const sm =
        smResult.rows[0];


      /* =====================
         IN_PROGRESS GUARD
      ===================== */

      if (
        String(
          sm.status || ""
        ).toUpperCase() !==
        "IN_PROGRESS"
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res
          .status(409)
          .json({
            error:
              "Completed Task can only be added to an IN_PROGRESS Scheduled Maintenance"
          });

      }


      /* =====================
         ACTUAL START GUARD
      ===================== */

      if (
        !sm.actual_started_at
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res
          .status(409)
          .json({
            error:
              "Scheduled Maintenance has no Actual Start"
          });

      }


      const actualStartedAt =
        new Date(
          sm.actual_started_at
        );


      if (
        executedAt <
        actualStartedAt
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res
          .status(409)
          .json({
            error:
              "Actual completion time cannot be earlier than Scheduled Maintenance Actual Start"
          });

      }


      /* =====================
         VERIFY TECHNICIAN
      ===================== */

      const technicianResult =
        await client.query(
          `
            SELECT
              id,
              name
            FROM technicians
            WHERE id = $1
            LIMIT 1
          `,
          [
            technicianId
          ]
        );


      if (
        !technicianResult.rows.length
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res
          .status(404)
          .json({
            error:
              "Technician not found"
          });

      }


      const technician =
        technicianResult.rows[0];


      /* =====================
         CREATE COMPLETED TASK
      ===================== */

      const taskResult =
        await client.query(
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
              breakdown_id,
              scheduled_maintenance_id,
              completed_by,
              completed_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              'Planned',
              $5,
              'Done',
              $6,
              0,
              NULL,
              $7,
              true,
              NULL,
              $8,
              $9,
              $10
            )
            RETURNING *
          `,
          [
            sm.asset_id,

            taskName,

            String(
              section || ""
            ).trim() || null,

            String(
              unit || ""
            ).trim() || null,

            resolvedImpact,

            dueAt,

            String(
              notes || ""
            ).trim() || null,

            smId,

            technician.name,

            executedAt
          ]
        );


      const completedTask =
        taskResult.rows[0];


      /* =====================
         RECORD EXECUTION
      ===================== */

      const executionResult =
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
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8
            )
            RETURNING *
          `,
          [
            completedTask.id,

            sm.asset_id,

            technician.name,

            technician.id,

            dueAt,

            executedAt,

            actualDuration,

            String(
              notes || ""
            ).trim() || null
          ]
        );


      /* =====================
         COMMIT
      ===================== */

      await client.query(
        "COMMIT"
      );


      return res
        .status(201)
        .json({

          success: true,

          message:
            "Completed Scheduled Maintenance Task recorded successfully",

          scheduled_maintenance_id:
            smId,

          task:
            completedTask,

          execution:
            executionResult.rows[0]

        });


    } catch (err) {

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "COMPLETED SM TASK ERROR:",
        err
      );


      return res
        .status(500)
        .json({
          error:
            "Failed to record completed Scheduled Maintenance Task"
        });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   DELETE SCHEDULED MAINTENANCE TASK
   DELETE /scheduled-maintenance/:smId/tasks/:taskId

   Permanently removes a Task from an IN_PROGRESS
   Scheduled Maintenance.

   RULES:
   - SM must exist.
   - SM must be IN_PROGRESS.
   - Task must belong to this SM.
   - If Task has executions, they are deleted first.
   - Task is then permanently deleted from maintenance_tasks.

   IMPORTANT:
   - Hard delete by design.
   - Intended for correction of wrong entries
     while Scheduled Maintenance is still open.
   - CLOSED Scheduled Maintenance cannot be modified.
   - Does NOT affect Breakdown tasks.
========================================================= */

app.delete("/scheduled-maintenance/:smId/tasks/:taskId", async (req, res) => {

    /* =====================
       READ IDS
    ===================== */

    const smId =
      Number(req.params.smId);

    const taskId =
      Number(req.params.taskId);


    /* =====================
       VALIDATE IDS
    ===================== */

    if (
      !Number.isInteger(smId) ||
      smId <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid Scheduled Maintenance ID"
      });
    }


    if (
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid Task ID"
      });
    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         LOAD + LOCK SM
      ===================== */

      const smResult =
        await client.query(
          `
            SELECT
              id,
              status
            FROM scheduled_maintenance
            WHERE id = $1
            FOR UPDATE
          `,
          [smId]
        );


      if (!smResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Scheduled Maintenance not found"
        });
      }


      const sm =
        smResult.rows[0];


      /* =====================
         SM STATUS GUARD
      ===================== */

      if (
        String(
          sm.status || ""
        ).toUpperCase() !==
        "IN_PROGRESS"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Tasks can only be deleted while Scheduled Maintenance is IN_PROGRESS"
        });
      }


      /* =====================
         LOAD + LOCK TASK

         Important:
         Task MUST belong to this SM.
      ===================== */

      const taskResult =
        await client.query(
          `
            SELECT
              id,
              status,
              task,
              scheduled_maintenance_id,
              breakdown_id
            FROM maintenance_tasks
            WHERE id = $1
              AND scheduled_maintenance_id = $2
            FOR UPDATE
          `,
          [
            taskId,
            smId
          ]
        );


      if (!taskResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Scheduled Maintenance Task not found"
        });
      }


      const task =
        taskResult.rows[0];


      /* =====================
         SAFETY GUARD

         SM tasks must never be
         Breakdown tasks.
      ===================== */

      if (
        task.breakdown_id !== null &&
        task.breakdown_id !== undefined
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Breakdown Task cannot be deleted through Scheduled Maintenance"
        });
      }


      /* =====================
         DELETE EXECUTIONS

         For open tasks:
         → usually deletes 0 rows

         For Done tasks:
         → removes execution/history
      ===================== */

      const executionDeleteResult =
        await client.query(
          `
            DELETE FROM task_executions
            WHERE task_id = $1
          `,
          [taskId]
        );


      /* =====================
         DELETE TASK
      ===================== */

      const taskDeleteResult =
        await client.query(
          `
            DELETE FROM maintenance_tasks
            WHERE id = $1
              AND scheduled_maintenance_id = $2
            RETURNING
              id,
              task,
              status
          `,
          [
            taskId,
            smId
          ]
        );


      if (!taskDeleteResult.rows.length) {

        throw new Error(
          "Task deletion failed"
        );
      }


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      return res.json({

        success: true,

        message:
          "Scheduled Maintenance Task deleted successfully",

        deleted_task:
          taskDeleteResult.rows[0],

        deleted_executions:
          executionDeleteResult.rowCount

      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}


      console.error(
        "DELETE SM TASK ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to delete Scheduled Maintenance Task"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   MANAGEMENT DASHBOARD

   Filters:
   - from
   - to
   - area = all | litho | crown

   Widgets currently supported:
   - Maintenance Mix
   - Schedule Delivery

   Classification:
   - Preventive  = frequency_hours > 0
   - Planned     = non-BD, non-preventive, planned
   - Corrective  = breakdown_id IS NOT NULL

   UI terminology:
   Database Restoration → Management "Corrective"
========================================================= */

app.get("/management-dashboard", async (req, res) => {

  try {

  const {
    from,
    to,
    area = "all",
    lines
  } = req.query;


    /* =====================
       VALIDATE PERIOD
    ===================== */

    if (!from || !to) {

      return res.status(400).json({
        error: "from and to are required"
      });

    }


    const fromDate =
      new Date(from);

    const toDate =
      new Date(to);


    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime())
    ) {

      return res.status(400).json({
        error: "Invalid from/to date"
      });

    }


    if (fromDate > toDate) {

      return res.status(400).json({
        error: "from cannot be after to"
      });

    }


    /* =====================
       VALIDATE AREA
    ===================== */

    const normalizedArea =
      String(area)
        .trim()
        .toLowerCase();


    if (
      ![
        "all",
        "litho",
        "crown"
      ].includes(normalizedArea)
    ) {

      return res.status(400).json({
        error: "Invalid area"
      });

    }

    /* =====================================================
      OPTIONAL EXPLICIT LINE FILTER

      Used by Reports.

      If explicit lines are supplied, they override
      the Management area filter.
    ===================================================== */

    const explicitLines =
      String(lines || "")
        .split(",")
        .map(line =>
          String(line)
            .trim()
            .toUpperCase()
        )
        .filter(Boolean);


    /* =====================================================
       AREA HELPER
    ===================================================== */

    function getAreaLines() {

      if (normalizedArea === "litho") {

        return [
          "F1",
          "F2",
          "F3",
          "F4"
        ];

      }


      if (normalizedArea === "crown") {

        return [
          "L1",
          "L2",
          "L3",
          "L4",
          "L5",
          "L6",
          "L7"
        ];

      }


      return null;

    }

  const areaLines =
    explicitLines.length > 0
      ? explicitLines
      : getAreaLines();

    /* =====================================================
       1. MAINTENANCE MIX
    ===================================================== */

    const mixParams = [
      fromDate.toISOString(),
      toDate.toISOString()
    ];


    const mixConditions = [

      `te.executed_at >= $1::timestamptz`,

      `te.executed_at <= $2::timestamptz`

    ];


    if (areaLines) {

      mixParams.push(
        areaLines
      );

      mixConditions.push(
        `UPPER(TRIM(l.name)) = ANY($${mixParams.length}::text[])`
      );

    }


    const mixWhereSql =
      `WHERE ${mixConditions.join(" AND ")}`;


    const mixSql = `

      SELECT

        COUNT(te.id) FILTER (

          WHERE
            mt.breakdown_id IS NULL
            AND COALESCE(
              mt.frequency_hours,
              0
            ) > 0

        )::int
          AS preventive,


        COUNT(te.id) FILTER (

          WHERE
            mt.breakdown_id IS NULL

            AND COALESCE(
              mt.frequency_hours,
              0
            ) <= 0

            AND mt.is_planned
                IS DISTINCT FROM false

        )::int
          AS planned,

        COUNT(te.id) FILTER (

          WHERE

            mt.breakdown_id IS NOT NULL

            OR (

              mt.breakdown_id IS NULL

              AND mt.is_planned = false

              AND te.executed_at
                <= '2026-09-03T00:00:00+00'::timestamptz

            )

        )::int AS corrective


      FROM task_executions te

      JOIN maintenance_tasks mt
        ON mt.id = te.task_id

      JOIN assets a
        ON a.id = mt.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      ${mixWhereSql}

    `;


    const mixResult =
      await pool.query(
        mixSql,
        mixParams
      );


    const mix =
      mixResult.rows[0] || {};


    const preventive =
      Number(mix.preventive) || 0;

    const planned =
      Number(mix.planned) || 0;

    const corrective =
      Number(mix.corrective) || 0;

    const maintenanceMix = {

        total:
          preventive +
          planned +
          corrective,

          preventive,
          planned,
          corrective

        };


    /* =====================================================
       2. SCHEDULE DELIVERY

       Same semantics as Daily Report.

       Historical occurrences:
       task_executions.prev_due_date

       Current open occurrence:
       maintenance_tasks.due_date
    ===================================================== */


    /* =====================
       LOAD RELEVANT EXECUTIONS
    ===================== */

    const executionParams = [
      fromDate.toISOString(),
      toDate.toISOString()
    ];


    const executionConditions = [

      `
        (
          te.prev_due_date BETWEEN
            $1::timestamptz
            AND
            $2::timestamptz

          OR

          te.executed_at BETWEEN
            $1::timestamptz
            AND
            $2::timestamptz
        )
      `

    ];


    if (areaLines) {

      executionParams.push(
        areaLines
      );

      executionConditions.push(
        `UPPER(TRIM(l.name)) = ANY($${executionParams.length}::text[])`
      );

    }


    const executionSql = `

      SELECT

        te.id AS execution_id,

        te.task_id,

        te.executed_at,

        te.prev_due_date,

        mt.frequency_hours,

        mt.is_planned,

        mt.breakdown_id

      FROM task_executions te

      JOIN maintenance_tasks mt
        ON mt.id = te.task_id

      JOIN assets a
        ON a.id = mt.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      WHERE
        ${executionConditions.join(" AND ")}

    `;


    const executionResult =
      await pool.query(
        executionSql,
        executionParams
      );


    /* =====================
       LOAD OPEN TASKS DUE
       INSIDE SELECTED PERIOD
    ===================== */

    const taskParams = [
      fromDate.toISOString(),
      toDate.toISOString()
    ];


    const taskConditions = [

      `mt.deleted_at IS NULL`,

      `mt.status != 'Done'`,

      `mt.due_date >= $1::timestamptz`,

      `mt.due_date <= $2::timestamptz`

    ];


    if (areaLines) {

      taskParams.push(
        areaLines
      );

      taskConditions.push(
        `UPPER(TRIM(l.name)) = ANY($${taskParams.length}::text[])`
      );

    }


    const taskSql = `

      SELECT

        mt.id,

        mt.due_date,

        mt.frequency_hours,

        mt.is_planned,

        mt.breakdown_id

      FROM maintenance_tasks mt

      JOIN assets a
        ON a.id = mt.asset_id

      LEFT JOIN lines l
        ON l.id = a.line_id

      WHERE
        ${taskConditions.join(" AND ")}

    `;


    const taskResult =
      await pool.query(
        taskSql,
        taskParams
      );


    /* =====================================================
       SCHEDULE DELIVERY HELPERS
    ===================================================== */

    function getCategory(row) {

      /*
        Corrective does not belong
        to Schedule Delivery.
      */

      if (
        row?.breakdown_id !== null &&
        row?.breakdown_id !== undefined
      ) {

        return null;

      }


      if (
        Number(
          row?.frequency_hours
        ) > 0
      ) {

        return "preventive";

      }


      if (
        row?.is_planned === false ||
        String(
          row?.is_planned
        ).toLowerCase() === "false"
      ) {

        return null;

      }


      return "planned";

    }


    function parseDate(value) {

      if (!value) {
        return null;
      }


      const date =
        new Date(value);


      return Number.isNaN(
        date.getTime()
      )
        ? null
        : date;

    }


    function inPeriod(date) {

      return (
        date &&
        date >= fromDate &&
        date <= toDate
      );

    }


    function createBucket() {

      return {

        scheduledDue: 0,

        fulfilled: 0,

        outstanding: 0,

        scheduleGap: 0,

        completedScheduled: 0,

        completedBeforePeriod: 0,

        backlogRecovered: 0,

        earlyCompleted: 0,

        deliveryRate: 0,

        fulfillmentRate: 0,

        totalDelivered: 0

      };

    }


    const delivery = {

      total:
        createBucket(),

      preventive:
        createBucket(),

      planned:
        createBucket()

    };


    function createSets() {

      return {

        scheduledDue:
          new Set(),

        completedScheduled:
          new Set(),

        completedBeforePeriod:
          new Set(),

        outstanding:
          new Set(),

        backlogRecovered:
          new Set(),

        earlyCompleted:
          new Set()

      };

    }


    const sets = {

      total:
        createSets(),

      preventive:
        createSets(),

      planned:
        createSets()

    };


    function getOccurrenceKey(
      row,
      dueDate
    ) {

      const taskId =
        row?.task_id ??
        row?.id ??
        "unknown";


      return (
        String(taskId) +
        "|" +
        dueDate.toISOString()
      );

    }


    function addToSet(
      category,
      metric,
      key
    ) {

      sets.total[metric].add(
        key
      );

      sets[category][metric].add(
        key
      );

    }


    /* =====================================================
       COMPLETED EXECUTIONS
    ===================================================== */

    executionResult.rows.forEach(row => {

      const category =
        getCategory(row);


      if (!category) {
        return;
      }


      const executedAt =
        parseDate(
          row.executed_at
        );


      const dueAt =
        parseDate(
          row.prev_due_date
        );


      /*
        Scheduled Delivery requires
        a historical due occurrence.
      */

      if (
        !executedAt ||
        !dueAt
      ) {

        return;

      }


      const key =
        getOccurrenceKey(
          row,
          dueAt
        );


      const dueInPeriod =
        inPeriod(
          dueAt
        );


      const executionInPeriod =
        inPeriod(
          executedAt
        );


      /* =====================
         SCHEDULED DUE
      ===================== */

      if (dueInPeriod) {

        addToSet(
          category,
          "scheduledDue",
          key
        );

      }


      /* =====================
         COMPLETED EARLIER

         Due in selected period,
         execution before period.
      ===================== */

      if (
        dueInPeriod &&
        executedAt < fromDate
      ) {

        addToSet(
          category,
          "completedBeforePeriod",
          key
        );

        return;

      }


      /*
        From here onward:
        execution must belong
        to selected period.
      */

      if (!executionInPeriod) {
        return;
      }


      /* =====================
         COMPLETED IN PERIOD
         FROM CURRENT SCHEDULE
      ===================== */

      if (dueInPeriod) {

        addToSet(
          category,
          "completedScheduled",
          key
        );

        return;

      }


      /* =====================
         BACKLOG RECOVERED
      ===================== */

      if (
        dueAt < fromDate
      ) {

        addToSet(
          category,
          "backlogRecovered",
          key
        );

        return;

      }


      /* =====================
         FUTURE DUE
         COMPLETED EARLY
      ===================== */

      if (
        dueAt > toDate
      ) {

        addToSet(
          category,
          "earlyCompleted",
          key
        );

      }

    });


    /* =====================================================
       CURRENT OPEN TASKS
       DUE INSIDE PERIOD
    ===================================================== */

    taskResult.rows.forEach(row => {

      const category =
        getCategory(row);


      if (!category) {
        return;
      }


      const dueAt =
        parseDate(
          row.due_date
        );


      if (
        !dueAt ||
        !inPeriod(dueAt)
      ) {

        return;
      }


      const key =
        getOccurrenceKey(
          {
            ...row,
            task_id: row.id
          },
          dueAt
        );


      addToSet(
        category,
        "scheduledDue",
        key
      );


      addToSet(
        category,
        "outstanding",
        key
      );

    });


    /* =====================================================
       FINALIZE DELIVERY
    ===================================================== */

    [
      "total",
      "preventive",
      "planned"
    ].forEach(category => {

      const bucket =
        delivery[category];


      const categorySets =
        sets[category];


      bucket.scheduledDue =
        categorySets
          .scheduledDue
          .size;


      bucket.completedScheduled =
        categorySets
          .completedScheduled
          .size;


      bucket.completedBeforePeriod =
        categorySets
          .completedBeforePeriod
          .size;


      bucket.outstanding =
        categorySets
          .outstanding
          .size;


      bucket.backlogRecovered =
        categorySets
          .backlogRecovered
          .size;


      bucket.earlyCompleted =
        categorySets
          .earlyCompleted
          .size;


      bucket.fulfilled =
        bucket.completedScheduled +
        bucket.completedBeforePeriod;


      bucket.scheduleGap =
        Math.max(
          0,
          bucket.scheduledDue -
          bucket.fulfilled
        );


      bucket.deliveryRate =
        bucket.scheduledDue > 0

          ? Math.round(
              bucket.completedScheduled *
              100 /
              bucket.scheduledDue
            )

          : 0;


      bucket.fulfillmentRate =
        bucket.scheduledDue > 0

          ? Math.round(
              bucket.fulfilled *
              100 /
              bucket.scheduledDue
            )

          : 0;


      bucket.totalDelivered =
        bucket.completedScheduled +
        bucket.backlogRecovered +
        bucket.earlyCompleted;

    });

  /* =========================================================
   3. RELIABILITY
========================================================= */


/* =====================
   RELIABILITY FILTERS
===================== */

const reliabilityParams = [
  fromDate.toISOString(),
  toDate.toISOString()
];


const reliabilityConditions = [

  `b.started_at >= $1::timestamptz`,

  `b.started_at <= $2::timestamptz`

];


if (areaLines) {

  reliabilityParams.push(
    areaLines
  );

  reliabilityConditions.push(
    `UPPER(TRIM(l.name)) = ANY($${reliabilityParams.length}::text[])`
  );

}


const reliabilityWhereSql =
  `WHERE ${reliabilityConditions.join(" AND ")}`;


/* =====================
   RELIABILITY SUMMARY
===================== */

const reliabilitySummarySql = `

  WITH breakdown_dt AS (

    SELECT

      b.id,
      b.status,
      b.started_at,
      b.closed_at,
      b.verified_down_seconds,

      l.name AS line_name,


      /* =====================
         RECORDED DOWN
      ===================== */

      COALESCE(

        SUM(

          CASE

            WHEN bsh.state = 'DOWN'

            THEN

              GREATEST(

                0,

                EXTRACT(

                  EPOCH FROM (

                    LEAST(

                      COALESCE(
                        bsh.ended_at,
                        b.closed_at,
                        NOW()
                      ),

                      COALESCE(
                        b.closed_at,
                        NOW()
                      )

                    )

                    -

                    bsh.started_at

                  )

                )

              )

            ELSE 0

          END

        ),

        0

      )::bigint
        AS recorded_down_seconds


    FROM breakdowns b


    JOIN assets a
      ON a.id = b.asset_id


    LEFT JOIN lines l
      ON l.id = a.line_id


    LEFT JOIN breakdown_state_history bsh
      ON bsh.breakdown_id = b.id


    ${reliabilityWhereSql}


    GROUP BY

      b.id,
      b.status,
      b.started_at,
      b.closed_at,
      b.verified_down_seconds,
      l.name

  ),


  effective_dt AS (

    SELECT

      id,
      status,
      line_name,

      COALESCE(

        verified_down_seconds,

        recorded_down_seconds

      )::bigint
        AS effective_down_seconds

    FROM breakdown_dt

  )


  SELECT

    COUNT(*)::int
      AS total_incidents,


    COUNT(*) FILTER (

      WHERE status IN (
        'OPEN',
        'IN_PROGRESS'
      )

    )::int
      AS active_incidents,


    COALESCE(

      SUM(
        effective_down_seconds
      ),

      0

    )::bigint
      AS total_effective_down_seconds


  FROM effective_dt

`;


const reliabilitySummaryResult =
  await pool.query(
    reliabilitySummarySql,
    reliabilityParams
  );


const reliabilitySummary =
  reliabilitySummaryResult.rows[0] || {};


/* =====================
   DOWNTIME BY LINE
===================== */

const reliabilityByLineSql = `

  WITH breakdown_dt AS (

    SELECT

      b.id,
      b.status,
      b.started_at,
      b.closed_at,
      b.verified_down_seconds,

      l.name AS line_name,


      COALESCE(

        SUM(

          CASE

            WHEN bsh.state = 'DOWN'

            THEN

              GREATEST(

                0,

                EXTRACT(

                  EPOCH FROM (

                    LEAST(

                      COALESCE(
                        bsh.ended_at,
                        b.closed_at,
                        NOW()
                      ),

                      COALESCE(
                        b.closed_at,
                        NOW()
                      )

                    )

                    -

                    bsh.started_at

                  )

                )

              )

            ELSE 0

          END

        ),

        0

      )::bigint
        AS recorded_down_seconds


    FROM breakdowns b


    JOIN assets a
      ON a.id = b.asset_id


    LEFT JOIN lines l
      ON l.id = a.line_id


    LEFT JOIN breakdown_state_history bsh
      ON bsh.breakdown_id = b.id


    ${reliabilityWhereSql}


    GROUP BY

      b.id,
      b.status,
      b.started_at,
      b.closed_at,
      b.verified_down_seconds,
      l.name

  ),


  effective_dt AS (

    SELECT

      id,

      COALESCE(
        line_name,
        '—'
      ) AS line,

      COALESCE(

        verified_down_seconds,

        recorded_down_seconds

      )::bigint
        AS effective_down_seconds

    FROM breakdown_dt

  )


  SELECT

    line,

    COUNT(*)::int
      AS incidents,

    COALESCE(

      SUM(
        effective_down_seconds
      ),

      0

    )::bigint
      AS effective_down_seconds


  FROM effective_dt


  GROUP BY
    line


  ORDER BY
    effective_down_seconds DESC,
    line ASC

`;


const reliabilityByLineResult =
  await pool.query(
    reliabilityByLineSql,
    reliabilityParams
  );


/* =====================
   NORMALIZE RELIABILITY
===================== */

const reliability = {

  total_incidents:
    Number(
      reliabilitySummary.total_incidents
    ) || 0,


  active_incidents:
    Number(
      reliabilitySummary.active_incidents
    ) || 0,


  effective_down_seconds:
    Number(
      reliabilitySummary.total_effective_down_seconds
    ) || 0,


  downtime_by_line:
    reliabilityByLineResult.rows.map(
      row => ({

        line:
          row.line,

        incidents:
          Number(
            row.incidents
          ) || 0,

        effective_down_seconds:
          Number(
            row.effective_down_seconds
          ) || 0

      })
    )

};

/* =========================================================
   4. BACKLOG HEALTH
========================================================= */

const backlogParams = [];

const backlogConditions = [

  `mt.deleted_at IS NULL`,

  `mt.status <> 'Done'`,

  `mt.due_date IS NOT NULL`,

  `mt.due_date < NOW()`,

  /*
    Corrective / Restoration tasks are not
    part of scheduled maintenance backlog.
  */
  `mt.breakdown_id IS NULL`,

  /*
    Same classification protection used
    by Schedule Delivery.

    Preventive:
      frequency_hours > 0

    Planned:
      frequency_hours <= 0
      and not legacy is_planned=false
  */
  `(
      COALESCE(mt.frequency_hours, 0) > 0

      OR

      mt.is_planned IS DISTINCT FROM false
   )`

];


if (areaLines) {

  backlogParams.push(
    areaLines
  );

  backlogConditions.push(
    `UPPER(TRIM(l.name)) =
      ANY($${backlogParams.length}::text[])`
  );

}


const backlogWhereSql =
  `WHERE ${backlogConditions.join(" AND ")}`;


/* =====================
   BACKLOG SUMMARY
===================== */

const backlogSql = `

  SELECT

    COUNT(*)::int
      AS overdue_tasks,


    COALESCE(
      SUM(
        COALESCE(
          mt.duration_min,
          0
        )
      ),
      0
    )::int
      AS workload_minutes,


    COUNT(*) FILTER (

      WHERE
        NOW() - mt.due_date
        <= INTERVAL '7 days'

    )::int
      AS age_1_7,


    COUNT(*) FILTER (

      WHERE
        NOW() - mt.due_date
          > INTERVAL '7 days'

        AND

        NOW() - mt.due_date
          <= INTERVAL '30 days'

    )::int
      AS age_8_30,


    COUNT(*) FILTER (

      WHERE
        NOW() - mt.due_date
          > INTERVAL '30 days'

    )::int
      AS age_over_30,


    COUNT(*) FILTER (

      WHERE
        LOWER(
          COALESCE(
            mt.impact,
            ''
          )
        )
        IN (
          'safety',
          'safety_quality'
        )

    )::int
      AS safety_overdue,


    COUNT(*) FILTER (

      WHERE
        LOWER(
          COALESCE(
            mt.impact,
            ''
          )
        )
        IN (
          'quality',
          'safety_quality'
        )

    )::int
      AS quality_overdue


  FROM maintenance_tasks mt


  JOIN assets a
    ON a.id = mt.asset_id


  LEFT JOIN lines l
    ON l.id = a.line_id


  ${backlogWhereSql}

`;


const backlogResult =
  await pool.query(
    backlogSql,
    backlogParams
  );


const backlogRow =
  backlogResult.rows[0] || {};


/* =====================
   NORMALIZE
===================== */

const backlogHealth = {

  overdue_tasks:
    Number(
      backlogRow.overdue_tasks
    ) || 0,


  workload_minutes:
    Number(
      backlogRow.workload_minutes
    ) || 0,


  age: {

    days_1_7:
      Number(
        backlogRow.age_1_7
      ) || 0,

    days_8_30:
      Number(
        backlogRow.age_8_30
      ) || 0,

    over_30:
      Number(
        backlogRow.age_over_30
      ) || 0

  },


  safety_overdue:
    Number(
      backlogRow.safety_overdue
    ) || 0,


  quality_overdue:
    Number(
      backlogRow.quality_overdue
    ) || 0

};

/* =========================================================
   5. MAINTENANCE EFFORT BY TYPE
========================================================= */

const effortParams = [
  fromDate.toISOString(),
  toDate.toISOString()
];


const effortConditions = [

  `te.executed_at >= $1::timestamptz`,

  `te.executed_at <= $2::timestamptz`

];


if (areaLines) {

  effortParams.push(
    areaLines
  );

  effortConditions.push(
    `UPPER(TRIM(l.name)) =
      ANY($${effortParams.length}::text[])`
  );

}


const effortWhereSql =
  `WHERE ${effortConditions.join(" AND ")}`;


/* =====================
   QUERY
===================== */

const effortSql = `

  SELECT


    /* =====================
       TOTAL
    ===================== */

    COUNT(te.id)::int
      AS total_executions,


    COUNT(te.duration_minutes)::int
      AS duration_recorded_executions,


    COALESCE(

      SUM(
        te.duration_minutes
      ),

      0

    )::int
      AS total_minutes,


    COALESCE(

      ROUND(
        AVG(
          te.duration_minutes
        )::numeric,
        1
      ),

      0

    )
      AS avg_duration_minutes,



    /* =====================
       PREVENTIVE
    ===================== */

    COUNT(te.id) FILTER (

      WHERE
        mt.breakdown_id IS NULL

        AND COALESCE(
          mt.frequency_hours,
          0
        ) > 0

    )::int
      AS preventive_executions,


    COALESCE(

      SUM(
        te.duration_minutes
      ) FILTER (

        WHERE
          mt.breakdown_id IS NULL

          AND COALESCE(
            mt.frequency_hours,
            0
          ) > 0

      ),

      0

    )::int
      AS preventive_minutes,



    /* =====================
       PLANNED
    ===================== */

    COUNT(te.id) FILTER (

      WHERE
        mt.breakdown_id IS NULL

        AND COALESCE(
          mt.frequency_hours,
          0
        ) <= 0

        AND mt.is_planned
          IS DISTINCT FROM false

    )::int
      AS planned_executions,


    COALESCE(

      SUM(
        te.duration_minutes
      ) FILTER (

        WHERE
          mt.breakdown_id IS NULL

          AND COALESCE(
            mt.frequency_hours,
            0
          ) <= 0

          AND mt.is_planned
            IS DISTINCT FROM false

      ),

      0

    )::int
      AS planned_minutes,

    /* =====================
      CORRECTIVE
      - New model: linked to Breakdown
      - Legacy model: is_planned = false
    ===================== */

    COUNT(te.id) FILTER (

      WHERE

        mt.breakdown_id IS NOT NULL

        OR (

          mt.breakdown_id IS NULL

          AND mt.is_planned = false

        )

    )::int
      AS corrective_executions,


    COALESCE(

      SUM(
        te.duration_minutes
      ) FILTER (

        WHERE

          mt.breakdown_id IS NOT NULL

          OR (

            mt.breakdown_id IS NULL

            AND mt.is_planned = false

          )

      ),

      0

    )::int
      AS corrective_minutes


  FROM task_executions te


  JOIN maintenance_tasks mt
    ON mt.id = te.task_id


  JOIN assets a
    ON a.id = mt.asset_id


  LEFT JOIN lines l
    ON l.id = a.line_id


  ${effortWhereSql}

`;


const effortResult =
  await pool.query(
    effortSql,
    effortParams
  );


const effortRow =
  effortResult.rows[0] || {};


/* =====================
   NORMALIZE
===================== */

const maintenanceEffort = {

  total_minutes:
    Number(
      effortRow.total_minutes
    ) || 0,


  total_executions:
    Number(
      effortRow.total_executions
    ) || 0,


  duration_recorded_executions:
    Number(
      effortRow.duration_recorded_executions
    ) || 0,


  avg_duration_minutes:
    Number(
      effortRow.avg_duration_minutes
    ) || 0,


  preventive: {

    minutes:
      Number(
        effortRow.preventive_minutes
      ) || 0,

    executions:
      Number(
        effortRow.preventive_executions
      ) || 0

  },


  planned: {

    minutes:
      Number(
        effortRow.planned_minutes
      ) || 0,

    executions:
      Number(
        effortRow.planned_executions
      ) || 0

  },


  corrective: {

    minutes:
      Number(
        effortRow.corrective_minutes
      ) || 0,

    executions:
      Number(
        effortRow.corrective_executions
      ) || 0

  }

};

/* =========================================================
   6. MAINTENANCE WORKLOAD FORECAST

   Next 7 calendar days
   - Preventive + Planned only
   - Corrective excluded
   - Overdue backlog shown separately
   - Overdue backlog NOT included in forecast
========================================================= */


/* =====================
   FORECAST FILTERS
===================== */

const forecastParams = [];


const forecastConditions = [

  `mt.deleted_at IS NULL`,

  `mt.status <> 'Done'`,

  `mt.due_date IS NOT NULL`,

  /*
    Only work still due from now onward.
    Overdue work is shown separately.
  */
  `mt.due_date >= NOW()`,

  /*
    Today + next 6 calendar days,
    based on Athens local date.
  */
  `
    mt.due_date < (
      (
        DATE_TRUNC(
          'day',
          NOW() AT TIME ZONE 'Europe/Athens'
        )
        + INTERVAL '7 days'
      )
      AT TIME ZONE 'Europe/Athens'
    )
  `,

  /*
    Corrective / Restoration excluded
  */
  `mt.breakdown_id IS NULL`,

  /*
    Preventive + Planned only.
    Legacy is_planned=false excluded.
  */
  `
    (
      COALESCE(
        mt.frequency_hours,
        0
      ) > 0

      OR

      (
        COALESCE(
          mt.frequency_hours,
          0
        ) <= 0

        AND mt.is_planned
          IS DISTINCT FROM false
      )
    )
  `

];


if (areaLines) {

  forecastParams.push(
    areaLines
  );


  forecastConditions.push(

    `UPPER(TRIM(l.name)) =
      ANY($${forecastParams.length}::text[])`

  );

}


const forecastWhereSql =
  `WHERE ${forecastConditions.join(" AND ")}`;

/* =====================
   FORECAST QUERY
===================== */

const forecastSql = `

  SELECT

    TO_CHAR(
      mt.due_date
      AT TIME ZONE 'Europe/Athens',
      'YYYY-MM-DD'
    ) AS due_day,


    COUNT(*)::int
      AS total_tasks,


    COALESCE(
      SUM(
        COALESCE(
          mt.duration_min,
          0
        )
      ),
      0
    )::int
      AS total_minutes,


    COUNT(*) FILTER (

      WHERE

        COALESCE(
          mt.frequency_hours,
          0
        ) > 0

    )::int
      AS preventive_tasks,


    COALESCE(

      SUM(
        COALESCE(
          mt.duration_min,
          0
        )
      ) FILTER (

        WHERE

          COALESCE(
            mt.frequency_hours,
            0
          ) > 0

      ),

      0

    )::int
      AS preventive_minutes,


    COUNT(*) FILTER (

      WHERE

        COALESCE(
          mt.frequency_hours,
          0
        ) <= 0

        AND mt.is_planned
          IS DISTINCT FROM false

    )::int
      AS planned_tasks,


    COALESCE(

      SUM(
        COALESCE(
          mt.duration_min,
          0
        )
      ) FILTER (

        WHERE

          COALESCE(
            mt.frequency_hours,
            0
          ) <= 0

          AND mt.is_planned
            IS DISTINCT FROM false

      ),

      0

    )::int
      AS planned_minutes


  FROM maintenance_tasks mt


  JOIN assets a
    ON a.id = mt.asset_id


  LEFT JOIN lines l
    ON l.id = a.line_id


  ${forecastWhereSql}


  GROUP BY

    TO_CHAR(
      mt.due_date
      AT TIME ZONE 'Europe/Athens',
      'YYYY-MM-DD'
    )


  ORDER BY

    due_day ASC

`;


const forecastResult =
  await pool.query(
    forecastSql,
    forecastParams
  );


/* =====================
   BUILD 7 CALENDAR DAYS
===================== */

const athensDateFormatter =
  new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );


const todayAthens =
  athensDateFormatter.format(
    new Date()
  );


const [
  forecastYear,
  forecastMonth,
  forecastDay
] =
  todayAthens
    .split("-")
    .map(Number);


/*
  UTC is used only for safe
  date arithmetic here.
*/
const forecastCalendarStart =
  new Date(
    Date.UTC(
      forecastYear,
      forecastMonth - 1,
      forecastDay
    )
  );


const forecastRowsByDate =
  new Map(
    forecastResult.rows.map(
      row => [

        String(
          row.due_day
        ),

        row

      ]
    )
  );


const forecastDays = [];


for (
  let i = 0;
  i < 7;
  i++
) {

  const calendarDate =
    new Date(
      forecastCalendarStart.getTime()
      +
      i * 86400000
    );


  const date =
    calendarDate
      .toISOString()
      .slice(0, 10);


  const row =
    forecastRowsByDate.get(
      date
    ) || {};


  forecastDays.push({

    date,

    tasks:
      Number(
        row.total_tasks
      ) || 0,

    minutes:
      Number(
        row.total_minutes
      ) || 0,


    preventive: {

      tasks:
        Number(
          row.preventive_tasks
        ) || 0,

      minutes:
        Number(
          row.preventive_minutes
        ) || 0

    },


    planned: {

      tasks:
        Number(
          row.planned_tasks
        ) || 0,

      minutes:
        Number(
          row.planned_minutes
        ) || 0

    }

  });

}


/* =====================
   FORECAST TOTALS
===================== */

const forecastTotalTasks =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.total_tasks
        ) || 0
      ),
    0
  );


const forecastTotalMinutes =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.total_minutes
        ) || 0
      ),
    0
  );


const forecastPreventiveTasks =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.preventive_tasks
        ) || 0
      ),
    0
  );


const forecastPreventiveMinutes =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.preventive_minutes
        ) || 0
      ),
    0
  );


const forecastPlannedTasks =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.planned_tasks
        ) || 0
      ),
    0
  );


const forecastPlannedMinutes =
  forecastResult.rows.reduce(
    (sum, row) =>
      sum +
      (
        Number(
          row.planned_minutes
        ) || 0
      ),
    0
  );


/* =====================
   PEAK DAY
===================== */

const forecastPeakDay =
  forecastDays.reduce(
    (peak, day) => {

      if (
        !peak ||
        day.minutes > peak.minutes
      ) {

        return day;

      }


      return peak;

    },
    null
  );


/* =====================
   NORMALIZE
===================== */

const maintenanceWorkloadForecast = {

  total_tasks:
    forecastTotalTasks,

  total_minutes:
    forecastTotalMinutes,


  preventive: {

    tasks:
      forecastPreventiveTasks,

    minutes:
      forecastPreventiveMinutes

  },


  planned: {

    tasks:
      forecastPlannedTasks,

    minutes:
      forecastPlannedMinutes

  },


  days:
    forecastDays,


  peak_day:
    forecastPeakDay,


  avg_minutes_per_day:
    Math.round(
      forecastTotalMinutes / 7
    ),


  /*
    Current overdue scheduled workload.

    This comes directly from Backlog Health
    and is NOT included in forecast totals.
  */
  overdue_backlog: {

    tasks:
      backlogHealth.overdue_tasks,

    minutes:
      backlogHealth.workload_minutes

  }

};


    /* =====================================================
       RESPONSE
    ===================================================== */

    res.json({

      period: {
        from:
          fromDate.toISOString(),

        to:
          toDate.toISOString()
      },


      area:
        normalizedArea,


      maintenance_mix: {

        total:
          preventive +
          planned +
          corrective,

        preventive,

        planned,

        corrective

      },


      schedule_delivery:
        delivery,

      reliability:
        reliability,

      backlog_health:
        backlogHealth,

      maintenance_effort:
        maintenanceEffort,

      maintenance_workload_forecast:
        maintenanceWorkloadForecast

    });


  } catch (err) {

    console.error(
      "GET /management-dashboard ERROR:",
      err
    );


    res.status(500).json({
      error:
        "Failed to load Management Dashboard"
    });

  }

});

/* =========================================================
   GET /tasks — ACTIVE MAINTENANCE TASKS

   Returns active Planned / Overdue Tasks for active Assets.

   INCIDENT REFERENCES
   ---------------------------------------------------------
   breakdown_id:
     Links a Restoration Task to its parent Breakdown.

   scheduled_maintenance_id:
     Links a Planned Task to its parent Scheduled Maintenance.

   maintenance_report_id / maintenance_report_code:
     Identifies a Planned Task that was created from a
     Maintenance Report (MR-xxxxx).

   IMPORTANT
   ---------------------------------------------------------
   - SM Tasks remain normal Planned Tasks.
   - MR-created Tasks remain normal Planned Tasks.
   - This route does not create or complete Tasks.
   - No Breakdown downtime is calculated or modified.
   - Completed Tasks are handled by the History endpoint.
========================================================= */

app.get("/tasks", async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        mt.id,
        mt.breakdown_id,
        mt.scheduled_maintenance_id,
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

        /* =================================================
           MAINTENANCE REPORT SOURCE

           If this Task was created from a Maintenance Report,
           expose the linked Report ID and formatted MR code.
        ================================================= */

        mr.id AS maintenance_report_id,

        CASE
          WHEN mr.id IS NOT NULL
            THEN
              'MR-' ||
              LPAD(
                mr.id::text,
                5,
                '0'
              )
          ELSE NULL
        END AS maintenance_report_code,

        a.name AS asset_name,
        a.model AS machine_name,
        a.serial_number,
        a.idle_since AS asset_idle_since,
        l.code AS line_code

      FROM maintenance_tasks mt

      JOIN assets a
        ON a.id = mt.asset_id

      JOIN lines l
        ON l.id = a.line_id

      /* =================================================
         MAINTENANCE REPORT SOURCE LINK

         Maintenance Reports store the ID of the Planned Task
         created during conversion in maintenance_task_id.
      ================================================= */

      LEFT JOIN maintenance_reports mr
        ON mr.maintenance_task_id = mt.id

      WHERE
        mt.status IN ('Planned', 'Overdue')
        AND mt.deleted_at IS NULL
        AND a.active = true

      ORDER BY mt.due_date ASC
    `);


    res.json(result.rows);

  } catch (err) {

    console.error(
      "GET /tasks ERROR:",
      err.message
    );

    res.status(500).json({
      error: err.message
    });

  }
});

/*================================
   CREATE TASK

   Modes:
   1. Planned Open
   2. Planned Completed
   3. Legacy Unplanned Completed
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

    technician_id,

    // Estimated duration — normal Planned only
    duration_min,

    // Actual duration — completed task only
    execution_duration_min,

    // Actual execution time
    execution_date,

    // NEW:
    // Planned task recorded directly as completed
    record_completed

  } = req.body;


  if (!asset_id || !task) {

    return res.status(400).json({
      error: "Missing required fields"
    });

  }


  const isPlanned =
    is_planned === true;


  const isCompletedPlanned =
    isPlanned &&
    record_completed === true;


  const isLegacyUnplanned =
    is_planned === false;


  /* =====================
     NORMAL PLANNED VALIDATION
  ===================== */

  if (
    isPlanned &&
    !isCompletedPlanned &&
    !due_date
  ) {

    return res.status(400).json({
      error:
        "Due date is required for a planned task"
    });

  }


  /* =====================
     COMPLETED TASK VALIDATION
  ===================== */

  if (
    isCompletedPlanned ||
    isLegacyUnplanned
  ) {

    if (!technician_id) {

      return res.status(400).json({
        error:
          "Technician is required for completed tasks"
      });

    }


    if (!execution_date) {

      return res.status(400).json({
        error:
          "Execution date is required for completed tasks"
      });

    }


    if (
      !Number.isFinite(
        Number(execution_duration_min)
      ) ||
      Number(execution_duration_min) < 0
    ) {

      return res.status(400).json({
        error:
          "Valid actual duration is required"
      });

    }

  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    /* =====================
      RESOLVE EXECUTION DATA
    ===================== */

    let executionAt = null;

    let technicianName = null;


    if (
      isCompletedPlanned ||
      isLegacyUnplanned
    ) {

      executionAt =
        new Date(
          execution_date
        );

      /* =====================
        VALIDATE EXECUTION DATE
      ===================== */

      if (
        Number.isNaN(
          executionAt.getTime()
        )
      ) {

        throw new Error(
          "Invalid execution date"
        );

      }

      if (
        executionAt.getTime() >
        Date.now()
      ) {

        throw new Error(
          "Execution date cannot be in the future"
        );

      }

      /* =====================
        LOAD TECHNICIAN
      ===================== */

      const techRes =
        await client.query(
          `
          SELECT
            id,
            name

          FROM technicians

          WHERE id = $1
            AND active = true

          LIMIT 1
          `,
          [technician_id]
        );


      if (
        techRes.rows.length === 0
      ) {

        throw new Error(
          "Technician not found or inactive"
        );

      }


      technicianName =
        techRes.rows[0].name;

    }

    /* =====================
       RESOLVE TASK VALUES
    ===================== */

    let resolvedDueDate = null;

    let resolvedStatus = "Planned";

    let resolvedDurationMin = null;

    let completedAt = null;

    let completedBy = null;


    /* NORMAL PLANNED */

    if (
      isPlanned &&
      !isCompletedPlanned
    ) {

      resolvedDueDate =
        new Date(due_date);

      resolvedStatus =
        "Planned";

      resolvedDurationMin =
        Number.isFinite(
          Number(duration_min)
        )
          ? Number(duration_min)
          : null;

    }


    /* COMPLETED PLANNED */

    if (isCompletedPlanned) {

      /*
        Reporting rule:

        Due = Actual Completion
      */

      resolvedDueDate =
        executionAt;

      resolvedStatus =
        "Done";

      resolvedDurationMin =
        null;

      completedAt =
        executionAt;

      completedBy =
        technicianName;

    }

    /* LEGACY UNPLANNED */

    if (isLegacyUnplanned) {

      resolvedDueDate =
        null;

      resolvedStatus =
        "Done";

      resolvedDurationMin =
        null;

      completedAt =
        executionAt;

      completedBy =
        technicianName;

    }

    /* =====================
       INSERT TASK
    ===================== */

    const taskRes =
      await client.query(
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
            notes,
            completed_at,
            completed_by
          )

        VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,$10,$11,$12,$13
          )

        RETURNING *
        `,
        [
          asset_id,                // $1
          section || null,         // $2
          unit || null,            // $3
          task,                    // $4
          type || null,            // $5
          impact || "normal",      // $6
          resolvedDueDate,         // $7
          resolvedStatus,          // $8
          isPlanned,               // $9
          resolvedDurationMin,     // $10
          notes || null,           // $11
          completedAt,             // $12
          completedBy              // $13
        ]
      );


    const newTask =
      taskRes.rows[0];


    /* =====================
       CREATE EXECUTION

       Only:
       - Completed Planned
       - Legacy Unplanned
    ===================== */

    if (
      isCompletedPlanned ||
      isLegacyUnplanned
    ) {

      await client.query(
        `
        INSERT INTO task_executions
          (
            task_id,
            asset_id,
            technician_id,
            executed_by,
            prev_due_date,
            executed_at,
            duration_minutes,
            notes
          )

        VALUES
          (
            $1,$2,$3,$4,
            $5,$6,$7,$8
          )
        `,
        [
          newTask.id,                         // $1
          asset_id,                           // $2
          technician_id,                      // $3
          technicianName,                     // $4

          /*
            Completed Planned:
            prev_due_date = execution time

            Legacy Unplanned:
            no artificial due
          */
          isCompletedPlanned
            ? executionAt
            : null,                           // $5

          executionAt,                        // $6

          Number(
            execution_duration_min
          ),                                  // $7

          notes || null                       // $8
        ]
      );

    }


    await client.query("COMMIT");


    return res.json({
      ...newTask,

      record_completed:
        isCompletedPlanned
    });


  } catch (err) {

    await client.query(
      "ROLLBACK"
    );


    console.error(
      "POST /tasks ERROR:",
      err
    );


    return res.status(500).json({
      error: err.message
    });


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


    /* =====================
       VALIDATION
    ===================== */

    if (!asset_id) {

      return res.status(400).json({
        error: "asset_id is required"
      });

    }


    if (
      !task ||
      !task.trim()
    ) {

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


    /* =====================
       IMPACT
    ===================== */

    const cleanImpact =
      String(
        impact || "normal"
      )
        .toLowerCase();


    const validImpacts = [
      "normal",
      "safety",
      "quality",
      "safety_quality"
    ];


    if (
      !validImpacts.includes(
        cleanImpact
      )
    ) {

      return res.status(400).json({
        error: "Invalid preventive impact"
      });

    }


    /* =====================
       START TRANSACTION
    ===================== */

    await client.query(
      "BEGIN"
    );


/* =====================
   CREATE PREVENTIVE TASK

   IMPORTANT:
   unique_preventive_task is a PARTIAL UNIQUE INDEX,
   not a PostgreSQL CONSTRAINT.

   Therefore conflict detection must use:
   - the indexed columns
   - the exact same partial-index predicate

   The unique rule applies only to Tasks that are:
   - NOT Breakdown Tasks
   - NOT Scheduled Maintenance Tasks
===================== */

const result =
  await client.query(
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

    /* =====================
       DUPLICATE PROTECTION

       Matches the partial unique index:

       unique_preventive_task
       (
         asset_id,
         section,
         unit,
         task,
         type,
         frequency_hours
       )

       WHERE
         breakdown_id IS NULL
         AND scheduled_maintenance_id IS NULL

       Result:
       - Preventive duplicates are blocked.
       - Standalone Planned duplicates are blocked.
       - Breakdown Tasks are excluded.
       - Scheduled Maintenance Tasks are excluded,
         because the same real maintenance work
         may legitimately repeat in another SM.
    ===================== */

    ON CONFLICT (
      asset_id,
      section,
      unit,
      task,
      type,
      frequency_hours
    )
    WHERE
      breakdown_id IS NULL
      AND scheduled_maintenance_id IS NULL

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


    /* =====================
       COMMIT
    ===================== */

    await client.query(
      "COMMIT"
    );


    /* =====================
       DUPLICATE PREVENTIVE
    ===================== */

    if (
      result.rowCount === 0
    ) {

      return res.status(409).json({
        error:
          "Preventive already exists for this asset"
      });

    }


    /* =====================
       SUCCESS
    ===================== */

    res.json({
      message:
        "Preventive created successfully",

      preventive:
        result.rows[0]
    });


  } catch (err) {

    /* =====================
       ROLLBACK
    ===================== */

    await client.query(
      "ROLLBACK"
    );


    console.error(
      "CREATE PREVENTIVE ERROR:",
      err
    );


    res.status(500).json({
      error:
        err.message
    });


  } finally {

    /* =====================
       RELEASE CONNECTION
    ===================== */

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
   - Planned / Restoration without frequency: FINISH

   HISTORICAL COMPLETION:
   - completed_at may represent the REAL time at which
     the maintenance work was previously performed.
   - Therefore completed_at may be earlier than the
     task created_at timestamp.
   - This supports Restoration work recorded later
     for an already restored / historical Breakdown.
   - task_executions.executed_at keeps the REAL
     maintenance execution time.

   SAFETY:
   - One-off tasks cannot be completed twice
   - Row is locked during completion
===================== */

app.patch("/tasks/:id", async (req, res) => {

  const {
    completed_by,
    completed_at,
    notes,
    technician_id,
    actual_duration_min
  } = req.body;

  const { id } = req.params;

  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    /* =====================
       NORMALIZE DATE
    ====================== */

    const completedAt =
      completed_at
        ? new Date(completed_at)
        : new Date();


    if (
      Number.isNaN(
        completedAt.getTime()
      )
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Invalid completion date / time"
      });

    }


    /* =====================
       1. FETCH + LOCK TASK

       FOR UPDATE prevents two simultaneous
       completion requests from processing
       the same task at the same time.
    ====================== */

    const taskRes =
      await client.query(
        `
          SELECT *
          FROM maintenance_tasks
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );


    if (!taskRes.rows.length) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Task not found"
      });

    }


    const task =
      taskRes.rows[0];


    const hasFrequency =
      task.frequency_hours &&
      Number(task.frequency_hours) > 0;


    /* =====================
       2. DUPLICATE COMPLETION GUARD

       Preventive tasks are intentionally
       excluded because they rotate and can
       have multiple executions over time.

       One-off tasks (including Restoration)
       may only be completed once.
    ====================== */

    if (
      !hasFrequency &&
      String(task.status).toLowerCase() === "done"
    ) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "Task is already completed"
      });

    }


    /* =====================
       3. LOG EXECUTION
    ====================== */

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
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8
        )
      `,
      [
        task.id,
        task.asset_id,
        completed_by || null,
        technician_id || null,
        task.due_date,
        completedAt,

        Number.isFinite(
          Number(actual_duration_min)
        )
          ? Math.round(
              Number(actual_duration_min)
            )
          : (
              Number.isFinite(
                Number(task.duration_min)
              )
                ? Math.round(
                    Number(task.duration_min)
                  )
                : null
            ),

        notes || task.notes || null
      ]
    );


    /* =====================
       4. PREVENTIVE → ROTATE
    ====================== */

    if (hasFrequency) {

      const freqHours =
        Number(task.frequency_hours);


      const calendarDays =
        Math.round(
          freqHours *
          7 /
          WORKING_HOURS_PER_WEEK
        );


      const nextDue =
        new Date(completedAt);


      nextDue.setDate(
        nextDue.getDate() +
        calendarDays
      );


      await client.query(
        `
          UPDATE maintenance_tasks
          SET
            status = 'Planned',
            due_date = $2,
            completed_by = $3,
            completed_at = $4,
            notes = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          id,
          nextDue,
          completed_by || null,
          completedAt
        ]
      );

    }


    /* =====================
       5. ONE-OFF / RESTORATION
          → FINISH
    ====================== */

    else {

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
          id,
          completed_by || null,
          completedAt,
          notes || null
        ]
      );

    }


    /* =====================
       COMMIT
    ====================== */

    await client.query("COMMIT");


    return res.json({
      success: true,
      rotated: hasFrequency
    });


  } catch (err) {

    try {
      await client.query("ROLLBACK");
    } catch (_) {}


    console.error(
      "PATCH /tasks/:id ERROR:",
      err.message
    );


    return res.status(500).json({
      error: err.message
    });


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

    const completedAt =
      completed_at
        ? new Date(completed_at)
        : new Date();


    if (
      Number.isNaN(
        completedAt.getTime()
      )
    ) {

      return res.status(400).json({
        error: "Invalid completion date / time"
      });

    }


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

/* =========================================================
   GET /executions — TASK EXECUTION HISTORY

   Returns completed Task executions for the central History.

   - Preserves the existing execution details and filters.
   - Returns Breakdown and Scheduled Maintenance references.
   - Returns Maintenance Report source reference when applicable.
   - SM executions remain normal Planned executions.
   - MR-created Tasks remain normal Planned executions.
   - Existing legacy Breakdown cutover remains unchanged.
   - Does not create, update or delete executions.
========================================================= */

app.get("/executions", async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        e.id,
        e.task_id,
        e.executed_at,
        e.executed_by,
        e.technician_id,
        e.notes AS notes,
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

        /* =====================================================
           MAINTENANCE INCIDENT REFERENCES

           breakdown_id:
             Parent Breakdown for Restoration Tasks.

           scheduled_maintenance_id:
             Parent Scheduled Maintenance for Planned Tasks.

           Both references are returned to History so the
           frontend can display BD-xxxxx or SM-xxxxx.

           Neither reference changes the execution type,
           task completion or Breakdown downtime.
        ===================================================== */

        t.breakdown_id,
        t.scheduled_maintenance_id,

        /* =====================================================
           MAINTENANCE REPORT SOURCE

           If the executed Task was originally created from a
           Maintenance Report, expose the linked Report ID and
           formatted MR-xxxxx code.

           The existing relation remains:
           maintenance_reports.maintenance_task_id = task.id
        ===================================================== */

        mr.id AS maintenance_report_id,

        CASE
          WHEN mr.id IS NOT NULL
            THEN
              'MR-' ||
              LPAD(
                mr.id::text,
                5,
                '0'
              )
          ELSE NULL
        END AS maintenance_report_code,

        /* =====================================================
           TASK ATTACHMENTS

           Count attachments owned by the Task.

           History uses this only as a lightweight indicator.
           No files or signed URLs are loaded here.
        ===================================================== */

        (
          SELECT COUNT(*)
          FROM attachments att
          WHERE att.entity_type = 'TASK'
            AND att.entity_id = t.id
        )::int AS attachment_count,

        a.model AS machine,
        a.serial_number,
        l.code AS line

      FROM task_executions e

      JOIN maintenance_tasks t
        ON t.id = e.task_id

      JOIN assets a
        ON a.id = e.asset_id

      JOIN lines l
        ON l.id = a.line_id

      /* =====================================================
         MAINTENANCE REPORT SOURCE LINK

         A Maintenance Report stores the ID of the Planned Task
         created during conversion in maintenance_task_id.

         LEFT JOIN preserves all normal Tasks and executions.
      ===================================================== */

      LEFT JOIN maintenance_reports mr
        ON mr.maintenance_task_id = t.id

      /* =====================================================
         HISTORY CUTOVER

         Hide old legacy Breakdown executions ONLY when
         the legacy task has already been migrated into
         the new Breakdown / Restoration model.

         No legacy data is deleted.
         Restoration executions remain visible.
      ===================================================== */

      WHERE NOT (
        t.is_planned = FALSE
        AND t.breakdown_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM breakdowns b_migrated
          WHERE b_migrated.legacy_task_id = t.id
        )
      )

      ORDER BY e.executed_at DESC
    `);


    res.json(
      result.rows
    );

  } catch (err) {

    console.error(
      "GET /executions ERROR:",
      err.message
    );


    res.status(500).json({
      error:
        err.message
    });

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

/*================================================
 KPI – MAINTENANCE WORKLOAD MIX

 New CMMS model:

 - Preventive
 - Planned
 - Restoration
 - Legacy Unplanned

 IMPORTANT:
 Legacy Unplanned remains visible during
 the transition / migration period.
=================================================*/

app.get("/kpis/workload-mix", async (req, res) => {

  try {

    const { rows } =
      await pool.query(`
        SELECT

          /* =========================
             PREVENTIVE WORK
          ========================= */

          COALESCE(
            SUM(
              CASE
                WHEN
                  mt.breakdown_id IS NULL
                  AND COALESCE(mt.frequency_hours, 0) > 0
                THEN mt.duration_min
                ELSE 0
              END
            ),
            0
          )::int AS preventive_minutes,


          /* =========================
             PLANNED ONE-OFF WORK
          ========================= */

          COALESCE(
            SUM(
              CASE
                WHEN
                  mt.breakdown_id IS NULL
                  AND COALESCE(mt.frequency_hours, 0) = 0
                  AND mt.is_planned = true
                THEN mt.duration_min
                ELSE 0
              END
            ),
            0
          )::int AS planned_minutes,


          /* =========================
             RESTORATION WORK

             Any maintenance task linked
             to a new Breakdown incident.
          ========================= */

          COALESCE(
            SUM(
              CASE
                WHEN
                  mt.breakdown_id IS NOT NULL
                THEN mt.duration_min
                ELSE 0
              END
            ),
            0
          )::int AS restoration_minutes,


          /* =========================
             LEGACY UNPLANNED

             Old Breakdown-as-Task model.
             Keep during migration only.
          ========================= */

          COALESCE(
            SUM(
              CASE
                WHEN
                  mt.breakdown_id IS NULL
                  AND mt.is_planned = false
                THEN mt.duration_min
                ELSE 0
              END
            ),
            0
          )::int AS legacy_unplanned_minutes,


          /* =========================
             TOTAL OPEN WORKLOAD
          ========================= */

          COALESCE(
            SUM(mt.duration_min),
            0
          )::int AS total_minutes


        FROM maintenance_tasks mt

        WHERE
          mt.duration_min IS NOT NULL

          AND mt.status != 'Done'

          AND mt.deleted_at IS NULL
      `);


    res.json(rows[0]);


  } catch (err) {

    console.error(
      "GET /kpis/workload-mix ERROR:",
      err.message
    );

    res.status(500).json({
      error: err.message
    });

  }

});

/*================================================
 KPI – BREAKDOWN SUMMARY
 DT Model v1

 Source:
   breakdowns = Breakdown incidents
   breakdown_state_history = raw Machine State history

 Rules:
   - Incident count comes from breakdowns
   - Active = OPEN + IN_PROGRESS
   - Effective DOWN =
       Verified DOWN when available
       otherwise Recorded DOWN
   - Average DOWN uses CLOSED incidents only

 Restoration Task duration is NOT downtime.
=================================================*/

app.get("/kpis/breakdowns/summary", async (req, res) => {

  try {

    const { rows } =
      await pool.query(`
        WITH breakdown_downtime AS (

          SELECT
            b.id,
            b.status,

            /* =========================
               RECORDED DOWN

               Sum raw DOWN intervals,
               clipped to Breakdown end.
            ========================= */

            COALESCE(
              (
                SELECT
                  SUM(
                    GREATEST(
                      EXTRACT(
                        EPOCH FROM (
                          LEAST(
                            COALESCE(
                              bsh.ended_at,
                              NOW()
                            ),
                            COALESCE(
                              b.closed_at,
                              NOW()
                            )
                          )
                          - bsh.started_at
                        )
                      ),
                      0
                    )
                  )

                FROM breakdown_state_history bsh

                WHERE
                  bsh.breakdown_id = b.id
                  AND bsh.state = 'DOWN'
              ),
              0
            ) AS recorded_down_seconds,


            /* =========================
               VERIFIED DOWN
            ========================= */

            b.verified_down_seconds

          FROM breakdowns b
        ),

        effective_downtime AS (

          SELECT
            id,
            status,

            /* =========================
               CANONICAL EFFECTIVE DOWN

               NULL verified value:
                 use Recorded

               0 verified value:
                 explicitly verified
                 zero downtime
            ========================= */

            COALESCE(
              verified_down_seconds,
              recorded_down_seconds
            ) AS effective_down_seconds

          FROM breakdown_downtime
        )


        SELECT

          /* =========================
             ALL BREAKDOWN INCIDENTS
          ========================= */

          COUNT(*)::int
            AS total_incidents,


          /* =========================
             ACTIVE INCIDENTS

             OPEN + IN_PROGRESS
          ========================= */

          COUNT(*) FILTER (
            WHERE status IN (
              'OPEN',
              'IN_PROGRESS'
            )
          )::int
            AS active_incidents,


          /* =========================
             CLOSED INCIDENTS
          ========================= */

          COUNT(*) FILTER (
            WHERE status = 'CLOSED'
          )::int
            AS closed_incidents,


          /* =========================
             TOTAL EFFECTIVE DOWN

             All incidents, including
             currently active ones.
          ========================= */

          COALESCE(
            SUM(
              effective_down_seconds
            ),
            0
          )::bigint
            AS total_effective_down_seconds,


          /* =========================
             CLOSED EFFECTIVE DOWN

             Useful denominator/source
             for closed-breakdown metrics.
          ========================= */

          COALESCE(
            SUM(
              effective_down_seconds
            ) FILTER (
              WHERE status = 'CLOSED'
            ),
            0
          )::bigint
            AS closed_effective_down_seconds,


          /* =========================
             AVG EFFECTIVE DOWN
             PER CLOSED BREAKDOWN

             Not called MTTR.
          ========================= */

          COALESCE(
            ROUND(
              AVG(
                effective_down_seconds
              ) FILTER (
                WHERE status = 'CLOSED'
              )
            ),
            0
          )::bigint
            AS avg_effective_down_seconds

        FROM effective_downtime
      `);


    res.json(rows[0]);


  } catch (err) {

    console.error(
      "GET /kpis/breakdowns/summary ERROR:",
      err.message
    );

    res.status(500).json({
      error: err.message
    });

  }

});

/*================================================
 KPI – MAINTENANCE EXECUTION MIX

 Counts completed maintenance executions.

 New CMMS model:
   - Preventive
   - Planned
   - Restoration
   - Legacy Unplanned

 IMPORTANT:
   Restoration is identified FIRST by
   maintenance_tasks.breakdown_id.

   Legacy Unplanned remains temporarily
   until historical migration is complete.
=================================================*/

app.get("/kpis/execution-mix", async (req, res) => {

  try {

    const { rows } =
      await pool.query(`
        SELECT

          /* =========================
             TOTAL EXECUTIONS
          ========================= */

          COUNT(te.id)::int
            AS total_executions,


          /* =========================
             PREVENTIVE

             Recurring maintenance task
             not linked to a Breakdown.
          ========================= */

          COUNT(te.id) FILTER (
            WHERE
              mt.breakdown_id IS NULL
              AND COALESCE(
                mt.frequency_hours,
                0
              ) > 0
          )::int
            AS preventive_executions,


          /* =========================
             PLANNED

             One-off planned work,
             not linked to a Breakdown.
          ========================= */

          COUNT(te.id) FILTER (
            WHERE
              mt.breakdown_id IS NULL
              AND COALESCE(
                mt.frequency_hours,
                0
              ) = 0
              AND mt.is_planned = true
          )::int
            AS planned_executions,


          /* =========================
             RESTORATION

             Any execution whose parent
             maintenance task belongs to
             a new Breakdown incident.

             breakdown_id takes priority
             over is_planned.
          ========================= */

          COUNT(te.id) FILTER (
            WHERE
              mt.breakdown_id IS NOT NULL
          )::int
            AS restoration_executions,


          /* =========================
             LEGACY UNPLANNED

             Old Breakdown-as-Task model.

             Temporary category until
             legacy migration is complete.
          ========================= */

          COUNT(te.id) FILTER (
            WHERE
              mt.breakdown_id IS NULL
              AND mt.is_planned = false
          )::int
            AS legacy_unplanned_executions


        FROM task_executions te

        JOIN maintenance_tasks mt
          ON mt.id = te.task_id
      `);


    res.json(rows[0]);


  } catch (err) {

    console.error(
      "GET /kpis/execution-mix ERROR:",
      err.message
    );

    res.status(500).json({
      error: err.message
    });

  }

});

/* =========================================================
   REPORT - BREAKDOWN PERFORMANCE

   Used by Completed Maintenance Report.

   Filters:
   - from : Breakdown started_at >= from
   - to   : Breakdown started_at < to + 1 day
   - line : Asset line

   IMPORTANT:
   Technician is intentionally NOT a filter here.

   Effective DOWN:
   Verified DOWN if available,
   otherwise Recorded DOWN.

   Average Effective DOWN:
   CLOSED incidents only.
========================================================= */

app.get("/kpis/breakdowns/report-summary", async (req, res) => {

    try {

      const {
        from,
        to,
        line
      } = req.query;


      const params = [];
      const conditions = [];


      /* =========================
         DATE FROM
      ========================= */

      if (from) {

        params.push(from);

        conditions.push(
          `b.started_at >= $${params.length}::date`
        );

      }


      /* =========================
         DATE TO

         Exclusive next-day boundary
         so the complete "to" date
         is included.
      ========================= */

      if (to) {

        params.push(to);

        conditions.push(
          `b.started_at < ` +
          `($${params.length}::date + INTERVAL '1 day')`
        );

      }

          /* =========================
          LINE FILTER

          Breakdown
          → Asset
          → Line
        ========================= */

        if (
          line &&
          String(line).trim() !== "" &&
          String(line).toLowerCase() !== "all"
        ) {

          params.push(
            String(line).trim()
          );

          conditions.push(
            `l.name = $${params.length}`
          );

        }


      const whereSql =
        conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";


      const sql = `
        WITH breakdown_dt AS (

          SELECT
            b.id,
            b.status,
            b.started_at,
            b.closed_at,

            /* =====================================================
              RECORDED DOWN

              Sum all raw Machine State intervals where state=DOWN.

              For an interval that is still open:
              - CLOSED Breakdown → clip at closed_at
              - Active Breakdown → clip at NOW()

              Raw Machine State History is never modified here.
            ===================================================== */

            COALESCE(
              SUM(
                CASE

                  WHEN bsh.state = 'DOWN'
                  THEN
                    GREATEST(
                      0,
                      EXTRACT(
                        EPOCH FROM (
                          LEAST(
                            COALESCE(
                              bsh.ended_at,
                              b.closed_at,
                              NOW()
                            ),
                            COALESCE(
                              b.closed_at,
                              NOW()
                            )
                          )
                          -
                          bsh.started_at
                        )
                      )
                    )

                  ELSE 0

                END
              ),
              0
            )::bigint
              AS recorded_down_seconds,


            /* =====================================================
              VERIFIED DOWN

              NULL = no Admin verification/correction.
              When present it overrides Recorded DOWN
              for Effective DOWN calculations.
            ===================================================== */

            b.verified_down_seconds


          FROM breakdowns b


          /* -----------------------------------------------------
            Breakdown -> Asset
          ----------------------------------------------------- */

          JOIN assets a
            ON a.id = b.asset_id


          /* -----------------------------------------------------
            Asset -> Production Line

            assets.line_id references lines.id
          ----------------------------------------------------- */

          LEFT JOIN lines l
            ON l.id = a.line_id


          /* -----------------------------------------------------
            Breakdown -> Machine State History
          ----------------------------------------------------- */

          LEFT JOIN breakdown_state_history bsh
            ON bsh.breakdown_id = b.id


          /* -----------------------------------------------------
            Dynamic report filters:

            Date From
            Date To
            Line
          ----------------------------------------------------- */

          ${whereSql}


          GROUP BY
            b.id,
            b.status,
            b.started_at,
            b.closed_at,
            b.verified_down_seconds

        ),


        /* =======================================================
          EFFECTIVE DOWN

          Admin Verified DOWN has priority.

          If there is no verification:
          Effective DOWN = Recorded DOWN
        ======================================================= */

        effective_dt AS (

          SELECT
            id,
            status,
            started_at,
            closed_at,

            COALESCE(
              verified_down_seconds,
              recorded_down_seconds
            )::bigint
              AS effective_down_seconds

          FROM breakdown_dt

        )


        /* =======================================================
          BREAKDOWN PERFORMANCE SUMMARY
        ======================================================= */

        SELECT


          /* -----------------------------------------------------
            All Breakdown incidents in selected report period
          ----------------------------------------------------- */

          COUNT(*)::int
            AS total_incidents,


          /* -----------------------------------------------------
            Closed incidents
          ----------------------------------------------------- */

          COUNT(*) FILTER (
            WHERE status = 'CLOSED'
          )::int
            AS closed_incidents,


          /* -----------------------------------------------------
            Currently active incidents
          ----------------------------------------------------- */

          COUNT(*) FILTER (
            WHERE status IN (
              'OPEN',
              'IN_PROGRESS'
            )
          )::int
            AS active_incidents,


          /* -----------------------------------------------------
            Effective DOWN for ALL incidents.

            Includes currently active incidents.
          ----------------------------------------------------- */

          COALESCE(
            SUM(
              effective_down_seconds
            ),
            0
          )::bigint
            AS total_effective_down_seconds,


          /* -----------------------------------------------------
            Effective DOWN from CLOSED incidents only
          ----------------------------------------------------- */

          COALESCE(
            SUM(
              effective_down_seconds
            ) FILTER (
              WHERE status = 'CLOSED'
            ),
            0
          )::bigint
            AS closed_effective_down_seconds,


          /* -----------------------------------------------------
            AVG EFFECTIVE DOWN / CLOSED INCIDENT

            IMPORTANT:
            This is NOT labelled MTTR.

            It represents:
            Closed Effective DOWN
            ---------------------
            Closed Incidents
          ----------------------------------------------------- */

          COALESCE(
            ROUND(
              AVG(
                effective_down_seconds
              ) FILTER (
                WHERE status = 'CLOSED'
              )
            ),
            0
          )::bigint
            AS avg_effective_down_seconds,


          /* -----------------------------------------------------
            MTTR

            Mean Time To Restore

            Average elapsed time:
            started_at -> closed_at

            CLOSED incidents only.
          ----------------------------------------------------- */

          COALESCE(
            ROUND(
              AVG(
                EXTRACT(
                  EPOCH FROM (
                    closed_at - started_at
                  )
                )
              ) FILTER (
                WHERE status = 'CLOSED'
                  AND closed_at IS NOT NULL
              )
            ),
            0
          )::bigint
            AS mttr_seconds


        FROM effective_dt
      `;


      const { rows } =
        await pool.query(
          sql,
          params
        );


      res.json(
        rows[0]
      );

    } catch (err) {

      console.error(
        "GET /kpis/breakdowns/report-summary error:",
        err
      );

      res.status(500).json({
        error:
          "Failed to calculate breakdown report summary"
      });

    }

  }
);

/* =========================================================
   REPORT - BREAKDOWN PERFORMANCE BY LINE

   Used by Completed Maintenance Report.

   Filters:
   - from
   - to
   - optional line

   Effective DOWN:
   verified_down_seconds if available,
   otherwise Recorded DOWN.

   IMPORTANT:
   This is NOT MTTR.
========================================================= */

app.get("/kpis/breakdowns/report-by-line", async (req, res) => {

    try {

      const {
        from,
        to,
        line
      } = req.query;


      const params = [];
      const conditions = [];


      /* =========================
         DATE FROM
      ========================= */

      if (from) {

        params.push(from);

        conditions.push(
          `b.started_at >= $${params.length}::date`
        );

      }


      /* =========================
         DATE TO
      ========================= */

      if (to) {

        params.push(to);

        conditions.push(
          `b.started_at < ` +
          `($${params.length}::date + INTERVAL '1 day')`
        );

      }


      /* =========================
         LINE FILTER
      ========================= */

      if (
        line &&
        String(line).trim() !== "" &&
        String(line).toLowerCase() !== "all"
      ) {

        params.push(
          String(line).trim()
        );

        conditions.push(
          `l.name = $${params.length}`
        );

      }


      const whereSql =
        conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";


      const sql = `
        WITH breakdown_dt AS (

          SELECT

            b.id,
            b.status,
            b.closed_at,

            l.name AS line,

            COALESCE(
              SUM(
                CASE

                  WHEN bsh.state = 'DOWN'
                  THEN
                    GREATEST(
                      0,
                      EXTRACT(
                        EPOCH FROM (
                          LEAST(
                            COALESCE(
                              bsh.ended_at,
                              b.closed_at,
                              NOW()
                            ),
                            COALESCE(
                              b.closed_at,
                              NOW()
                            )
                          )
                          -
                          bsh.started_at
                        )
                      )
                    )

                  ELSE 0

                END
              ),
              0
            )::bigint
              AS recorded_down_seconds,


            b.verified_down_seconds


          FROM breakdowns b


          JOIN assets a
            ON a.id = b.asset_id


          LEFT JOIN lines l
            ON l.id = a.line_id


          LEFT JOIN breakdown_state_history bsh
            ON bsh.breakdown_id = b.id


          ${whereSql}


          GROUP BY
            b.id,
            b.status,
            b.closed_at,
            l.name,
            b.verified_down_seconds

        ),


        effective_dt AS (

          SELECT

            id,
            status,
            line,

            COALESCE(
              verified_down_seconds,
              recorded_down_seconds
            )::bigint
              AS effective_down_seconds

          FROM breakdown_dt

        )


        SELECT

          COALESCE(
            line,
            '—'
          ) AS line,


          COUNT(*)::int
            AS total_incidents,


          COUNT(*) FILTER (
            WHERE status = 'CLOSED'
          )::int
            AS closed_incidents,


          COUNT(*) FILTER (
            WHERE status IN (
              'OPEN',
              'IN_PROGRESS'
            )
          )::int
            AS active_incidents,


          COALESCE(
            SUM(
              effective_down_seconds
            ),
            0
          )::bigint
            AS total_effective_down_seconds,


          COALESCE(
            SUM(
              effective_down_seconds
            ) FILTER (
              WHERE status = 'CLOSED'
            ),
            0
          )::bigint
            AS closed_effective_down_seconds,


          COALESCE(
            ROUND(
              AVG(
                effective_down_seconds
              ) FILTER (
                WHERE status = 'CLOSED'
              )
            ),
            0
          )::bigint
            AS avg_effective_down_seconds


        FROM effective_dt


        GROUP BY
          line


        ORDER BY
          line
      `;


      const { rows } =
        await pool.query(
          sql,
          params
        );


      res.json(rows);

    } catch (err) {

      console.error(
        "GET /kpis/breakdowns/report-by-line error:",
        err
      );

      res.status(500).json({
        error:
          "Failed to calculate breakdown performance by line"
      });

    }

  }
);

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

/* RESUME ASSET FROM IDLE */

app.post("/assets/:id/resume", async (req, res) => {

  const client =
    await pool.connect();


  try {

    const { id } =
      req.params;


    await client.query(
      "BEGIN"
    );


    /* =====================
       LOAD ASSET IDLE DATE
    ===================== */

    const assetRes =
      await client.query(
        `
        SELECT
          idle_since
        FROM assets
        WHERE id = $1
        `,
        [id]
      );


    const idleSince =
      assetRes.rows[0]?.idle_since;


    if (!idleSince) {

      await client.query(
        "ROLLBACK"
      );


      return res
        .status(400)
        .json({
          error:
            "Asset not idle"
        });

    }


    /* =====================
       CALCULATE IDLE TIME

       SAME EXISTING LOGIC
    ===================== */

    const idleMs =
      Date.now() -
      new Date(
        idleSince
      ).getTime();


    /* =====================
       SHIFT ONLY OPEN TASKS

       SAME EXISTING SHIFT.

       NEW RULE ONLY:
       If calculated Due falls
       on Sunday in Athens time,
       move it to Monday
       at the same local time.
    ===================== */

    await client.query(
      `
      UPDATE maintenance_tasks

      SET due_date =

        CASE

          WHEN EXTRACT(
            DOW FROM (
              (
                due_date +
                ($1 || ' milliseconds')::interval
              )
              AT TIME ZONE 'Europe/Athens'
            )
          ) = 0

          THEN

            (
              (
                (
                  due_date +
                  ($1 || ' milliseconds')::interval
                )
                AT TIME ZONE 'Europe/Athens'
              )
              +
              INTERVAL '1 day'
            )
            AT TIME ZONE 'Europe/Athens'

          ELSE

            due_date +
            ($1 || ' milliseconds')::interval

        END

      WHERE asset_id = $2

        AND status != 'Done'

        AND due_date IS NOT NULL
      `,
      [
        idleMs,
        id
      ]
    );


    /* =====================
       REACTIVATE ASSET

       UNCHANGED
    ===================== */

    await client.query(
      `
      UPDATE assets

      SET idle_since = NULL

      WHERE id = $1
      `,
      [id]
    );


    await client.query(
      "COMMIT"
    );


    res.json({
      success: true
    });


  } catch (err) {

    await client.query(
      "ROLLBACK"
    );


    console.error(
      "RESUME ERROR:",
      err.message
    );


    res.status(500).json({
      error:
        "Resume failed"
    });


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

/* =========================================================
   RESUME FILTERED ASSETS

   POST /assets/resume-all

   For each selected Asset:
   - Calculates its own actual idle duration.
   - Shifts ONLY current/future Preventive Tasks.
   - Does NOT shift overdue Preventive Tasks.
   - Does NOT shift Planned Tasks.
   - Does NOT shift Scheduled Maintenance Tasks.
   - Does NOT shift Breakdown / Restoration Tasks.
   - If the new Due Date falls on Sunday in Athens time,
     moves it one additional day to Monday.
   - Reactivates the Asset by clearing idle_since.

   All changes run inside ONE database transaction.
========================================================= */

app.post("/assets/resume-all", async (req, res) => {

    const client =
      await pool.connect();


    try {

      const {
        asset_ids
      } = req.body;


      /* =====================
         VALIDATE ASSET LIST
      ===================== */

      if (
        !Array.isArray(asset_ids) ||
        asset_ids.length === 0
      ) {

        return res.status(400).json({
          error:
            "No assets selected"
        });

      }


      /* =====================
         BEGIN TRANSACTION
      ===================== */

      await client.query(
        "BEGIN"
      );


      /* =================================================
         LOAD SELECTED IDLE ASSETS

         Only Assets that are actually IDLE
         are included in the Resume operation.
      ================================================= */

      const assetsRes =
        await client.query(
          `
          SELECT
            id,
            idle_since
          FROM assets
          WHERE id = ANY($1::int[])
            AND idle_since IS NOT NULL
          `,
          [
            asset_ids
          ]
        );


      const idleAssets =
        assetsRes.rows;


      /* =================================================
         RESUME EACH ASSET

         Every Asset uses its OWN idle duration.
      ================================================= */

      for (
        const asset
        of idleAssets
      ) {

        /* =====================
           ACTUAL IDLE DURATION
        ===================== */

        const idleMs =
          Date.now() -
          new Date(
            asset.idle_since
          ).getTime();


        /* =================================================
           SHIFT PREVENTIVE TASKS ONLY

           PREVENTIVE DEFINITION:
           - breakdown_id IS NULL
           - scheduled_maintenance_id IS NULL
           - frequency_hours > 0

           ADDITIONAL RULES:
           - Task must still be open.
           - Task must have a Due Date.
           - Overdue Preventive Tasks are NOT shifted.
           - Due today or in the future ARE shifted.

           SUNDAY RULE:
           If the calculated new Due Date falls on Sunday
           in Europe/Athens, add one additional day.
        ================================================= */

        await client.query(
          `
          UPDATE maintenance_tasks

          SET due_date =

            CASE

              /* =====================
                 NEW DUE FALLS SUNDAY
              ===================== */

              WHEN EXTRACT(
                DOW FROM (
                  (
                    due_date +
                    ($1 || ' milliseconds')::interval
                  )
                  AT TIME ZONE 'Europe/Athens'
                )
              ) = 0

              THEN

                /* =====================
                   MOVE SUNDAY → MONDAY

                   Preserve the same local clock time.
                ===================== */

                (
                  (
                    (
                      due_date +
                      ($1 || ' milliseconds')::interval
                    )
                    AT TIME ZONE 'Europe/Athens'
                  )
                  +
                  INTERVAL '1 day'
                )
                AT TIME ZONE 'Europe/Athens'


              /* =====================
                 NORMAL SHIFT
              ===================== */

              ELSE

                due_date +
                ($1 || ' milliseconds')::interval

            END


          WHERE
            asset_id = $2


            /* =====================
               OPEN TASK ONLY
            ===================== */

            AND status != 'Done'


            /* =====================
               DUE DATE REQUIRED
            ===================== */

            AND due_date IS NOT NULL


            /* =====================
               PREVENTIVE ONLY
            ===================== */

            AND breakdown_id IS NULL

            AND scheduled_maintenance_id IS NULL

            AND COALESCE(
              frequency_hours,
              0
            ) > 0


            /* =====================
               NOT OVERDUE

               Compare calendar dates in Athens time.

               Preventive Tasks due today or later
               are shifted.

               Preventive Tasks due before today
               remain unchanged.
            ===================== */

            AND (
              due_date
              AT TIME ZONE 'Europe/Athens'
            )::date
            >=
            (
              NOW()
              AT TIME ZONE 'Europe/Athens'
            )::date
          `,
          [
            idleMs,
            asset.id
          ]
        );


        /* =====================
           REACTIVATE ASSET
        ===================== */

        await client.query(
          `
          UPDATE assets

          SET idle_since = NULL

          WHERE id = $1
          `,
          [
            asset.id
          ]
        );

      }


      /* =====================
         COMMIT
      ===================== */

      await client.query(
        "COMMIT"
      );


      /* =====================
         SUCCESS RESPONSE
      ===================== */

      return res.json({
        success:
          true,

        updated:
          idleAssets.length
      });


    } catch (err) {

      /* =====================
         ROLLBACK
      ===================== */

      await client.query(
        "ROLLBACK"
      );


      console.error(
        "RESUME FILTERED ASSETS ERROR:",
        err
      );


      return res.status(500).json({
        error:
          err.message
      });


    } finally {

      /* =====================
         RELEASE DB CLIENT
      ===================== */

      client.release();

    }

  }
);

// ============================================================
// GET /assets/:id/locations
// Returns historical Section / Unit catalogue for one Asset
// Source: maintenance_tasks (all statuses)
// Excludes soft-deleted tasks and placeholder values like "__new__"
// ============================================================

app.get('/assets/:id/locations', async (req, res) => {
  try {
    const assetId = Number(req.params.id);

    if (!Number.isInteger(assetId) || assetId <= 0) {
      return res.status(400).json({
        error: 'Invalid asset id'
      });
    }

    const result = await pool.query(
      `
      SELECT
          TRIM(section) AS section,
          TRIM(unit) AS unit,
          COUNT(*)::int AS usage_count
      FROM maintenance_tasks
      WHERE asset_id = $1

        -- Exclude soft-deleted tasks
        AND deleted_at IS NULL

        -- Valid Section
        AND section IS NOT NULL
        AND TRIM(section) <> ''
        AND LOWER(TRIM(section)) <> '__new__'

        -- Valid Unit
        AND unit IS NOT NULL
        AND TRIM(unit) <> ''
        AND LOWER(TRIM(unit)) <> '__new__'

      GROUP BY
          TRIM(section),
          TRIM(unit)

      ORDER BY
          TRIM(section),
          TRIM(unit)
      `,
      [assetId]
    );

    // ----------------------------------------------------------
    // Case-insensitive deduplication.
    // Example:
    // "Τροφοδότης" and "ΤΡΟΦΟΔΟΤΗΣ"
    // are treated as the same Section/Unit combination.
    //
    // If duplicates exist, keep the version with the highest usage.
    // ----------------------------------------------------------
    const locationMap = new Map();

    for (const row of result.rows) {
      const section = row.section?.trim();
      const unit = row.unit?.trim();

      if (!section || !unit) continue;

      const key =
        `${section.toLocaleLowerCase('el-GR')}|||${unit.toLocaleLowerCase('el-GR')}`;

      const existing = locationMap.get(key);

      if (!existing || row.usage_count > existing.usage_count) {
        locationMap.set(key, {
          section,
          unit,
          usage_count: row.usage_count
        });
      }
    }

    const locations = Array.from(locationMap.values())
      .sort((a, b) => {
        const sectionCompare = a.section.localeCompare(
          b.section,
          'el',
          { sensitivity: 'base' }
        );

        if (sectionCompare !== 0) return sectionCompare;

        return a.unit.localeCompare(
          b.unit,
          'el',
          { sensitivity: 'base' }
        );
      });

    return res.json({
      asset_id: assetId,
      locations
    });

  } catch (err) {
    console.error('GET /assets/:id/locations error:', err);

    return res.status(500).json({
      error: 'Failed to load asset locations'
    });
  }
});

/* =========================================================
   CREATE MAINTENANCE REPORT
   POST /maintenance-reports

   Production → Maintenance reporting layer.

   IMPORTANT:
   - Creates ONLY a Maintenance Report.
   - Does NOT create Breakdown.
   - Does NOT create Maintenance Task.
   - Does NOT calculate downtime.
   - Initial status is always NEW.
========================================================= */

app.post("/maintenance-reports", async (req, res) => {

  try {

    const {
      asset_id,
      category,
      priority,
      production_stopped,
      description,
      reported_by,
      reported_by_id
    } = req.body;


    /* =====================
       VALIDATE ASSET
    ===================== */

    const assetId =
      Number(asset_id);


    if (
      !Number.isInteger(assetId) ||
      assetId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Asset ID"
      });

    }


    /* =====================
       VALIDATE DESCRIPTION
    ===================== */

    const reportDescription =
      String(
        description || ""
      ).trim();


    if (!reportDescription) {

      return res.status(400).json({
        error:
          "Description is required"
      });

    }


    /* =====================
       VALIDATE REPORTER NAME
    ===================== */

    const reporter =
      String(
        reported_by || ""
      ).trim();


    if (!reporter) {

      return res.status(400).json({
        error:
          "Reporter is required"
      });

    }


    /* =====================
       VALIDATE REPORTER ID
    ===================== */

    const reporterId =
      Number(
        reported_by_id
      );


    if (
      !Number.isInteger(reporterId) ||
      reporterId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Reporter ID"
      });

    }


    /* =====================
       NORMALIZE CATEGORY
    ===================== */

    const reportCategory =
      String(
        category || ""
      ).trim() || null;


    /* =====================
       NORMALIZE PRIORITY
    ===================== */

    const reportPriority =
      String(
        priority || "NORMAL"
      )
        .trim()
        .toUpperCase();


    if (
      ![
        "NORMAL",
        "URGENT"
      ].includes(
        reportPriority
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid priority"
      });

    }


    /* =====================
       NORMALIZE PRODUCTION STOP
    ===================== */

    const productionStopped =
      production_stopped === true;


    /* =====================
       VERIFY ASSET EXISTS
       AND IS ACTIVE
    ===================== */

    const assetResult =
      await pool.query(
        `
        SELECT
          id,
          model,
          serial_number,
          name,
          active
        FROM assets
        WHERE id = $1
        LIMIT 1
        `,
        [assetId]
      );


    if (
      assetResult.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          "Asset not found"
      });

    }


    const asset =
      assetResult.rows[0];


    if (asset.active !== true) {

      return res.status(409).json({
        error:
          "Report cannot be created for an inactive Asset"
      });

    }


    /* =====================
       VERIFY REPORTER EXISTS
       AND IS ACTIVE SHIFT FOREMAN
    ===================== */

    const reporterResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          role,
          active,
          is_user
        FROM technicians
        WHERE id = $1
        LIMIT 1
        `,
        [reporterId]
      );


    if (
      reporterResult.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          "Reporter user not found"
      });

    }


    const reporterUser =
      reporterResult.rows[0];


    const reporterRole =
      String(
        reporterUser.role || ""
      )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");


    if (
      reporterUser.active !== true ||
      reporterUser.is_user !== true ||
      reporterRole !== "shift_foreman"
    ) {

      return res.status(403).json({
        error:
          "Reporter must be an active Shift Foreman user"
      });

    }


    /* =====================
       CREATE REPORT
    ===================== */

    const result =
      await pool.query(
        `
        INSERT INTO maintenance_reports (
          asset_id,
          category,
          priority,
          production_stopped,
          description,
          reported_by,
          reported_by_id,
          status
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          'NEW'
        )

        RETURNING
          id,
          asset_id,
          category,
          priority,
          production_stopped,
          description,
          reported_by,
          reported_by_id,
          reported_at,
          status,
          created_at
        `,
        [
          assetId,
          reportCategory,
          reportPriority,
          productionStopped,
          reportDescription,
          reporter,
          reporterId
        ]
      );


    const report =
      result.rows[0];


    /* =====================
       RESPONSE
    ===================== */

    return res.status(201).json({

      success: true,

      message:
        "Maintenance Report created successfully",

      report: {

        ...report,

        report_code:
          `MR-${String(
            report.id
          ).padStart(5, "0")}`,

        asset: {
          id:
            asset.id,

          name:
            asset.name,

          model:
            asset.model,

          serial_number:
            asset.serial_number
        }

      }

    });


  } catch (err) {

    console.error(
      "POST /maintenance-reports ERROR:",
      err
    );


    return res.status(500).json({
      error:
        "Failed to create Maintenance Report"
    });

  }

});

/* =========================================================
   GET MAINTENANCE REPORTS
   GET /maintenance-reports

   Returns Production → Maintenance Reports.

   IMPORTANT:
   - READ ONLY.
   - Does NOT create Breakdown.
   - Does NOT create Tasks.
   - Does NOT modify Report status.
   - Returns Asset + Line information ready for frontend.
========================================================= */

app.get("/maintenance-reports", async (req, res) => {

  try {

    const result =
      await pool.query(
        `
        SELECT
          mr.id,
          mr.asset_id,

          mr.category,
          mr.priority,
          mr.production_stopped,
          mr.description,

          mr.reported_by,
          mr.reported_at,

          mr.status,

          mr.reviewed_by,
          mr.reviewed_at,
          mr.maintenance_comment,

          mr.resolution_type,

          mr.breakdown_id,
          mr.maintenance_task_id,

          mr.created_at,
          mr.updated_at,

          a.name AS asset_name,
          a.model AS asset_model,
          a.serial_number AS asset_serial,

          l.id AS line_id,
          l.code AS line_code,
          l.name AS line_name

        FROM maintenance_reports mr

        JOIN assets a
          ON a.id = mr.asset_id

        LEFT JOIN lines l
          ON l.id = a.line_id

        ORDER BY
          CASE mr.status

            WHEN 'NEW'
              THEN 1

            WHEN 'UNDER_REVIEW'
              THEN 2

            WHEN 'CONVERTED'
              THEN 3

            WHEN 'CLOSED'
              THEN 4

            ELSE 9

          END,

          CASE mr.priority

            WHEN 'URGENT'
              THEN 1

            ELSE 2

          END,

          mr.reported_at DESC
        `
      );


    const reports =
      result.rows.map(row => ({

        ...row,

        report_code:
          `MR-${String(
            row.id
          ).padStart(5, "0")}`

      }));


    return res.json({
      reports
    });


  } catch (err) {

    console.error(
      "GET /maintenance-reports ERROR:",
      err
    );


    return res.status(500).json({
      error:
        "Failed to load Maintenance Reports"
    });

  }

});

/* =========================================================
   GET REPORTING ASSETS
   GET /maintenance-reports/assets

   Minimal Asset list for Production Reporting.

   IMPORTANT:
   - READ ONLY.
   - Returns only active Assets.
   - Does NOT expose maintenance data.
   - Does NOT expose Tasks / Breakdowns / KPIs.
========================================================= */

app.get("/maintenance-reports/assets", async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            a.id,
            a.name,
            a.model,
            a.serial_number,

            l.id AS line_id,
            l.code AS line_code,
            l.name AS line_name

          FROM assets a

          LEFT JOIN lines l
            ON l.id = a.line_id

          WHERE a.active = true

          ORDER BY
            COALESCE(l.code, ''),
            COALESCE(a.name, ''),
            a.model,
            a.serial_number
          `
        );


      return res.json({
        assets: result.rows
      });


    } catch (err) {

      console.error(
        "GET /maintenance-reports/assets ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to load Reporting Assets"
      });

    }

  }
);

/* =========================================================
   GET SHIFT FOREMAN MAINTENANCE REPORTS
   GET /maintenance-reports/my?technician_id=123

   Shared Production Reporting queue.

   All active Shift Foremen can see ALL Production Reports,
   regardless of which Shift Foreman created them.

   PURPOSE:
   - Avoid duplicate reporting between shifts.
   - Give incoming Shift Foremen visibility of existing issues.

   IMPORTANT:
   - READ ONLY.
   - Shift Foreman access only.
   - Does NOT expose normal CMMS data.
   - Does NOT create / modify Breakdown or Tasks.
========================================================= */

app.get( "/maintenance-reports/my", async (req, res) => {

    try {

      /* =====================
         VALIDATE USER
      ===================== */

      const technicianId =
        Number(
          req.query.technician_id
        );


      if (
        !Number.isInteger(technicianId) ||
        technicianId <= 0
      ) {

        return res.status(400).json({
          error:
            "Invalid Technician ID"
        });

      }


      /* =====================
         LOAD USER
      ===================== */

      const userResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const user =
        userResult.rows[0];


      if (
        user.active !== true ||
        user.is_user !== true
      ) {

        return res.status(403).json({
          error:
            "User is not active"
        });

      }


      /* =====================
         VALIDATE ROLE
      ===================== */

      const role =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");


      if (
        role !==
        "shift_foreman"
      ) {

        return res.status(403).json({
          error:
            "Shift Foreman access required"
        });

      }


      /* =====================
         LOAD ALL PRODUCTION
         REPORTS

         Shared between all
         Shift Foremen.
      ===================== */

      const result =
        await pool.query(
          `
          SELECT
            mr.id,
            mr.asset_id,

            mr.category,
            mr.priority,
            mr.production_stopped,
            mr.description,

            mr.reported_by,
            mr.reported_at,

            mr.status,

            mr.reviewed_by,
            mr.reviewed_at,
            mr.maintenance_comment,

            mr.resolution_type,

            mr.breakdown_id,
            mr.maintenance_task_id,

            a.name AS asset_name,
            a.model AS asset_model,
            a.serial_number AS asset_serial,

            l.code AS line_code,
            l.name AS line_name

          FROM maintenance_reports mr

          JOIN assets a
            ON a.id = mr.asset_id

          LEFT JOIN lines l
            ON l.id = a.line_id

          ORDER BY

            CASE mr.status

              WHEN 'NEW'
                THEN 1

              WHEN 'UNDER_REVIEW'
                THEN 2

              WHEN 'CONVERTED'
                THEN 3

              WHEN 'CLOSED'
                THEN 4

              ELSE 9

            END,

            CASE mr.priority

              WHEN 'URGENT'
                THEN 1

              ELSE 2

            END,

            mr.reported_at DESC
          `
        );


      /* =====================
         FORMAT RESPONSE
      ===================== */

      const reports =
        result.rows.map(row => ({

          ...row,

          report_code:
            `MR-${String(
              row.id
            ).padStart(5, "0")}`

        }));


      return res.json({

        viewer: {

          id:
            user.id,

          name:
            user.name,

          role:
            "shift_foreman"

        },

        reports

      });


    } catch (err) {

      console.error(
        "GET /maintenance-reports/my ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to load Production Reports"
      });

    }

  }
);

/* =========================================================
   GET NEW MAINTENANCE REPORT COUNT
   GET /maintenance-reports/new-count

   Returns only the number of NEW Production Reports.

   IMPORTANT:
   - READ ONLY.
   - Used for Maintenance Team tab badge.
========================================================= */

app.get("/maintenance-reports/new-count", async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            COUNT(*)::int AS new_count

          FROM maintenance_reports

          WHERE status = 'NEW'
          `
        );


      return res.json({
        new_count:
          result.rows[0]?.new_count || 0
      });


    } catch (err) {

      console.error(
        "GET /maintenance-reports/new-count ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to load new Maintenance Report count"
      });

    }

  }
);

/* =========================================================
   GET MAINTENANCE REPORT DETAIL
   GET /maintenance-reports/:id?technician_id=123

   Shared read-only Maintenance Report Detail endpoint.

   ACCESS
   ---------------------------------------------------------
   Allowed roles:
   - Shift Foreman
   - Technician
   - Planner
   - Admin

   PURPOSE
   ---------------------------------------------------------
   Provides one common Maintenance Report Detail source for:
   - Shift Foreman Production Reporting
   - Maintenance / Technical Team
   - MR references shown in Tasks
   - MR references shown in History

   IMPORTANT
   ---------------------------------------------------------
   - READ ONLY.
   - Does NOT start review.
   - Does NOT update comments.
   - Does NOT create Breakdown.
   - Does NOT create Maintenance Task.
========================================================= */

app.get("/maintenance-reports/:id", async (req, res) => {

    try {

      /* =====================
         REPORT ID
      ===================== */

      const reportId =
        Number(
          req.params.id
        );


      /* =====================
         VIEWER ID

         Uses the same technician/user identity
         already used by Production Reporting.
      ===================== */

      const technicianId =
        Number(
          req.query.technician_id
        );


      /* =====================
         VALIDATE REPORT ID
      ===================== */

      if (
        !Number.isInteger(
          reportId
        ) ||
        reportId <= 0
      ) {

        return res.status(400).json({
          error:
            "Invalid Maintenance Report ID"
        });

      }


      /* =====================
         VALIDATE VIEWER ID
      ===================== */

      if (
        !Number.isInteger(
          technicianId
        ) ||
        technicianId <= 0
      ) {

        return res.status(400).json({
          error:
            "Invalid User ID"
        });

      }


      /* =====================
         LOAD VIEWER
      ===================== */

      const userResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [
            technicianId
          ]
        );


      if (
        !userResult.rows.length
      ) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const user =
        userResult.rows[0];


      /* =====================
         NORMALIZE ROLE
      ===================== */

      const rawRole =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase()
          .replace(
            /\s+/g,
            "_"
          );


      const roleMap = {

        shift_foreman:
          "shift_foreman",

        technician:
          "technician",

        supervisor:
          "planner",

        planner:
          "planner",

        admin:
          "admin"

      };


      const normalizedRole =
        roleMap[
          rawRole
        ];


      /* =====================
         ACCESS CONTROL
      ===================== */

      if (
        user.active !== true ||
        user.is_user !== true ||
        ![
          "shift_foreman",
          "technician",
          "planner",
          "admin"
        ].includes(
          normalizedRole
        )
      ) {

        return res.status(403).json({
          error:
            "Maintenance Report access denied"
        });

      }


      /* =====================
         LOAD REPORT DETAIL
      ===================== */

      const result =
        await pool.query(
          `
          SELECT
            mr.id,
            mr.asset_id,

            mr.category,
            mr.priority,
            mr.production_stopped,
            mr.description,

            mr.reported_by,
            mr.reported_at,

            mr.status,

            mr.reviewed_by,
            mr.reviewed_at,
            mr.maintenance_comment,

            mr.resolution_type,

            mr.breakdown_id,
            mr.maintenance_task_id,

            mr.created_at,
            mr.updated_at,

            a.name AS asset_name,
            a.model AS asset_model,
            a.serial_number AS asset_serial,

            l.id AS line_id,
            l.code AS line_code,
            l.name AS line_name

          FROM maintenance_reports mr

          JOIN assets a
            ON a.id = mr.asset_id

          LEFT JOIN lines l
            ON l.id = a.line_id

          WHERE mr.id = $1

          LIMIT 1
          `,
          [
            reportId
          ]
        );


      /* =====================
         NOT FOUND
      ===================== */

      if (
        !result.rows.length
      ) {

        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      const report =
        result.rows[0];


      /* =====================
         RESPONSE

         report_code is generated consistently
         with the existing Maintenance Report APIs.
      ===================== */

      return res.json({

        report: {

          ...report,

          report_code:
            `MR-${String(
              report.id
            ).padStart(
              5,
              "0"
            )}`

        }

      });


    } catch (err) {

      /* =====================
         ERROR
      ===================== */

      console.error(
        "GET MAINTENANCE REPORT DETAIL ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to load Maintenance Report"
      });

    }

  }
);

/* =========================================================
   START MAINTENANCE REPORT REVIEW
   PATCH /maintenance-reports/:id/start-review

   Maintenance Team:
   - Admin
   - Planner
   - Technician

   RULES:
   - Report must exist.
   - Only NEW reports can start review.
   - Shift Foreman cannot review.
   - Does NOT create Breakdown.
   - Does NOT create Maintenance Task.
========================================================= */

app.patch("/maintenance-reports/:id/start-review", async (req, res) => {

    const reportId =
      Number(
        req.params.id
      );


    const technicianId =
      Number(
        req.body?.technician_id
      );


    /* =====================
       VALIDATE REPORT ID
    ===================== */

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance Report ID"
      });

    }


    /* =====================
       VALIDATE USER ID
    ===================== */

    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance User ID"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query(
        "BEGIN"
      );


      /* =====================
         LOAD MAINTENANCE USER
      ===================== */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (
        userResult.rows.length === 0
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(404).json({
          error:
            "Maintenance user not found"
        });

      }


      const user =
        userResult.rows[0];


      if (
        user.active !== true ||
        user.is_user !== true
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(403).json({
          error:
            "Maintenance user is not active"
        });

      }


      /* =====================
         VALIDATE MAINTENANCE ROLE
      ===================== */

      const role =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase();


      const roleMap = {

        technician:
          "technician",

        supervisor:
          "planner",

        planner:
          "planner",

        admin:
          "admin"

      };


      const normalizedRole =
        roleMap[role];


      if (
        ![
          "technician",
          "planner",
          "admin"
        ].includes(
          normalizedRole
        )
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(403).json({
          error:
            "Maintenance Team access required"
        });

      }


      /* =====================
         LOAD + LOCK REPORT
      ===================== */

      const reportResult =
        await client.query(
          `
          SELECT
            id,
            status,
            asset_id,
            description,
            reported_by,
            reported_at

          FROM maintenance_reports

          WHERE id = $1

          FOR UPDATE
          `,
          [reportId]
        );


      if (
        reportResult.rows.length === 0
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      const report =
        reportResult.rows[0];


      /* =====================
         STATUS GUARD
      ===================== */

      if (
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase() !==
        "NEW"
      ) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(409).json({
          error:
            "Only NEW Maintenance Reports can start review"
        });

      }


      /* =====================
         START REVIEW
      ===================== */

      const updateResult =
        await client.query(
          `
          UPDATE maintenance_reports

          SET
            status = 'UNDER_REVIEW',
            reviewed_by = $2,
            reviewed_at = NOW(),
            updated_at = NOW()

          WHERE id = $1

          RETURNING
            id,
            asset_id,
            category,
            priority,
            production_stopped,
            description,
            reported_by,
            reported_at,
            status,
            reviewed_by,
            reviewed_at,
            maintenance_comment,
            resolution_type,
            breakdown_id,
            maintenance_task_id,
            updated_at
          `,
          [
            reportId,
            user.name
          ]
        );


      await client.query(
        "COMMIT"
      );


      const updatedReport =
        updateResult.rows[0];


      return res.json({

        success: true,

        message:
          "Maintenance Report review started",

        report: {

          ...updatedReport,

          report_code:
            `MR-${String(
              updatedReport.id
            ).padStart(5, "0")}`

        }

      });


    } catch (err) {

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (_) {}


      console.error(
        "START MAINTENANCE REPORT REVIEW ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to start Maintenance Report review"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   UPDATE MAINTENANCE REPORT COMMENT
   PATCH /maintenance-reports/:id/comment

   Maintenance Team:
   - Admin
   - Planner
   - Technician

   RULES:
   - Report must exist.
   - Report must be UNDER_REVIEW.
   - Comment cannot be empty.
   - Does NOT close the Report.
   - Does NOT create Breakdown or Task.
========================================================= */

app.patch("/maintenance-reports/:id/comment", async (req, res) => {

    const reportId =
      Number(
        req.params.id
      );


    const technicianId =
      Number(
        req.body?.technician_id
      );


    const maintenanceComment =
      String(
        req.body?.maintenance_comment || ""
      ).trim();


    /* =====================
       VALIDATE INPUT
    ===================== */

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance Report ID"
      });

    }


    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance User ID"
      });

    }


    if (!maintenanceComment) {

      return res.status(400).json({
        error:
          "Maintenance Comment is required"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         LOAD MAINTENANCE USER
      ===================== */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (!userResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance user not found"
        });

      }


      const user =
        userResult.rows[0];


      const role =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase();


      const roleMap = {
        technician: "technician",
        supervisor: "planner",
        planner: "planner",
        admin: "admin"
      };


      const normalizedRole =
        roleMap[role];


      if (
        user.active !== true ||
        user.is_user !== true ||
        ![
          "technician",
          "planner",
          "admin"
        ].includes(normalizedRole)
      ) {

        await client.query("ROLLBACK");

        return res.status(403).json({
          error:
            "Maintenance Team access required"
        });

      }


      /* =====================
         LOCK REPORT
      ===================== */

      const reportResult =
        await client.query(
          `
          SELECT
            id,
            status

          FROM maintenance_reports

          WHERE id = $1

          FOR UPDATE
          `,
          [reportId]
        );


      if (!reportResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      if (
        String(
          reportResult.rows[0].status || ""
        )
          .trim()
          .toUpperCase() !==
        "UNDER_REVIEW"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Maintenance Comment can only be added while Report is UNDER_REVIEW"
        });

      }


      /* =====================
         SAVE COMMENT
      ===================== */

      const updateResult =
        await client.query(
          `
          UPDATE maintenance_reports

          SET
            maintenance_comment = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            reportId,
            maintenanceComment,
            user.name
          ]
        );


      await client.query("COMMIT");


      return res.json({
        success: true,
        message:
          "Maintenance Comment saved",
        report:
          updateResult.rows[0]
      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}


      console.error(
        "UPDATE MAINTENANCE REPORT COMMENT ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to update Maintenance Report Comment"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   CLOSE MAINTENANCE REPORT — NO ACTION
   PATCH /maintenance-reports/:id/close-no-action

   Maintenance Team:
   - Admin
   - Planner
   - Technician

   RESULT:
   status = CLOSED
   resolution_type = NO_ACTION

   IMPORTANT:
   - Requires Maintenance Comment.
   - Does NOT create Breakdown.
   - Does NOT create Maintenance Task.
========================================================= */

app.patch("/maintenance-reports/:id/close-no-action", async (req, res) => {

    const reportId =
      Number(
        req.params.id
      );


    const technicianId =
      Number(
        req.body?.technician_id
      );


    const maintenanceComment =
      String(
        req.body?.maintenance_comment || ""
      ).trim();


    /* =====================
       VALIDATE INPUT
    ===================== */

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance Report ID"
      });

    }


    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance User ID"
      });

    }


    if (!maintenanceComment) {

      return res.status(400).json({
        error:
          "Maintenance Comment is required before closing the Report"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         LOAD MAINTENANCE USER
      ===================== */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (!userResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance user not found"
        });

      }


      const user =
        userResult.rows[0];


      const role =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase();


      const roleMap = {
        technician: "technician",
        supervisor: "planner",
        planner: "planner",
        admin: "admin"
      };


      const normalizedRole =
        roleMap[role];


      if (
        user.active !== true ||
        user.is_user !== true ||
        ![
          "technician",
          "planner",
          "admin"
        ].includes(normalizedRole)
      ) {

        await client.query("ROLLBACK");

        return res.status(403).json({
          error:
            "Maintenance Team access required"
        });

      }


      /* =====================
         LOCK REPORT
      ===================== */

      const reportResult =
        await client.query(
          `
          SELECT
            id,
            status

          FROM maintenance_reports

          WHERE id = $1

          FOR UPDATE
          `,
          [reportId]
        );


      if (!reportResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      if (
        String(
          reportResult.rows[0].status || ""
        )
          .trim()
          .toUpperCase() !==
        "UNDER_REVIEW"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Only Reports UNDER_REVIEW can be closed"
        });

      }


      /* =====================
         CLOSE REPORT
      ===================== */

      const updateResult =
        await client.query(
          `
          UPDATE maintenance_reports

          SET
            status = 'CLOSED',
            resolution_type = 'NO_ACTION',
            maintenance_comment = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            reportId,
            maintenanceComment,
            user.name
          ]
        );


      await client.query("COMMIT");


      return res.json({
        success: true,
        message:
          "Maintenance Report closed",
        report:
          updateResult.rows[0]
      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}


      console.error(
        "CLOSE MAINTENANCE REPORT ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to close Maintenance Report"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   CONVERT MAINTENANCE REPORT TO BREAKDOWN
   PATCH /maintenance-reports/:id/convert-to-breakdown

   IMPORTANT:
   - Report must be UNDER_REVIEW.
   - Creates ONE Breakdown.
   - Does NOT create Maintenance Task.
   - Does NOT create Task Execution.
   - Does NOT create Machine State.
   - Breakdown reported_by / reported_by_id come from Foreman.
   - Breakdown started_at = Report reported_at.
   - Report remains as audit trail and becomes CONVERTED.

   Entire operation runs in ONE transaction.
========================================================= */

app.patch("/maintenance-reports/:id/convert-to-breakdown",
  async (req, res) => {

    const reportId =
      Number(
        req.params.id
      );


    const technicianId =
      Number(
        req.body?.technician_id
      );


    const breakdownTitle =
      String(
        req.body?.title || ""
      ).trim();


    const maintenanceComment =
      String(
        req.body?.maintenance_comment || ""
      ).trim();


    /* =====================
       VALIDATE INPUT
    ===================== */

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance Report ID"
      });

    }


    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance User ID"
      });

    }


    if (!breakdownTitle) {

      return res.status(400).json({
        error:
          "Breakdown title is required"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         VERIFY MAINTENANCE USER
      ===================== */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (!userResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance user not found"
        });

      }


      const user =
        userResult.rows[0];


      const rawRole =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");


      const roleMap = {
        technician:
          "technician",

        supervisor:
          "planner",

        planner:
          "planner",

        admin:
          "admin"
      };


      const normalizedRole =
        roleMap[rawRole];


      if (
        user.active !== true ||
        user.is_user !== true ||
        ![
          "technician",
          "planner",
          "admin"
        ].includes(
          normalizedRole
        )
      ) {

        await client.query("ROLLBACK");

        return res.status(403).json({
          error:
            "Maintenance Team access required"
        });

      }


      /* =====================
         LOCK MAINTENANCE REPORT
      ===================== */

      const reportResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            description,
            reported_by,
            reported_by_id,
            reported_at,
            status,
            maintenance_comment,
            resolution_type,
            breakdown_id,
            maintenance_task_id

          FROM maintenance_reports

          WHERE id = $1

          FOR UPDATE
          `,
          [reportId]
        );


      if (!reportResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      const report =
        reportResult.rows[0];


      /* =====================
         REPORT MUST BE
         UNDER REVIEW
      ===================== */

      if (
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase() !==
        "UNDER_REVIEW"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Only Reports UNDER_REVIEW can be converted to Breakdown"
        });

      }


      /* =====================
         SAFETY:
         REPORT MUST NOT ALREADY
         BE CONNECTED
      ===================== */

      if (
        report.breakdown_id ||
        report.maintenance_task_id
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Maintenance Report is already connected to Maintenance activity"
        });

      }


      /* =====================
         FOREMAN INFORMATION
         MUST EXIST
      ===================== */

      if (
        !report.reported_by ||
        !report.reported_at
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Maintenance Report has incomplete reporter information"
        });

      }


      /* =====================
         CREATE BREAKDOWN

         IMPORTANT:
         started_at = Foreman Report time

         reported_by =
           Foreman name

         reported_by_id =
           Foreman technician ID
      ===================== */

      const breakdownResult =
        await client.query(
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
            $4,
            $5,
            $6,
            NOW(),
            NOW()
          )

          RETURNING *
          `,
          [
            report.asset_id,
            breakdownTitle,
            report.description,
            report.reported_at,
            report.reported_by,
            report.reported_by_id
          ]
        );


      const breakdown =
        breakdownResult.rows[0];


      /* =====================
         UPDATE REPORT
      ===================== */

      const convertedReportResult =
        await client.query(
          `
          UPDATE maintenance_reports

          SET
            status = 'CONVERTED',
            resolution_type = 'BREAKDOWN',
            breakdown_id = $2,
            maintenance_task_id = NULL,

            maintenance_comment =
              CASE
                WHEN $3::text <> ''
                  THEN $3::text
                ELSE maintenance_comment
              END,

            reviewed_by = $4,
            reviewed_at = NOW(),
            updated_at = NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            reportId,
            breakdown.id,
            maintenanceComment,
            user.name
          ]
        );


      const convertedReport =
        convertedReportResult.rows[0];


      /* =====================
         COMMIT
      ===================== */

      await client.query("COMMIT");


      /* =====================
         RESPONSE
      ===================== */

      return res.status(201).json({

        success: true,

        message:
          "Maintenance Report converted to Breakdown successfully",

        report: {

          ...convertedReport,

          report_code:
            `MR-${String(
              convertedReport.id
            ).padStart(5, "0")}`

        },

        breakdown

      });


    } catch (err) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}


      console.error(
        "CONVERT MAINTENANCE REPORT TO BREAKDOWN ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to convert Maintenance Report to Breakdown"
      });


    } finally {

      client.release();

    }

  }
);

/* =========================================================
   CONVERT MAINTENANCE REPORT TO PLANNED TASK
   PATCH /maintenance-reports/:id/convert-to-planned-task

   IMPORTANT:
   - Report must be UNDER_REVIEW.
   - Creates ONE normal Planned/Open Maintenance Task.
   - Does NOT create Task Execution.
   - Does NOT create Breakdown.
   - Keeps Maintenance Report as audit trail.
   - Entire operation runs in ONE transaction.
========================================================= */

app.patch("/maintenance-reports/:id/convert-to-planned-task",
  async (req, res) => {

    const reportId =
      Number(req.params.id);


    const technicianId =
      Number(
        req.body?.technician_id
      );


    const taskText =
      String(
        req.body?.task || ""
      ).trim();


    const section =
      String(
        req.body?.section || ""
      ).trim() || null;


    const unit =
      String(
        req.body?.unit || ""
      ).trim() || null;


    const type =
      String(
        req.body?.type || ""
      ).trim() || null;


    const impact =
      String(
        req.body?.impact || "normal"
      ).trim() || "normal";


    const notes =
      String(
        req.body?.notes || ""
      ).trim() || null;


    const maintenanceComment =
      String(
        req.body?.maintenance_comment || ""
      ).trim();


    const dueDateRaw =
      req.body?.due_date;


    const estimatedDuration =
      req.body?.duration_min !== undefined &&
      req.body?.duration_min !== null &&
      req.body?.duration_min !== ""
        ? Number(req.body.duration_min)
        : null;


    /* =====================
       VALIDATION
    ===================== */

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance Report ID"
      });

    }


    if (
      !Number.isInteger(technicianId) ||
      technicianId <= 0
    ) {

      return res.status(400).json({
        error:
          "Invalid Maintenance User ID"
      });

    }


    if (!taskText) {

      return res.status(400).json({
        error:
          "Task description is required"
      });

    }


    if (!dueDateRaw) {

      return res.status(400).json({
        error:
          "Due date is required"
      });

    }


    const dueDate =
      new Date(
        dueDateRaw
      );


    if (
      Number.isNaN(
        dueDate.getTime()
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid Due Date"
      });

    }


    if (
      estimatedDuration !== null &&
      (
        !Number.isFinite(
          estimatedDuration
        ) ||
        estimatedDuration < 0
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid estimated duration"
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query("BEGIN");


      /* =====================
         VERIFY MAINTENANCE USER
      ===================== */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            name,
            role,
            active,
            is_user

          FROM technicians

          WHERE id = $1

          LIMIT 1
          `,
          [technicianId]
        );


      if (!userResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance user not found"
        });

      }


      const user =
        userResult.rows[0];


      const rawRole =
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");


      const roleMap = {
        technician:
          "technician",

        supervisor:
          "planner",

        planner:
          "planner",

        admin:
          "admin"
      };


      const normalizedRole =
        roleMap[rawRole];


      if (
        user.active !== true ||
        user.is_user !== true ||
        ![
          "technician",
          "planner",
          "admin"
        ].includes(
          normalizedRole
        )
      ) {

        await client.query("ROLLBACK");

        return res.status(403).json({
          error:
            "Maintenance Team access required"
        });

      }


      /* =====================
         LOCK REPORT
      ===================== */

      const reportResult =
        await client.query(
          `
          SELECT
            id,
            asset_id,
            description,
            status,
            breakdown_id,
            maintenance_task_id

          FROM maintenance_reports

          WHERE id = $1

          FOR UPDATE
          `,
          [reportId]
        );


      if (!reportResult.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          error:
            "Maintenance Report not found"
        });

      }


      const report =
        reportResult.rows[0];


      /* =====================
         MUST BE UNDER REVIEW
      ===================== */

      if (
        String(
          report.status || ""
        )
          .trim()
          .toUpperCase() !==
        "UNDER_REVIEW"
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Only Reports UNDER_REVIEW can be converted to Planned Task"
        });

      }


      /* =====================
         SAFETY:
         MUST NOT ALREADY BE LINKED
      ===================== */

      if (
        report.breakdown_id ||
        report.maintenance_task_id
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Maintenance Report is already connected to Maintenance activity"
        });

      }


      /* =====================
         CREATE PLANNED TASK
      ===================== */

      const taskResult =
        await client.query(
          `
          INSERT INTO maintenance_tasks (
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

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'Planned',
            true,
            $8,
            $9
          )

          RETURNING *
          `,
          [
            report.asset_id,
            section,
            unit,
            taskText,
            type,
            impact,
            dueDate,
            estimatedDuration,
            notes
          ]
        );


      const newTask =
        taskResult.rows[0];


      /* =====================
         UPDATE REPORT
      ===================== */

      const convertedReportResult =
        await client.query(
          `
          UPDATE maintenance_reports

          SET
            status = 'CONVERTED',
            resolution_type = 'PLANNED_TASK',
            breakdown_id = NULL,
            maintenance_task_id = $2,

            maintenance_comment =
              CASE
                WHEN $3::text <> ''
                  THEN $3::text
                ELSE maintenance_comment
              END,

            reviewed_by = $4,
            reviewed_at = NOW(),
            updated_at = NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            reportId,
            newTask.id,
            maintenanceComment,
            user.name
          ]
        );


      const convertedReport =
        convertedReportResult.rows[0];


      await client.query("COMMIT");


      return res.status(201).json({

        success: true,

        message:
          "Maintenance Report converted to Planned Task successfully",

        report: {

          ...convertedReport,

          report_code:
            `MR-${String(
              convertedReport.id
            ).padStart(5, "0")}`

        },

        task:
          newTask

      });


    } catch (err) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}


      console.error(
        "CONVERT MAINTENANCE REPORT TO PLANNED TASK ERROR:",
        err
      );


      return res.status(500).json({
        error:
          "Failed to convert Maintenance Report to Planned Task"
      });


    } finally {

      client.release();

    }

  }
);

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
