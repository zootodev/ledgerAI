import { describe, expect, it } from "vitest";
import {
  RECONCILE_TOLERANCE,
  SIDE_CORRECTED_WARNING,
  reconcileNormalizedRows,
} from "@/lib/import/reconcile";
import type { NormalizedImportRow } from "@/lib/import/types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowIndex: 0,
    sourceRow: 2,
    date: "2026-01-05",
    rawDate: "2026-01-05",
    description: "Transaction",
    amount: "1000.00",
    type: "expense",
    reference: null,
    category: null,
    balance: null,
    errors: [],
    warnings: [],
    skipped: false,
    skipReason: null,
    ...overrides,
  };
}

/** A short statement: 10,000 opening, expense 2,500, income 1,000. */
function consistentStatement(): NormalizedImportRow[] {
  return [
    row({ rowIndex: 0, description: "Rent", amount: "2500.00", type: "expense", balance: "7500.00" }),
    row({ rowIndex: 1, description: "Client", amount: "1000.00", type: "income", balance: "8500.00" }),
  ];
}

describe("reconcileNormalizedRows", () => {
  it("reports the balance column as verified when the maths holds", () => {
    const { summary } = reconcileNormalizedRows(consistentStatement(), "10000.00");
    expect(summary.checked).toBe(2);
    expect(summary.reconciled).toBe(2);
    expect(summary.mismatches).toEqual([]);
    expect(summary.openingBalance).toBe("10000.00");
    expect(summary.closingBalance).toBe("8500.00");
  });

  it("verifies rows from the first balance even without a printed opening balance", () => {
    const { summary } = reconcileNormalizedRows(consistentStatement());
    // The first row's 7,500 becomes the anchor, so only the second row is checked.
    expect(summary.checked).toBe(1);
    expect(summary.reconciled).toBe(1);
    expect(summary.openingBalance).toBe("7500.00");
  });

  it("flags a row whose balance does not follow", () => {
    const rows = consistentStatement();
    rows[1] = { ...rows[1], balance: "8600.00" };
    const { summary } = reconcileNormalizedRows(rows, "10000.00");
    expect(summary.checked).toBe(2);
    expect(summary.reconciled).toBe(1);
    expect(summary.mismatches).toHaveLength(1);
    expect(summary.mismatchRowIndexes).toEqual([1]);
    expect(summary.mismatches[0]).toMatchObject({
      rowIndex: 1,
      description: "Client",
      expected: "1000.00",
      actual: "1100.00",
      difference: "100.00",
    });
  });

  it("corrects a single-row debit/credit mix-up from the balance", () => {
    // The row is typed income, but the balance only works if it is an expense.
    const rows = [
      row({ rowIndex: 0, description: "Opening-ish", amount: "500.00", type: "income", balance: "10500.00" }),
      row({ rowIndex: 1, description: "Flip me", amount: "2000.00", type: "income", balance: "8500.00" }),
    ];
    const { rows: fixed, summary } = reconcileNormalizedRows(rows);
    expect(summary.corrected).toBe(1);
    expect(summary.mismatches).toEqual([]);
    // The row is an expense; its type was incorrectly income, so we flip it.
    expect(fixed[1].type).toBe("expense");
    expect(fixed[1].warnings).toContain(SIDE_CORRECTED_WARNING);
  });

  it("never tries to correct a multi-row gap it cannot attribute", () => {
    const rows = [
      row({ rowIndex: 0, description: "A", amount: "100.00", type: "expense", balance: "1000.00" }),
      row({ rowIndex: 1, description: "B", amount: "100.00", type: "expense", balance: null }),
      row({ rowIndex: 2, description: "C", amount: "100.00", type: "expense", balance: "900.00" }),
    ];
    const { summary } = reconcileNormalizedRows(rows);
    expect(summary.corrected).toBe(0);
    expect(summary.mismatches.length).toBeGreaterThan(0);
    // Both intermediate rows are attributed the mismatch so the filter shows them.
    expect(summary.mismatchRowIndexes).toEqual([1, 2]);
  });

  it("leaves an unverifiable transfer span unchecked", () => {
    const rows = [
      row({ rowIndex: 0, description: "A", amount: "100.00", type: "expense", balance: "900.00" }),
      row({ rowIndex: 1, description: "Move", amount: "50.00", type: "transfer", balance: "950.00" }),
    ];
    const { summary } = reconcileNormalizedRows(rows);
    expect(summary.checked).toBe(0);
    expect(summary.mismatches).toEqual([]);
  });

  it("tolerates a one-kobo rounding drift", () => {
    const rows = [
      row({ rowIndex: 0, description: "A", amount: "100.00", type: "expense", balance: "900.00" }),
      row({ rowIndex: 1, description: "B", amount: "100.00", type: "expense", balance: "800.00" }),
    ];
    const { summary } = reconcileNormalizedRows(rows, "1000.00");
    expect(summary.mismatches).toEqual([]);
    expect(RECONCILE_TOLERANCE).toBe(0.01);
  });

  it("does nothing when the file carries no balances", () => {
    const rows = [row({ balance: null }), row({ rowIndex: 1, balance: null })];
    const { summary } = reconcileNormalizedRows(rows);
    expect(summary).toMatchObject({
      checked: 0,
      reconciled: 0,
      corrected: 0,
      openingBalance: null,
      closingBalance: null,
    });
  });

  it("ignores invalid rows as balance checkpoints", () => {
    const rows = [row({ rowIndex: 0, errors: ["bad amount"], balance: "100.00" })];
    const { summary } = reconcileNormalizedRows(rows);
    expect(summary.checked).toBe(0);
    expect(summary.openingBalance).toBeNull();
  });
});
