// ============================================================
// LedgerAI — Context resolver (V2 wrapper, Stage 1/2)
// ------------------------------------------------------------
// Two responsibilities:
//   1. Build the REDACTED surface handed to the interpreter (spec §3):
//      slot names + intent/period KINDS only — never a prior free-form
//      answer, category name, amount, account, transaction, or id.
//   2. Ground an interpretation's reference slots and
//      `conversation_reference` periods against OWNED frames using the
//      same deterministic precedence as the Phase 8B resolver
//      (explicit exact > semantic relationship > continuity > recency)
//      and the §22 rule: duplicate figures in distinct periods clarify.
// It also derives the V2 structured frame (§6) for turn-state writes.
// ============================================================

import {
  type ContextFrameV2,
  type Interpretation,
  type ReferenceSlot,
} from "./contracts";
import { extractHypotheticalAmount, type FollowUpAnalysis } from "./understanding";
import { semanticIntentSchema, type SemanticIntent, type SemanticPeriod } from "./semantics";
import {
  resolveAgainstFrames,
  type FinancialContextFrame,
} from "@/lib/finance/context-frame";
import type {
  AssistantIntent,
  AssistantQuery,
  ClarificationReason,
} from "@/lib/finance/assistant";
import type { FinancialFact } from "./contracts";

export interface InterpreterSurface {
  /** Reference slots the caller actually owns context for (plus "none"). */
  availableReferenceSlots: ReferenceSlot[];
  lastIntent: string | null;
  lastPeriodKind: string | null;
  allowedIntents: string[];
}

/* ------------------------------------------------------------
 * Kind mapping (AssistantQuery -> semantic snake_case, redacted)
 * ------------------------------------------------------------ */

export function intentToSemanticKind(intent: AssistantIntent): string {
  const map: Record<AssistantIntent, string> = {
    balance: "balance",
    income: "income",
    expenses: "expenses",
    profit: "profit",
    profitMargin: "profit_margin",
    transactionCount: "transaction_count",
    topCategory: "top_category",
    lowestCategory: "lowest_category",
    categorySpend: "category_spend",
    categoryShare: "category_share",
    expenseImpact: "expense_impact",
    spendingDistribution: "spending_distribution",
    expenseBreakdown: "expense_breakdown",
    incomeVsExpenses: "income_vs_expenses",
    periodComparison: "period_comparison",
  };
  return map[intent];
}

export function periodToSemanticKind(period: AssistantQuery["period"]): SemanticPeriod | null {
  switch (period.kind) {
    case "thisMonth":
      return { kind: "this_month" };
    case "lastMonth":
      return { kind: "last_month" };
    case "thisYear":
      return { kind: "this_year" };
    case "lastYear":
      return { kind: "last_year" };
    case "allTime":
      return { kind: "all_time" };
    case "month":
      return { kind: "month", month: period.month, year: period.year };
    case "recent":
      return { kind: "recent", days: period.days };
    case "custom":
      return null;
  }
}

/** Slot set the resolver has context for (derived from owned frames). */
export function referenceSlotsFor(frames: FinancialContextFrame[]): ReferenceSlot[] {
  const slots: ReferenceSlot[] = ["none"];
  const newest = frames[0];
  if (!newest) return slots;
  if (newest.classification === "clarification") {
    slots.push("last_clarification");
  }
  if (newest.reported.categoryName) {
    slots.push("last_category");
  }
  if (
    newest.reported.total !== null &&
    (newest.reported.metric === "expenses" || newest.reported.metric === "category")
  ) {
    slots.push("last_expense_total");
  }
  return slots;
}

/** Narrow intents the interpreter may propose (no data leaks in names). */
const SURFACE_ALLOWED_INTENTS = [
  "income",
  "expenses",
  "profit",
  "balance",
  "profit_margin",
  "transaction_count",
  "top_category",
  "lowest_category",
  "category_spend",
  "spending_distribution",
  "expense_breakdown",
  "income_vs_expenses",
  "period_comparison",
  "expense_impact",
];

/**
 * Redacted context surface (§3): the interpreter sees kinds and slot names,
 * never a prior answer, category name, amount, account, transaction, or id.
 */
export function buildInterpreterSurface(
  frames: FinancialContextFrame[],
): InterpreterSurface {
  const newest = frames[0];
  const lastPeriod = newest?.query?.period ? periodToSemanticKind(newest.query.period) : null;
  return {
    availableReferenceSlots: referenceSlotsFor(frames),
    lastIntent: newest?.query ? intentToSemanticKind(newest.query.intent) : null,
    lastPeriodKind: lastPeriod?.kind ?? null,
    allowedIntents: SURFACE_ALLOWED_INTENTS,
  };
}

