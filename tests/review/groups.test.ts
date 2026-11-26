import { describe, expect, it } from "vitest";
import {
  cleanReviewDescription,
  groupLowConfidenceRows,
  reviewGroupLabel,
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
  it("uses a readable cleaned counterparty and keeps raw text only as a sample", () => {
    expect(cleanReviewDescription("POS ZOOZ COFFEE 06SEP")).toBe("ZOOZ COFFEE");
    expect(reviewGroupLabel("POS ZOOZ COFFEE 06SEP")).toBe("Zooz Coffee");

    const groups = groupLowConfidenceRows([
      row({ id: "a", description: "POS ZOOZ COFFEE 06SEP" }),
      row({ id: "b", description: "ZOOZ-COFFEE purchase", date: "2026-09-07" }),
      row({ id: "c", description: "ZOOZ COFFEE", aiCategory: "Shopping" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Zooz Coffee");
    expect(groups[0].samples).toEqual(["POS ZOOZ COFFEE 06SEP", "ZOOZ-COFFEE purchase"]);
    expect(groups[0].suggestedCategory).toBe("Food");
    expect(groups[1].suggestedCategory).toBe("Shopping");
  });

  it("collapses every real-world airtime variant into one group", () => {
    const descriptions = [
      "AIRTIME AIRTIME PURCHASE 2349018363223",
      "AIRTIME AIRTIME PURCHASE 2349033660823",
      "₦ AIRTIME AIRTIME PURCHASE 2347058053642",
      "NGN AIRTIME PURCHASE 2348061234567",
    ];
    for (const description of descriptions) {
      expect(reviewGroupLabel(description)).toBe("Airtime");
    }

    const groups = groupLowConfidenceRows(
      descriptions.map((description, index) =>
        row({
          id: `airtime-${index}`,
          description,
          amount: "100.00",
          aiCategory: "Other Income",
        }),
      ),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Airtime");
    expect(groups[0].rowCount).toBe(4);
    expect(reviewMerchantKey(descriptions[0])).toBe("AIRTIME");
  });

  it("collapses data/bills plans into one Mobile data group", () => {
    const descriptions = [
      "bills 2gb plan (30 days) purchase",
      "MTN 1gb data plan (30 days) purchase",
      "GLO 100 MINS WEEKLY bundle",
    ];
    for (const description of descriptions) {
      expect(reviewGroupLabel(description)).toBe("Mobile data");
    }

    const groups = groupLowConfidenceRows(
      descriptions.map((description, index) =>
        row({ id: `data-${index}`, description, amount: "500.00" }),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Mobile data");
  });

  it("labels withdrawals and transfers instead of a random middle word", () => {
    expect(reviewGroupLabel("off campus withdrawal")).toBe("Cash withdrawal");
    expect(reviewGroupLabel("POS withdrawal 2349033660823")).toBe("Cash withdrawal");
    expect(reviewGroupLabel("ATM CASH WITHDRAWAL")).toBe("Cash withdrawal");
    expect(reviewGroupLabel("TRANSFER TO JOHN DOE 2349018363223")).toBe("Transfer – John Doe");
    expect(reviewGroupLabel("TRANSFER FROM ZOOZ COFFEE")).toBe("Transfer – Zooz Coffee");
  });

  it("orders groups by absolute total amount and lists money-relevant facts", () => {
    const groups = groupLowConfidenceRows([
      row({ id: "small", description: "ZOOZ COFFEE", amount: "2.50", date: "2026-09-01" }),
      row({ id: "small2", description: "ZOOZ COFFEE", amount: "2.50", date: "2026-09-03" }),
      row({
        id: "big",
        description: "MTN AIRTIME 2349018363223",
        amount: "150.00",
        date: "2026-09-05",
        aiCategory: "Airtime & Data",
      }),
      row({
        id: "big2",
        description: "₦ AIRTIME AIRTIME PURCHASE 2347058053642",
        amount: "50.00",
        date: "2026-09-08",
        aiCategory: "Airtime & Data",
      }),
    ]);

    expect(groups[0].label).toBe("Airtime");
    expect(groups[0].rowCount).toBe(2);
    expect(groups[0].totalAmount).toBe(200);
    expect(groups[0].dateFrom).toBe("2026-09-05");
    expect(groups[0].dateTo).toBe("2026-09-08");
    expect(groups[0].samples).toEqual([
      "MTN AIRTIME 2349018363223",
      "₦ AIRTIME AIRTIME PURCHASE 2347058053642",
    ]);
    expect(groups[1].totalAmount).toBe(5);
  });
});
