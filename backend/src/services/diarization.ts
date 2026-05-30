import { groq } from "../config/openai.js";

/**
 * Speaker diarization using LLM-based classification.
 *
 * Why LLM-based instead of a dedicated diarization model (like pyannote)?
 * - No Python dependency or separate service needed
 * - Groq's LLM is free and fast
 * - In a sales call context, the pattern is predictable:
 *   Agent speaks first (greeting), then alternating turns
 * - The LLM can use semantic cues (greetings, "how can I help", "I need...")
 *   to identify speakers more accurately than pure audio clustering
 *
 * At scale, you'd use pyannote.audio or AWS Transcribe with speaker labels
 * for better accuracy on overlapping speech.
 */

export interface DiarizedSegment {
  speaker: "Agent" | "Customer";
  text: string;
  start: number;
  end: number;
}

export interface DiarizationResult {
  segments: DiarizedSegment[];
  formattedTranscript: string;
}

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface TranscriptData {
  text: string;
  segments: TranscriptSegment[];
  duration: number;
}

export async function diarizeTranscript(
  transcriptJson: string
): Promise<DiarizationResult> {
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured — cannot perform diarization");
  }

  const transcriptData: TranscriptData = JSON.parse(transcriptJson);
  const segments = transcriptData.segments;

  if (!segments || segments.length === 0) {
    throw new Error("No segments found in transcript");
  }

  // Build numbered segment list for the LLM
  const segmentList = segments
    .map((seg, i) => `[${i}] (${formatTime(seg.start)} - ${formatTime(seg.end)}): "${seg.text.trim()}"`)
    .join("\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a speaker diarization expert for sales/support call center recordings.

Your task: Label each transcript segment as either "Agent" or "Customer".

Rules:
- In a typical call center recording, the Agent usually speaks first (greeting/introduction)
- Agents use phrases like: "How can I help you", "Let me check", "Thank you for calling", "Is there anything else"
- Customers use phrases like: "I need", "I want", "My problem is", "Can you help me"
- Speakers alternate in conversation — consecutive segments from the same speaker are possible but less common
- Use context clues: the person providing service/information is the Agent, the person requesting help is the Customer

Output ONLY a JSON array of speaker labels in order, like: ["Agent", "Customer", "Agent", "Customer", ...]
The array must have exactly ${segments.length} elements, one for each segment.
Do not include any other text, explanation, or markdown formatting.`,
      },
      {
        role: "user",
        content: `Here are ${segments.length} transcript segments from a call center recording. Label each as "Agent" or "Customer":\n\n${segmentList}`,
      },
    ],
    temperature: 0.1,
    max_tokens: segments.length * 15,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "[]";

  // Parse the LLM response
  let labels: string[];
  try {
    // Handle potential markdown code blocks in response
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    labels = JSON.parse(cleaned) as string[];
  } catch {
    // Fallback: alternate Agent/Customer starting with Agent
    console.warn("[Diarization] Failed to parse LLM response, using alternating fallback");
    labels = segments.map((_, i) => (i % 2 === 0 ? "Agent" : "Customer"));
  }

  // Ensure we have the right number of labels
  while (labels.length < segments.length) {
    labels.push(labels.length % 2 === 0 ? "Agent" : "Customer");
  }

  // Build diarized segments
  const diarizedSegments: DiarizedSegment[] = segments.map((seg, i) => ({
    speaker: (labels[i] === "Customer" ? "Customer" : "Agent") as "Agent" | "Customer",
    text: seg.text.trim(),
    start: seg.start,
    end: seg.end,
  }));

  // Build formatted transcript string
  const formattedTranscript = buildFormattedTranscript(diarizedSegments);

  return {
    segments: diarizedSegments,
    formattedTranscript,
  };
}

/**
 * Merge consecutive segments from the same speaker and format as:
 * Agent: Hello sir, how can I help you today?
 * Customer: I need a refund for my order.
 * Agent: Let me check that for you.
 */
function buildFormattedTranscript(segments: DiarizedSegment[]): string {
  if (segments.length === 0) return "";

  const merged: { speaker: string; text: string }[] = [];

  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      // Same speaker — merge text
      last.text += " " + seg.text;
    } else {
      merged.push({ speaker: seg.speaker, text: seg.text });
    }
  }

  return merged
    .map((m) => `${m.speaker}: ${m.text}`)
    .join("\n");
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
