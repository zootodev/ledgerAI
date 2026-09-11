// ============================================================
// LedgerAI — Semantic Question Model (Ask LedgerAI)
// ------------------------------------------------------------
// The canonical, strongly-typed + Zod-validated representation of
// WHAT a user question means, before any financial data is touched.
// Both the deterministic understanding layer (ask/understanding.ts)
// and any future LLM provider emit this shape; the trusted resolver
// (finance/assistant.ts -> queryFromSemantic) turns it into a concrete
// engine query.
//
// The model deliberately carries meaning, not SQL: metric/operation/
// dimension/period/entity/comparison. It contains no business ids,
// db handles, amounts, or raw transactions; validation here rejects
// anything that does not fit the constrained vocabulary.
// ============================================================

import { z } from "zod";

/** Period a question refers to (snake_case keys are the canonical engine form). */
export const semanticPeriodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("this_month") }),
  z.object({ kind: z.literal("last_month") }),
  z.object({ kind: z.literal("this_year") }),
  z.object({ kind: z.literal("last_year") }),
  z.object({ kind: z.literal("all_time") }),
  z.object({
    kind: z.literal("month"),
    month: z.number().int().min(0).max(11),
    year: z.number().int().min(1900).max(2100),
  }),
  z.object({
    kind: z.literal("recent"),
    days: z.number().int().min(1).max(365),
  }),
  z.object({
    kind: z.literal("conversation_reference"),
  }),
]);
export type SemanticPeriod = z.infer<typeof semanticPeriodSchema>;

/** The intent catalogue: the capability set the engine can answer. */
export const semanticIntentSchema = z.enum([
  "balance",
  "income",
  "expenses",
  "profit",
  "profit_margin",
  "transaction_count",
  "top_category",
  "lowest_category",
  "category_spend",
  "expense_impact",
  "spending_distribution",
  "expense_breakdown",
  "income_vs_expenses",
  "period_comparison",
]);
export type SemanticIntent = z.infer<typeof semanticIntentSchema>;
export const SEMANTIC_INTENTS: readonly SemanticIntent[] = semanticIntentSchema.options;

export const semanticDimensionSchema = z.enum(["total", "category"]);

export const semanticTargetSchema = z.enum(["income", "expenses", "profit", "balance"]);

export const semanticComparisonSchema = z.enum(["previous_period"]);

/**
 * How a question frames its request:
 *   - factual: report a figure that exists now ("What were my expenses?");
 *   - comparison: set one figure against a previous period/baseline;
 *   - hypothetical: reason about an imagined change ("If I spent less…").
 * Absent = factual, so existing provider payloads stay valid.
 */
export const semanticQuestionModeSchema = z.enum([
  "factual",
  "comparison",
  "hypothetical",
]);

/** The direction of a posited change to spending ("spent less" vs "spent more"). */
export const semanticOperationSchema = z.enum(["increase", "decrease"]);

export const semanticClarificationReasonSchema = z.enum([
  "missing_metric",
  "missing_period",
  "ambiguous_financial_metric",
  "ambiguous_savings",
  "needs_subject",
  "ambiguous_amount",
]);

/**
 * Fully validated structured output for one question. A provider may emit any
 * of these; anything that fails this schema is rejected before it can influence
 * an answer, and the deterministic engine stays authoritative.
 */
export const semanticQuestionSchema = z.discriminatedUnion("classification", [
  z.object({
    classification: z.literal("query"),
    intent: semanticIntentSchema,
    period: semanticPeriodSchema,
    /** Canonical entity name when relevant (e.g. a category for category_spend). */
    entity: z.string().min(1).max(80).nullable().optional(),
    dimension: semanticDimensionSchema.nullable().optional(),
    /** Which metric a comparison should report (null = everything relevant). */
    target: semanticTargetSchema.nullable().optional(),
    comparison: semanticComparisonSchema.nullable().optional(),
    /**
     * Question framing for hypothetical/comparison turns ("If I spent less…").
     * Optional so existing factual payloads remain valid.
     */
    mode: semanticQuestionModeSchema.optional(),
    /** Which metric the posited change is expected to move (effectGoal). */
    effectGoal: semanticTargetSchema.optional(),
    /** Direction of the posited spending change ("spent less" = decrease). */
    operation: semanticOperationSchema.optional(),
    /** A user-stated amount for the change (never invented by the system). */
    hypotheticalAmount: z.number().min(0).max(1_000_000_000_000).optional(),
    /**
     * The amount an expense breakdown asks about. When the period is
     * `conversation_reference` the service must anchor this against the owned
     * previous exchange's own answer before it can be answered (otherwise it
     * clarifies); `previous_answer` means the figure was read from our own
     * deterministic narration, never invented.
     */
    amountReference: z
      .object({
        value: z.number().min(0).max(1_000_000_000_000),
        source: z.enum(["user_stated", "previous_answer"]),
      })
      .optional(),
    confidence: z.number().min(0).max(1).optional(),
    needsClarification: z.boolean().optional(),
  }),
  z.object({
    classification: z.literal("clarification"),
    reason: semanticClarificationReasonSchema,
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    classification: z.literal("unsupported"),
    reason: z.string().min(1).max(120),
    confidence: z.number().min(0).max(1).optional(),
  }),
]);
export type SemanticQuestion = z.infer<typeof semanticQuestionSchema>;

/** Type guard: is this structured output a data-answerable query? */
export function isDataQuestion(input: SemanticQuestion): input is Extract<
  SemanticQuestion,
  { classification: "query" }
> {
  return input.classification === "query";
}