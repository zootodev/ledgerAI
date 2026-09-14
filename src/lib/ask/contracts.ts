// ============================================================
// LedgerAI — Ask LedgerAI architecture contracts (Stage 1)
// ------------------------------------------------------------
// Strict boundary contracts for the LLM interpreter seam and the
// trusted execution pipeline (spec §5). Everything a provider emits
// passes through these schemas BEFORE policy/compiler/tools see it.
// The schemas intentionally carry no business ids, raw dates, SQL,
// DB fields, model-selected currencies, or arbitrary JSON — and the
// only money-shaped fields are user-stated spans / verified
// tool results, never model-authored figures.
// ============================================================

import { z } from "zod";
import type { AssistantQuery, ClarificationReason } from "@/lib/finance/assistant";
import {
  semanticClarificationReasonSchema,
  semanticIntentSchema,
  semanticOperationSchema,
  semanticPeriodSchema,
  semanticQuestionModeSchema,
  semanticTargetSchema,
} from "./semantics";

/* ------------------------------------------------------------
 * Server-action input (spec §5)
 * ------------------------------------------------------------ */

export const askTurnInputSchema = z
  .object({
    question: z.string().trim().min(2).max(500),
    conversationId: z.string().uuid().nullable().optional(),
    clientRequestId: z.string().uuid(),
  })
  .strict();
export type AskTurnInput = z.infer<typeof askTurnInputSchema>;

/* ------------------------------------------------------------
 * Reference slots (spec §6)
 * ------------------------------------------------------------ */

export const referenceSlotSchema = z.enum([
  "none",
  "last_answer",
  "last_expense_total",
  "last_category",
  "last_clarification",
  "older_amount_anchor",
]);
export type ReferenceSlot = z.infer<typeof referenceSlotSchema>;

/* ------------------------------------------------------------
 * Interpreter proposal (spec §5 interpretationSchema)
 * ------------------------------------------------------------ */

/**
 * The model emits a PROPOSAL with a `userAmountSpan` (a text span), never an
 * amount: only trusted code parses and validates any money reference.
 */
