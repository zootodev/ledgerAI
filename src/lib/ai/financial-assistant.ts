// ============================================================
// LedgerAI — Deterministic Financial Assistant (Phase 8B)
// ------------------------------------------------------------
// Implements the AI FinancialAssistant interface WITHOUT an LLM: the
// Q&A engine (src/lib/finance/assistant.ts) already produced the full,
// verified answer draft from real data. This provider simply passes it
// through unchanged. A real LLM provider can swap in behind the same
// interface without touching callers.
// ============================================================

import type { FinancialAssistant } from "./types";

/** Context contract the service hands the assistant (keep stable-ish). */
interface AssistantContext {
  /** The deterministic, data-cited draft answer. */
  draft: string;
  /** The original question text. */
  question: string;
}

/** Deterministic fallback: returns the verified draft verbatim. */
export class DeterministicFinancialAssistant implements FinancialAssistant {
  async answer(_question: string, context: unknown): Promise<string> {
    const draft = (context as AssistantContext | null | undefined)?.draft;
    if (typeof draft === "string" && draft.length > 0) return draft;
    return "";
  }
}