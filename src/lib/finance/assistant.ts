// ============================================================
// LedgerAI — Semantic Q&A Engine (Ask LedgerAI)
// ------------------------------------------------------------
// Pipeline: natural language -> semantic understanding
// (ask/understanding.ts) -> validated SemanticQuestion
// (ask/semantics.ts) -> trusted engine query (queryFromSemantic)
// -> verified metrics (service layer) -> narration (answerFromMetrics).
//
// The AI has ONE job: understand meaning. Every figure comes from
// the finance engine; nothing here invents numbers, guesses, or
// fabricates data. When the data cannot answer accurately we say so
// plainly instead of guessing (blueprint §15).
// ============================================================

import { percentChange, round, type PeriodSummary } from "./engine";
import {
  comparisonDelta,
  distribution,
  topContributors,
} from "./analysis";
import {
  prepareQuestion,
  understand,
  type FollowUpAnalysis,
  analyzeFollowUp,
} from "@/lib/ask/understanding";
import type {
  SemanticPeriod,
  SemanticQuestion,
} from "@/lib/ask/semantics";

export type AssistantIntent =
  | "balance"
  | "income"
  | "expenses"
  | "profit"
  | "profitMargin"
  | "transactionCount"
  | "topCategory"
  | "lowestCategory"
  | "categorySpend"
  | "expenseImpact"
  | "spendingDistribution"
  | "expenseBreakdown"
  | "incomeVsExpenses"
  | "periodComparison";

export type ComparisonTarget = "income" | "expenses" | "profit" | "balance";

/** Resolved question before any data is touched (still period-agnostic). */
export interface AssistantQuery {
  intent: AssistantIntent;
  /** Canonical category name when the intent scopes to one category. */
  category: string | null;
  /** Which metric a period comparison reports (null = everything). */
  target?: ComparisonTarget | null;
  /** Explicit baseline window for a two-window comparison, when named. */
  comparisonPeriod?: AssistantQuery["period"];
  period:
    | { kind: "thisMonth" | "lastMonth" | "thisYear" | "allTime" }
    | { kind: "month"; month: number; year: number }
    | { kind: "lastYear" }
    | { kind: "recent"; days: number }
    | { kind: "custom"; from: string; to: string; label: string };
  /** Question framing: hypothetical/comparison vs plain factual (absent). */
  mode?: "factual" | "comparison" | "hypothetical";
  /** Which metric a posited spending change is expected to move. */
  effectGoal?: ComparisonTarget;
  /** Direction of the posited spending change ("spent less" = decrease). */
  operation?: "increase" | "decrease";
  /** A user-stated amount for the change (never invented by the system). */
  hypotheticalAmount?: number;
  /**
   * The amount an expense breakdown asks about. `previous_answer` means the
   * figure was read from our own deterministic narration (never user text or
   * AI output); the narration only ever brackets a computed total against it.
   */
  amountReference?: { value: number; source: "user_stated" | "previous_answer" };
}

/** The period a query implies, resolved against a real clock. */
export interface ResolvedPeriod {
  /** Human label like "May 2026" or "all time". */
  label: string;
  /** Inclusive bounds (YYYY-MM-DD); null means open-ended. */
  from: string | null;
  to: string | null;
}

/** One current-period expense category total (mirrors CategorySpend). */
export interface AssistantCategorySpend {
  categoryName: string;
  amount: number;
  priorAmount: number;
}

/** Pre-aggregated, verified metrics the engine answers from. */
export interface AssistantMetrics {
  summary: PeriodSummary;
  priorSummary: PeriodSummary | null;
  /** Current-period expense categories (only used by category intents). */
  categoryTotals: AssistantCategorySpend[];
  /** As-of cumulative net cash position (balance intent). */
  balance: number | null;
  /** Per-type transaction counts in the period (count intent). */
  count: { income: number; expenses: number; transfers: number } | null;
}

export interface AssistantAnswer {
  kind: "answer" | "insufficient";
  text: string;
  /** Cited numbers so the UI can show sourcing without hardcoding text. */
  data: Record<string, unknown>;
}

export const INSUFFICIENT_ANSWER =
  "I don't have enough data to answer that accurately.";
/** Shown when the question isn't a supported finance question. */
export const UNSUPPORTED_ANSWER =
  "I’m focused on your business finances, so I can’t help with that. I can analyze your income, expenses, profit, balance, transactions, and spending by category.";
/** Shown when the question is financial but too vague to answer without guidance. */
export const CLARIFICATION_ANSWER =
  "Could you clarify what you'd like to know — your revenue, expenses, profit, or balance?";
/**
 * Shown when the question is about "savings". "Save" is ambiguous without
 * context (spend-reduction vs money-left-after-expenses), so we ask which
 * meaning the user intended instead of inventing one.
 */
