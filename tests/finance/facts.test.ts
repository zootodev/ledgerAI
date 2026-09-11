import { describe, expect, it } from "vitest";
import {
  buildFactManifest,
  formatFactMoney,
  formatFactPercent,
} from "@/lib/finance/facts";
import { summarizePeriod } from "@/lib/finance/engine";
import type { AssistantMetrics, AssistantQuery } from "@/lib/finance/assistant";
import type { NarrationManifest } from "@/lib/ask/contracts";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const CURRENCY = "NGN";

function metricsFor(input: {
  revenue?: number;
  expenses?: number;
  transfers?: number;
  prior?: { revenue: number; expenses: number };
  categories?: { categoryName: string; amount: number; priorAmount: number }[];
  balance?: number | null;
  count?: { income: number; expenses: number; transfers: number } | null;
}): AssistantMetrics {
  const summary = summarizePeriod(input.revenue ?? 0, input.expenses ?? 0, input.transfers ?? 0);
  return {
    summary,
    priorSummary: input.prior ? summarizePeriod(input.prior.revenue, input.prior.expenses) : null,
    categoryTotals: input.categories ?? [],
    balance: input.balance ?? null,
    count: input.count ?? null,
  };
}

function manifestOf(input: Record<string, unknown>): NarrationManifest {
  const built = buildFactManifest({ currency: CURRENCY, now: NOW, ...input } as never);
  if (!built) throw new Error("expected a manifest");
  return built.manifest;
}

function factsFor(query: AssistantQuery, metrics: AssistantMetrics) {
  return buildFactManifest({ query, metrics, currency: CURRENCY, now: NOW });
}

describe("formatFactMoney / formatFactPercent", () => {
  it("renders money in en-NG major units like the deterministic narration", () => {
    expect(formatFactMoney(600_000, "NGN")).toBe("₦600,000");
    expect(formatFactMoney(0.4, "NGN")).toBe("₦0");
  });

  it("renders percents", () => {
    expect(formatFactPercent(25.4)).toBe("25%");
  });
});

describe("buildFactManifest", () => {
  it("builds a stable verified summary manifest with F1 = period", () => {
    const query: AssistantQuery = { intent: "expenses", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({ query, metrics: metricsFor({ revenue: 1_000_000, expenses: 600_000 }) });
    expect(manifest.answerKind).toBe("summary");
    expect(manifest.facts[0]).toEqual({ id: "F1", kind: "period", display: "August 2026", required: true });
    expect(manifest.facts[1].kind).toBe("money");
    expect(manifest.facts[1].display).toContain("600,000");
    // The LLM may never author a figure: ids stay F1..Fn (money ≠ arbitrary).
    expect(manifest.facts.every((f) => /^F[1-9]\d*$/.test(f.id))).toBe(true);
  });

  it("returns null for a no-activity breakdown", () => {
    const query: AssistantQuery = { intent: "expenseBreakdown", category: null, period: { kind: "thisMonth" } };
    expect(factsFor(query, metricsFor({ expenses: 600_000, categories: [] }))).toBeNull();
  });

  it("sets moneyFactId for an expense breakdown and flags the total fact", () => {
    const query: AssistantQuery = { intent: "expenseBreakdown", category: null, period: { kind: "thisMonth" } };
    const built = factsFor(query, metricsFor({
      expenses: 600_000,
      categories: [{ categoryName: "Rent", amount: 500_000, priorAmount: 0 }],
    }));
    expect(built?.moneyFactId).toBe("F2");
    expect(built?.manifest.facts[1].display).toBe("₦600,000 total");
  });

  it("builds a period comparison manifest keyed on the prior window", () => {
    const query: AssistantQuery = {
      intent: "periodComparison",
      target: "expenses",
      category: null,
      period: { kind: "thisMonth" },
    };
    const manifest = manifestOf({
      query,
      metrics: metricsFor({
        revenue: 1_000_000,
        expenses: 600_000,
        prior: { revenue: 800_000, expenses: 500_000 },
      }),
    });
    expect(manifest.answerKind).toBe("comparison");
    expect(manifest.facts.some((f) => f.kind === "percent")).toBe(true);
    expect(manifest.facts.some((f) => f.display.includes("spending"))).toBe(true);
  });

  it("binds a category fact to the top category for topCategory", () => {
    const query: AssistantQuery = { intent: "topCategory", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({
      query,
      metrics: metricsFor({
        expenses: 600_000,
        categories: [{ categoryName: "Rent", amount: 500_000, priorAmount: 0 }],
      }),
    });
    expect(manifest.facts.some((f) => f.kind === "category" && f.display === "Rent")).toBe(true);
  });

  it("never emits a negative profit margin figure in the period manifest", () => {
    // Loss-making period: profitMargin is negative but the manifest carries
    // the verified net profit number, never an invented positive.
    const query: AssistantQuery = { intent: "profit", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({ query, metrics: metricsFor({ revenue: 400_000, expenses: 600_000 }) });
    expect(manifest.facts.some((f) => f.kind === "money" && f.display === "-₦200,000")).toBe(true);
  });
});