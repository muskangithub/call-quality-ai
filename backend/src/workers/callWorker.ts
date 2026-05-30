import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { pool } from "../db.js";
import { transcribeAudio } from "../services/transcription.js";
import type { CallJobData } from "../queues/callQueue.js";

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

  const transcript = await transcribeAudio(filePath, mimeType);
  await job.updateProgress(50);

  // Save transcript to DB
  await pool.query(
    `UPDATE calls
     SET transcript = $2, updated_at = NOW()
     WHERE id = $1`,
    [callId, transcript]
  );

  console.log(`[Worker] Transcription complete for ${callId} (${transcript.length} chars)`);
  await job.updateProgress(60);

  // ─── Step 2: Mark as completed (for now — later modules will add analysis) ─
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
      if (job.attemptsMade >= attempts) {
        await updateCallStatus(job.data.callId, "failed", {
          errorMessage: err.message,
        });
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err.message);
  });

  console.log("✓ Call processing worker started (concurrency: 3)");
}
