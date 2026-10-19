import { describe, expect, it } from "vitest";
import {
  filterPreviewRows,
  countByView,
  summarizeStatementPeriod,
  periodsOverlap,
  isDuplicateRow,
} from "@/lib/import/review";
import type { ImportPreviewRow } from "@/lib/import/types";

function row(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowIndex: 0,
    displayRow: 1,
    sourceRow: 2,
    date: "2026-01-05",
    description: "UBER ride",
    amount: "2500.00",
    type: "expense",
    reference: null,
    category: null,
    balance: null,
    reconciles: null,
    reconcilesNote: null,
    suggestedCategory: "Transportation",
    confidence: 0.94,
    duplicate: "new",
    errors: [],
    warnings: [],
    valid: true,
    skipped: false,
    skipReason: null,
    needsReview: false,
    ...overrides,
  };
}

describe("filterPreviewRows", () => {
  const rows = [
    row({ rowIndex: 0 }),
    row({ rowIndex: 1, needsReview: true }),
    row({ rowIndex: 2, duplicate: "duplicate_in_file" }),
    row({ rowIndex: 3, duplicate: "duplicate_existing" }),
    row({ rowIndex: 4, valid: false, errors: ["bad amount"] }),
    row({ rowIndex: 5, needsReview: true, duplicate: "duplicate_in_file" }),
  ];

  it("keeps every row for the all view", () => {
    expect(filterPreviewRows(rows, "all")).toHaveLength(6);
  });

  it("keeps valid rows needing review", () => {
    expect(filterPreviewRows(rows, "review").map((r) => r.rowIndex)).toEqual([1, 5]);
  });

  it("keeps valid duplicate rows", () => {
    expect(filterPreviewRows(rows, "duplicates").map((r) => r.rowIndex)).toEqual([2, 3, 5]);
  });

  it("keeps invalid rows", () => {
    expect(filterPreviewRows(rows, "invalid").map((r) => r.rowIndex)).toEqual([4]);
  });
});

describe("countByView", () => {
  it("counts each focus view without double-counting invalid rows", () => {
    const rows = [
      row({ rowIndex: 0 }),
      row({ rowIndex: 1, needsReview: true }),
      row({ rowIndex: 2, duplicate: "duplicate_existing" }),
      row({ rowIndex: 3, valid: false }),
    ];
    expect(countByView(rows)).toEqual({
      all: 4,
      review: 1,
      unreconciled: 0,
      duplicates: 1,
      invalid: 1,
      skipped: 0,
    });
  });
});

describe("isDuplicateRow", () => {
  it("is true only for duplicate tags", () => {
    expect(isDuplicateRow(row({ duplicate: "new" }))).toBe(false);
    expect(isDuplicateRow(row({ duplicate: "duplicate_in_file" }))).toBe(true);
    expect(isDuplicateRow(row({ duplicate: "duplicate_existing" }))).toBe(true);
  });
});

describe("summarizeStatementPeriod", () => {
  it("returns the inclusive span of valid dated rows", () => {
    const rows = [
      row({ rowIndex: 0, date: "2026-06-15" }),
      row({ rowIndex: 1, date: "2026-06-01" }),
      row({ rowIndex: 2, date: "2026-06-30" }),
    ];
    expect(summarizeStatementPeriod(rows)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("ignores invalid rows even when they carry dates", () => {
    const rows = [
      row({ rowIndex: 0, date: "2026-06-15" }),
      row({ rowIndex: 1, date: "1999-01-01", valid: false }),
    ];
    expect(summarizeStatementPeriod(rows)).toEqual({ from: "2026-06-15", to: "2026-06-15" });
  });

  it("returns null bounds when there are no valid dated rows", () => {
    expect(summarizeStatementPeriod([row({ valid: false })])).toEqual({ from: null, to: null });
    expect(summarizeStatementPeriod([])).toEqual({ from: null, to: null });
  });
});

describe("periodsOverlap", () => {
  it("detects an intersecting range", () => {
    expect(
      periodsOverlap({ from: "2026-06-01", to: "2026-06-30" }, { from: "2026-06-15", to: "2026-07-15" }),
    ).toBe(true);
  });

  it("treats a touching endpoint as overlapping (inclusive)", () => {
    expect(
      periodsOverlap({ from: "2026-06-01", to: "2026-06-30" }, { from: "2026-06-30", to: "2026-07-15" }),
    ).toBe(true);
  });

  it("returns false for disjoint ranges", () => {
    expect(
      periodsOverlap({ from: "2026-01-01", to: "2026-01-31" }, { from: "2026-06-01", to: "2026-06-30" }),
    ).toBe(false);
  });

  it("returns false when either range is absent", () => {
    expect(periodsOverlap({ from: null, to: null }, { from: "2026-06-01", to: "2026-06-30" })).toBe(false);
    expect(periodsOverlap({ from: "2026-06-01", to: "2026-06-30" }, { from: null, to: null })).toBe(false);
  });

  it("treats a null bound as unbounded on that side", () => {
    expect(periodsOverlap({ from: null, to: "2026-06-30" }, { from: "2026-06-15", to: null })).toBe(true);
  });
});
