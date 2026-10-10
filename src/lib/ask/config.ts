// ============================================================
// LedgerAI — Ask (v1) surface gate (Phase 28C)
// ------------------------------------------------------------
// The v1 /ask assistant is on hold and renders the presentation-only
// "Coming Soon" state, exactly like /ask-v2. A single server-only
// helper gates the page (and its resumption), so the switch can
// never be overridden client-side.
//
// Independence invariant:
//   - ASK_ENABLED (safe default OFF) independently controls the v1
//     surface;
//   - it is INDEPENDENT of ASK_V2_ENABLED and the ASK_LLM_* flags —
//     enabling v1 must never enable v2, and vice versa.
// ============================================================

import { readAskAiConfig } from "@/lib/ai/ask-provider";

/** Server-only gate: may the /ask (v1) surface run at all? Defaults OFF. */
export function isAskEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAskAiConfig(env).askEnabled;
}