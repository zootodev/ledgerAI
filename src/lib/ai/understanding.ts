// ============================================================
// LedgerAI — Question Understanding (validated AI seam)
// ------------------------------------------------------------
// Understanding decides WHAT a question asks; the engine still computes
// every figure. This module is the machine-readable contract for that
// step: a provider emits the SAME constrained semantic model the
// deterministic understanding layer produces (ask/semantics.ts), which is
// ALWAYS validated with Zod before it can influence an answer.
//
// The rules provider has no external understanding and stays off by
// default (configured = false), so the deterministic classifier in
// src/lib/finance/assistant.ts remains the production path. A provider's
// output is only intent + period + (optionally) an entity/dimension —
// it never receives or returns business ids, DB handles, raw
// transactions, amounts, or credentials, and it never performs a
// financial calculation.
// ============================================================

import {
  isDataQuestion,
  semanticPeriodSchema,
  semanticQuestionSchema,
  type SemanticPeriod,
  type SemanticQuestion,
} from "@/lib/ask/semantics";
import { queryFromSemantic } from "@/lib/finance/assistant";
import type { AssistantQuery } from "@/lib/finance/assistant";

/** Re-exported under the historical names for the provider contract. */
export const understandingOutputSchema = semanticQuestionSchema;
export const understandingPeriodSchema = semanticPeriodSchema;

export type UnderstandingOutput = SemanticQuestion;
export type UnderstandingPeriod = SemanticPeriod;

/**
 * An understanding provider: emits structured meaning, zod-validated by
 * callers. Implementations must treat the prompt as untrusted input and must
 * NEVER be handed a database handle, business id, or financial data.
 */
export interface QuestionUnderstanding {
  /**
   * True when this provider is an explicit, wired AI provider. The built-in
   * rules provider is never configured, so pattern-covered questions and
   * out-of-scope turns never call an external service.
   */
  readonly configured: boolean;
  /** Raw, unvalidated structured output for the question (validated upstream). */
  classify(question: string, now: Date): Promise<unknown>;
}

/**
 * Convert validated structured understanding into an engine query (null when
 * it isn't a trustworthy data question). This is the ONLY sanctioned path for
 * provider output to reach the financial engine.
 */
export function toAssistantQuery(understood: unknown): AssistantQuery | null {
  const parsed = understandingOutputSchema.safeParse(understood);
  if (!parsed.success) return null;
  if (!isDataQuestion(parsed.data)) return null;
  return queryFromSemantic(parsed.data);
}