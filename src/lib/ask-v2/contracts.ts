// ============================================================
// LedgerAI — Ask v2 boundary contracts (Phase 2 foundation)
// ------------------------------------------------------------
// The v2 boundary: what the LLM will eventually PROPOSE, and what the
// server may ANSWER. Every schema here is strict so that tenant context
// (businessId, userId, tenantId, database identifiers, authorization
// fields) can never silently pass a boundary check.
//
// Security invariants hold structurally (mirroring ask/contracts.ts):
//   - the LLM-facing proposal carries SEMANTIC arguments only (period,
//     category, delta, …) — never businessId/userId/tenantId/DB ids;
//   - businessId is owned by the server layer (injected from
//     requireAuthContext()) and never appears on any v2 contract;
//   - money may only ever be a user-stated span or a VERIFIED engine
//     figure — never model-authored (proposals carry a signed `delta`
//     the user themselves posed, validated to a bounded range);
//   - every derived figure is validated against the canonical Zod
//     contracts before it is attached to an answer.
//
// Phase 2 is deterministic-only: no AI provider is invoked in the
// answer path. The provider seam stays an explicit deploy-config opt-in
// that can NEVER change a served answer (spec §7 shadow semantics).
// ============================================================

import { z } from "zod";
import {
  assistantPeriodSchema,
  internalToolKeySchema,
} from "@/lib/ask/contracts";
import {
  type AssistantAnswer,
  type AssistantMetrics,
  type AssistantQuery,
} from "@/lib/finance/assistant";

/* ------------------------------------------------------------
 * v2 tool vocabulary (LLM-facing — semantic arguments only)
 * ------------------------------------------------------------ */

export const askV2ToolSchema = z.enum([
  "expense_summary",
  "expense_breakdown",
  "expense_comparison",
  "category_ranking",
  "balance",
  "transactions",
  "search_transactions",
  "goal_impact",
  "category_share",
]);
export type AskV2Tool = z.infer<typeof askV2ToolSchema>;

/** Signed user-posed spending change (bounded; validated, never invented). */
const amountDeltaSchema = z
  .number()
  .finite()
  .min(-1_000_000_000_000)
  .max(1_000_000_000_000);

/**
 * LLM-facing proposal: a tool call with semantic arguments ONLY. Strict on
 * every branch so tenant context can never pass. `delta` is the signed change
 * the USER posed — the server maps it to the trusted hypothetical-impact path.
 */
