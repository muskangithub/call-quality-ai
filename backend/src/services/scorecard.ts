import { groq } from "../config/openai.js";

/**
 * AI-powered agent performance scorecard.
 *
 * Scores the agent across 6 dimensions (0-10 each) plus a weighted overall.
 * Each score comes with a short justification so QA managers can trust and
 * act on the number rather than treating it as a black box.
 *
 * Why a single LLM call for all metrics (vs one call per metric)?
 * - The metrics are interdependent (empathy affects resolution perception)
 * - One call sees the whole conversation context at once
 * - Cheaper and faster — 1 request instead of 6
 * - Structured JSON output keeps it reliable
 */

export interface ScoreDimension {
  score: number; // 0-10
  reason: string;
}

export interface Scorecard {
  greeting: ScoreDimension;
  communication: ScoreDimension;
  empathy: ScoreDimension;
  processAdherence: ScoreDimension;
  resolutionQuality: ScoreDimension;
  closing: ScoreDimension;
  overall: number; // weighted average
  flags: string[]; // notable issues e.g. "Customer frustration not acknowledged"
}

// Weights reflect what matters most in sales/support QA.
// Resolution and empathy carry the most weight; greeting/closing least.
const WEIGHTS = {
  greeting: 0.1,
  communication: 0.2,
  empathy: 0.2,
  processAdherence: 0.15,
  resolutionQuality: 0.25,
  closing: 0.1,
} as const;

interface RawScorecard {
  greeting?: ScoreDimension;
  communication?: ScoreDimension;
  empathy?: ScoreDimension;
  processAdherence?: ScoreDimension;
  resolutionQuality?: ScoreDimension;
  closing?: ScoreDimension;
  flags?: string[];
}

export async function generateScorecard(
  formattedTranscript: string
): Promise<Scorecard> {
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured — cannot generate scorecard");
  }

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a strict but fair call center QA evaluator. Score the AGENT's performance based on the transcript.

Rate each dimension from 0 to 10 (10 = excellent, 0 = very poor):

1. greeting — Did the agent open professionally? Identify themselves/company, warm tone?
2. communication — Clarity, active listening, no jargon, appropriate pace, professional language
3. empathy — Did the agent acknowledge the customer's feelings and show genuine care?
4. processAdherence — Did the agent verify identity, follow procedures, gather needed info correctly?
5. resolutionQuality — Was the customer's issue actually resolved or properly escalated?
6. closing — Did the agent confirm resolution, ask if anything else is needed, close warmly?

Also provide "flags": an array of short strings noting any serious issues (e.g. "Did not acknowledge customer frustration", "Failed to verify account", "Left issue unresolved"). Empty array if none.

Respond ONLY with valid JSON in this exact shape:
{
  "greeting": { "score": <0-10>, "reason": "<one sentence>" },
  "communication": { "score": <0-10>, "reason": "<one sentence>" },
  "empathy": { "score": <0-10>, "reason": "<one sentence>" },
  "processAdherence": { "score": <0-10>, "reason": "<one sentence>" },
  "resolutionQuality": { "score": <0-10>, "reason": "<one sentence>" },
  "closing": { "score": <0-10>, "reason": "<one sentence>" },
  "flags": ["<issue>", ...]
}`,
      },
      {
        role: "user",
        content: formattedTranscript,
      },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "{}";

  let raw: RawScorecard;
  try {
    raw = JSON.parse(content) as RawScorecard;
  } catch {
    throw new Error("Failed to parse scorecard JSON from LLM");
  }

  // Normalize + clamp each dimension
  const norm = (d: ScoreDimension | undefined): ScoreDimension => ({
    score: Math.max(0, Math.min(10, Math.round(d?.score ?? 0))),
    reason: d?.reason ?? "No assessment provided",
  });

  const greeting = norm(raw.greeting);
  const communication = norm(raw.communication);
  const empathy = norm(raw.empathy);
  const processAdherence = norm(raw.processAdherence);
  const resolutionQuality = norm(raw.resolutionQuality);
  const closing = norm(raw.closing);

  // Weighted overall, rounded to 1 decimal
  const overall =
    Math.round(
      (greeting.score * WEIGHTS.greeting +
        communication.score * WEIGHTS.communication +
        empathy.score * WEIGHTS.empathy +
        processAdherence.score * WEIGHTS.processAdherence +
        resolutionQuality.score * WEIGHTS.resolutionQuality +
        closing.score * WEIGHTS.closing) *
        10
    ) / 10;

  return {
    greeting,
    communication,
    empathy,
    processAdherence,
    resolutionQuality,
    closing,
    overall,
    flags: Array.isArray(raw.flags) ? raw.flags : [],
  };
}
