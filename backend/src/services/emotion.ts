import { groq } from "../config/openai.js";
import type { DiarizedSegment } from "./diarization.js";

/**
 * Emotion / sentiment analysis across the call timeline.
 *
 * Key design goal (from the spec): produce SEPARATE emotional arcs for the
 * agent and the customer so a QA manager can see the *relationship* between
 * the two — where the customer escalated, where the agent failed to match
 * or de-escalate, and where things settled.
 *
 * Approach:
 * 1. Bucket the diarized segments into fixed time windows (default 30s).
 * 2. For each window, collect what the agent said and what the customer said.
 * 3. Ask the LLM to score each speaker's emotional state per window.
 *
 * We use a numeric sentiment score (-5 = very negative/angry, 0 = neutral,
 * +5 = very positive) so the frontend can plot a continuous arc, plus a
 * human-readable label (e.g. "Frustrated", "Calm", "Angry", "Satisfied").
 *
 * Why bucket by time rather than per-segment?
 * - A smooth arc needs evenly spaced points on a time axis
 * - Per-segment would be noisy and uneven (segments vary in length)
 * - Time windows let us directly compare agent vs customer at the same moment
 */

export interface EmotionPoint {
  windowIndex: number;
  startSec: number;
  endSec: number;
  timeLabel: string; // e.g. "0:30"
  agent: {
    score: number; // -5 to +5
    label: string; // e.g. "Calm", "Frustrated"
  };
  customer: {
    score: number;
    label: string;
  };
}

export interface EmotionEvent {
  type: "escalation" | "de-escalation" | "mismatch";
  windowIndex: number;
  timeLabel: string;
  description: string;
}

export interface EmotionTimeline {
  windowSizeSec: number;
  points: EmotionPoint[];
  // Detected key moments: escalations, de-escalations, mismatches
  events: EmotionEvent[];
  // High-level insight about the emotional dynamic
  insight: string;
}

const WINDOW_SIZE_SEC = 30;

interface WindowBucket {
  index: number;
  startSec: number;
  endSec: number;
  agentText: string[];
  customerText: string[];
}

interface RawEmotionPoint {
  windowIndex: number;
  agent?: { score?: number; label?: string };
  customer?: { score?: number; label?: string };
}

interface RawEmotionResponse {
  points?: RawEmotionPoint[];
  insight?: string;
}

