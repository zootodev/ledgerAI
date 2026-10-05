// ============================================================
// LedgerAI — Ask v2 surface gate (Phase 18C, B-2)
// ------------------------------------------------------------
// A single server-only helper both the /ask-v2 page and its server
// action use, so the gate is never duplicated and the client can
// never override it.
//
// Independence invariant (Phase 18B, B-2):
//   - ASK_V2_ENABLED independently gates v2 delivery;
//   - it is INDEPENDENT of ASK_LLM_MODE / ASK_LLM_INTERPRETER_ENABLED /
//     ASK_LLM_NARRATION_ENABLED / ASK_SHADOW_SAMPLE_RATE — enabling the v2
//     surface must never be coupled to the v1 /ask AI seam, and vice versa;
//   - safe default OFF: an absent/empty ASK_V2_ENABLED never enables v2;
//   - it does NOT replace provider configuration: ASK_V2_ENABLED=true with no
//     provider still yields the typed provider-unavailable path.
// ============================================================

import { readAskAiConfig } from "@/lib/ai/ask-provider";

/** Server-only gate: may the /ask-v2 surface run at all? Defaults OFF. */
export function isAskV2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readAskAiConfig(env).askV2Enabled;
}