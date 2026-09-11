// ============================================================
// LedgerAI — Trusted execution-plan compiler (Stage 1)
// ------------------------------------------------------------
// Turns a POLICY-VALIDATED interpreter proposal into an allowlisted
// execution plan. The compiler is the ONLY thing that can create
// executable work from provider output (spec §§2, 8): it is
// exhaustive over the semantic-intent union and never accepts a
// provider-proposed tool key. `userAmountSpan` is parsed with trusted
// money logic; `conversation_reference` periods are refused here —
// the context resolver must ground them first.
// ============================================================

import {
  type ExecutionPlan,
  type InternalToolKey,
  type Interpretation,
  type QueryInterpretation,
} from "./contracts";
import { semanticPeriodSchema, type SemanticQuestion } from "./semantics";
import { extractHypotheticalAmount } from "./understanding";
import {
  queryFromSemantic,
  type ClarificationReason,
} from "@/lib/finance/assistant";

/* ------------------------------------------------------------
 * Interpretation -> semantic model mapping
 * ------------------------------------------------------------ */

/** Map a query interpretation onto the canonical SemanticQuestion shape. */
export function interpretationToSemantic(
  interpretation: QueryInterpretation,
): SemanticQuestion | null {
  if (!semanticPeriodSchema.safeParse(interpretation.period).success) return null;

  const common = {
    intent: interpretation.intent,
    period: interpretation.period,
    entity: interpretation.entity ?? undefined,
    target: interpretation.target ?? undefined,
    mode: interpretation.mode,
    effectGoal: interpretation.effectGoal ?? undefined,
    operation: interpretation.operation ?? undefined,
    confidence: interpretation.confidence,
  };
  const amount =
    interpretation.userAmountSpan && interpretation.userAmountSpan.length > 0
      ? extractHypotheticalAmount(interpretation.userAmountSpan)
      : null;

  switch (interpretation.intent) {
    case "expense_impact":
      return { classification: "query", ...common, hypotheticalAmount: amount ?? undefined };
    case "expense_breakdown":
      return {
        classification: "query",
        ...common,
        amountReference:
          amount !== null ? { value: amount, source: "user_stated" } : undefined,
      };
    default:
      return { classification: "query", ...common };
  }
}

/* ------------------------------------------------------------
 * Intent -> allowed tool keys
 * ------------------------------------------------------------ */

const INTENT_TOOL_MAP: Readonly<Record<string, readonly InternalToolKey[]>> = {
  balance: ["balance.get"],
  income: ["summary.get"],
  expenses: ["summary.get"],
  profit: ["summary.get"],
  profit_margin: ["summary.get"],
  income_vs_expenses: ["summary.get"],
  transaction_count: ["summary.get", "transactions.count"],
  top_category: ["categories.listSpending", "categories.extremity"],
  lowest_category: ["categories.listSpending", "categories.extremity"],
  category_spend: ["categories.listSpending"],
  spending_distribution: ["categories.listSpending", "categories.distribution"],
  expense_breakdown: ["summary.get", "categories.listSpending", "categories.distribution"],
  expense_impact: ["summary.get", "categories.listSpending"],
  period_comparison: ["period.compare"],
};

/** Approved internal tool keys for an intent — throws on unknown intent. */
export function toolKeysForIntent(intent: string): InternalToolKey[] {
  const keys = INTENT_TOOL_MAP[intent];
  if (!keys) {
    // Exhaustiveness failure is a programming bug, not a data condition.
    throw new Error(`compiler: unknown semantic intent ${intent}`);
  }
  return [...keys];
}

/** Normalize a clarification reason to the service's canonical vocabulary. */
export function canonicalClarificationReason(reason: string): ClarificationReason {
  switch (reason) {
    case "needs_subject":
      return "needs_subject";
    case "ambiguous_savings":
      return "ambiguous_savings";
    case "ambiguous_amount":
      return "ambiguous_amount";
    default:
      return "ambiguous_financial_metric";
  }
}

/* ------------------------------------------------------------
 * Compilation
 * ------------------------------------------------------------ */

/**
 * Compile an interpretation into a trusted execution plan. Queries must have
 * a concrete (non-`conversation_reference`) period — anything the resolver
 * has not already grounded becomes an honest clarification.
 */
export function compileExecutionPlan(
  interpretation: Interpretation,
): ExecutionPlan {
  if (interpretation.disposition === "clarify") {
    return {
      kind: "clarification",
      reason: canonicalClarificationReason(interpretation.reason),
    };
  }
  if (interpretation.disposition === "unsupported") {
    return { kind: "unsupported" };
  }

  if (interpretation.period.kind === "conversation_reference") {
    // Never reach the engine with an unresolvable period — the resolver must
    // ground `conversation_reference` before compilation.
    return { kind: "clarification", reason: "needs_subject" };
  }

  const semantic = interpretationToSemantic(interpretation);
  if (!semantic) return { kind: "clarification", reason: "needs_subject" };

  const engineQuery = queryFromSemantic(semantic);
  if (!engineQuery) {
    // e.g. a category_spend proposal that forgot its entity.
    return { kind: "clarification", reason: "needs_subject" };
  }

  return {
    kind: "answer",
    query: engineQuery,
    toolKeys: toolKeysForIntent(interpretation.intent),
  };
}