import fs from "fs";
import path from "path";
import { groq } from "../config/openai.js";

/**
 * Transcribes an audio file using Groq's Whisper API.
 *
 * Why Groq + whisper-large-v3?
 * - Free tier, 7,000 requests/day
 * - whisper-large-v3 is more accurate than whisper-1
 * - Returns timestamps for speaker diarization alignment
 * - OpenAI-compatible API — swap back to OpenAI anytime
 */
export async function transcribeAudio(
  filePath: string,
  _mimeType: string
): Promise<string> {
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured — cannot transcribe");
  }

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const response = await groq.audio.transcriptions.create({
    model: "whisper-large-v3",
    file: new File([fileBuffer], fileName, { type: "audio/mpeg" }),
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: "en",
  });

  // Store the full verbose response as JSON string
  // (segments with timestamps are needed for diarization alignment)
  const transcript = JSON.stringify({
    text: response.text,
    segments: response.segments,
    language: response.language,
    duration: response.duration,
  });

  return transcript;
}
