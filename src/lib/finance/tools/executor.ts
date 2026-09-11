// ============================================================
// LedgerAI — finance tool registry + execution (Stage 2)
// ------------------------------------------------------------
// The executor is the ONLY place in the /ask pipeline that touches the
// DB beyond response persistence. It runs a compiled plan's tool keys,
// validates every derived result against its Zod contract, and assembles
// AssistantMetrics -> answerFromMetrics (the existing deterministic
// narration). computeMetricsFor is a faithful port of the original
// service's collectMetrics so offline parity is structural, not
// aspirational.
// ============================================================

import {
  internalToolKeySchema,
  type ExecutionPlan,
  type InternalToolKey,
  type TrustedExecutionContext,
} from "@/lib/ask/contracts";
import { extractionSchemas, type VerifiedToolResult } from "./result-schemas";
import {
  answerFromMetrics,
  resolvePeriod,
  type AssistantAnswer,
  type AssistantCategorySpend,
  type AssistantMetrics,
  type AssistantQuery,
  type ClarificationReason,
  type ResolvedPeriod,
} from "@/lib/finance/assistant";
import { distribution } from "@/lib/finance/analysis";
import { percentChange, round, type PeriodSummary } from "@/lib/finance/engine";
import { shiftRangeBack } from "@/lib/finance/context-frame";
import {
  asOfBalance,
  buildWhere,
  categorySpends,
  countGroups,
  summarizeGroups,
  type TypeGroup,
} from "./query-helpers";
import type { PrismaClient } from "@/generated/prisma/client";

/** Context the executor needs; businessId scoping is caller-guaranteed. */
export interface FinanceToolContext extends TrustedExecutionContext {
  readonly prisma: PrismaClient;
}

export type ToolResultRecord = Partial<
  Record<InternalToolKey, VerifiedToolResult>
>;

/**
 * Aggregate exactly the figures a parsed intent needs — a structural copy of
 * the deterministic service path (see services/assistant.ts history). Balance
 * is a point-in-time cumulative snapshot (everything up to the end of the
 * window); prior-window figures only exist for bounded, non-open periods.
 */
export async function computeMetricsFor(
  prisma: PrismaClient,
  businessId: string,
  query: AssistantQuery,
  now: Date,
): Promise<AssistantMetrics> {
  const period = resolvePeriod(query.period, now);
  const bounded = Boolean(period.from && period.to);
  const prior = bounded ? shiftRangeBack(period.from!, period.to!) : null;

  const balance =
    query.intent === "balance"
      ? await asOfBalance(prisma, businessId, period, now)
      : null;

  const currentWhere = buildWhere(businessId, period.from, period.to);
  const priorWhere = prior ? buildWhere(businessId, prior[0], prior[1]) : null;

  const currentGroups = await prisma.transaction.groupBy({
    by: ["type"],
    where: currentWhere,
    _sum: { amount: true },
    _count: true,
  });

  const priorGroups = priorWhere
    ? await prisma.transaction.groupBy({
        by: ["type"],
        where: priorWhere,
        _sum: { amount: true },
        _count: true,
      })
    : [];

  let categoryTotals: AssistantCategorySpend[] = [];
  if (
    query.intent === "categorySpend" ||
    query.intent === "topCategory" ||
    query.intent === "lowestCategory" ||
    query.intent === "expenseImpact" ||
    query.intent === "spendingDistribution" ||
    query.intent === "expenseBreakdown"
  ) {
    categoryTotals = await categorySpends(prisma, businessId, currentWhere, priorWhere);
  }

  return citeMetrics(period, currentGroups, priorGroups, categoryTotals, balance);
}

function citeMetrics(
  period: ResolvedPeriod,
  currentGroups: TypeGroup[],
  priorGroups: TypeGroup[],
  categoryTotals: AssistantCategorySpend[],
  balance: number | null,
): AssistantMetrics {
  return {
    summary: summarizeGroups(currentGroups),
    priorSummary: priorGroups.length > 0 ? summarizeGroups(priorGroups) : null,
    categoryTotals,
    balance,
    count: countGroups(currentGroups),
  };
}

/* ------------------------------------------------------------
 * Tools: verified derivations of the trusted computation
 * ------------------------------------------------------------ */

type DerivativeInput = {
  metrics: AssistantMetrics;
  query: AssistantQuery;
};

