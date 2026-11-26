import { describe, expect, it } from "vitest";
import { REVIEW_THRESHOLD } from "@/lib/ai/rules";
import {
  planAirtimeCategoryReset,
  UNCERTAIN_CONFIDENCE,
} from "@/lib/import/airtime-repair";
import type { CategoryRuleDto } from "@/types";

const categories = [
  { id: "income-other", name: "Other Income", type: "income" },
  { id: "expense-utilities", name: "Utilities", type: "expense" },
  { id: "expense-other", name: "Other", type: "expense" },
  { id: "expense-betting", name: "Betting", type: "expense" },
];

const row = (description: string, categoryId: string | null = "income-other") => ({
  id: "txn-1",
  description,
  categoryId,
});

const rule = (pattern: string, categoryName: string): CategoryRuleDto => ({
  id: `rule-${pattern}`,
  businessId: "biz-1",
  matchType: "merchant",
  pattern,
  categoryId: "expense-betting",
  categoryName,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("planAirtimeCategoryReset", () => {
  it("moves a confident airtime row off the income category onto a matching expense category", () => {
    const plan = planAirtimeCategoryReset(row("MTN AIRTIME PURCHASE"), categories, []);

    expect(plan.recategorised).toBe(true);
    expect(plan.categoryId).toBe("expense-utilities");
    expect(Number(plan.aiConfidence)).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(plan.toReview).toBe(false);
  });

  it("uses a learned business rule when it clears the review threshold", () => {
    const plan = planAirtimeCategoryReset(
      row("ZOTOBET STAKE"),
      categories,
      [rule("ZOTOBET", "Betting")],
    );

    expect(plan.categoryId).toBe("expense-betting");
    expect(Number(plan.aiConfidence)).toBe(0.94);
    expect(plan.toReview).toBe(false);
  });

  it("resets an unconfident row to the neutral expense category and returns it to Review", () => {
    const plan = planAirtimeCategoryReset(row("OFF CAMPUS WITHDRAWAL"), categories, []);

    expect(plan.recategorised).toBe(true);
    expect(plan.categoryId).toBe("expense-other");
    expect(plan.toReview).toBe(true);
    expect(Number(plan.aiConfidence)).toBeLessThan(REVIEW_THRESHOLD);
    expect(plan.aiConfidence).toBe(UNCERTAIN_CONFIDENCE);
  });

  it("leaves a row that already has an expense category alone", () => {
    const plan = planAirtimeCategoryReset(row("MTN AIRTIME", "expense-other"), categories, []);

    expect(plan.recategorised).toBe(false);
    expect(plan.toReview).toBe(false);
    expect(plan.categoryId).toBe("expense-other");
    expect(plan.aiConfidence).toBeNull();
  });

  it("still clears the income category when no neutral expense category exists", () => {
    const plan = planAirtimeCategoryReset(
      row("OFF CAMPUS WITHDRAWAL"),
      categories.filter((category) => category.name !== "Other"),
      [],
    );

    expect(plan.categoryId).toBeNull();
    expect(plan.recategorised).toBe(true);
    expect(plan.toReview).toBe(true);
  });
});
