// ============================================================
// LedgerAI — Deterministic Insight Engine (Phase 8A)
// ------------------------------------------------------------
// ALL insight math and thresholds live here in ordinary application
// code. The AI layer NEVER computes figures — it only receives these
// derived, verified metrics and narrates them using templates.
//
// The engine takes pre-aggregated inputs (the service layer does the
// database grouping; see src/lib/services/insights.ts) and emits a
// bounded set of human-readable insights: an explanation backed by the
// real numbers in `metadata`, never invented.
// ============================================================

import { percentChange, round, type PeriodSummary } from "./engine";

export type InsightKind =
  | "key"
  | "spending"
  | "revenue"
  | "profitability"
  | "anomaly"
  | "recommendation";

export const INSIGHT_KINDS: readonly InsightKind[] = [
  "key",
  "spending",
  "revenue",
  "profitability",
  "anomaly",
  "recommendation",
];

/** One category's current-period + prior-period expense totals. */
export interface CategorySpend {
  categoryId: string | null;
  categoryName: string;
  /** Current period total in major units (already rounded by the engine). */
  amount: number;
  /** Prior period total in major units. */
  priorAmount: number;
  /** Number of transactions in the current period for this category. */
  transactions: number;
}

/** Metrics the insight engine derives from. All aggregation is done first. */
export interface InsightsInput {
  summary: PeriodSummary;
  priorSummary: PeriodSummary;
  /** Current-period top expense categories, each with its prior-period total. */
  topCategories: CategorySpend[];
  /** Current-period top income categories, each with its prior-period total. */
  topIncome: CategorySpend[];
  /** Largest single current-period expense (for the anomaly signal). */
  largestExpense: { categoryName: string | null; amount: number } | null;
}

/** A single derived insight — the UI renders these cards. */
export interface DerivedInsight {
  kind: InsightKind;
  title: string;
  description: string;
  /** Backing numbers so the caller can show a data table/citations. */
  metadata: Record<string, unknown>;
}

/** Minimum prior-period spend for a category delta to be reported (₦). */
const MIN_DELTA_AMOUNT = 5000;
/** Minimum percent change for a category delta to be noteworthy. */
const MIN_DELTA_PERCENT = 15;

/** A single expense that consumes at least this share of total expenses. */
const ANOMALY_SHARE = 0.3;
/** Minimum share of total expenses for a category to count as "top". */
const TOP_CATEGORY_SHARE = 0.2;

/**
 * Derive a bounded, deterministic set of insights from verified metrics.
 *
 * Every number in `description`/`metadata` comes from the input metrics;
 * nothing is guessed. Thresholds are explicit constants so behavior is
 * predictable and covered by tests.
 */
export function deriveInsights(input: InsightsInput): DerivedInsight[] {
  const insights: DerivedInsight[] = [];

  const current = input.summary;
  const prior = input.priorSummary;

  /* ---- key: the highest-value single observation ---- */
  const key = deriveKeyInsight(input);
  if (key) insights.push(key);

  /* ---- spending: most notable category movement ---- */
  const spending = deriveSpendingInsight(input);
  if (spending) insights.push(spending);

  /* ---- revenue: how income moved vs the prior period ---- */
  const revenue = deriveRevenueInsight(current.revenue, prior.revenue);
  if (revenue) insights.push(revenue);

  /* ---- profitability: margin callout ---- */
  const profitability = deriveProfitabilityInsight(current, prior);
  if (profitability) insights.push(profitability);

  /* ---- anomaly: a single expense dominating the period ---- */
  const anomaly = deriveAnomalyInsight(input);
  if (anomaly) insights.push(anomaly);

  /* ---- recommendation: an actionable next step ---- */
  const recommendation = deriveRecommendation(input);
  if (recommendation) insights.push(recommendation);

  return insights;
}

/* ------------------------------------------------------------
 * key
 * ------------------------------------------------------------ */

