 import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { pool } from "../db.js";
import { transcribeAudio } from "../services/transcription.js";
import { diarizeTranscript } from "../services/diarization.js";
import { generateSummary } from "../services/summary.js";
import { generateScorecard } from "../services/scorecard.js";
import { analyzeEmotion } from "../services/emotion.js";
import { embedBatch, chunkTranscript } from "../services/embeddings.js";
import { notifyFailure } from "../services/notifications.js";
import type { CallJobData } from "../queues/callQueue.js";

// Custom error that carries which pipeline stage failed (for richer alerts)
class StageError extends Error {
  constructor(public stage: string, original: Error) {
    super(original.message);
    this.name = "StageError";
  }
}

async function runStage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new StageError(stage, err as Error);
  }
}

async function updateCallStatus(
  callId: string,
  status: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const sets = ["status = $2", "updated_at = NOW()"];
  const values: unknown[] = [callId, status];

  if (extra?.["errorMessage"]) {
    sets.push(`error_message = $${values.length + 1}`);
    values.push(extra["errorMessage"]);
  }

  await pool.query(
    `UPDATE calls SET ${sets.join(", ")} WHERE id = $1`,
    values
  );
}

async function processCall(job: Job<CallJobData>): Promise<void> {
  const { callId, filePath, mimeType } = job.data;

  console.log(`[Worker] Processing call ${callId}`);

  // ─── Step 1: Transcription ────────────────────────────────────────────────
  await updateCallStatus(callId, "transcribing");
  await job.updateProgress(10);

  const transcript = await runStage("transcription", () =>
    transcribeAudio(filePath, mimeType)
  );
  await job.updateProgress(40);

  // Save transcript to DB
  await pool.query(
    `UPDATE calls SET transcript = $2, updated_at = NOW() WHERE id = $1`,
    [callId, transcript]
  );

  console.log(`[Worker] Transcription complete for ${callId}`);

  // ─── Step 2: Speaker Diarization ──────────────────────────────────────────
  await updateCallStatus(callId, "analysing");
  await job.updateProgress(50);

  const diarization = await runStage("diarization", () =>
    diarizeTranscript(transcript)
  );
  await job.updateProgress(70);

  // Save diarization to DB
  await pool.query(
    `UPDATE calls SET diarization = $2, updated_at = NOW() WHERE id = $1`,
    [callId, JSON.stringify(diarization)]
  );

  console.log(`[Worker] Diarization complete for ${callId} (${diarization.segments.length} segments)`);

  // ─── Step 3: Summary + Scorecard + Emotion (run in parallel) ──────────────
  // All three only depend on the diarized transcript, so we run concurrently.
  await job.updateProgress(75);

  const [summary, scorecard, emotion] = await runStage("analysis", () =>
    Promise.all([
      generateSummary(diarization.formattedTranscript),
      generateScorecard(diarization.formattedTranscript),
      analyzeEmotion(diarization.segments),
    ])
  );

  // Save all results to DB
  await pool.query(
    `UPDATE calls
     SET summary = $2, scorecard = $3, emotion = $4, updated_at = NOW()
     WHERE id = $1`,
    [callId, summary, JSON.stringify(scorecard), JSON.stringify(emotion)]
  );

  console.log(`[Worker] Summary + scorecard + emotion generated for ${callId} (overall: ${scorecard.overall})`);

  // ─── Step 4: Generate + store embeddings for semantic search ──────────────
  await job.updateProgress(85);

  const chunks = chunkTranscript(diarization.formattedTranscript);
  if (chunks.length > 0) {
    const vectors = await runStage("embeddings", () => embedBatch(chunks));

    // Clear any existing chunks for this call (in case of reprocessing)
    await pool.query(`DELETE FROM call_chunks WHERE call_id = $1`, [callId]);

    // Bulk insert chunks + embeddings
    for (let i = 0; i < chunks.length; i++) {
      await pool.query(
        `INSERT INTO call_chunks (call_id, chunk_index, chunk_text, embedding)
         VALUES ($1, $2, $3, $4)`,
        [callId, i, chunks[i], JSON.stringify(vectors[i])]
      );
    }

    console.log(`[Worker] Stored ${chunks.length} embeddings for ${callId}`);
  }

  // ─── Step 5: Mark as completed ────────────────────────────────────────────
  await updateCallStatus(callId, "completed");
  await job.updateProgress(100);

  console.log(`[Worker] Call ${callId} processing complete`);
}

export function startWorker(): void {
  const worker = new Worker(
    "call-processing",
    processCall,
    {
      connection: redisConnection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60_000,
      },
    }
  );

  worker.on("completed", (job) => {
    if (job) {
      console.log(`[Worker] Job ${job.id} completed for call ${job.data.callId}`);
    }
  });

  worker.on("failed", async (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);

    if (job) {
      const attempts = job.opts.attempts ?? 3;
      // Only finalize + notify once all retries are exhausted
      if (job.attemptsMade >= attempts) {
        const callId = job.data.callId;
        const stage = err.name === "StageError" ? (err as StageError).stage : "processing";

        await updateCallStatus(callId, "failed", {
          errorMessage: err.message,
        });

        // Look up the file name for richer alert context
        let fileName = job.data.originalName ?? "unknown";
        try {
          const r = await pool.query<{ original_name: string }>(
            `SELECT original_name FROM calls WHERE id = $1`,
            [callId]
          );
          if (r.rows[0]) fileName = r.rows[0].original_name;
        } catch {
          // best-effort
        }

        // Fire notifications (Slack/email/console) — never blocks or throws
        await notifyFailure({
          callId,
          fileName,
          reason: err.message,
          timestamp: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
          stage,
        });
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err.message);
  });

  console.log("✓ Call processing worker started (concurrency: 3)");
}
