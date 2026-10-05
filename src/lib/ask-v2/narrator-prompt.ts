// ============================================================
// LedgerAI — Ask v2 narrator prompt (Phase 4)
// ------------------------------------------------------------
// The narrator explains VERIFIED financial facts in natural language.
// It never calculates, estimates, or invents figures. It receives a
// manifest of verified facts and must not introduce any figure absent
// from that manifest.
// ============================================================

import type { NarrationManifest } from "@/lib/ask/contracts";

export const ASK_V2_NARRATOR_PROMPT_VERSION = "ask-v2-narrator/v1";

export const ASK_V2_NARRATOR_SYSTEM_PROMPT = `You are a financial assistant. You explain verified financial data to a
business owner. Rules:
- Use ONLY the verified facts provided. Never calculate, estimate, add,
  subtract, compute percentages, or infer missing values.
- Never invent categories, counts, dates, comparison percentages, or
  conclusions. If a fact is missing, say the information is unavailable.
- Never mention tools, schemas, database systems, Prisma, architecture,
  or internal system details.
- Never expose tenant identifiers, user identifiers, or authorization
  data.
- Preserve the period and category context from the user's question.
- Write naturally and conversationally, but only on verified ground.
- The example text in "deterministicFallback" is illustrative, not
  prescriptive. Do not imitate its wording mechanically.
- Do not introduce comparison percentages unless the exact percentage is
  represented in the verified facts. Prefer plain restatement of the
  verified facts. Never calculate a new percentage from other facts, and
  never introduce facts merely because they appear in the fallback wording
  unless they are represented in the manifest.

OUTPUT:
Return EXACTLY ONE JSON object of the form {"answer": "<your narration>"} and
nothing else — no commentary, no markdown, no extra fields.`;

export interface NarratorUserPayload {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  manifest: NarrationManifest;
  deterministicFallback: string;
  today: string;
}

/**
 * Build the versioned user payload for the narrator provider call.
 * The payload carries only redacted, boundary-safe data: the user's
 * message, bounded history, verified fact manifest, and the
 * deterministic fallback text.
 */
export function buildNarratorUserPayload(
  input: NarratorUserPayload,
): {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  manifest: NarrationManifest;
  deterministicFallback: string;
  today: string;
  outputSchema: string;
} {
  return {
    userMessage: input.userMessage,
    history: input.history,
    manifest: input.manifest,
    deterministicFallback: input.deterministicFallback,
    today: input.today,
    outputSchema: "narrationSchema",
  };
}

/**
 * Build both halves of the narrator turn for a provider call.
 */
export function buildNarratorMessages(input: {
  now: Date;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  manifest: NarrationManifest;
  deterministicFallback: string;
}) {
  const { now, userMessage, history, manifest, deterministicFallback } = input;
  const today = now.toISOString().slice(0, 10);
  return {
    promptVersion: ASK_V2_NARRATOR_PROMPT_VERSION,
    system: ASK_V2_NARRATOR_SYSTEM_PROMPT,
    user: JSON.stringify(
      buildNarratorUserPayload({
        userMessage,
        history,
        manifest,
        deterministicFallback,
        today,
      }),
    ),
  };
}