export const SAVINGS_CLARIFICATION_ANSWER =
  "Do you mean how much you spent less than the previous period, or how much money you had left after expenses?";

export const AMOUNT_CLARIFICATION_ANSWER =
  "Which of those figures should we use for the breakdown?";

export type ClarificationReason =
  | "ambiguous_financial_metric"
  | "ambiguous_savings"
  | "needs_subject"
  | "ambiguous_amount";

/** The professional clarification wording for a given ambiguity reason. */
export function clarificationText(reason: ClarificationReason): string {
  if (reason === "ambiguous_savings") return SAVINGS_CLARIFICATION_ANSWER;
  if (reason === "ambiguous_amount") return AMOUNT_CLARIFICATION_ANSWER;
  return CLARIFICATION_ANSWER;
}

/**
 * What a question means before any data is touched. Data-answerable questions
 * carry a full AssistantQuery; the rest are explicit, deterministic kinds so
 * callers never have to fold "too vague" or "out of scope" into an error.
 */
export type QuestionClassification =
  | { kind: "query"; query: AssistantQuery }
  | { kind: "clarification"; reason: ClarificationReason }
  | { kind: "unsupported" };

/* ------------------------------------------------------------
 * Semantic model <-> engine query mapping
 * ------------------------------------------------------------ */

/** Map a validated semantic period onto the engine's period union. */
export function toAssistantPeriod(
  period: SemanticPeriod,
): AssistantQuery["period"] | null {
  switch (period.kind) {
    case "this_month":
      return { kind: "thisMonth" };
    case "last_month":
      return { kind: "lastMonth" };
    case "this_year":
      return { kind: "thisYear" };
    case "last_year":
      return { kind: "lastYear" };
    case "all_time":
      return { kind: "allTime" };
    case "month":
      return { kind: "month", month: period.month, year: period.year };
    case "recent":
      return { kind: "recent", days: period.days };
    case "conversation_reference":
      // No engine period: this is resolved against owned conversation context
      // by the service layer — never an engine-readable window on its own.
      return null;
  }
}

/**
 * Turn already-validated structured understanding into a concrete engine query.
 * Returns null for anything that is not a trustworthy data question (including
 * a category_spend that forgot its entity). Authoritative, tenant-agnostic:
 * the caller still scopes all data access.
 */
export function queryFromSemantic(
  semantic: SemanticQuestion,
): AssistantQuery | null {
  if (semantic.classification !== "query") return null;
  const period = toAssistantPeriod(semantic.period);
  if (!period) return null;

  switch (semantic.intent) {
    case "balance":
      return { intent: "balance", category: null, period };
    case "income":
      return { intent: "income", category: null, period };
    case "expenses":
      return { intent: "expenses", category: null, period };
    case "profit":
      return { intent: "profit", category: null, period };
    case "profit_margin":
      return { intent: "profitMargin", category: null, period };
    case "transaction_count":
      return { intent: "transactionCount", category: null, period };
    case "top_category":
      return { intent: "topCategory", category: null, period };
    case "lowest_category":
      return { intent: "lowestCategory", category: null, period };
    case "category_spend":
      if (!semantic.entity) return null;
      return { intent: "categorySpend", category: semantic.entity, period };
    case "expense_impact":
      return {
        intent: "expenseImpact",
        category: semantic.entity ?? null,
        period,
        mode: semantic.mode ?? undefined,
        effectGoal: semantic.effectGoal ?? undefined,
        operation: semantic.operation ?? undefined,
        hypotheticalAmount: semantic.hypotheticalAmount ?? undefined,
      };
    case "spending_distribution":
      return { intent: "spendingDistribution", category: semantic.entity ?? null, period };
    case "expense_breakdown":
      return {
        intent: "expenseBreakdown",
        category: semantic.entity ?? null,
        period,
        amountReference: (semantic as { amountReference?: AssistantQuery["amountReference"] }).amountReference,
      };
    case "income_vs_expenses":
      return { intent: "incomeVsExpenses", category: null, period };
    case "period_comparison":
      {
        const comparisonPeriod = semantic.comparisonPeriod
          ? toAssistantPeriod(semantic.comparisonPeriod)
          : null;
      return {
        intent: "periodComparison",
        category: semantic.entity ?? null,
        target: semantic.target ?? null,
        period,
        ...(comparisonPeriod ? { comparisonPeriod } : {}),
      };
      }
  }
}

/**
 * Parse a natural-language question into a structured query through the
 * semantic understanding layer. Returns null when the question is not a
 * data-answerable finance question. Defaults: most intents mean
 * "this month"; the balance is a cumulative "as of now" figure.
 */
export function parseAssistantQuestion(
  question: string,
  now: Date = new Date(),
): AssistantQuery | null {
  const semantic = understand(question, now);
  return queryFromSemantic(semantic);
}

