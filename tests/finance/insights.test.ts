import { describe, expect, it } from "vitest";
import {
  deriveInsights,
  type CategorySpend,
  type InsightsInput,
} from "../../src/lib/finance/insights";
import { summarizePeriod } from "../../src/lib/finance/engine";

function baseInput(overrides: Partial<InsightsInput> = {}): InsightsInput {
  return {
    summary: summarizePeriod(1_000_000, 600_000, 0),
    priorSummary: summarizePeriod(800_000, 700_000, 0),
    topCategories: [],
    topIncome: [],
    largestExpense: null,
    ...overrides,
  };
}

function cat(
  name: string,
  amount: number,
  priorAmount: number,
  transactions = 1,
): CategorySpend {
  return { categoryId: null, categoryName: name, amount, priorAmount, transactions };
}

function findKind(insights: ReturnType<typeof deriveInsights>, kind: string) {
  return insights.find((i) => i.kind === kind);
}

describe("deriveInsights (deterministic insight engine)", () => {
  it("surfaces a key insight naming the top expense category", () => {
    const insights = deriveInsights(
      baseInput({
        summary: summarizePeriod(1_000_000, 600_000, 0),
        topCategories: [cat("Inventory", 300_000, 200_000), cat("Transportation", 120_000, 90_000)],
      }),
    );
    const key = findKind(insights, "key");
    expect(key?.title).toContain("Inventory");
    expect(key?.description).toContain("50%");
    expect(key?.metadata.shareOfExpenses).toBe(50);
  });

  it("flags a loss as the key insight when the period is negative", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(80_000, 100_000, 0) }),
    );
    const key = findKind(insights, "key");
    expect(key?.title).toContain("loss");
    expect((key?.metadata.netProfit as number) ?? 0).toBeLessThan(0);
  });

  it("derives a spending insight for a category with a meaningful increase", () => {
    const insights = deriveInsights(
      baseInput({ topCategories: [cat("Marketing", 40_000, 20_000)] }),
    );
    const spending = findKind(insights, "spending");
    expect(spending?.title).toContain("Marketing");
    expect(spending?.title).toContain("100%");
    expect(spending?.metadata.percentChange).toBe(100);
  });

  it("does not emit a spending insight for tiny/non-noteworthy deltas", () => {
    const insights = deriveInsights(
      baseInput({
        topCategories: [
          cat("Software", 52_000, 50_000), // +4%, below the 15% threshold
        ],
      }),
    );
    expect(findKind(insights, "spending")).toBeUndefined();
  });

  it("derives a revenue insight with the signed change", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(900_000, 300_000, 0), priorSummary: summarizePeriod(600_000, 300_000, 0) }),
    );
    const revenue = findKind(insights, "revenue");
    expect(revenue?.title).toContain("grew");
    expect(revenue?.title).toContain("50%");
    expect(revenue?.description).toContain("+50%");
  });

  it("reports a falling revenue as a decrease", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(400_000, 300_000, 0), priorSummary: summarizePeriod(600_000, 300_000, 0) }),
    );
    const revenue = findKind(insights, "revenue");
    expect(revenue?.title).toContain("fell");
    expect(revenue?.title).toContain("33%");
  });

  it("skips revenue insight when the prior period had no revenue", () => {
    const insights = deriveInsights(
      baseInput({ priorSummary: summarizePeriod(0, 0, 0) }),
    );
    // With zero prior revenue there is no delta to compare.
    expect(findKind(insights, "revenue")).toBeUndefined();
  });

  it("calls out a healthy margin as a profitability insight", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(1_000_000, 300_000, 0) }),
    );
    const profitability = findKind(insights, "profitability");
    expect(profitability?.title).toContain("70%");
    expect(profitability?.title.toLowerCase()).toContain("healthy");
  });

  it("calls out a thin margin as a profitability insight", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(1_000_000, 930_000, 0) }),
    );
    const profitability = findKind(insights, "profitability");
    expect(profitability?.title).toContain("7%");
    expect(profitability?.title.toLowerCase()).toContain("thin");
  });

  it("does not emit profitability when margin is null (no revenue)", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(0, 5_000, 0) }),
    );
    expect(findKind(insights, "profitability")).toBeUndefined();
  });

  it("flags a single expense that dominates the period as an anomaly", () => {
    const insights = deriveInsights(
      baseInput({
        summary: summarizePeriod(1_000_000, 400_000, 0),
        topCategories: [cat("Equipment", 350_000, 0)],
        largestExpense: { categoryName: "Equipment", amount: 320_000 },
      }),
    );
    const anomaly = findKind(insights, "anomaly");
    expect(anomaly?.title).toContain("single expense");
    expect((anomaly?.metadata.shareOfExpenses as number) ?? 0).toBeGreaterThanOrEqual(30);
  });

  it("does not flag an anomaly when no single expense dominates", () => {
    const insights = deriveInsights(
      baseInput({
        summary: summarizePeriod(1_000_000, 600_000, 0),
        topCategories: [cat("Rent", 300_000, 300_000)],
        largestExpense: { categoryName: "Rent", amount: 150_000 }, // 150/600 = 25%, below 30%
      }),
    );
    expect(findKind(insights, "anomaly")).toBeUndefined();
  });

  it("emits a recommendation to review the top category when it is a large share", () => {
    const insights = deriveInsights(
      baseInput({
        summary: summarizePeriod(1_000_000, 600_000, 0),
        topCategories: [cat("Rent", 400_000, 400_000)],
      }),
    );
    const rec = findKind(insights, "recommendation");
    expect(rec?.title.toLowerCase()).toContain("rent");
    expect(rec?.title.toLowerCase()).toContain("review");
    expect((rec?.metadata.shareOfExpenses as number) ?? 0).toBeGreaterThanOrEqual(20);
  });

  it("recommends revenue/fixed-cost work when margin is thin", () => {
    const insights = deriveInsights(
      baseInput({ summary: summarizePeriod(1_000_000, 950_000, 0) }),
    );
    const rec = findKind(insights, "recommendation");
    expect(rec?.title.toLowerCase()).toContain("revenue");
  });

  it("derives insights deterministically (same input, same output)", () => {
    const input = baseInput({
      topCategories: [cat("Inventory", 300_000, 200_000), cat("Marketing", 80_000, 40_000)],
      largestExpense: { categoryName: "Inventory", amount: 250_000 },
    });
    const a = deriveInsights(input);
    const b = deriveInsights(input);
    expect(a).toEqual(b);
  });
});