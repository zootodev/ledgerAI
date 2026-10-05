// ============================================================
// LedgerAI — Ask v2 executor boundary (Phase 2 foundation)
// ------------------------------------------------------------
// The ONLY v2 seam that RUNS tools. It is a thin trusted wrapper over
// the canonical deterministic finance engine (finance/tools/executor):
//
//   - businessId NEVER comes from a proposal, the future interpreter, or
//     a tool result — it is INJECTED here by the server layer from
//     requireAuthContext() (ask boundary invariant §5/§8);
//   - every figure is computed by the deterministic engine and validated
//     against its canonical Zod contracts (extractionSchemas) before it
//     is attached to an answer — no model-authored figure can reach a
//     served answer;
//   - READ-ONLY boundary: only the allow-listed internal keys may run,
//     and every canonical key maps to a pure verified derivation — no
//     phase-2 tool can mutate tenant data;
//   - deterministic-only: the AI provider seam (spec §7) can never
//     change a served answer.
// ============================================================

import type { PrismaClient } from "@/generated/prisma/client";
import {
  type AssistantAnswer,
  type AssistantMetrics,
  type AssistantQuery,
} from "@/lib/finance/assistant";
import {
  type ExecutionPlan,
} from "@/lib/ask/contracts";
import {
  executePlan,
  type FinanceToolContext,
  type PlanOutcome,
} from "@/lib/finance/tools/executor";
import {
  type AskV2PlanOutcome,
  type AskV2ToolKeys,
} from "./contracts";

/** Trusted server-injected context for one v2 turn. */
export interface AskV2ExecutorContext {
  readonly prisma: PrismaClient;
  /** INJECTED from requireAuthContext(); never client- or proposal-supplied. */
  readonly businessId: string;
  readonly currency: string;
  readonly now: Date;
  readonly traceId: string;
}

/** Build the canonical finance-tool context from the injected seam context. */
export function buildFinanceToolContext(
  ctx: AskV2ExecutorContext,
): FinanceToolContext {
  return {
    prisma: ctx.prisma,
    businessId: ctx.businessId,
    currency: ctx.currency,
    now: ctx.now,
    traceId: ctx.traceId,
  };
}

/** Map the canonical engine outcome onto the v2 boundary contract. */
function planOutcomeToV2(
  outcome: PlanOutcome,
  query: AssistantQuery,
  toolKeys: AskV2ToolKeys,
): AskV2PlanOutcome {
  switch (outcome.kind) {
    case "answer":
      return {
        kind: "answer",
        query,
        answer: outcome.answer as AssistantAnswer,
        metrics: outcome.metrics as AssistantMetrics,
        toolKeys,
      };
    case "clarification":
      return { kind: "clarification", reason: outcome.reason };
    case "unsupported":
      return { kind: "unsupported", reason: "not_supported" };
  }
}

/**
 * Execute a POLICY-COMPILED plan through the trusted deterministic engine.
 * The plan's query and tool keys were validated upstream; this seam only
 * runs canonical, allow-listed, read-only derivations and returns VERIFIED
 * figures.
 */
export async function executeAskV2Plan(
  ctx: AskV2ExecutorContext,
  plan: ExecutionPlan,
  query: AssistantQuery,
  toolKeys: AskV2ToolKeys,
): Promise<AskV2PlanOutcome> {
  const financeCtx = buildFinanceToolContext(ctx);
  const outcome = await executePlan(financeCtx, plan);
  return planOutcomeToV2(outcome, query, toolKeys);
}