function toolMeta(ctx: FinanceToolContext, query: AssistantQuery) {
  const period = resolvePeriod(query.period, ctx.now);
  return {
    source: "deterministic_finance_engine" as const,
    currency: ctx.currency,
    period: { from: period.from, to: period.to, label: period.label },
  };
}

function summaryResult(input: DerivativeInput, ctx: FinanceToolContext) {
  const s = input.metrics.summary;
  return extractionSchemas.summary.parse({
    meta: toolMeta(ctx, input.query),
    income: s.revenue,
    expenses: s.expenses,
    netProfit: s.netProfit,
    counts: input.metrics.count,
  });
}

function balanceResult(input: DerivativeInput, ctx: FinanceToolContext) {
  return extractionSchemas.balance.parse({
    meta: toolMeta(ctx, input.query),
    balance: round(input.metrics.balance ?? 0, 0),
  });
}

function categoryListResult(input: DerivativeInput, ctx: FinanceToolContext) {
  return extractionSchemas.categoryList.parse({
    meta: toolMeta(ctx, input.query),
    categories: input.metrics.categoryTotals.map((c) => ({
      categoryName: c.categoryName,
      amount: round(c.amount, 2),
      priorAmount: round(c.priorAmount, 2),
    })),
  });
}

function extremityResult(input: DerivativeInput, ctx: FinanceToolContext) {
  const active = input.metrics.categoryTotals.filter((c) => c.amount > 0);
  const found = input.query.intent === "lowestCategory" ? leastActive(active) : active[0];
  if (!found) {
    return extractionSchemas.categoryList.parse({
      meta: toolMeta(ctx, input.query),
      categories: [],
    });
  }
  const share =
    input.metrics.summary.expenses > 0
      ? round((found.amount / input.metrics.summary.expenses) * 100, 1)
      : 0;
  return extractionSchemas.extremity.parse({
    meta: toolMeta(ctx, input.query),
    categoryName: found.categoryName,
    amount: round(found.amount, 2),
    shareOfExpenses: share,
  });
}

/** Deterministic lowest-spend pick (ties resolve alphabetically). */
function leastActive(active: AssistantCategorySpend[]): AssistantCategorySpend | null {
  if (active.length === 0) return null;
  const min = Math.min(...active.map((c) => c.amount));
  return active
    .filter((c) => c.amount === min)
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName))[0];
}

function distributionResult(input: DerivativeInput, ctx: FinanceToolContext) {
  const active = input.metrics.categoryTotals.filter((c) => c.amount > 0);
  if (active.length === 0) {
    return extractionSchemas.distribution.parse({
      meta: toolMeta(ctx, input.query),
      total: 0,
      breakdown: [],
    });
  }
  const total =
    input.metrics.summary.expenses > 0
      ? round(input.metrics.summary.expenses, 2)
      : round(active.reduce((sum, c) => sum + c.amount, 0), 2);
  const breakdown = distribution(active, total).map((c) => ({
    categoryName: c.categoryName,
    amount: c.amount,
    share: c.share,
  }));
  return extractionSchemas.distribution.parse({
    meta: toolMeta(ctx, input.query),
    total,
    breakdown,
  });
}

type ComparisonTarget = "income" | "expenses" | "profit" | "balance";

function pickValue(target: ComparisonTarget, summary: PeriodSummary): number | null {
  switch (target) {
    case "income":
      return summary.revenue;
    case "expenses":
      return summary.expenses;
    case "profit":
      return summary.netProfit;
    case "balance":
      return summary.netProfit;
  }
}

function periodCompareResult(input: DerivativeInput, ctx: FinanceToolContext) {
  const { metrics, query } = input;
  if (query.intent !== "periodComparison") {
    return extractionSchemas.comparison.parse({
      meta: toolMeta(ctx, input.query),
      target: null,
      current: 0,
      prior: 0,
      deltaAmount: 0,
      deltaPercent: null,
    });
  }
  const prior = metrics.priorSummary;
  const target = (query.target ?? null) as ComparisonTarget | null;

  let current: number | null;
  let priorValue: number | null;
  if (target === null) {
    current = metrics.summary.revenue;
    priorValue = prior?.revenue ?? null;
  } else {
    current = pickValue(target, metrics.summary);
    priorValue = prior ? pickValue(target, prior) : null;
  }
  if (current === null || priorValue === null) {
    return extractionSchemas.comparison.parse({
      meta: toolMeta(ctx, input.query),
      target,
      current: 0,
      prior: 0,
      deltaAmount: 0,
      deltaPercent: null,
    });
  }
  const currentR = round(current, 2);
  const priorR = round(priorValue, 2);
  return extractionSchemas.comparison.parse({
    meta: toolMeta(ctx, input.query),
    target,
    current: currentR,
    prior: priorR,
    deltaAmount: round(currentR - priorR, 2),
    deltaPercent: percentChange(currentR, priorR),
  });
}