export async function analyzeEmotion(
  segments: DiarizedSegment[]
): Promise<EmotionTimeline> {
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured — cannot analyze emotion");
  }

  if (!segments || segments.length === 0) {
    throw new Error("No segments to analyze");
  }

  // ─── Step 1: Bucket segments into time windows ──────────────────────────
  const totalDuration = Math.max(...segments.map((s) => s.end));
  const numWindows = Math.max(1, Math.ceil(totalDuration / WINDOW_SIZE_SEC));

  const buckets: WindowBucket[] = [];
  for (let i = 0; i < numWindows; i++) {
    buckets.push({
      index: i,
      startSec: i * WINDOW_SIZE_SEC,
      endSec: (i + 1) * WINDOW_SIZE_SEC,
      agentText: [],
      customerText: [],
    });
  }

  for (const seg of segments) {
    // Place segment in the window its midpoint falls into
    const midpoint = (seg.start + seg.end) / 2;
    const windowIdx = Math.min(
      Math.floor(midpoint / WINDOW_SIZE_SEC),
      numWindows - 1
    );
    const bucket = buckets[windowIdx];
    if (!bucket) continue;

    if (seg.speaker === "Agent") {
      bucket.agentText.push(seg.text);
    } else {
      bucket.customerText.push(seg.text);
    }
  }

  // ─── Step 2: Build prompt with windowed conversation ────────────────────
  const windowDescriptions = buckets
    .map((b) => {
      const agent = b.agentText.join(" ") || "(silent)";
      const customer = b.customerText.join(" ") || "(silent)";
      return `Window ${b.index} [${formatTime(b.startSec)}-${formatTime(b.endSec)}]:
  Agent: "${agent}"
  Customer: "${customer}"`;
    })
    .join("\n\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an emotion analysis expert for call center recordings.

For EACH time window, score the emotional state of the Agent and the Customer SEPARATELY.

Use a sentiment score from -5 to +5:
  -5 = very negative (angry, hostile)
  -3 = frustrated, annoyed
  -1 = mildly negative, concerned
   0 = neutral
  +2 = positive, cooperative
  +5 = very positive (happy, grateful, satisfied)

Also give a one-word emotion label for each (e.g. "Neutral", "Frustrated", "Angry", "Calm", "Satisfied", "Anxious", "Empathetic", "Defensive").

If a speaker is silent in a window, carry forward their previous emotional state (don't jump to neutral).

Also provide an "insight": one sentence describing the emotional dynamic of the call — e.g. where the customer escalated and whether the agent matched or de-escalated it.

Respond ONLY with valid JSON:
{
  "points": [
    { "windowIndex": 0, "agent": { "score": <num>, "label": "<word>" }, "customer": { "score": <num>, "label": "<word>" } },
    ...
  ],
  "insight": "<one sentence>"
}
Include exactly one entry per window, in order.`,
      },
      {
        role: "user",
        content: `Analyze the emotional arc of this ${numWindows}-window call:\n\n${windowDescriptions}`,
      },
    ],
    temperature: 0.2,
    max_tokens: numWindows * 60 + 200,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "{}";

  let raw: RawEmotionResponse;
  try {
    raw = JSON.parse(content) as RawEmotionResponse;
  } catch {
    throw new Error("Failed to parse emotion analysis JSON from LLM");
  }

  const rawPoints = raw.points ?? [];

  // ─── Step 3: Build final timeline, clamping + filling gaps ──────────────
  const clamp = (n: number): number => Math.max(-5, Math.min(5, n));

  let lastAgent = { score: 0, label: "Neutral" };
  let lastCustomer = { score: 0, label: "Neutral" };

  const points: EmotionPoint[] = buckets.map((b) => {
    const rp = rawPoints.find((p) => p.windowIndex === b.index);

    const agent = rp?.agent
      ? { score: clamp(rp.agent.score ?? 0), label: rp.agent.label ?? lastAgent.label }
      : lastAgent;
    const customer = rp?.customer
      ? { score: clamp(rp.customer.score ?? 0), label: rp.customer.label ?? lastCustomer.label }
      : lastCustomer;

    lastAgent = agent;
    lastCustomer = customer;

    return {
      windowIndex: b.index,
      startSec: b.startSec,
      endSec: b.endSec,
      timeLabel: formatTime(b.startSec),
      agent,
      customer,
    };
  });

  return {
    windowSizeSec: WINDOW_SIZE_SEC,
    points,
    events: detectEvents(points),
    insight: raw.insight ?? "",
  };
}

/**
 * Detect the three key moments the spec asks the graph to surface:
 *
 * 1. Escalation — customer sentiment drops sharply between two windows
 *    (they got noticeably more upset).
 * 2. De-escalation — customer sentiment recovers sharply
 *    (the agent successfully calmed them down).
 * 3. Mismatch — at a given moment the agent and customer are emotionally
 *    far apart, especially when the customer is upset but the agent is
 *    flat/positive (failed to match or acknowledge the customer's energy).
 */
function detectEvents(points: EmotionPoint[]): EmotionEvent[] {
  const events: EmotionEvent[] = [];

  // Thresholds tuned for the -5..+5 scale
  const SHARP_CHANGE = 2; // a jump of 2+ points window-to-window is "sharp"
  const MISMATCH_GAP = 4; // agent/customer differ by 4+ points = mismatch

  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!;

    // ─── Escalation / De-escalation (compare customer to previous window) ──
    if (i > 0) {
      const prev = points[i - 1]!;
      const delta = cur.customer.score - prev.customer.score;

      if (delta <= -SHARP_CHANGE) {
        events.push({
          type: "escalation",
          windowIndex: cur.windowIndex,
          timeLabel: cur.timeLabel,
          description: `Customer escalated (${prev.customer.label} → ${cur.customer.label})`,
        });
      } else if (delta >= SHARP_CHANGE) {
        events.push({
          type: "de-escalation",
          windowIndex: cur.windowIndex,
          timeLabel: cur.timeLabel,
          description: `Customer calmed down (${prev.customer.label} → ${cur.customer.label})`,
        });
      }
    }

    // ─── Mismatch (agent not matching an upset customer) ───────────────────
    const gap = cur.agent.score - cur.customer.score;
    // Flag when customer is negative AND agent is much more positive/flat
    if (cur.customer.score <= -2 && gap >= MISMATCH_GAP) {
      events.push({
        type: "mismatch",
        windowIndex: cur.windowIndex,
        timeLabel: cur.timeLabel,
        description: `Agent (${cur.agent.label}) didn't match upset customer (${cur.customer.label})`,
      });
    }
  }

  return events;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
