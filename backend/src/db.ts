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
      uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    CREATE INDEX IF NOT EXISTS idx_calls_uploaded_at ON calls(uploaded_at DESC);
  `);

  console.log("Database initialised");
}