export const askV2ProposalSchema = z.discriminatedUnion("tool", [
  z
    .object({
      tool: z.literal("expense_summary"),
      period: assistantPeriodSchema,
    })
    .strict(),
  z
    .object({
      tool: z.literal("expense_breakdown"),
      period: assistantPeriodSchema,
      category: z.string().trim().min(1).max(80).optional(),
      // Where the category came from: "explicit" means the user stated the
      // category in the message (run as-is); "referenced" means the
      // interpreter resolved it from conversation history (the trusted policy
      // layer verifies it against the owned category set). Absent = legacy
      // proposal (a present category is trusted as explicit, no category is
      // the aggregate distribution).
      categoryOrigin: z.enum(["explicit", "referenced"]).optional(),
      // Phase 15 — category complement / remainder semantics. Absent (legacy):
      // aggregate distribution (no category) or single-category spend (category).
      // "aggregate": every category of the requested period BEYOND the top five
      // of the distribution (the "remaining"/"rest"/"other categories" follow-up).
      // "complement" with a category: the requested period's distribution
      // EXCLUDING that one category ("categories apart from X"). The interpreter
      // marks the INTENT; the trusted engine derives all figures. Never carries
      // financial values.
      scope: z.enum(["aggregate", "complement"]).optional(),
    })
    .strict(),
  z
    .object({
      tool: z.literal("expense_comparison"),
      currentPeriod: assistantPeriodSchema,
      priorPeriod: assistantPeriodSchema,
    })
    .strict(),
  z
    .object({
      tool: z.literal("category_ranking"),
      period: assistantPeriodSchema,
    })
    .strict(),
  z.object({ tool: z.literal("balance") }).strict(),
  z
    .object({
      tool: z.literal("transactions"),
      period: assistantPeriodSchema.optional(),
      category: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({
      tool: z.literal("search_transactions"),
      query: z.string().trim().min(1).max(200),
      period: assistantPeriodSchema.optional(),
    })
    .strict(),
  z
    .object({
      tool: z.literal("goal_impact"),
      category: z.string().trim().min(1).max(80),
      delta: amountDeltaSchema,
      period: assistantPeriodSchema,
    })
    .strict(),
  // Phase 17 — category share. A named category's share (percentage) of the
  // requested period's total spending, alongside its amount. The category is
  // REQUIRED — a share is never an aggregate/complement figure. The engine
  // derives every value from the trusted distribution; this branch never
  // carries amounts, percentages, or tenant identifiers.
  z
    .object({
      tool: z.literal("category_share"),
      period: assistantPeriodSchema,
      category: z.string().trim().min(1).max(80),
      // Same origin semantics as expense_breakdown: "explicit" = the user
      // stated the category; "referenced" = resolved from history (policy
      // verifies against the owned category set). Absent = legacy (a present
      // category is trusted as explicit).
      categoryOrigin: z.enum(["explicit", "referenced"]).optional(),
    })
    .strict(),
]);
export type AskV2Proposal = z.infer<typeof askV2ProposalSchema>;

/* ------------------------------------------------------------
 * Allow-listed canonical tool keys
 * ------------------------------------------------------------ */

/** Allow-listed internal keys a v2 plan may run (bounded like the canonical
 * execution plan; the executor only ever runs allow-listed keys). */
export const askV2ToolKeysSchema = z
  .array(internalToolKeySchema)
  .min(1)
  .max(3);
export type AskV2ToolKeys = z.infer<typeof askV2ToolKeysSchema>;

/* ------------------------------------------------------------
 * Verified plan outcome (trusted executor result)
 * ------------------------------------------------------------ */

export const askV2ClarificationReasonSchema = z.enum([
  "ambiguous_financial_metric",
  "ambiguous_savings",
  "needs_subject",
  "ambiguous_amount",
]);
export type AskV2ClarificationReason = z.infer<
  typeof askV2ClarificationReasonSchema
>;

export const askV2UnsupportedReasonSchema = z.enum([
  "not_financial",
  "not_supported",
]);
export type AskV2UnsupportedReason = z.infer<
  typeof askV2UnsupportedReasonSchema
>;

export type AskV2PlanOutcome =
  | {
      kind: "answer";
      query: AssistantQuery;
      answer: AssistantAnswer;
      metrics: AssistantMetrics;
      toolKeys: AskV2ToolKeys;
    }
  | { kind: "clarification"; reason: AskV2ClarificationReason }
  | { kind: "unsupported"; reason: AskV2UnsupportedReason };

/* ------------------------------------------------------------
 * API request / response (client boundary)
 * ------------------------------------------------------------ */

export const askV2RequestSchema = z
  .object({
    proposal: askV2ProposalSchema,
    conversationId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type AskV2Request = z.infer<typeof askV2RequestSchema>;

export const askV2ResponseSchema = z.discriminatedUnion("disposition", [
  z
    .object({
      disposition: z.literal("answer"),
      text: z.string().min(1),
      conversationId: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      disposition: z.literal("clarification"),
      reason: askV2ClarificationReasonSchema,
      text: z.string().min(1),
      conversationId: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      disposition: z.literal("unsupported"),
      reason: askV2UnsupportedReasonSchema,
      text: z.string().min(1),
      conversationId: z.string().nullable(),
    })
    .strict(),
]);
export type AskV2Response = z.infer<typeof askV2ResponseSchema>;