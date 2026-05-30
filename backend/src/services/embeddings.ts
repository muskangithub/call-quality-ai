import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

/**
 * Local text embeddings using Transformers.js + all-MiniLM-L6-v2.
 *
 * Why this model / approach?
 * - Runs fully locally — no API key, no per-call cost, no rate limits
 * - all-MiniLM-L6-v2 is a proven sentence-embedding model (384 dims),
 *   widely used in production RAG/semantic-search systems
 * - Good balance of quality and speed for short conversational chunks
 *
 * The model is downloaded once on first use and cached on disk.
 *
 * At scale you'd swap this for a hosted embedding API (OpenAI/Cohere) or a
 * dedicated embedding service — the interface here stays the same.
 */

let embedder: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;

  // Guard against concurrent loads (worker concurrency = 3)
  if (!loadingPromise) {
    console.log("[Embeddings] Loading model all-MiniLM-L6-v2 (first run downloads it)…");
    loadingPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    ) as Promise<FeatureExtractionPipeline>;
  }

  embedder = await loadingPromise;
  console.log("[Embeddings] Model ready");
  return embedder;
}

/**
 * Embed a single piece of text into a 384-dim vector (mean-pooled, normalized).
 */
export async function embedText(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Embed many texts. Done sequentially to keep memory predictable;
 * MiniLM is fast enough that this is fine for call-sized transcripts.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embedText(text));
  }
  return vectors;
}

/**
 * Split a diarized/formatted transcript into overlapping chunks suitable
 * for embedding. We chunk so that a specific phrase buried in a long call
 * (e.g. "I haven't received my money back") produces its own focused vector
 * rather than being diluted across the whole transcript.
 *
 * Strategy: group consecutive lines into chunks of ~max 60 words, with a
 * small overlap so meaning that spans a boundary isn't lost.
 */
export function chunkTranscript(formattedTranscript: string): string[] {
  const lines = formattedTranscript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const MAX_WORDS = 60;
  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;

  for (const line of lines) {
    const words = line.split(/\s+/).length;

    if (wordCount + words > MAX_WORDS && current.length > 0) {
      chunks.push(current.join("\n"));
      // Overlap: keep the last line as the start of the next chunk
      const lastLine = current[current.length - 1];
      current = lastLine ? [lastLine] : [];
      wordCount = lastLine ? lastLine.split(/\s+/).length : 0;
    }

    current.push(line);
    wordCount += words;
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

/**
 * Cosine similarity between two vectors.
 * Vectors from embedText are already normalized, so this is just a dot product,
 * but we normalize defensively in case inputs aren't.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