export const interpretationSchema = z.discriminatedUnion("disposition", [
  z
    .object({
      disposition: z.literal("query"),
      intent: semanticIntentSchema,
      period: semanticPeriodSchema,
      entity: z.string().trim().min(1).max(80).nullable(),
      target: semanticTargetSchema.nullable(),
      mode: semanticQuestionModeSchema.default("factual"),
      operation: semanticOperationSchema.nullable(),
      effectGoal: semanticTargetSchema.nullable(),
      /** A text span only; trusted code parses/validates any money reference. */
      userAmountSpan: z.string().max(48).nullable(),
      reference: referenceSlotSchema,
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      disposition: z.literal("clarify"),
      reason: semanticClarificationReasonSchema,
      reference: referenceSlotSchema,
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      disposition: z.literal("unsupported"),
      safeReason: z.enum(["not_financial", "not_supported", "insufficient_context"]),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
]);
export type Interpretation = z.infer<typeof interpretationSchema>;
export type QueryInterpretation = Extract<Interpretation, { disposition: "query" }>;

/* ------------------------------------------------------------
 * Tool registry (spec §4)
 * ------------------------------------------------------------ */

export const internalToolKeySchema = z.enum([
  "summary.get",
  "balance.get",
  "categories.listSpending",
  "categories.extremity",
  "categories.distribution",
  "period.compare",
  "expense.impact",
  "transactions.count",
]);
export type InternalToolKey = z.infer<typeof internalToolKeySchema>;

/** Server-only execution context for trusted tools. */
export interface TrustedExecutionContext {
  readonly prisma: unknown;
  readonly businessId: string;
  readonly currency: string;
  readonly now: Date;
  readonly traceId: string;
}

/* ------------------------------------------------------------
 * Engine query mirror (spec §5 assistantQuerySchema)
 * ------------------------------------------------------------ */

/** Period union mirrors AssistantQuery["period"] exactly. */
export const assistantPeriodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thisMonth") }),
  z.object({ kind: z.literal("lastMonth") }),
  z.object({ kind: z.literal("thisYear") }),
  z.object({ kind: z.literal("lastYear") }),
  z.object({ kind: z.literal("allTime") }),
  z.object({ kind: z.literal("month"), month: z.number().int().min(0).max(11), year: z.number().int().min(1900).max(2100) }),
  z.object({ kind: z.literal("recent"), days: z.number().int().min(1).max(365) }),
  z
    .object({
      kind: z.literal("custom"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      label: z.string().min(1).max(32),
    })
    .strict(),
]);
export type AssistantPeriodSchema = z.infer<typeof assistantPeriodSchema>;

const comparisonTargetSchema = semanticTargetSchema;

/** Mirrors the trusted AssistantQuery discriminated union (§5). */
export const assistantQuerySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("balance"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("income"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("expenses"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("profit"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("profitMargin"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("transactionCount"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("topCategory"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z.object({ intent: z.literal("lowestCategory"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z
    .object({
      intent: z.literal("categorySpend"),
      category: z.string().min(1).max(80),
      period: assistantPeriodSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("expenseImpact"),
      category: z.string().max(80).nullable(),
      period: assistantPeriodSchema,
      mode: semanticQuestionModeSchema.optional(),
      effectGoal: semanticTargetSchema.optional(),
      operation: semanticOperationSchema.optional(),
      hypotheticalAmount: z.number().min(0).max(1_000_000_000_000).optional(),
    })
    .strict(),
  z
    .object({
      intent: z.literal("spendingDistribution"),
      category: z.string().max(80).nullable(),
      period: assistantPeriodSchema,
    })
    .strict(),
  z
    .object({
      intent: z.literal("expenseBreakdown"),
      category: z.string().max(80).nullable(),
      period: assistantPeriodSchema,
      amountReference: z
        .object({
          value: z.number().min(0).max(1_000_000_000_000),
          source: z.enum(["user_stated", "previous_answer"]),
        })
        .optional(),
    })
    .strict(),
  z.object({ intent: z.literal("incomeVsExpenses"), category: z.string().max(80).nullable(), period: assistantPeriodSchema }).strict(),
  z
    .object({
      intent: z.literal("periodComparison"),
      category: z.string().max(80).nullable(),
      target: comparisonTargetSchema.nullable().optional(),
      period: assistantPeriodSchema,
      comparisonPeriod: assistantPeriodSchema.optional(),
    })
    .strict(),
]);
export type AssistantQueryContract = z.infer<typeof assistantQuerySchema>;

/* ------------------------------------------------------------
 * Execution plan (spec §5)
 * ------------------------------------------------------------ */

/**
 * Validate an execution plan value (compiler output, persisted JSON). The
 * schema mirrors the canonical `ExecutionPlan` TS union below.
 */
export const executionPlanSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("answer"),
      query: assistantQuerySchema,
      toolKeys: z.array(internalToolKeySchema).min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clarification"),
      reason: semanticClarificationReasonSchema,
    })
    .strict(),
  z.object({ kind: z.literal("unsupported") }).strict(),
]);

/** Canonical, TS-native execution plan (see spec §5). */
export type ExecutionPlan =
  | { kind: "answer"; query: AssistantQuery; toolKeys: InternalToolKey[] }
  | { kind: "clarification"; reason: ClarificationReason }
  | { kind: "unsupported" };
export type PlanAnswer = Extract<ExecutionPlan, { kind: "answer" }>;

/* ------------------------------------------------------------
 * Tool results (spec §5)
 * ------------------------------------------------------------ */

export const trustedPeriodSchema = z
  .object({
    from: z.iso.date().nullable(),
    to: z.iso.date().nullable(),
    label: z.string().min(1).max(32),
  })
  .strict();

export const toolResultMetaSchema = z
  .object({
    source: z.literal("deterministic_finance_engine"),
    currency: z.string().min(3).max(8),
    period: trustedPeriodSchema,
  })
  .strict();

export const summaryResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    income: z.number().finite(),
    expenses: z.number().finite(),
    netProfit: z.number().finite(),
    counts: z
      .object({
        income: z.number().int().nonnegative(),
        expenses: z.number().int().nonnegative(),
        transfers: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const categorySpendSchema = z
  .object({
    categoryName: z.string().min(1).max(80),
    amount: z.number().finite().nonnegative(),
    priorAmount: z.number().finite().nonnegative(),
  })
  .strict();

export const balanceResultSchema = z
  .object({ meta: toolResultMetaSchema, balance: z.number().finite() })
  .strict();

export const categoryListResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    categories: z.array(categorySpendSchema).max(80),
  })
  .strict();

export const categoryExtremityResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    categoryName: z.string().min(1).max(80),
    amount: z.number().finite().nonnegative(),
    shareOfExpenses: z.number().finite().nonnegative(),
  })
  .strict();

export const categoryDistributionResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    total: z.number().finite().nonnegative(),
    breakdown: z
      .array(
        z
          .object({
            categoryName: z.string().min(1).max(80),
            amount: z.number().finite().nonnegative(),
            share: z.number().finite().nonnegative().max(100),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const periodComparisonResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    target: comparisonTargetSchema.nullable(),
    current: z.number().finite(),
    prior: z.number().finite(),
    deltaAmount: z.number().finite(),
    deltaPercent: z.number().finite().nullable(),
  })
  .strict();

export const expenseImpactResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    revenue: z.number().finite(),
    expenses: z.number().finite(),
    netProfit: z.number().finite(),
    scenario: z
      .object({
        effectGoal: comparisonTargetSchema,
        operation: semanticOperationSchema,
        hypotheticalAmount: z.number().finite().nonnegative().nullable(),
        shifted: z.number().finite().nullable(),
      })
      .strict(),
  })
  .strict();

export const transactionCountResultSchema = z
  .object({
    meta: toolResultMetaSchema,
    counts: z
      .object({
        income: z.number().int().nonnegative(),
        expenses: z.number().int().nonnegative(),
        transfers: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

/** Union of every verified tool result (all share `meta` except facts). */
export const toolResultUnionSchema = z.union([
  summaryResultSchema,
  balanceResultSchema,
  categoryListResultSchema,
  categoryExtremityResultSchema,
  categoryDistributionResultSchema,
  periodComparisonResultSchema,
  expenseImpactResultSchema,
  transactionCountResultSchema,
]);

/* ------------------------------------------------------------
 * Facts + narration (spec §5)
 * ------------------------------------------------------------ */

export const financialFactSchema = z
  .object({
    id: z.string().regex(/^F[1-9][0-9]*$/),
    kind: z.enum(["period", "money", "percent", "category", "count", "relation"]),
    display: z.string().min(1).max(120),
    required: z.boolean(),
  })
  .strict();
export type FinancialFact = z.infer<typeof financialFactSchema>;

export const narrationManifestSchema = z
  .object({
    answerKind: z.enum([
      "summary",
      "breakdown",
      "comparison",
      "hypothetical",
      "clarification",
      "insufficient",
    ]),
    facts: z.array(financialFactSchema).min(1).max(24),
    allowedTemplates: z.array(z.enum(["direct", "brief", "explain", "ranked"])).min(1),
  })
  .strict();
export type NarrationManifest = z.infer<typeof narrationManifestSchema>;

export const narrationPlanSchema = z
  .object({
    template: z.enum(["direct", "brief", "explain", "ranked"]),
    factOrder: z.array(z.string().regex(/^F[1-9][0-9]*$/)).max(24),
    optionalLead: z.enum(["none", "answer", "context", "comparison"]).default("none"),
  })
  .strict();
export type NarrationPlan = z.infer<typeof narrationPlanSchema>;

/* ------------------------------------------------------------
 * V2 structured context frame (spec §6)
 * ------------------------------------------------------------ */

export const contextFrameV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    turnOrdinal: z.number().int().nonnegative(),
    answerKind: z.enum(["answer", "clarification", "unsupported", "insufficient"]),
    intent: semanticIntentSchema.nullable(),
    period: semanticPeriodSchema.nullable(),
    category: z.string().max(80).nullable(),
    anchors: z
      .array(
        z
          .object({
            id: z.string().max(64),
            kind: z.enum(["expense_total", "category", "period", "clarification"]),
            factId: z.string().regex(/^F[1-9][0-9]*$/),
          })
          .strict(),
      )
      .max(8),
    pendingClarification: semanticClarificationReasonSchema.nullable(),
  })
  .strict();
export type ContextFrameV2 = z.infer<typeof contextFrameV2Schema>;
