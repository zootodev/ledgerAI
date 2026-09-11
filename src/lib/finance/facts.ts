// ============================================================
// LedgerAI — financial fact manifest (Stage 2)
// ------------------------------------------------------------
// Builds an immutable, verified fact set from an executed plan. Facts are
// the ONLY financial values that may reach a narration LLM, and they are
// rendered by trusted money logic — the LLM can re-write the wording, never
// the numbers. Facts carry stable ids (F1 = period, then canonical order)
// so the narration planner can reference them and the V2 frame can anchor
// them.
// ============================================================

import {
  financialFactSchema,
  type FinancialFact,
  type NarrationManifest,
} from "@/lib/ask/contracts";
import { resolvePeriod, type AssistantMetrics, type AssistantQuery } from "@/lib/finance/assistant";
import { round } from "@/lib/finance/engine";

/** Trusted money rendering — keeping this slow-path narration sample
 * consistent with the deterministic narration is a GOAL, so the same
 * Intl formatter used by answerFromMetrics is replicated exactly here. */
export function formatFactMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(round(value, 0));
}

export function formatFactPercent(value: number): string {
  return `${round(value, 0).toLocaleString("en-NG")}%`;
}

export interface FactManifestInput {
  query: AssistantQuery;
  metrics: AssistantMetrics;
  currency: string;
  now: Date;
}

export interface BuiltFactManifest {
  manifest: NarrationManifest;
  /** Id of the fact carrying the anchorable expense total (null when none). */
  moneyFactId: string | null;
}

function answerKindFor(query: AssistantQuery): NarrationManifest["answerKind"] {
  switch (query.intent) {
    case "expenseBreakdown":
    case "spendingDistribution":
      return "breakdown";
    case "periodComparison":
      return "comparison";
    case "expenseImpact":
      return query.mode === "hypothetical" || query.mode === "comparison"
        ? "hypothetical"
        : "summary";
    default:
      return "summary";
  }
}

function allowedTemplatesFor(kind: NarrationManifest["answerKind"]): NarrationManifest["allowedTemplates"] {
  switch (kind) {
    case "comparison":
      return ["direct", "explain"];
    case "breakdown":
      return ["direct", "brief", "ranked"];
    case "hypothetical":
      return ["direct", "explain"];
    default:
      return ["direct", "brief", "explain"];
  }
}

/**
 * Immutable verified fact manifest. Every fact is validated against
 * financialFactSchema as it is built; building never throws on data (only on
 * genuinely malformed count structures, which the engine cannot produce).
 */
