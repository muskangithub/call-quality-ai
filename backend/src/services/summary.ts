import { groq } from "../config/openai.js";

/**
 * Generates a concise, readable summary of a call using the diarized transcript.
 *
 * The summary captures:
 * - Why the customer called
 * - What the agent did
 * - How the call ended (resolved/unresolved/escalated)
 */
export async function generateSummary(
  formattedTranscript: string
): Promise<string> {
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured — cannot generate summary");
  }

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a call center QA analyst. Generate a brief, professional summary of the following call transcript.

The summary should be 2-4 sentences covering:
1. Why the customer called (the issue/request)
2. What the agent did to address it
3. The outcome (resolved, escalated, pending, unresolved)

Write in third person, past tense. Be factual and concise.
Do not include any headers, bullet points, or formatting — just plain text sentences.`,
      },
      {
        role: "user",
        content: formattedTranscript,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const summary = response.choices[0]?.message?.content?.trim() ?? "";

  if (!summary) {
    throw new Error("LLM returned empty summary");
  }

  return summary;
}
