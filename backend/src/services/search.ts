import { pool } from "../db.js";
import { embedText, cosineSimilarity } from "./embeddings.js";

export interface SearchResult {
  callId: string;
  originalName: string;
  summary: string | null;
  overallScore: number | null;
  uploadedAt: string;
  // Best matching chunk
  matchText: string;
  similarity: number;
}

interface ChunkRow {
  call_id: string;
  chunk_text: string;
  embedding: string; // JSONB comes back as parsed array or string depending on driver
  originalName: string;
  summary: string | null;
  overallScore: number | null;
  uploadedAt: string;
}

/**
 * Semantic search across all call transcripts.
 *
 * Flow:
 * 1. Embed the natural-language query into the same vector space as the chunks.
 * 2. Load candidate chunks and score each by cosine similarity.
 * 3. Keep the best-matching chunk per call, then rank calls by that score.
 *
 * This is "best chunk wins" — a call is relevant if ANY part of it semantically
 * matches the query, which is exactly what we want for queries like
 * "customer angry about refund" matching "I haven't received my money back".
 *
 * NOTE ON SCALE: we currently load chunks into Node and score in JS. That's
 * fine for thousands of chunks. Beyond that, move the cosine search into
 * Postgres with pgvector (`ORDER BY embedding <=> $1 LIMIT k`) so only the
 * top-k ever leave the database.
 */
export async function semanticSearch(
  query: string,
  limit = 10
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // 1. Embed the query
  const queryVector = await embedText(query);

  // 2. Load all chunks joined with their call metadata
  const result = await pool.query<ChunkRow>(`
    SELECT
      cc.call_id,
      cc.chunk_text,
      cc.embedding,
      c.original_name              AS "originalName",
      c.summary,
      (c.scorecard->>'overall')::float AS "overallScore",
      c.uploaded_at                AS "uploadedAt"
    FROM call_chunks cc
    JOIN calls c ON c.id = cc.call_id
    WHERE c.status = 'completed'
  `);

  // 3. Score each chunk, keep best per call
  const bestByCall = new Map<string, SearchResult>();

  for (const row of result.rows) {
    const embedding: number[] =
      typeof row.embedding === "string"
        ? (JSON.parse(row.embedding) as number[])
        : (row.embedding as unknown as number[]);

    const similarity = cosineSimilarity(queryVector, embedding);

    const existing = bestByCall.get(row.call_id);
    if (!existing || similarity > existing.similarity) {
      bestByCall.set(row.call_id, {
        callId: row.call_id,
        originalName: row.originalName,
        summary: row.summary,
        overallScore: row.overallScore,
        uploadedAt: row.uploadedAt,
        matchText: row.chunk_text,
        similarity,
      });
    }
  }

  // 4. Rank by similarity, return top results
  return Array.from(bestByCall.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
