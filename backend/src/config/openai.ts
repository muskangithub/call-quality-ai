import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

/**
 * We use Groq's API for transcription (Whisper) and LLM tasks.
 * Groq is OpenAI-compatible so we use the same SDK, just point to their base URL.
 *
 * Why Groq?
 * - Free tier with generous limits (7,000 req/day)
 * - Hosts whisper-large-v3 (better than whisper-1)
 * - Extremely fast inference
 * - Same SDK/API shape as OpenAI — easy to swap back later
 */
const apiKey = process.env["GROQ_API_KEY"];

export const groq: OpenAI | null = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

if (!groq) {
  console.warn("⚠️  GROQ_API_KEY not set — transcription/analysis will be unavailable.");
}
