// ============================================================
// LedgerAI — AI Service Abstraction
// ------------------------------------------------------------
// The application must never be tightly coupled to a single AI
// provider. This file defines the provider-agnostic interface that
// the rest of the app depends on. The MVP ships a deterministic
// rules-based implementation so the product is fully functional with
// NO API key. A real LLM provider can be swapped in later by adding
// a provider implementing this interface (see provider.ts).
//
// IMPORTANT: AI never calculates financial figures. It only classifies
// text and narrates metrics provided by the deterministic engine.
// ============================================================

import type { CategorizationResult } from "../../types";

/** Anything that can categorize an unclassified transaction description. */
export interface Categorizer {
  /**
   * Return a category + confidence for a raw description (e.g. "UBER").
   * Confidence is 0..1. `needsReview` flags results below a threshold.
   */
  categorize(description: string): Promise<CategorizationResult>;
}

/** Interface for future insight narration (LLM). Deterministic MVP uses templates. */
export interface InsightGenerator {
  generateInsight(input: unknown): Promise<string>;
}

/** Interface for future natural-language Q&A over verified data. */
export interface FinancialAssistant {
  answer(question: string, context: unknown): Promise<string>;
}

/** Aggregate AI service facade the app consumes. */
export interface AIService {
  categorizer: Categorizer;
  insightGenerator?: InsightGenerator;
  assistant?: FinancialAssistant;
}
