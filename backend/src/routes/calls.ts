import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../db.js";

const router = Router();

// ─── Storage config ───────────────────────────────────────────────────────────
// Files land in <project-root>/uploads/  (created if missing)
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Prefix with timestamp so filenames are unique and sortable
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "video/mp4",   // some recorders save as mp4
  "video/webm",
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB max
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── POST /api/calls/upload ───────────────────────────────────────────────────
router.post(
  "/upload",
  upload.single("audio"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    try {
      const { filename, originalname, path: filePath, size, mimetype } = req.file;

      const result = await pool.query<{ id: string }>(
        `INSERT INTO calls
           (filename, original_name, file_path, file_size, mime_type, status)
         VALUES ($1, $2, $3, $4, $5, 'uploaded')
         RETURNING id`,
        [filename, originalname, filePath, size, mimetype]
      );

      const callId = result.rows[0]?.id;

      res.status(201).json({
        id: callId,
        filename,
        originalName: originalname,
        fileSize: size,
        status: "uploaded",
        message: "File uploaded successfully. Processing will begin shortly.",
      });
    } catch (err) {
      console.error("Upload DB error:", err);
      // Clean up the file if DB insert failed
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      res.status(500).json({ error: "Failed to save call record" });
    }
  }
);

// ─── GET /api/calls ───────────────────────────────────────────────────────────
// Returns all calls ordered by most recent first
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        original_name  AS "originalName",
        file_size      AS "fileSize",
        mime_type      AS "mimeType",
        duration_sec   AS "durationSec",
        status,
        error_message  AS "errorMessage",
        uploaded_at    AS "uploadedAt",
        updated_at     AS "updatedAt"
      FROM calls
      ORDER BY uploaded_at DESC
      LIMIT 100
    `);

    res.json({ calls: result.rows });
  } catch (err) {
    console.error("List calls error:", err);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

// ─── GET /api/calls/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         id,
         original_name  AS "originalName",
         file_size      AS "fileSize",
         mime_type      AS "mimeType",
         duration_sec   AS "durationSec",
         status,
         error_message  AS "errorMessage",
         uploaded_at    AS "uploadedAt",
         updated_at     AS "updatedAt"
       FROM calls
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get call error:", err);
    res.status(500).json({ error: "Failed to fetch call" });
  }
});

export default router;
