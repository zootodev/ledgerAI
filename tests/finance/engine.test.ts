import { describe, expect, it } from "vitest";
import {
  summarizePeriod,
  percentChange,
  round,
  formatAmount,
  toMinorUnits,
  fromMinorUnits,
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
