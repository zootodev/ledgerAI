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
import type { QuestionUnderstanding } from "./understanding";

/** Anything that can categorize an unclassified transaction description. */
export interface Categorizer {
  /**
   * Return a category + confidence for a raw description (e.g. "UBER").
   * Confidence is 0..1. `needsReview` flags results below a threshold.
   * `rowType` (when known) restricts built-in matches to categories of the
   * same type so an income row is never suggested an expense category.
   */
  categorize(
    description: string,
    rowType?: "income" | "expense",
  ): Promise<CategorizationResult>;
}

/** Interface for insight narration. Deterministic MVP uses templates. */
export interface InsightGenerator {
  /** Narrate/count a batch of pre-derived insights (template or LLM). */
  generateInsights(insights: unknown[]): Promise<unknown[]>;
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
  /**
   * Optional question-understanding seam (src/lib/ai/understanding.ts). The
   * rules provider leaves this unset, keeping the deterministic classifier
   * authoritative; an explicitly configured provider may inject constrained,
   * Zod-validated structured intent only where the deterministic
   * understanding can't classify a genuinely financial turn.
   */
  understanding?: QuestionUnderstanding;
}
