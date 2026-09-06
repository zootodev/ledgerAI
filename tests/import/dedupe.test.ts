import { describe, expect, it } from "vitest";
import {
  canonicalAmount,
  fingerprintOf,
  inFileFingerprint,
  tagDuplicates,
} from "@/lib/import/dedupe";
import type { NormalizedImportRow } from "@/lib/import/types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowIndex: 0,
    sourceRow: 2,
    date: "2026-01-05",
    rawDate: "2026-01-05",
    description: "UBER ride",
    amount: "2500.00",
    type: "income",
    reference: null,
    category: null,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

describe("canonicalAmount", () => {
  it("normalizes to two decimals", () => {
    expect(canonicalAmount("1250.5")).toBe("1250.50");
    expect(canonicalAmount("1250")).toBe("1250.00");
    expect(canonicalAmount("  950.5 ")).toBe("950.50");
  });
});

describe("fingerprintOf", () => {
  it("produces a stable fingerprint from date, type, description, amount and reference", () => {
    const a = row();
    const b = row({ date: "2026-01-06" });
    expect(fingerprintOf(row({ amount: "1250.5" }))).toBe(
      fingerprintOf(row({ amount: "1250.50" })),
    );
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });
});

describe("inFileFingerprint", () => {
  it("keeps occurrence and reference but is insensitive to the date", () => {
    const a = row({ date: "2026-08-01" });
    const b = row({ date: "2026-08-04" });
    expect(a.description).toBe(b.description);
    expect(inFileFingerprint(a)).toBe(inFileFingerprint(b));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });

  it("differs when the amount, description, type or reference differ", () => {
    expect(inFileFingerprint(row({ amount: "2500.00" }))).not.toBe(
      inFileFingerprint(row({ amount: "2500.01" })),
    );
    expect(inFileFingerprint(row())).not.toBe(
      inFileFingerprint(row({ description: "Office supplies" })),
    );
    expect(inFileFingerprint(row())).not.toBe(
      inFileFingerprint(row({ type: "expense" })),
    );
    expect(inFileFingerprint(row())).not.toBe(
      inFileFingerprint(row({ reference: "ref-001" })),
    );
  });
});

describe("tagDuplicates", () => {
  it("marks the first valid occurrence new and later ones duplicate_in_file", () => {
    const rows = [
      row({ rowIndex: 0 }),
      row({ rowIndex: 1 }),
      row({ rowIndex: 2, description: "Rent payment" }),
    ];
    const tags = tagDuplicates(rows);
    expect(tags.get(0)?.duplicate).toBe("new");
    expect(tags.get(1)).toMatchObject({ duplicate: "duplicate_in_file", duplicateOfRow: 0 });
    expect(tags.get(2)?.duplicate).toBe("new");
  });

  it("never lets an invalid first occurrence shadow a valid identical row", () => {
    const rows = [
      row({ rowIndex: 0, errors: ["invalid amount"] }),
      row({ rowIndex: 1 }),
    ];
    const tags = tagDuplicates(rows);
    // 0 is invalid so cannot be a leader for the block; 1 is new.
    expect(tags.get(1)?.duplicate).toBe("new");
  });

  it("prioritizes duplicate_existing over in-file signals", () => {
    const fp = fingerprintOf(row());
    const rows = [row({ rowIndex: 0, description: "Rent" }), row({ rowIndex: 1 })];
    const tags = tagDuplicates(rows, new Set([fp]));
    expect(tags.get(0)?.duplicate).toBe("new");
    expect(tags.get(1)?.duplicate).toBe("duplicate_existing");
    expect(tags.get(1)?.duplicateOfRow).toBeUndefined();
  });

  it("flags the same merchant and amount on different dates as in-file duplicates", () => {
    const rows = [
      row({ rowIndex: 0, date: "2026-08-01", description: "Client payment", amount: "150000.00" }),
      row({ rowIndex: 1, date: "2026-08-02", description: "Office supplies", amount: "25000.00" }),
      row({ rowIndex: 2, date: "2026-08-03", description: "Internet subscription", amount: "10000.00" }),
      row({ rowIndex: 3, date: "2026-08-04", description: "Client payment", amount: "150000.00" }),
      row({ rowIndex: 4, date: "2026-08-05", description: "Office supplies", amount: "25000.00" }),
    ];
    const tags = tagDuplicates(rows);
    expect(tags.get(0)?.duplicate).toBe("new");
    expect(tags.get(1)?.duplicate).toBe("new");
    expect(tags.get(2)?.duplicate).toBe("new");
    expect(tags.get(3)).toMatchObject({ duplicate: "duplicate_in_file", duplicateOfRow: 0 });
    expect(tags.get(4)).toMatchObject({ duplicate: "duplicate_in_file", duplicateOfRow: 1 });
  });

  it("never tags legitimately distinct transactions as duplicates", () => {
    const rows = [
      row({ rowIndex: 0, description: "Client payment", amount: "150000.00" }),
      row({ rowIndex: 1, description: "Client payment", amount: "50000.00" }),
      row({ rowIndex: 2, description: "Office supplies", amount: "25000.00", reference: "inv-1" }),
      row({ rowIndex: 3, description: "Office supplies", amount: "25000.00", reference: "inv-2" }),
      row({ rowIndex: 4, description: "Office supplies", amount: "25000.00", type: "expense" }),
    ];
    const tags = tagDuplicates(rows);
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(tags.get(idx)?.duplicate).toBe("new");
    }
  });
});