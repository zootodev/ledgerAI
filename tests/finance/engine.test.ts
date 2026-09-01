import { describe, expect, it } from "vitest";
import {
  summarizePeriod,
  percentChange,
  round,
  formatAmount,
  toMinorUnits,
  fromMinorUnits,
  profitImpact,
  computeSummary,
  majorAmount,
  transactionFingerprint,
} from "../../src/lib/finance/engine";

describe("summarizePeriod", () => {
  it("computes net profit as revenue minus expenses", () => {
    const s = summarizePeriod(2_450_000, 1_100_000, 0);
    expect(s.revenue).toBe(2_450_000);
    expect(s.expenses).toBe(1_100_000);
    expect(s.netProfit).toBe(1_350_000);
  });

  it("computes profit margin as a percentage of revenue", () => {
    const s = summarizePeriod(100_000, 60_000, 0);
    expect(s.profitMargin).toBe(40);
  });

  it("returns null margin when revenue is zero (avoids divide by zero)", () => {
    const s = summarizePeriod(0, 5_000, 0);
    expect(s.profitMargin).toBeNull();
  });

  it("handles a loss (negative net profit and margin)", () => {
    const s = summarizePeriod(50_000, 80_000, 0);
    expect(s.netProfit).toBe(-30_000);
    expect(s.profitMargin).toBe(-60);
  });

  it("passes through transfers separately and excludes them from profit", () => {
    const s = summarizePeriod(100_000, 40_000, 10_000);
    expect(s.transfers).toBe(10_000);
    expect(s.netProfit).toBe(60_000);
  });
});

describe("profitImpact (income/expense/transfer handling)", () => {
  it("income adds to profit", () => {
    expect(profitImpact("income", 50_000)).toBe(50_000);
  });

  it("expense subtracts from profit", () => {
    expect(profitImpact("expense", 20_000)).toBe(-20_000);
  });

  it("transfers never count as income or expense", () => {
    expect(profitImpact("transfer", 100_000)).toBe(0);
  });
});

describe("computeSummary (deterministic P&L aggregation)", () => {
  it("totals revenue, expenses, and transfers separately", () => {
    const s = computeSummary([
      { type: "income", amount: 2_000_000 },
      { type: "income", amount: 450_000 },
      { type: "expense", amount: 600_000 },
      { type: "expense", amount: 300_000 },
      { type: "transfer", amount: 5_000_000 },
      { type: "transfer", amount: 2_500_000 },
    ]);
    expect(s.revenue).toBe(2_450_000);
    expect(s.expenses).toBe(900_000);
    expect(s.transfers).toBe(7_500_000);
    expect(s.netProfit).toBe(1_550_000);
  });

  it("excludes transfers from net profit entirely", () => {
    const s = computeSummary([
      { type: "income", amount: 100_000 },
      { type: "transfer", amount: 99_999 },
    ]);
    expect(s.netProfit).toBe(100_000);
    expect(s.transfers).toBe(99_999);
  });

  it("handles a pure-transfer period as zero profit", () => {
    const s = computeSummary([
      { type: "transfer", amount: 1_000 },
      { type: "transfer", amount: 500 },
    ]);
    expect(s.revenue).toBe(0);
    expect(s.expenses).toBe(0);
    expect(s.netProfit).toBe(0);
    expect(s.profitMargin).toBeNull();
  });

  it("treats negative inputs as absolute magnitudes (records store positives)", () => {
    const s = computeSummary([
      { type: "expense", amount: -250.5 },
      { type: "income", amount: -1000 },
    ]);
    expect(s.expenses).toBe(250.5);
    expect(s.revenue).toBe(1000);
  });

  it("rounds aggregated cents deterministically", () => {
    const s = computeSummary([
      { type: "expense", amount: 0.1 },
      { type: "expense", amount: 0.2 },
    ]);
    expect(s.expenses).toBe(0.3);
  });
});

describe("majorAmount", () => {
  it("parses validated decimal strings to numbers", () => {
    expect(majorAmount("250.50")).toBe(250.5);
    expect(majorAmount("1234")).toBe(1234);
  });

  it("passes numbers through after rounding", () => {
    expect(majorAmount(0.1 + 0.2)).toBe(0.3);
  });

  it("rejects non-numeric amounts", () => {
    expect(() => majorAmount("abc")).toThrow();
  });
});

describe("transactionFingerprint (deterministic duplicate detection)", () => {
  it("normalizes case and whitespace in descriptions", () => {
    const a = transactionFingerprint({
      date: "2026-01-15",
      type: "expense",
      description: "  UBER   Trip  ",
      amount: "2500.00",
    });
    const b = transactionFingerprint({
      date: "2026-01-15",
      type: "expense",
      description: "uber trip",
      amount: "2500.00",
    });
    expect(a).toBe(b);
    expect(a).toBe("2026-01-15|expense|uber trip|2500.00|");
  });

  it("distinguishes income, expense, and transfer", () => {
    const base = { date: "2026-01-15", description: "opay transfer", amount: "1000" };
    const income = transactionFingerprint({ ...base, type: "income" });
    const expense = transactionFingerprint({ ...base, type: "expense" });
    const transfer = transactionFingerprint({ ...base, type: "transfer" });
    expect(new Set([income, expense, transfer]).size).toBe(3);
  });

  it("distinguishes by amount and reference", () => {
    const base = { date: "2026-01-15", type: "expense" as const, description: "rent" };
    expect(
      transactionFingerprint({ ...base, amount: "1000", reference: "jan" }),
    ).not.toBe(transactionFingerprint({ ...base, amount: "1100", reference: "jan" }));
    expect(
      transactionFingerprint({ ...base, amount: "1000", reference: "jan" }),
    ).not.toBe(transactionFingerprint({ ...base, amount: "1000" }));
  });
});

describe("percentChange", () => {
  it("returns the percent change from previous to current", () => {
    expect(percentChange(2440, 2000)).toBeCloseTo(22, 5);
  });

  it("returns null when previous is zero (no baseline)", () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it("handles a decrease as a negative percent", () => {
    expect(percentChange(100, 200)).toBe(-50);
  });
});

describe("round", () => {
  it("rounds to the requested decimals", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
  });

  it("defaults to 2 decimals", () => {
    expect(round(3.14159)).toBe(3.14);
  });
});

describe("toMinorUnits / fromMinorUnits", () => {
  it("converts a decimal string to integer minor units", () => {
    expect(toMinorUnits("2450.50")).toBe(245050);
    expect(toMinorUnits("100")).toBe(10000);
  });

  it("strips currency symbols, commas, and whitespace", () => {
    expect(toMinorUnits("₦2,450.50")).toBe(245050);
    expect(toMinorUnits(" 1,000.00 ")).toBe(100000);
  });

  it("handles negatives", () => {
    expect(toMinorUnits("-500.25")).toBe(-50025);
  });

  it("rejects malformed amounts rather than silently accepting bad money", () => {
    expect(() => toMinorUnits("abc")).toThrow();
    expect(() => toMinorUnits("")).toThrow();
    expect(() => toMinorUnits("1.234")).toThrow();
  });

  it("round-trips through fromMinorUnits", () => {
    expect(fromMinorUnits(toMinorUnits("1234.56"))).toBe(1234.56);
  });
});

describe("formatAmount", () => {
  it("formats major units as a Naira currency string", () => {
    const out = formatAmount(2450000);
    expect(out).toContain("2,450,000");
  });
});
