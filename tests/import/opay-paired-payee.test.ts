import { describe, expect, it } from "vitest";
import { categorizeImportRow } from "@/lib/import/categorize";
import { applyOpayPairedPayees } from "@/lib/import/prepare";
import type { NormalizedImportRow } from "@/lib/import/types";

function row(overrides: Partial<NormalizedImportRow> & Pick<NormalizedImportRow, "rowIndex" | "sourceRow" | "date" | "description" | "amount" | "type">): NormalizedImportRow {
  return {
    rawDate: overrides.date,
    reference: null,
    category: null,
    balance: null,
    errors: [],
    warnings: [],
    skipped: false,
    skipReason: null,
    sectionId: null,
    time: null,
    transfer: null,
    pairedPayee: null,
    ...overrides,
  };
}

describe("OPay paired payee enrichment", () => {
  it("pairs a set-aside Transfer to payee with a real debit and categorises by payee", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-03",
        description: "Transfer to PRECIOUS FASTFOOD",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "internal transfer",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
      }),
    ];

    applyOpayPairedPayees(rows, "opay");

    expect(rows[1].pairedPayee).toBe("PRECIOUS FASTFOOD");
    expect(rows[0].skipped).toBe(true);

    const suggestion = await categorizeImportRow(rows[1]);
    expect(suggestion.categoryName).toBe("Food");
    expect(suggestion.confidence).toBe(0.84);
  });

  it("keeps a person-name paired payee as Other, 50%, flagged", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-03",
        description: "Transfer to PRECIOUS OREOLUWA",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "not a transaction",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
      }),
    ];

    applyOpayPairedPayees(rows, "opay");
    expect(rows[1].pairedPayee).toBe("PRECIOUS OREOLUWA");

    const suggestion = await categorizeImportRow(rows[1]);
    expect(suggestion.categoryName).toBe("Other");
    expect(suggestion.confidence).toBe(0.5);
    expect(suggestion.needsReview).toBe(true);
  });

  it("does not pair across different dates", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-04",
        description: "Transfer to PRECIOUS FASTFOOD",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "internal transfer",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
      }),
    ];

    applyOpayPairedPayees(rows, "opay");
    expect(rows[1].pairedPayee).toBeNull();
  });

  it("pairs only one debit when two debits share amount/date and one set-aside row", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-03",
        description: "Transfer to PRECIOUS FASTFOOD",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "internal transfer",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
      }),
      row({
        rowIndex: 2,
        sourceRow: 3,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000005",
        amount: "1020.00",
        type: "expense",
      }),
    ];

    applyOpayPairedPayees(rows, "opay");
    const paired = rows.filter((r) => r.pairedPayee === "PRECIOUS FASTFOOD");
    expect(paired).toHaveLength(1);
  });

  it("does not apply to non-OPay statements", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-03",
        description: "Transfer to PRECIOUS FASTFOOD",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "internal transfer",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
      }),
    ];

    applyOpayPairedPayees(rows, "kuda");
    expect(rows[1].pairedPayee).toBeNull();
  });

  it("strips POS Transfer prefix and does not mutate accounting fields", async () => {
    const rows: NormalizedImportRow[] = [
      row({
        rowIndex: 0,
        sourceRow: 1,
        date: "2026-11-03",
        description: "Transfer to POS Transfer - OMOLOLA FASTFOOD",
        amount: "1020.00",
        type: "transfer",
        skipped: true,
        skipReason: "internal transfer",
      }),
      row({
        rowIndex: 1,
        sourceRow: 2,
        date: "2026-11-03",
        description: "LAWAL|MONIE POINT|0000000004",
        amount: "1020.00",
        type: "expense",
        balance: "500.00",
      }),
    ];

    applyOpayPairedPayees(rows, "opay");
    expect(rows[1].pairedPayee).toBe("OMOLOLA FASTFOOD");
    expect(rows[1].amount).toBe("1020.00");
    expect(rows[1].date).toBe("2026-11-03");
    expect(rows[1].type).toBe("expense");
    expect(rows[1].balance).toBe("500.00");
    expect(rows[0].skipped).toBe(true);
  });
});