function deriveKeyInsight(input: InsightsInput): DerivedInsight | null {
  const { summary, priorSummary } = input;
  const margin = summary.profitMargin;
  if (margin !== null && margin < 0) {
    return {
      kind: "key",
      title: "This period ran at a loss",
      description: `Expenses (${formatMajor(summary.expenses)}) exceeded revenue (${formatMajor(summary.revenue)}), leaving a net loss of ${formatMajor(summary.netProfit)}.`,
      metadata: {
        revenue: summary.revenue,
        expenses: summary.expenses,
        netProfit: summary.netProfit,
        profitMargin: margin,
      },
    };
  }

  const top = input.topCategories[0];
  if (top && summary.expenses > 0) {
    const share = (top.amount / summary.expenses) * 100;
    return {
      kind: "key",
      title: `${cap(top.categoryName)} was your top expense`,
      description: `Spending on ${lower(top.categoryName)} (${formatMajor(top.amount)}) made up ${formatPercent(share)} of all expenses this period.`,
      metadata: {
        categoryName: top.categoryName,
        amount: top.amount,
        shareOfExpenses: round(share, 1),
      },
    };
  }

  const marginNote =
    margin !== null
      ? `a ${formatPercent(margin)} net margin`
      : "no income this period";
  const revDelta = percentChange(summary.revenue, priorSummary.revenue);
  return {
    kind: "key",
    title: "Period snapshot",
    description: `Revenue ${formatMajor(summary.revenue)} against expenses ${formatMajor(summary.expenses)} — ${marginNote}${revDelta !== null ? ` (${formatSignedPercent(revDelta)} vs prior period)` : ""}.`,
    metadata: {
      revenue: summary.revenue,
      expenses: summary.expenses,
      netProfit: summary.netProfit,
      profitMargin: margin,
    },
  };
}

/* ------------------------------------------------------------
 * spending
 * ------------------------------------------------------------ */

function deriveSpendingInsight(input: InsightsInput): DerivedInsight | null {
  let best: CategorySpend | null = null;
  for (const cat of input.topCategories) {
    const delta = percentChange(cat.amount, cat.priorAmount);
    if (delta === null) continue;
    // Report meaningful single-category moves (up or down).
    if (Math.abs(delta) < MIN_DELTA_PERCENT) continue;
    if (Math.abs(cat.amount - cat.priorAmount) < MIN_DELTA_AMOUNT) continue;
    if (!best || Math.abs(delta) > Math.abs(percentChange(best.amount, best.priorAmount) ?? 0)) {
      best = cat;
    }
  }

  if (!best) return null;
  const delta = percentChange(best.amount, best.priorAmount)!;
  const up = delta > 0;
  return {
    kind: "spending",
    title: `${cap(best.categoryName)} ${up ? "increased" : "decreased"} ${formatPercent(Math.abs(delta))}`,
    description: `Spending on ${lower(best.categoryName)} moved from ${formatMajor(best.priorAmount)} to ${formatMajor(best.amount)} (${formatPercent(delta)}) between the two periods${best.transactions > 0 ? ` across ${best.transactions} transaction${best.transactions === 1 ? "" : "s"}` : ""}.`,
    metadata: {
      categoryName: best.categoryName,
      priorAmount: best.priorAmount,
      amount: best.amount,
      percentChange: round(delta, 1),
      transactions: best.transactions,
    },
  };
}

/* ------------------------------------------------------------
 * revenue
 * ------------------------------------------------------------ */

function deriveRevenueInsight(currentRevenue: number, priorRevenue: number): DerivedInsight | null {
  const delta = percentChange(currentRevenue, priorRevenue);
  if (delta === null) return null;
  const up = delta > 0;
  return {
    kind: "revenue",
    title: `Revenue ${up ? "grew" : "fell"} ${formatPercent(Math.abs(delta))}`,
    description: `Income moved from ${formatMajor(priorRevenue)} to ${formatMajor(currentRevenue)} (${formatSignedPercent(delta)}) compared with the prior period.`,
    metadata: {
      priorRevenue,
      revenue: currentRevenue,
      percentChange: round(delta, 1),
    },
  };
}

/* ------------------------------------------------------------
 * profitability
 * ------------------------------------------------------------ */