function expenseImpactResult(input: DerivativeInput, ctx: FinanceToolContext) {
  const { metrics, query } = input;
  if (query.intent !== "expenseImpact") {
    return extractionSchemas.impact.parse({
      meta: toolMeta(ctx, input.query),
      revenue: metrics.summary.revenue,
      expenses: metrics.summary.expenses,
      netProfit: metrics.summary.netProfit,
      scenario: {
        effectGoal: "profit",
        operation: "decrease",
        hypotheticalAmount: null,
        shifted: null,
      },
    });
  }
  const goal = query.effectGoal ?? "profit";
  const operation = query.operation ?? "decrease";
  const amount = query.hypotheticalAmount ?? null;
  const { revenue, expenses, netProfit } = metrics.summary;

  let shifted: number | null = null;
  if (amount !== null) {
    shifted =
      goal === "expenses"
        ? round(operation === "decrease" ? expenses - amount : expenses + amount, 2)
        : round(netProfit + (operation === "increase" ? amount : -amount), 2);
  }

  return extractionSchemas.impact.parse({
    meta: toolMeta(ctx, input.query),
    revenue,
    expenses,
    netProfit,
    scenario: {
      effectGoal: goal,
      operation,
      hypotheticalAmount: amount,
      shifted,
    },
  });
}

function transactionCountResult(input: DerivativeInput, ctx: FinanceToolContext) {
  return extractionSchemas.count.parse({
    meta: toolMeta(ctx, input.query),
    counts: input.metrics.count,
  });
}

/** Registry: every allowlisted key maps to a pure verified derivation. */
const TOOL_EXECUTORS: Record<
  InternalToolKey,
  (input: DerivativeInput, ctx: FinanceToolContext) => VerifiedToolResult
> = {
  "summary.get": (input, ctx) => summaryResult(input, ctx),
  "balance.get": (input, ctx) => balanceResult(input, ctx),
  "categories.listSpending": (input, ctx) => categoryListResult(input, ctx),
  "categories.extremity": (input, ctx) => extremityResult(input, ctx),
  "categories.distribution": (input, ctx) => distributionResult(input, ctx),
  "period.compare": (input, ctx) => periodCompareResult(input, ctx),
  "expense.impact": (input, ctx) => expenseImpactResult(input, ctx),
  "transactions.count": (input, ctx) => transactionCountResult(input, ctx),
};

export type PlanOutcome =
  | {
      kind: "answer";
      query: AssistantQuery;
      answer: AssistantAnswer;
      metrics: AssistantMetrics;
      toolResults: ToolResultRecord;
    }
  | { kind: "clarification"; reason: ClarificationReason }
  | { kind: "unsupported" };

/**
 * Execute a compiled plan without touching any LLM. Deterministic phrasing is
 * the default render; the narration seam (if enabled) runs over the verified
 * draft only in the service layer.
 */
export async function executePlan(
  ctx: FinanceToolContext,
  plan: ExecutionPlan,
): Promise<PlanOutcome> {
  if (plan.kind !== "answer") {
    return plan.kind === "clarification"
      ? { kind: "clarification", reason: plan.reason }
      : { kind: "unsupported" };
  }

  const metrics = await computeMetricsFor(ctx.prisma, ctx.businessId, plan.query, ctx.now);
  const input: DerivativeInput = { metrics, query: plan.query };

  const toolResults: ToolResultRecord = {};
  for (const key of plan.toolKeys.slice(0, 3)) {
    if (!internalToolKeySchema.safeParse(key).success) continue;
    const executing = TOOL_EXECUTORS[key];
    if (!executing) continue;
    toolResults[key] = executing(input, ctx);
  }

  const answer = answerFromMetrics(plan.query, metrics, ctx.currency, ctx.now);
  return { kind: "answer", query: plan.query, answer, metrics, toolResults };
}