/** Phrases that ask about financial performance/figures without naming one. */
const VAGUE_FINANCIAL_QUESTIONS = [
  "how did i do", "how did we do", "how did we perform", "how am i doing",
  "how are we doing", "how have i been doing", "how much was it",
  "how much is it", "what happened", "what is happening", "whats happening",
  "how are things", "how is business", "hows business", "how is it going",
  "hows it going", "how is the business doing", "how is my business doing",
  "am i doing well", "am i making money", "performance", "give me a summary",
  "give me an overview", "summary of my finances", "overview of my finances",
  "tell me about my business", "how did things go", "what are my numbers",
  "what do my numbers say",
];

/**
 * Full deterministic classification: data query, clarification, or
 * unsupported. Data-answerable questions come from semantic understanding;
 * the vague-finance and out-of-scope answers are explicit, deterministic
 * kinds that MUST NOT touch the database. Returns the explicit kinds — never
 * null.
 */
export function classifyAssistantQuestion(
  question: string,
  now: Date = new Date(),
): QuestionClassification {
  const text = prepareQuestion(question);
  if (text.length === 0) return { kind: "unsupported" };

  const semantic = understand(question, now);

  // A conversation_reference period means the understanding layer determined
  // this is an expense-breakdown whose total must be anchored against a prior
  // owned exchange.  The engine period union has no conversation_reference, so
  // queryFromSemantic would return null (→ unsupported).  Classify it as a
  // clarification instead; the service layer resolves it against owned context.
  if (
    semantic.classification === "query" &&
    semantic.period.kind === "conversation_reference"
  ) {
    return { kind: "clarification", reason: "ambiguous_amount" };
  }

  const query = queryFromSemantic(semantic);
  if (query) return { kind: "query", query };
  if (semantic.classification === "clarification") {
    return {
      kind: "clarification",
      reason:
        semantic.reason === "needs_subject"
          ? "needs_subject"
          : semantic.reason === "ambiguous_savings"
            ? "ambiguous_savings"
            : semantic.reason === "ambiguous_amount"
              ? "ambiguous_amount"
              : "ambiguous_financial_metric",
    };
  }

  if (VAGUE_FINANCIAL_QUESTIONS.includes(text)) {
    return { kind: "clarification", reason: "ambiguous_financial_metric" };
  }

  return { kind: "unsupported" };
}

/** Detect a period-only conversational follow-up (reuses the ask layer). */
export function classifyFollowUp(
  question: string,
  now: Date = new Date(),
): FollowUpAnalysis {
  return analyzeFollowUp(question, now);
}

/* ------------------------------------------------------------
 * Period resolution
 * ------------------------------------------------------------ */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Turn a parsed period into concrete inclusive date bounds against a clock.
 * All bounds are resolved in UTC so month windows are exact.
 */
export function resolvePeriod(period: AssistantQuery["period"], now: Date): ResolvedPeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (period.kind) {
    case "allTime":
      return { label: "all time", from: null, to: null };
    case "thisYear":
      return { label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
    case "lastYear":
      return { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "thisMonth":
      return {
        label: monthLabel(m, y),
        from: isoStart(y, m),
        to: isoEnd(y, m),
      };
    case "lastMonth": {
      const [lm, ly] = shiftMonths(m, y, -1);
      return { label: monthLabel(lm, ly), from: isoStart(ly, lm), to: isoEnd(ly, lm) };
    }
    case "recent": {
      const to = nowIsoDay(now);
      const from = shiftDays(to, -(period.days - 1));
      return { label: `last ${period.days} days`, from, to };
    }
    case "custom":
      return { label: period.label, from: period.from, to: period.to };
    case "month": {
      const { month, year } = period;
      // Robustness guard: only integral 0–11 months are meaningful. Direct
      // programmatic misuse (e.g. month 13) must never reach Prisma with an
      // invalid date, so fall back to a valid bounded window — the whole
      // given year. The user-facing parser never produces these values.
      if (!Number.isInteger(month) || month < 0 || month > 11) {
        return {
          label: `${year}`,
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        };
      }
      return {
        label: monthLabel(month, year),
        from: isoStart(year, month),
        to: isoEnd(year, month),
      };
    }
  }
}

/** Human label for the period immediately before the given one (null when none). */
export function priorPeriodLabel(
  period: AssistantQuery["period"],
  now: Date,
): string | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (period.kind) {
    case "allTime":
      return null;
    case "thisYear":
      return `${y - 1}`;
    case "lastYear":
      return `${y - 2}`;
    case "thisMonth": {
      const [pm, py] = shiftMonths(m, y, -1);
      return monthLabel(pm, py);
    }
    case "lastMonth": {
      const [pm, py] = shiftMonths(m, y, -2);
      return monthLabel(pm, py);
    }
    case "month": {
      const [pm, py] = shiftMonths(period.month, period.year, -1);
      return monthLabel(pm, py);
    }
    case "recent":
      return `the ${period.days} days before`;
    case "custom":
      return null;
  }
}