/* ------------------------------------------------------------
 * Reference grounding
 * ------------------------------------------------------------ */

export type ResolvedInterpretation =
  | { kind: "resolved"; interpretation: Interpretation }
  | { kind: "clarify"; reason: ClarificationReason };

/** Parse a user-stated amount span with trusted money logic. */
export function parseUserAmountSpan(span: string | null): number | null {
  if (!span || span.length === 0) return null;
  return extractHypotheticalAmount(span);
}

/**
 * Ground an interpretation against owned frames. A `conversation_reference`
 * period is only legal for an expense breakdown and is resolved with the exact
 * same precedence + §22 duplicate-period rule as the deterministic path.
 */
export function resolveInterpretationContext(
  interpretation: Interpretation,
  question: string,
  frames: FinancialContextFrame[],
  now: Date,
): ResolvedInterpretation {
  if (interpretation.disposition !== "query") {
    return { kind: "resolved", interpretation };
  }
  const query = interpretation;

  if (query.period.kind !== "conversation_reference") {
    // Explicit period: the compiler parses `userAmountSpan` with trusted money
    // logic when relevant. No reference grounding required.
    return { kind: "resolved", interpretation: query };
  }

  // A conversation_reference period is only an expense breakdown; the service
  // layer re-uses the deterministic anchor ranking for it.
  if (query.intent !== "expense_breakdown") {
    return { kind: "clarify", reason: "needs_subject" };
  }

  const fragment: FollowUpAnalysis = {
    kind: "expenseBreakdown",
    amount: parseUserAmountSpan(query.userAmountSpan),
    referential: true,
  };
  const resolution = resolveAgainstFrames(question, fragment, frames, now);

  if (resolution.kind === "ambiguousAmount") {
    return { kind: "clarify", reason: "ambiguous_amount" };
  }
  if (resolution.kind === "resolved") {
    const { period } = resolution.query;
    const concretePeriod = periodToSemantic(period);
    if (!concretePeriod) return { kind: "clarify", reason: "needs_subject" };
    return {
      kind: "resolved",
      interpretation: {
        ...query,
        period: concretePeriod,
        userAmountSpan: null,
        reference: "none",
      },
    };
  }
  return { kind: "clarify", reason: "needs_subject" };
}

/** AssistantQuery period -> SemanticPeriod (only concrete kinds). */
export function periodToSemantic(period: AssistantQuery["period"]): SemanticPeriod | null {
  return periodToSemanticKind(period);
}

/* ------------------------------------------------------------
 * V2 structured frame derivation (Stage 2 write path)
 * ------------------------------------------------------------ */

/**
 * Derive a V2 structured frame (§6) from an OWNED exchange's deterministic
 * re-reading plus the verified fact manifest. `moneyFactId` is the manifest
 * fact carrying the anchorable expense total (null when none).
 */
export function deriveContextFrameV2(input: {
  turnOrdinal: number;
  frame: FinancialContextFrame;
  facts: FinancialFact[];
  moneyFactId: string | null;
}): ContextFrameV2 {
  const { turnOrdinal, frame, facts, moneyFactId } = input;
  const intentRaw = frame.query ? intentToSemanticKind(frame.query.intent) : null;
  const intent =
    intentRaw !== null && semanticIntentSchema.safeParse(intentRaw).success
      ? (intentRaw as SemanticIntent)
      : null;
  const period = frame.period ? periodToSemanticKind(frame.period) : null;
  const category = frame.reported.categoryName ?? frame.query?.category ?? null;

  const anchors: ContextFrameV2["anchors"] = [];
  if (moneyFactId && frame.reported.total !== null) {
    anchors.push({
      id: "last_expense_total",
      kind: "expense_total",
      factId: moneyFactId,
    });
  }
  if (category && facts.length > 0) {
    const categoryFact = facts.find((f) => f.kind === "category");
    if (categoryFact) {
      anchors.push({ id: "last_category", kind: "category", factId: categoryFact.id });
    }
  }
  if (period && facts.length > 0) {
    const periodFact = facts.find((f) => f.kind === "period");
    if (periodFact) {
      anchors.push({ id: "period", kind: "period", factId: periodFact.id });
    }
  }
  if (frame.clarificationReason) {
    anchors.push({ id: "clarification", kind: "clarification", factId: "F1" });
  }

  return {
    schemaVersion: 2,
    turnOrdinal,
    answerKind:
      frame.classification === "unsupported"
        ? "unsupported"
        : frame.classification === "clarification"
          ? "clarification"
          : frame.answer === null
            ? "insufficient"
            : "answer",
    intent,
    period,
    category,
    anchors: anchors.slice(0, 8),
    pendingClarification: frame.clarificationReason,
  };
}