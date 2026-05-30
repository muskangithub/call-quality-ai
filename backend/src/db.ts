import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env["DB_HOST"] ?? "localhost",
  port: Number(process.env["DB_PORT"] ?? 5432),
  database: process.env["DB_NAME"] ?? "call_quality_ai",
  user: process.env["DB_USER"] ?? "postgres",
  password: process.env["DB_PASSWORD"] ?? "password",
});

pool.on("error", (err: Error) => {
  console.error("Unexpected PostgreSQL client error:", err);
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      file_size     INTEGER NOT NULL,
      mime_type     TEXT NOT NULL,
      duration_sec  INTEGER,
      status        TEXT NOT NULL DEFAULT 'uploaded',
      -- status values: uploaded | transcribing | analysing | completed | failed
      error_message TEXT,
      transcript    JSONB,
      uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    CREATE INDEX IF NOT EXISTS idx_calls_uploaded_at ON calls(uploaded_at DESC);
  `);

  // Add transcript column if table already existed without it
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'transcript'
      ) THEN
        ALTER TABLE calls ADD COLUMN transcript JSONB;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'diarization'
      ) THEN
        ALTER TABLE calls ADD COLUMN diarization JSONB;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'summary'
      ) THEN
        ALTER TABLE calls ADD COLUMN summary TEXT;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'scorecard'
      ) THEN
        ALTER TABLE calls ADD COLUMN scorecard JSONB;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls' AND column_name = 'emotion'
      ) THEN
        ALTER TABLE calls ADD COLUMN emotion JSONB;
      END IF;
    END $$;
  `);

  // ─── Embeddings table for semantic search ───────────────────────────────
  // One row per transcript chunk. We store the vector as JSONB (a float array)
  // to avoid requiring the pgvector extension for this stage.
  //
  // AT SCALE: switch `embedding` to the pgvector `vector(384)` type and add an
  // IVFFlat/HNSW index. Then search becomes `ORDER BY embedding <=> $query`
  // executed inside Postgres instead of loading rows into Node. The schema and
  // service interface stay the same — only the storage type + query change.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_chunks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      call_id     UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text  TEXT NOT NULL,
      embedding   JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_call_chunks_call_id ON call_chunks(call_id);
  `);

  console.log("Database initialised");
}