export function buildFactManifest(input: FactManifestInput): BuiltFactManifest | null {
  const { query, metrics, currency, now } = input;
  const period = resolvePeriod(query.period, now);
  const kind = answerKindFor(query);
  if (kind === "clarification" || kind === "insufficient") return null;

  const money = (v: number) => formatFactMoney(v, currency);
  const facts: FinancialFact[] = [];
  let n = 1;
  const add = (factKind: FinancialFact["kind"], display: string, required: boolean) => {
    facts.push(financialFactSchema.parse({ id: `F${n++}`, kind: factKind, display, required }));
  };

  add("period", period.label, true);
  let moneyFactId: string | null = null;

  switch (query.intent) {
    case "balance":
      add("money", money(metrics.balance ?? 0), true);
      break;

    case "income":
      add("money", money(metrics.summary.revenue), true);
      if (metrics.priorSummary) {
        add("relation", `prior ${periodAgoLabel(query, now)}: ${money(metrics.priorSummary.revenue)}`, true);
      }
      break;

    case "expenses":
      add("money", money(metrics.summary.expenses), true);
      if (metrics.priorSummary) {
        add("relation", `prior ${periodAgoLabel(query, now)}: ${money(metrics.priorSummary.expenses)}`, true);
      }
      break;

    case "profit":
      add("money", money(metrics.summary.netProfit), true);
      add("money", `revenue ${money(metrics.summary.revenue)}`, true);
      add("money", `expenses ${money(metrics.summary.expenses)}`, true);
      if (metrics.summary.profitMargin !== null) {
        add("percent", formatFactPercent(metrics.summary.profitMargin), true);
      }
      break;

    case "profitMargin":
      if (metrics.summary.profitMargin !== null) {
        add("percent", formatFactPercent(metrics.summary.profitMargin), true);
      }
      add("money", money(metrics.summary.netProfit), true);
      add("money", `revenue ${money(metrics.summary.revenue)}`, true);
      add("money", `expenses ${money(metrics.summary.expenses)}`, true);
      break;

    case "topCategory": {
      const top = metrics.categoryTotals[0];
      if (!top || top.amount <= 0) return null;
      add("category", top.categoryName, true);
      add("money", money(top.amount), true);
      const share =
        metrics.summary.expenses > 0 ? round((top.amount / metrics.summary.expenses) * 100, 1) : 0;
      add("percent", formatFactPercent(share), true);
      break;
    }

    case "lowestCategory": {
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return null;
      const least = Math.min(...active.map((c) => c.amount));
      const tied = active.filter((c) => c.amount === least).map((c) => c.categoryName).sort();
      add("category", tied.join(", "), true);
      add("money", money(least), true);
      break;
    }

    case "categorySpend":
      add("category", query.category ?? "all", true);
      {
        const total =
          metrics.categoryTotals.find(
            (c) => c.categoryName.toLowerCase() === query.category?.toLowerCase(),
          ) ?? null;
        add("money", money(total?.amount ?? 0), true);
        if (metrics.priorSummary && total && total.priorAmount >= 0) {
          add("money", `prior ${periodAgoLabel(query, now)}: ${money(total.priorAmount)}`, true);
        }
      }
      break;

    case "transactionCount": {
      if (!metrics.count) return null;
      const c = metrics.count;
      add("count", `${c.income + c.expenses + c.transfers} transactions`, true);
      add("count", `${c.income} income`, true);
      add("count", `${c.expenses} expenses`, true);
      add("count", `${c.transfers} transfers`, false);
      break;
    }

    case "expenseImpact": {
      add("money", `revenue ${money(metrics.summary.revenue)}`, true);
      add("money", `expenses ${money(metrics.summary.expenses)}`, true);
      add("money", `net profit ${money(metrics.summary.netProfit)}`, true);
      if (query.category) add("category", query.category, false);
      if (query.hypotheticalAmount !== undefined) {
        const goal = query.effectGoal ?? "profit";
        const operation = query.operation ?? "decrease";
        let shifted = 0;
        if (goal === "expenses") {
          shifted = operation === "decrease"
            ? metrics.summary.expenses - query.hypotheticalAmount
            : metrics.summary.expenses + query.hypotheticalAmount;
        } else {
          shifted = metrics.summary.netProfit + (operation === "increase" ? query.hypotheticalAmount : -query.hypotheticalAmount);
        }
        add("money", `${operation} ${money(query.hypotheticalAmount)}`, true);
        add("money", `after ${money(Math.max(shifted, 0))}`, true);
      }
      if (metrics.priorSummary) {
        add("relation", `prior net profit ${money(metrics.priorSummary.netProfit)}`, false);
      }
      break;
    }

    case "expenseBreakdown": {
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return null;
      const total =
        metrics.summary.expenses > 0
          ? metrics.summary.expenses
          : round(active.reduce((sum, c) => sum + c.amount, 0), 2);
      moneyFactId = `F${n}`;
      add("money", `${money(total)} total`, true);
      const remaining = Math.min(4, active.length);
      for (const c of active.slice(0, remaining)) {
        add("category", c.categoryName, true);
        add("money", money(c.amount), true);
        const share = total > 0 ? round((c.amount / total) * 100, 1) : 0;
        add("percent", formatFactPercent(share), false);
      }
      break;
    }

    case "spendingDistribution": {
      const active = metrics.categoryTotals.filter((c) => c.amount > 0);
      if (active.length === 0) return null;
      const total =
        metrics.summary.expenses > 0
          ? round(metrics.summary.expenses, 2)
          : round(active.reduce((sum, c) => sum + c.amount, 0), 2);
      add("money", `${money(total)} total`, true);
      const remaining = Math.min(5, active.length);
      for (const c of active.slice(0, remaining)) {
        add("category", c.categoryName, true);
        const share = total > 0 ? round((c.amount / total) * 100, 1) : 0;
        add("percent", formatFactPercent(share), false);
      }
      break;
    }

    case "incomeVsExpenses":
      add("money", `revenue ${money(metrics.summary.revenue)}`, true);
      add("money", `expenses ${money(metrics.summary.expenses)}`, true);
      add("money", `net profit ${money(metrics.summary.netProfit)}`, true);
      if (metrics.summary.profitMargin !== null) {
        add("percent", formatFactPercent(metrics.summary.profitMargin), true);
      }
      break;

    case "periodComparison": {
      const prior = metrics.priorSummary;
      if (!prior) return null;
      const priorLabel = periodAgoLabel(query, now);
      add("relation", `compared to ${priorLabel}`, true);
      const target = query.target ?? null;
      if (target === null) {
        add("money", `revenue ${money(metrics.summary.revenue)} → ${money(prior.revenue)}`, true);
        add("money", `expenses ${money(metrics.summary.expenses)} → ${money(prior.expenses)}`, true);
        add("money", `profit ${money(metrics.summary.netProfit)} → ${money(prior.netProfit)}`, true);
      } else {
        const current = pick(target, metrics.summary);
        const before = pick(target, prior);
        if (current !== null && before !== null) {
          add("category", targetLabel(target), false);
          add("money", `current ${money(current)}`, true);
          add("money", `prior ${money(before)}`, true);
          const pct = before !== 0 ? round(((current - before) / Math.abs(before)) * 100, 1) : null;
          if (pct !== null) add("percent", formatFactPercent(Math.abs(pct)), false);
        }
      }
      break;
    }
  }

  const manifest = { answerKind: kind, facts, allowedTemplates: allowedTemplatesFor(kind) };
  return { manifest, moneyFactId };
}

function pick(
  target: ComparisonTarget,
  summary: AssistantMetrics["summary"],
): number | null {
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

type ComparisonTarget = "income" | "expenses" | "profit" | "balance";

function periodAgoLabel(query: AssistantQuery, now: Date): string | null {
  if (query.intent !== "periodComparison") {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    switch (query.period.kind) {
      case "thisYear":
        return `${y - 1}`;
      case "lastYear":
        return `${y - 2}`;
      case "thisMonth":
        return monthLabel((m + 11) % 12, m === 0 ? y - 1 : y);
      case "lastMonth":
        return monthLabel((m + 10) % 12, m <= 1 ? y - 1 : y);
      case "month":
        return monthLabel((query.period.month + 11) % 12, query.period.month === 0 ? query.period.year - 1 : query.period.year);
      case "recent":
        return "the period before";
      default:
        return null;
    }
  }
  return null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[Math.min(Math.max(month, 0), 11)]} ${year}`;
}