/** Human label for exactly the verified range, including partial windows. */
export function rangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const startMonth = start.getUTCMonth();
  const endMonth = end.getUTCMonth();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const monthEnd = new Date(Date.UTC(startYear, startMonth + 1, 0)).getUTCDate();
  if (startYear === endYear && startMonth === endMonth && start.getUTCDate() === 1 && end.getUTCDate() === monthEnd) {
    return monthLabel(startMonth, startYear);
  }
  const startPart = `${MONTH_NAMES[startMonth]} ${start.getUTCDate()}`;
  const endPart = `${MONTH_NAMES[endMonth]} ${end.getUTCDate()}`;
  return startYear === endYear
    ? `${startPart}–${endPart}, ${startYear}`
    : `${startPart}, ${startYear}–${endPart}, ${endYear}`;
}

/** Label the exact comparison range actually used by the executor. */
export function comparisonPeriodLabel(query: AssistantQuery, now: Date): string | null {
  if (query.comparisonPeriod) return resolvePeriod(query.comparisonPeriod, now).label;
  const current = resolvePeriod(query.period, now);
  if (!current.from || !current.to) return null;
  const start = new Date(`${current.from}T00:00:00.000Z`);
  const end = new Date(`${current.to}T00:00:00.000Z`);
  const span = Math.max(end.getTime() - start.getTime(), 0);
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - span);
  return rangeLabel(priorStart.toISOString().slice(0, 10), priorEnd.toISOString().slice(0, 10));
}

/* ------------------------------------------------------------
 * Answer narration (verified figures only)
 * ------------------------------------------------------------ */

