// ============================================================
// LedgerAI — Deterministic Insight Generator (Phase 8A)
// ------------------------------------------------------------
// Implements the AI InsightGenerator interface WITHOUT an LLM: it only
// narrates metrics that the deterministic Insight Engine already
// derived (see src/lib/finance/insights.ts). The AI layer never
// calculates figures — this provider simply renders insight cards with
// language chosen deterministically from verified numbers.
//
// A real LLM provider can be swapped in later behind the same
// interface without touching callers.
// ============================================================

import type { InsightGenerator } from "./types";
import type { DerivedInsight } from "../../lib/finance/insights";

/** Deterministic template provider: returns pre-narrated insight cards. */
export class DeterministicInsightGenerator implements InsightGenerator {
  /** Accept a batch of derived insights; returns them unchanged (no LLM). */
  async generateInsights(insights: DerivedInsight[]): Promise<DerivedInsight[]> {
    return insights;
  }

  /**
   * Single-insight interface compatibility. Since the deterministic engine
   * already produces the full card, this returns the input as-is.
   */
  async generateInsight(input: unknown): Promise<string> {
    if (input && typeof input === "object" && "description" in input) {
      return String((input as { description: unknown }).description);
    }
    return "";
  }
}