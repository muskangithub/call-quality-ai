import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../db.js";
import { getCallQueue } from "../queues/callQueue.js";

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

      // Enqueue for background processing (non-blocking)
      const queue = getCallQueue();
      if (queue) {
        await queue.add(
          "process-call",
          {
            callId: callId!,
            filePath,
            originalName: originalname,
            mimeType: mimetype,
          },
          { jobId: callId! }
        );
      } else {
        console.warn(`[Upload] Redis unavailable — call ${callId} saved but not queued for processing`);
      }

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
        summary,
        (scorecard->>'overall')::float                   AS "overallScore",
        COALESCE(jsonb_array_length(emotion->'events'), 0) AS "eventCount",
        (
          SELECT COUNT(*)
          FROM jsonb_array_elements(emotion->'events') AS ev
          WHERE ev->>'type' IN ('escalation', 'mismatch')
        )                                                AS "negativeEventCount",
        COALESCE(jsonb_array_length(scorecard->'flags'), 0) AS "flagCount",
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
         transcript,
         diarization,
         summary,
         scorecard,
         emotion,
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

// ─── GET /api/calls/:id/audio ─────────────────────────────────────────────────
// Streams the audio file with HTTP range support so the player can seek.
router.get("/:id/audio", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query<{ file_path: string; mime_type: string }>(
      `SELECT file_path, mime_type FROM calls WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    const filePath = row.file_path;
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Audio file not found on disk" });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = row.mime_type || "audio/mpeg";

    if (range) {
      // Partial content — needed for seeking/scrubbing in the player
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0] ?? "0", 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      // Full file
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("Audio stream error:", err);
    res.status(500).json({ error: "Failed to stream audio" });
  }
});

export default router;