/** Answer a parsed query from verified metrics (never guesses). */
export function answerFromMetrics(
  query: AssistantQuery,
  metrics: AssistantMetrics,
  currency = "NGN",
  now: Date = new Date(),
): AssistantAnswer {
  const money = (v: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(round(v, 0));

  const period = resolvePeriod(query.period, now);

  switch (query.intent) {
    case "balance": {
      if (metrics.balance === null) return insufficient();
      return {
        kind: "answer",
        text: `Your cash balance across all accounts is ${money(metrics.balance)}.`,
        data: { balance: metrics.balance, period: period.label },
      };
    }

    case "income": {
      if (noActivity(metrics.summary)) return insufficient();
      const tail = metrics.priorSummary
        ? deltaTail(metrics.summary.revenue, metrics.priorSummary.revenue, money)
        : "";
      return {
        kind: "answer",
        text: `Income in ${period.label} was ${money(metrics.summary.revenue)}.${tail}`,
        data: { revenue: metrics.summary.revenue, period: period.label },
      };
    }

    case "expenses": {
      if (noActivity(metrics.summary)) return insufficient();
      const tail = metrics.priorSummary
        ? deltaTail(metrics.summary.expenses, metrics.priorSummary.expenses, money)
        : "";
      return {
        kind: "answer",
        text: `Spending in ${period.label} was ${money(metrics.summary.expenses)}.${tail}`,
        data: { expenses: metrics.summary.expenses, period: period.label },
      };
    }

    case "profit": {
      if (noActivity(metrics.summary)) return insufficient();
      const { revenue, expenses, netProfit, profitMargin } = metrics.summary;
      if (netProfit >= 0) {
        return {
          kind: "answer",
          text: `Net profit in ${period.label} was ${money(netProfit)}${profitMargin !== null ? ` — a ${formatPercent(profitMargin)} margin` : ""}. Revenue was ${money(revenue)} against expenses ${money(expenses)}.`,
          data: { netProfit, profitMargin, revenue, expenses, period: period.label },
        };
      }
      return {
        kind: "answer",
        text: `You ran at a loss of ${money(-netProfit)} in ${period.label}${profitMargin !== null ? ` (margin ${formatPercent(profitMargin)})` : ""} — revenue ${money(revenue)} against expenses ${money(expenses)}.`,
        data: { netProfit, profitMargin, revenue, expenses, period: period.label },
      };
    }

    case "profitMargin": {
      if (noActivity(metrics.summary) || metrics.summary.profitMargin === null) {
        return insufficient();
      }
      const { revenue, expenses, netProfit, profitMargin } = metrics.summary;
      return {
        kind: "answer",
        text: `Your profit margin in ${period.label} was ${formatPercent(profitMargin)} — ${money(netProfit)} profit on ${money(revenue)} revenue (against ${money(expenses)} expenses).`,
        data: { profitMargin, netProfit, revenue, expenses, period: period.label },
      };
    }

    case "topCategory": {
      const top = metrics.categoryTotals[0];
      if (!top || top.amount <= 0) return insufficient();
      const share =
        metrics.summary.expenses > 0
          ? (top.amount / metrics.summary.expenses) * 100
          : 0;
      return {
        kind: "answer",
        text: `Your top expense category in ${period.label} was ${cap(top.categoryName)} at ${money(top.amount)} — ${formatPercent(share)} of all expenses.`,
        data: { categoryName: top.categoryName, amount: top.amount, shareOfExpenses: round(share, 1), period: period.label },
      };
    }

    case "lowestCategory": {
      // Category totals are pre-filtered to categories with actual activity,
      // but never trust a borderline value: ignore anything <= 0 here too.
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return insufficient();
      const least = Math.min(...active.map((c) => c.amount));
      // Ties are listed deterministically (alphabetical) — never pick one
      // arbitrarily just because groupBy returned rows in some order.
      const tied = active
        .filter((c) => c.amount === least)
        .map((c) => cap(c.categoryName))
        .sort();
      const listing =
        tied.length === 1 ? tied[0] : `${tied.slice(0, -1).join(", ")} and ${tied[tied.length - 1]}`;
      return {
        kind: "answer",
        text: `You spent the least on ${listing}, at ${money(least)}${tied.length > 1 ? " each" : ""}, ${period.label}.`,
        data: { categoryNames: tied, amount: least, period: period.label },
      };
    }

    case "categorySpend": {
      const target = query.category;
      const total = metrics.categoryTotals.find(
        (c) => c.categoryName.toLowerCase() === target?.toLowerCase(),
      ) ?? { categoryName: target ?? "Other", amount: 0, priorAmount: 0 };
      if (noActivity(metrics.summary) && total.amount === 0) return insufficient();

      if (total.amount === 0) {
        return {
          kind: "answer",
          text: `No spending on ${lower(target)} was recorded in ${period.label}.`,
          data: { categoryName: target, amount: 0, period: period.label },
        };
      }
      const tail = metrics.priorSummary
        ? categoryDeltaTail(total, money)
        : "";
      return {
        kind: "answer",
        text: `Spending on ${lower(target)} in ${period.label} was ${money(total.amount)}.${tail}`,
        data: { categoryName: target, amount: total.amount, period: period.label },
      };
    }

    case "transactionCount": {
      if (!metrics.count || noActivity(metrics.summary)) return insufficient();
      const n = metrics.count.income + metrics.count.expenses + metrics.count.transfers;
      return {
        kind: "answer",
        text: `There were ${n} transactions in ${period.label} — ${metrics.count.income} income, ${metrics.count.expenses} expenses, ${metrics.count.transfers} transfer${metrics.count.transfers === 1 ? "" : "s"}.`,
        data: { ...metrics.count, total: n, period: period.label },
      };
    }

    case "expenseImpact": {
      if (noActivity(metrics.summary)) return insufficient();
      // Hypothetical/counterfactual reasoning ("If I spent less on X…") is a
      // different answer surface: it reasons about a POSED change using only
      // verified figures plus any amount the user themselves stated. Absent
      // a mode, this stays the factual expense-impact explanation.
      if (query.mode === "hypothetical" || query.mode === "comparison") {
        return hypotheticalImpactAnswer(query, metrics, money, period, now);
      }
      const { revenue, expenses, netProfit } = metrics.summary;
      const contributors = topContributors(metrics.categoryTotals, 3);
      let text =
        `Spending doesn’t reduce your revenue — revenue is what you earned, while expenses are subtracted from it to give profit. ` +
        `In ${period.label} you earned ${money(revenue)} and spent ${money(expenses)}, leaving ${money(netProfit)} profit.`;
      if (contributors.length > 0) {
        const combined = contributors.reduce((sum, c) => sum + c.amount, 0);
        const share = expenses > 0 ? round((combined / expenses) * 100, 0) : 0;
        const listing = contributors
          .map((c) => `${cap(c.categoryName)} (${money(c.amount)})`)
          .join(", ");
        text += ` The biggest drivers were ${listing} — together ${formatPercent(share)} of your spending.`;
      }
      if (metrics.priorSummary) {
        const delta = percentChange(revenue, metrics.priorSummary.revenue);
        if (delta !== null) {
          text += ` Revenue ${delta > 0 ? "rose" : "fell"} ${formatSignedPercent(delta)} vs the prior period (${money(revenue)} now vs ${money(metrics.priorSummary.revenue)} before).`;
        }
      }
      return {
        kind: "answer",
        text,
        data: {
          revenue,
          expenses,
          netProfit,
          topCategories: contributors.map((c) => ({
            categoryName: c.categoryName,
            amount: c.amount,
            shareOfExpenses: round(c.share, 1),
          })),
          period: period.label,
        },
      };
    }

    case "expenseBreakdown": {
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return insufficient();
      const computedTotal =
        metrics.summary.expenses > 0
          ? metrics.summary.expenses
          : round(active.reduce((sum, c) => sum + c.amount, 0), 2);
      const breakdown = distribution(active, computedTotal);
      const anchor = query.amountReference;
      const withinTolerance =
        anchor &&
        anchor.source === "previous_answer" &&
        Math.abs(anchor.value - computedTotal) <= Math.max(anchor.value * 0.005, 0.01);
      const shown = breakdown.slice(0, 5);
      const parts = shown.map((c) => `${cap(c.categoryName)} (${money(c.amount)})`);
      const totalLabel = withinTolerance
        ? `the ${money(computedTotal)} you asked about`
        : `your ${money(computedTotal)} spending`;
      let text =
        `Of ${totalLabel} in ${period.label}, ${joinList(parts)} accounted for ${formatPercent(
          round(shown.reduce((sum, c) => sum + c.share, 0), 1),
        )}.`;
      if (breakdown.length > shown.length) {
        const rest = breakdown.slice(shown.length);
        const restTotal = rest.reduce((sum, c) => sum + c.amount, 0);
        text += ` ${joinList(rest.map((c) => cap(c.categoryName)))} (${money(restTotal)}) made up the remainder.`;
      }
      return {
        kind: "answer",
        text,
        data: {
          breakdown: shown.map((c) => ({
            categoryName: c.categoryName,
            amount: c.amount,
            shareOfExpenses: c.share,
          })),
          total: computedTotal,
          period: period.label,
          anchored: withinTolerance,
        },
      };
    }

    case "spendingDistribution": {
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return insufficient();
      const total =
        metrics.summary.expenses > 0
          ? round(metrics.summary.expenses, 2)
          : round(active.reduce((sum, c) => sum + c.amount, 0), 2);
      const breakdown = distribution(active, total);
      const shown = breakdown.length <= 5 ? breakdown : breakdown.slice(0, 5);
      const parts = shown.map((c) => `${cap(c.categoryName)} (${formatPercent(c.share)})`);
      let text = `In ${period.label} your spending broke down as ${joinList(parts)}.`;
      if (breakdown.length > shown.length) {
        text += ` ${breakdown.length - shown.length} more categories make up the rest of the ${money(total)} total.`;
      }
      return {
        kind: "answer",
        text,
        data: {
          breakdown: shown.map((c) => ({
            categoryName: c.categoryName,
            amount: c.amount,
            shareOfExpenses: c.share,
          })),
          total,
          period: period.label,
        },
      };
    }

    case "incomeVsExpenses": {
      if (noActivity(metrics.summary)) return insufficient();
      const { revenue, expenses, netProfit, profitMargin } = metrics.summary;
      return {
        kind: "answer",
        text: `In ${period.label} you brought in ${money(revenue)} and spent ${money(expenses)}, leaving ${money(netProfit)} profit${profitMargin !== null ? ` (a ${formatPercent(profitMargin)} margin)` : ""}.`,
        data: { revenue, expenses, netProfit, profitMargin, period: period.label },
      };
    }

    case "periodComparison": {
      if (!metrics.priorSummary) return insufficient();
      if (noActivity(metrics.summary) && noActivity(metrics.priorSummary)) {
        return insufficient();
      }
      const priorLabel = comparisonPeriodLabel(query, now) ?? "the prior period";
      const target = query.target ?? null;

      if (target === null) {
        const parts = [
          changePhrase("revenue", metrics.summary.revenue, metrics.priorSummary.revenue, money),
          changePhrase("expenses", metrics.summary.expenses, metrics.priorSummary.expenses, money),
          changePhrase("profit", metrics.summary.netProfit, metrics.priorSummary.netProfit, money),
        ].filter((p): p is string => p !== null);
        if (parts.length === 0) return insufficient();
        return {
          kind: "answer",
          text: `Compared to ${priorLabel}, ${joinList(parts)}.`,
          data: {
            target,
            current: {
              revenue: metrics.summary.revenue,
              expenses: metrics.summary.expenses,
              netProfit: metrics.summary.netProfit,
            },
            prior: {
              revenue: metrics.priorSummary.revenue,
              expenses: metrics.priorSummary.expenses,
              netProfit: metrics.priorSummary.netProfit,
            },
            priorLabel,
            period: period.label,
          },
        };
      }

      const current = pickValue(target, metrics.summary);
      const prior = pickValue(target, metrics.priorSummary);
      const tail = deltaWording(current, prior, money);
      if (!tail) return insufficient();
      return {
        kind: "answer",
        text: `Compared to ${priorLabel}, your ${targetLabel(target)} ${tail}.`,
        data: { target, current, prior, priorLabel, period: period.label },
      };
    }
  }
}

/* ------------------------------------------------------------
 * Hypothetical reasoning narration (verified figures only)
 * ------------------------------------------------------------ */

/**
 * Narrate a posited spending change ("If I spent less on X…"). Answers the
 * question FIRST, reasons from verified figures only, and never invents an
 * amount: when the user supplied one it is computed through; otherwise the
 * effect is described symbolically ("by exactly the amount you save") and
 * anchored to the verified current spend.
 */
function hypotheticalImpactAnswer(
  query: AssistantQuery,
  metrics: AssistantMetrics,
  money: (v: number) => string,
  period: ResolvedPeriod,
  now: Date,
): AssistantAnswer {
  const { revenue, expenses, netProfit } = metrics.summary;
  const goal = query.effectGoal ?? "profit";
  const operation = query.operation ?? "decrease";
  const amount = query.hypotheticalAmount ?? null;
  const subject = query.category === null ? "" : ` on ${lower(query.category)}`;
  const categoryTotal =
    query.category === null
      ? null
      : metrics.categoryTotals.find(
          (c) => c.categoryName.toLowerCase() === query.category!.toLowerCase(),
        ) ?? null;
  const prior = metrics.priorSummary;
  const priorSentence =
    prior && query.mode === "comparison"
      ? ` In ${priorPeriodLabel(query.period, now) ?? "the prior period"}, your profit was ${money(prior.netProfit)}.`
      : null;

  // The metric being moved is total expenses: they change by the amount.
  if (goal === "expenses") {
    const fall = operation === "decrease";
    const base = `${fall ? "Reducing" : "Raising"} your spending${subject} ${
      fall ? "reduces" : "raises"
    } your total expenses by exactly the amount of the change${
      fall ? " you save" : ""
    }.`;
    if (amount !== null) {
      const shifted = round(fall ? expenses - amount : expenses + amount, 2);
      return {
        kind: "answer",
        text: `${base} Your expenses in ${period.label} are ${money(expenses)}${
          categoryTotal
            ? ` (${money(categoryTotal.amount)} on ${lower(query.category)})`
            : ""
        } — spending ${money(amount)} ${fall ? "less" : "more"} would take them to ${money(
          Math.max(shifted, 0),
        )}.`,
        data: { expenses, shifted, effectGoal: goal, period: period.label },
      };
    }
    return {
      kind: "answer",
      text: `${base}${
        categoryTotal
          ? ` You spent ${money(categoryTotal.amount)} on ${lower(query.category)} in ${period.label}, so that's the most this change could affect.`
          : ` You spent ${money(expenses)} in total in ${period.label}.`
      }`,
      data: { expenses, effectGoal: goal, period: period.label },
    };
  }

  // Revenue is what customers pay; spending only moves profit. Say so plainly
  // when the question implies spending affects revenue.
  if (goal === "income") {
    return {
      kind: "answer",
      text: `Spending ${operation === "decrease" ? "less" : "more"} doesn't change your revenue — revenue is what customers pay you, and it isn't affected by what you spend. It does change profit: spending ${
        operation === "decrease" ? "less" : "more"
      } ${operation === "decrease" ? "adds to" : "takes away from"} profit by the amount of the change.`,
      data: { revenue, expenses, netProfit, effectGoal: goal, period: period.label },
    };
  }

  // Default goal: profit. A cut adds to profit; more spend subtracts.
  const rise = operation === "decrease";
  const flipped = rise ? "rise" : "fall";
  if (amount !== null) {
    const shifted = round(netProfit + (rise ? amount : -amount), 2);
    return {
      kind: "answer",
      text: `Yes — spending ${rise ? "less" : "more"}${subject} would ${
        rise ? "increase" : "reduce"
      } your profit by the amount of the change, as long as your income stays the same. In ${period.label} your profit is ${money(
        netProfit,
      )} (income ${money(revenue)} minus expenses ${money(expenses)})${
        categoryTotal
          ? `, including ${money(categoryTotal.amount)} on ${lower(query.category)}`
          : ""
      }. If you cut ${money(amount)} from spending, profit would ${flipped} to ${money(
        shifted,
      )}.${priorSentence ?? ""}`,
      data: {
        hypotheticalAmount: amount,
        netProfit,
        shifted,
        effectGoal: goal,
        period: period.label,
        priorNetProfit: prior?.netProfit,
      },
    };
  }

  return {
    kind: "answer",
    text: `${rise ? "Yes — spending less" : "Spending more"}${subject} would ${
      rise ? "increase your profit by exactly the amount you save, as long as your income stays the same"
      : "reduce your profit by the amount you spend extra, as long as your income stays the same"
    }.${
      categoryTotal
        ? ` You spent ${money(categoryTotal.amount)} on ${lower(query.category)} in ${period.label}, so that's the most you could save there.`
        : ` In ${period.label} you spent ${money(expenses)} in total, so that's the ceiling on what you could save by spending less.`
    }${priorSentence ?? ""}`,
    data: { netProfit, expenses, revenue, effectGoal: goal, period: period.label },
  };
}

function pickValue(
  target: ComparisonTarget,
  summary: PeriodSummary,
): number {
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

function targetLabel(target: ComparisonTarget): string {
  switch (target) {
    case "income":
      return "income";
    case "expenses":
      return "spending";
    case "profit":
      return "profit";
    case "balance":
      return "cash balance";
  }
}

/**
 * "went from ₦X to ₦Y (+Z%)" for a single metric; null when neither period has
 * a figure (baseline 0 with no change is reported without a percentage).
 */
function deltaWording(
  current: number,
  prior: number,
  money: (v: number) => string,
): string | null {
  const delta = comparisonDelta(current, prior);
  if (delta.pct === null) {
    if (current === 0 && prior === 0) return null;
    return `went from ${money(prior)} to ${money(current)}`;
  }
  return `went from ${money(prior)} to ${money(current)} (${formatSignedPercent(delta.pct)})`;
}

/**
 * Label-prefixed version of deltaWording for the all-target comparison
 * ("revenue went from ₦X to ₦Y …"); null when the metric was idle in both
 * periods.
 */
function changePhrase(
  label: string,
  current: number,
  prior: number,
  money: (v: number) => string,
): string | null {
  const tail = deltaWording(current, prior, money);
  return tail === null ? null : `${label} ${tail}`;
}

/**
 * Deterministic, human-readable title for a conversation, derived from the
 * parsed query (never AI-generated, so history stays stable and cheap).
 */
export function conversationTitle(query: AssistantQuery): string {
  let topic: string;
  switch (query.intent) {
    case "balance":
      topic = "Cash balance";
      break;
    case "income":
      topic = "Income";
      break;
    case "expenses":
      topic = "Spending";
      break;
    case "profit":
      topic = "Profit";
      break;
    case "profitMargin":
      topic = "Profit margin";
      break;
    case "topCategory":
      topic = "Top expense category";
      break;
    case "lowestCategory":
      topic = "Lowest expense category";
      break;
    case "categorySpend":
      topic = `${cap(query.category)} spending`;
      break;
    case "transactionCount":
      topic = "Transaction count";
      break;
    case "expenseImpact":
      topic = "Expense impact";
      break;
    case "spendingDistribution":
      topic = "Spending breakdown";
      break;
    case "expenseBreakdown":
      topic = "Spending breakdown";
      break;
    case "incomeVsExpenses":
      topic = "Income vs expenses";
      break;
    case "periodComparison":
      topic = "Period comparison";
      break;
  }

  const period = periodTitle(query.period);
  const title = period ? `${topic} — ${period}` : topic;
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

function periodTitle(period: AssistantQuery["period"]): string {
  switch (period.kind) {
    case "thisMonth":
      return "This month";
    case "lastMonth":
      return "Last month";
    case "thisYear":
      return "This year";
    case "lastYear":
      return "Last year";
    case "allTime":
      return "All time";
    case "recent":
      return `Last ${period.days} days`;
    case "month":
      return monthLabel(period.month, period.year);
    case "custom":
      return period.label;
  }
}

/* ------------------------------------------------------------
 * shared helpers
 * ------------------------------------------------------------ */

function insufficient(): AssistantAnswer {
  return { kind: "insufficient", text: INSUFFICIENT_ANSWER, data: {} };
}

function noActivity(s: PeriodSummary): boolean {
  return s.revenue === 0 && s.expenses === 0 && s.transfers === 0;
}

/** "…, and was +x% vs the prior period (¤now vs ¤before)." */
function deltaTail(
  current: number,
  prior: number,
  money: (v: number) => string,
): string {
  const delta = percentChange(current, prior);
  if (delta === null) return "";
  return ` That's ${formatSignedPercent(delta)} vs the prior period (${money(current)} now vs ${money(prior)} before).`;
}

/** Category-flavoured version of deltaTail mirroring its wording. */
function categoryDeltaTail(
  total: AssistantCategorySpend,
  money: (v: number) => string,
): string {
  return deltaTail(total.amount, total.priorAmount, money);
}

function shiftMonths(month: number, year: number, offset: number): [number, number] {
  const total = month + offset;
  const y = year + Math.floor(total / 12);
  return [((total % 12) + 12) % 12, y];
}

function isoStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function isoEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function nowIsoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD day by a signed number of days. */
function shiftDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
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

/** "software" -> "Software" (title-cased, matching category display names). */
function cap(value: string | null): string {
  if (!value) return "Uncategorized";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function lower(value: string | null): string {
  return value ? value.toLowerCase() : "that category";
}

/** "A, B and C" style listing. */
function joinList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