function deriveProfitabilityInsight(
  current: PeriodSummary,
  prior: PeriodSummary,
): DerivedInsight | null {
  if (current.profitMargin === null) return null;
  const priorDelta =
    prior.profitMargin === null
      ? null
      : percentChange(current.profitMargin, prior.profitMargin);
  const meta: Record<string, unknown> = {
    netProfit: current.netProfit,
    profitMargin: current.profitMargin,
    priorProfitMargin: prior.profitMargin,
  };
  if (priorDelta !== null) meta.marginChange = round(priorDelta, 1);

  if (current.profitMargin >= 40) {
    return {
      kind: "profitability",
      title: `Healthy ${formatPercent(current.profitMargin)} net margin`,
      description: `You kept ${formatPercent(current.profitMargin)} of every naira of revenue as profit (${formatMajor(current.netProfit)} net).${priorDelta !== null ? ` Margin ${priorDelta >= 0 ? "improved" : "eroded"} ${formatPercent(Math.abs(priorDelta))} vs the prior period.` : ""}`,
      metadata: meta,
    };
  }
  if (current.profitMargin < 10) {
    return {
      kind: "profitability",
      title: `Thin ${formatPercent(current.profitMargin)} net margin`,
      description: `Only ${formatPercent(current.profitMargin)} of revenue became profit (${formatMajor(current.netProfit)} net) after expenses of ${formatMajor(current.expenses)}.${priorDelta !== null ? ` That is ${priorDelta >= 0 ? "an improvement" : "a decline"} of ${formatPercent(Math.abs(priorDelta))} vs the prior period.` : ""}`,
      metadata: meta,
    };
  }
  return null;
}

/* ------------------------------------------------------------
 * anomaly
 * ------------------------------------------------------------ */

function deriveAnomalyInsight(input: InsightsInput): DerivedInsight | null {
  const { summary, largestExpense, topCategories } = input;
  if (!largestExpense || largestExpense.amount <= 0 || summary.expenses <= 0) return null;
  const share = (largestExpense.amount / summary.expenses) * 100;
  if (share < ANOMALY_SHARE * 100) return null;

  // Only report it as an anomaly when it dominates the category too.
  const cat = topCategories.find((c) => c.categoryName === largestExpense.categoryName);
  const catShare = cat && cat.amount > 0 ? (largestExpense.amount / cat.amount) * 100 : 100;

  return {
    kind: "anomaly",
    title: `A single expense stood out`,
    description: `${formatMajor(largestExpense.amount)} (${formatPercent(share)} of all expenses)${largestExpense.categoryName ? ` in ${lower(largestExpense.categoryName)}` : ""} dominated the period.${catShare >= 50 ? ` It accounts for ${formatPercent(catShare)} of that category's total spending.` : ""}`,
    metadata: {
      categoryName: largestExpense.categoryName,
      amount: largestExpense.amount,
      shareOfExpenses: round(share, 1),
      shareOfCategory: round(catShare, 1),
    },
  };
}

/* ------------------------------------------------------------
 * recommendation
 * ------------------------------------------------------------ */

function deriveRecommendation(input: InsightsInput): DerivedInsight | null {
  const { summary, topCategories } = input;
  if (summary.expenses > 0 && topCategories.length > 0) {
    const top = topCategories[0];
    const share = (top.amount / summary.expenses) * 100;
    if (share >= TOP_CATEGORY_SHARE * 100) {
      return {
        kind: "recommendation",
        title: `Review ${lower(top.categoryName)} spend`,
        description: `${cap(top.categoryName)} (${formatMajor(top.amount)}) is your largest category at ${formatPercent(share)} of expenses. Review recent ${lower(top.categoryName)} transactions to confirm the spend is still necessary.`,
        metadata: {
          categoryName: top.categoryName,
          amount: top.amount,
          shareOfExpenses: round(share, 1),
        },
      };
    }
  }

  const margin = summary.profitMargin;
  if (margin !== null && margin < 10) {
    return {
      kind: "recommendation",
      title: "Consider boosting revenue or trimming fixed costs",
      description: `A ${formatPercent(margin)} net margin leaves little room for unexpected costs. Growing income or reducing a fixed expense (like rent or salaries) would widen the buffer.`,
      metadata: { profitMargin: margin },
    };
  }

  return null;
}

/* ------------------------------------------------------------
 * shared formatting helpers
 * ------------------------------------------------------------ */

/** "SALES" -> "Sales"; "MTN DATA" -> "Mtn data" (title-cased first word). */
function cap(value: string | null): string {
  if (!value) return "Uncategorized";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function lower(value: string | null): string {
  return value ? value.toLowerCase() : "uncategorized";
}

function formatMajor(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(round(value, 0));
}

function formatPercent(value: number | null): string {
  if (value === null) return "0%";
  return `${round(value, 0).toLocaleString("en-NG")}%`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return "0%";
  const rounded = round(Math.abs(value), 0);
  return `${value > 0 ? "+" : "-"}${rounded.toLocaleString("en-NG")}%`;
}