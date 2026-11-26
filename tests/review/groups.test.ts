import { describe, expect, it } from "vitest";
import {
  groupLowConfidenceRows,
  reviewMerchantKey,
  type ReviewRowInput,
} from "@/lib/review/groups";

const row = (overrides: Partial<ReviewRowInput>): ReviewRowInput => ({
  id: "row-1",
  description: "POS ZOOZ COFFEE 06SEP",
  amount: "10.00",
  date: "2026-09-06",
  categoryId: "cat-food",
  aiCategory: "Food",
  aiConfidence: 0.4,
  type: "expense",
  ...overrides,
});

describe("low-confidence review grouping", () => {
  it("uses the categorizer's merchant key and suggested category", () => {
    const groups = groupLowConfidenceRows([
      row({ id: "a", description: "POS ZOOZ COFFEE 06SEP" }),
      row({ id: "b", description: "ZOOZ-COFFEE purchase", date: "2026-09-07" }),
      row({ id: "c", description: "ZOOZ COFFEE", aiCategory: "Shopping" }),
    ]);

    expect(reviewMerchantKey("POS ZOOZ COFFEE 06SEP")).toBe("ZOOZ");
    expect(groups).toHaveLength(2);
    expect(groups[0].merchant).toBe("ZOOZ");
    expect(groups[0].rowCount).toBe(2);
    expect(groups[0].suggestedCategory).toBe("Food");
    expect(groups[1].suggestedCategory).toBe("Shopping");
  });

  it("orders groups by absolute total amount and lists money-relevant facts", () => {
    const groups = groupLowConfidenceRows([
      row({ id: "small", description: "ZOOZ COFFEE", amount: "2.50", date: "2026-09-01" }),
      row({ id: "small2", description: "ZOOZ COFFEE", amount: "2.50", date: "2026-09-03" }),
      row({
        id: "big",
        description: "MTN AIRTIME",
        amount: "150.00",
        date: "2026-09-05",
        aiCategory: "Airtime & Data",
      }),
      row({
        id: "big2",
        description: "MTN AIRTIME",
        amount: "50.00",
        date: "2026-09-08",
        aiCategory: "Airtime & Data",
      }),
    ]);

    expect(groups[0].merchant).toBe("MTN");
    expect(groups[0].rowCount).toBe(2);
    expect(groups[0].totalAmount).toBe(200);
    expect(groups[0].dateFrom).toBe("2026-09-05");
    expect(groups[0].dateTo).toBe("2026-09-08");
    expect(groups[0].samples).toEqual(["MTN AIRTIME", "MTN AIRTIME"]);
    expect(groups[1].totalAmount).toBe(5);
  });
});
