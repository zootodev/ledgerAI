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

  it("certifies the exact prior-period delta the deterministic renderer displays", () => {
    const query: AssistantQuery = { intent: "expenses", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({
      query,
      metrics: metricsFor({ expenses: 600_000, prior: { revenue: 1_000_000, expenses: 500_000 } }),
    });
    // deltaTail("..."): percentChange(600000, 500000) = +20% — the fallback text
    // "That's +20% vs the prior period" must now be representable in the manifest.
    expect(
      manifest.facts.some(
        (f) => f.kind === "relation" && f.required === false && f.display === "vs prior July 2026: +20%",
      ),
    ).toBe(true);
  });

  it("adds no delta relation when there is no prior window", () => {
    const query: AssistantQuery = { intent: "expenses", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({ query, metrics: metricsFor({ revenue: 1_000_000, expenses: 600_000 }) });
    expect(manifest.facts.filter((f) => f.kind === "relation").length).toBe(0);
  });

  it("skips the delta relation when the prior baseline is zero (renderer renders none)", () => {
    const query: AssistantQuery = { intent: "expenses", category: null, period: { kind: "thisMonth" } };
    const manifest = manifestOf({
      query,
      metrics: metricsFor({ expenses: 600_000, prior: { revenue: 0, expenses: 0 } }),
    });
    expect(
      manifest.facts.some((f) => f.kind === "relation" && /vs prior/i.test(f.display)),
    ).toBe(false);
  });

  describe("Phase 15 — category complement facts", () => {
    const EIGHT_CAT = [
      { categoryName: "Inventory", amount: 150_000, priorAmount: 0 },
      { categoryName: "Rent", amount: 120_000, priorAmount: 0 },
      { categoryName: "Salaries", amount: 100_000, priorAmount: 0 },
      { categoryName: "Equipment", amount: 60_000, priorAmount: 0 },
      { categoryName: "Marketing", amount: 50_000, priorAmount: 0 },
      { categoryName: "Food", amount: 40_000, priorAmount: 0 },
      { categoryName: "Transport", amount: 40_000, priorAmount: 0 },
      { categoryName: "Other", amount: 40_000, priorAmount: 0 },
    ];

    function complementQuery(complement: { kind: "aggregate" } | { kind: "excluding"; category: string }): AssistantQuery {
      return { intent: "spendingDistribution", category: null, period: { kind: "thisYear" }, complement };
    }

    it("aggregate complement certifies the combined money + share and the member categories", () => {
      const built = factsFor(
        complementQuery({ kind: "aggregate" }),
        metricsFor({ expenses: 600_000, categories: EIGHT_CAT }),
      );
      const manifest = built?.manifest;
      expect(manifest?.answerKind).toBe("breakdown");
      expect(manifest?.facts.some((f) => f.kind === "money" && f.required && f.display === "₦120,000 total")).toBe(true);
      expect(manifest?.facts.some((f) => f.kind === "percent" && f.required && f.display === "20%")).toBe(true);
      // every named member category is a verifiable, capped fact byte
      for (const name of ["Food", "Transport", "Other"]) {
        expect(manifest?.facts.some((f) => f.kind === "category" && f.display === name)).toBe(true);
      }
      // the complement case carries ONLY the remaining members (never re-slices the top five)
      expect(manifest?.facts.some((f) => f.kind === "category" && f.display === "Inventory")).toBe(false);
      expect(manifest?.facts.some((f) => f.kind === "category" && f.display === "Rent")).toBe(false);
    });

    it("excluding complement sends the excluded boundary and never the excluded name's amount", () => {
      const built = factsFor(
        complementQuery({ kind: "excluding", category: "Rent" }),
        metricsFor({ expenses: 600_000, categories: EIGHT_CAT }),
      );
      const manifest = built?.manifest;
      expect(manifest?.facts.some((f) => f.kind === "category" && f.required === false && f.display === "Rent")).toBe(true);
      expect(manifest?.facts.some((f) => f.kind === "money" && f.required && f.display === "₦480,000 total")).toBe(true);
      expect(manifest?.facts.some((f) => f.kind === "percent" && f.required && f.display === "80%")).toBe(true);
    });

    it("an emptied complement certifies the exact 'no remaining categories' phrase as a required relation", () => {
      const built = factsFor(
        complementQuery({ kind: "aggregate" }),
        metricsFor({
          expenses: 600_000,
          categories: [
            { categoryName: "Inventory", amount: 200_000, priorAmount: 0 },
            { categoryName: "Rent", amount: 150_000, priorAmount: 0 },
            { categoryName: "Salaries", amount: 120_000, priorAmount: 0 },
            { categoryName: "Equipment", amount: 80_000, priorAmount: 0 },
            { categoryName: "Marketing", amount: 50_000, priorAmount: 0 },
          ],
        }),
      );
      const manifest = built?.manifest;
      expect(
        manifest?.facts.some(
          (f) => f.kind === "relation" && f.required && f.display === "no remaining categories",
        ),
      ).toBe(true);
    });

    it("an emptied excluding complement keeps the excluded boundary fact non-required", () => {
      const built = factsFor(
        complementQuery({ kind: "excluding", category: "Rent" }),
        metricsFor({
          expenses: 300_000,
          categories: [{ categoryName: "Rent", amount: 300_000, priorAmount: 0 }],
        }),
      );
      const manifest = built?.manifest;
      expect(
        manifest?.facts.some(
          (f) => f.kind === "relation" && f.required && f.display === "no remaining categories",
        ),
      ).toBe(true);
      expect(
        manifest?.facts.some((f) => f.kind === "category" && f.required === false && f.display === "Rent"),
      ).toBe(true);
    });

    it("caps complement member category facts at 20 for a huge ledger", () => {
      const huge = Array.from({ length: 40 }, (_, i) => ({
        categoryName: `Cat ${i + 1}`,
        amount: 100_000,
        priorAmount: 0,
      }));
      const built = factsFor(complementQuery({ kind: "aggregate" }), metricsFor({ expenses: 4_000_000, categories: huge }));
      const categoryFacts = (built?.manifest.facts ?? []).filter((f) => f.kind === "category");
      expect(categoryFacts.length).toBeLessThanOrEqual(20);
    });
  });

  describe("Phase 17 — category share facts", () => {
    const JULY: AssistantQuery["period"] = { kind: "month", month: 6, year: 2026 };
    const CATS = [
      { categoryName: "Rent", amount: 120_000, priorAmount: 84_000 },
      { categoryName: "Inventory", amount: 87_000, priorAmount: 61_000 },
      { categoryName: "Salaries", amount: 206_300, priorAmount: 200_000 },
    ];

    it("certifies the category, the money, the percent share, and the prior delta relation", () => {
      const manifest = factsFor(
        { intent: "categoryShare", category: "Inventory", period: JULY },
        metricsFor({ expenses: 413_300, categories: CATS, prior: { revenue: 0, expenses: 345_000 } }),
      )?.manifest;
      expect(manifest).toBeTruthy();
      expect(manifest!.facts.some((f) => f.kind === "category" && f.required && f.display === "Inventory")).toBe(true);
      expect(manifest!.facts.some((f) => f.kind === "money" && f.required && f.display === "₦87,000")).toBe(true);
      // 87,000 / 413,300 = 21.05% -> formatFactPercent(round) -> "21%"
      expect(manifest!.facts.some((f) => f.kind === "percent" && f.required && f.display === "21%")).toBe(true);
      // prior label for July 2026 is June 2026; percentChange(87000, 61000) -> +43%
      expect(manifest!.facts.some((f) => f.kind === "relation" && f.required === false && f.display === "vs prior June 2026: +43%")).toBe(true);
    });

    it("certifies a tensioned share exactly once and only for the asked category", () => {
      const manifest = factsFor(
        { intent: "categoryShare", category: "Rent", period: JULY },
        metricsFor({ expenses: 413_300, categories: CATS, prior: { revenue: 0, expenses: 345_000 } }),
      )?.manifest;
      expect(manifest).toBeTruthy();
      const percents = manifest!.facts.filter((f) => f.kind === "percent" && f.required);
      expect(percents).toHaveLength(1);
      expect(percents[0].display).toBe("29%");
      expect(manifest!.facts.some((f) => f.kind === "category" && f.display === "Inventory")).toBe(false);
    });

    it("does not force a delta relation when there is no prior window", () => {
      const manifest = factsFor(
        { intent: "categoryShare", category: "Inventory", period: JULY },
        metricsFor({ expenses: 413_300, categories: CATS }),
      )?.manifest;
      expect(manifest).toBeTruthy();
      expect(manifest!.facts.some((f) => f.kind === "relation" && /prior/i.test(f.display))).toBe(false);
      expect(manifest!.facts.some((f) => f.kind === "percent" && f.required && f.display === "21%")).toBe(true);
      expect(manifest!.facts.some((f) => f.kind === "money" && f.required && f.display === "₦87,000")).toBe(true);
    });

    it("certifies a zero-share answer as money ₦0 and percent 0%", () => {
      const manifest = factsFor(
        { intent: "categoryShare", category: "Other", period: JULY },
        metricsFor({ expenses: 413_300, categories: CATS, prior: { revenue: 0, expenses: 345_000 } }),
      )?.manifest;
      expect(manifest).toBeTruthy();
      expect(manifest!.facts.some((f) => f.kind === "money" && f.required && f.display === "₦0")).toBe(true);
      expect(manifest!.facts.some((f) => f.kind === "percent" && f.required && f.display === "0%")).toBe(true);
      expect(manifest!.facts.some((f) => f.kind === "category" && f.required && f.display === "Other")).toBe(true);
    });

    it("an entirely empty period still certifies the zero share fact set", () => {
      const manifest = factsFor(
        { intent: "categoryShare", category: "Inventory", period: { kind: "thisYear" } },
        metricsFor({ expenses: 0, categories: [], prior: { revenue: 0, expenses: 0 } }),
      )?.manifest;
      expect(manifest).toBeTruthy();
      expect(manifest!.facts.some((f) => f.kind === "percent" && f.required && f.display === "0%")).toBe(true);
      expect(manifest!.facts.some((f) => f.kind === "money" && f.required && f.display === "₦0")).toBe(true);
    });
  });
});