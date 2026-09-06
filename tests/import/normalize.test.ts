import { describe, expect, it } from "vitest";
import {
  normalizeText,
  parseAmount,
  parseDate,
  inferTypeFromLabel,
  normalizeImportRow,
  isAbsentAmountCell,
} from "@/lib/import/normalize";
import { parseCsv } from "@/lib/import/parse-csv";
import { detectColumns } from "@/lib/import/mapping";
import { buildImportPreview, shouldIncludeByDefault } from "@/lib/import/preview";
import { tagDuplicates } from "@/lib/import/dedupe";
import type { ColumnMapping, RawImportRow } from "@/lib/import/types";

describe("normalizeText", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeText("  coffee    and   tea ")).toBe("coffee and tea");
  });
});

describe("parseAmount", () => {
  it.each([
    ["1250.50", "1250.50"],
    ["1250.5", "1250.50"],
    ["1250", "1250.00"],
    ["1,250.50", "1250.50"],
    ["1,250", "1250.00"],
    ["₦5,000", "5000.00"],
    ["$5,000.00", "5000.00"],
    ["  2,500.00  ", "2500.00"],
  ])("parses %j as %j", (raw, expected) => {
    expect(parseAmount(raw as string)).toEqual({ value: expected });
  });

  it.each([
    ["(1,250.50)", "1250.50"],
    ["(500.00)", "500.00"],
  ])("strips accounting parentheses after sign handling in %j", (raw, expected) => {
    const result = parseAmount(raw as string);
    expect(result.value).toBe(expected);
  });

  it.each([
    ["abc"],
    ["2500.123"],
    ["1,25"],
    ["1.250,50"],
    [""],
    ["0"],
    ["0.00"],
    [",500"],
  ])("rejects %j", (raw) => {
    expect(parseAmount(raw as string).error).toBeTruthy();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-01-05", "2026-01-05"],
    ["2026/01/05", "2026-01-05"],
    ["2026.01.05", "2026-01-05"],
    ["2026-1-5", "2026-01-05"],
  ])("parses ISO date %j as %j", (raw, expected) => {
    expect(parseDate(raw as string)).toEqual({ value: expected });
  });

  it("parses unambiguous day-first dates", () => {
    expect(parseDate("25/12/2026")).toEqual({ value: "2026-12-25" });
    expect(parseDate("25-12-2026")).toEqual({ value: "2026-12-25" });
  });

  it("flags ambiguous day-first dates (day-first ordered) when both parts are small", () => {
    const result = parseDate("12/02/2026");
    expect(result.value).toBe("2026-02-12");
    expect(result.warning).toContain("ambiguous");
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026").error).toBeTruthy();
    expect(parseDate("13-13-2026").error).toBeTruthy();
    expect(parseDate("hello").error).toBeTruthy();
    expect(parseDate("").error).toBeTruthy();
  });
});

describe("inferTypeFromLabel", () => {
  it.each([
    ["Credit", "income"],
    ["cr", "income"],
    ["Deposit", "income"],
    ["Debit", "expense"],
    ["dr", "expense"],
    ["Withdrawal", "expense"],
    ["transfer", "transfer"],
    ["Internal", "transfer"],
    ["between accounts", "transfer"],
  ])("maps %j to %j", (label, expected) => {
    expect(inferTypeFromLabel(label as string)).toBe(expected);
  });

  it("returns null for unknown labels", () => {
    expect(inferTypeFromLabel("misc")).toBeNull();
    expect(inferTypeFromLabel("")).toBeNull();
  });
});

const RAW = (values: Record<string, string>, sourceRow = 2): RawImportRow => ({
  sourceRow,
  values,
});

const AMOUNT_MAP: ColumnMapping = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  reference: "Reference",
};

describe("isAbsentAmountCell", () => {
  it.each(["", "   ", "-", "0", "0.00", "0.0", "₦0.00", "0,00", "0,000", "-0.00", "(0.00)"])(
    "treats %j as an absent pair cell",
    (raw) => {
      expect(isAbsentAmountCell(raw as string)).toBe(true);
    },
  );

  it.each(["1", "0.01", "12000", "1,250.50", "₦5,000", "abc", "0x"])(
    "treats %j as a present pair cell",
    (raw) => {
      expect(isAbsentAmountCell(raw as string)).toBe(false);
    },
  );
});

describe("Debit/Credit zero-filled pair", () => {
  const dc: ColumnMapping = { date: "Date", description: "Description", debit: "Debit", credit: "Credit" };

  it("treats a zero-filled unused side as absent and resolves the real side", () => {
    const credit = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Sales", Debit: "0", Credit: "12000" }),
      dc,
      0,
    );
    expect(credit.errors).toEqual([]);
    expect(credit.type).toBe("income");
    expect(credit.amount).toBe("12000.00");

    const debit = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Rent", Debit: "18500.00", Credit: "0" }),
      dc,
      0,
    );
    expect(debit.errors).toEqual([]);
    expect(debit.type).toBe("expense");
    expect(debit.amount).toBe("18500.00");
  });

  it.each([
    ["0.00", "2500", "2500.00"],
    ["₦0.00", "1200", "1200.00"],
    ["-", "4500", "4500.00"],
    ["0,00", "3150", "3150.00"],
    ["", "700", "700.00"],
  ])("treats an absent credit variant %j as zero and reads the debit side", (creditCell, debitCell, amount) => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Pay", Debit: debitCell, Credit: creditCell }),
      dc,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("expense");
    expect(row.amount).toBe(amount);
  });

  it("flags a row where both sides of the pair are non-zero", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Ambiguous", Debit: "500.00", Credit: "300.00" }),
      dc,
      0,
    );
    expect(row.errors.some((e) => e.includes("row has both debit and credit amounts"))).toBe(true);
    expect(row.amount).toBe("");
  });

  it("flags a row where both sides of the pair are absent", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Empty pair", Debit: "0", Credit: "0.00" }),
      dc,
      0,
    );
    expect(row.errors).toContain("row has no amount");
    expect(row.amount).toBe("");
  });
});

describe("Debit/Credit pair end-to-end (zero-filled columns)", () => {
  const CSV = [
    "Date,Description,Income,Expense",
    "2026-01-04,Bakery sales,12000,0",
    "2026-01-04,Rent,0,18500",
    "2026-01-05,POS receipts,500.50,0.00",
    "2026-01-05,Stationery,₦0.00,2500",
    "2026-01-06,Consulting,2000,-",
    "2026-01-06,Internet,0,4500",
    "2026-01-07,Sales,3000,",
    "2026-01-07,Courier,0,1500.75",
  ].join("\n");

  it("auto-maps Income/Expense, normalizes all 8 rows as valid with correct types and amounts", () => {
    const parsed = parseCsv(CSV);
    expect(parsed.errors).toEqual([]);
    const mapping = detectColumns(parsed.headers);
    expect(mapping.credit).toBe("Income");
    expect(mapping.debit).toBe("Expense");
    expect(mapping.amount).toBeUndefined();

    const normalized = parsed.rows.map((raw, i) => normalizeImportRow(raw, mapping, i));
    expect(normalized.every((row) => row.errors.length === 0)).toBe(true);

    const { rows, summary } = buildImportPreview(normalized, new Map(), new Map());
    expect(summary.valid).toBe(8);
    expect(summary.invalid).toBe(0);
    expect(rows.map((r) => [r.type, r.amount])).toEqual([
      ["income", "12000.00"],
      ["expense", "18500.00"],
      ["income", "500.50"],
      ["expense", "2500.00"],
      ["income", "2000.00"],
      ["expense", "4500.00"],
      ["income", "3000.00"],
      ["expense", "1500.75"],
    ]);
  });
});

describe("normalizeImportRow", () => {
  it("normalizes a positive amount as income", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Ugift", Amount: "2,500.00" }),
      AMOUNT_MAP,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("income");
    expect(row.amount).toBe("2500.00");
    expect(row.date).toBe("2026-01-05");
    expect(row.description).toBe("Ugift");
  });

  it("treats a negative amount as expense and stores its absolute value", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Dstv", Amount: "-150.00" }),
      AMOUNT_MAP,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("expense");
    expect(row.amount).toBe("150.00");
  });

  it("accepts parenthesized (accounting) amounts as expenses", () => {
    const row = normalizeImportRow(
      RAW({ Date: "01/01/2026", Description: "Internet", Amount: "(10,000.00)" }),
      AMOUNT_MAP,
      0,
    );
    expect(row.type).toBe("expense");
    expect(row.amount).toBe("10000.00");
  });

  it("rejects zero amounts and non-numeric amounts", () => {
    for (const amount of ["0", "0.00", "abc", "1.2.3"]) {
      const row = normalizeImportRow(
        RAW({ Date: "2026-01-05", Description: "Bad", Amount: amount }),
        AMOUNT_MAP,
        0,
      );
      expect(row.errors.length).toBeGreaterThan(0);
      expect(row.amount).toBe("");
    }
  });

  it("flags a missing description", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "  ", Amount: "10.00" }),
      AMOUNT_MAP,
      0,
    );
    expect(row.errors).toContain("missing description");
  });

  it("uses Debit/Credit columns and forbids populating both without a transfer type", () => {
    const dc: ColumnMapping = { date: "Date", description: "Description", debit: "Debit", credit: "Credit" };
    const debit = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Cashout", Debit: "500.00" }),
      dc,
      0,
    );
    expect(debit.type).toBe("expense");
    expect(debit.amount).toBe("500.00");

    const both = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Ambiguous", Debit: "500.00", Credit: "300.00" }),
      dc,
      0,
    );
    expect(both.errors.some((e) => e.includes("both debit and credit"))).toBe(true);
  });

  it("produces a transfer only when the type column says so", () => {
    const map: ColumnMapping = { ...AMOUNT_MAP, type: "Type" };
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Own transfer", Amount: "1000.00", Type: "Transfer" }),
      map,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("transfer");
  });

  it("keeps the file's category text and a rewritten reference", () => {
    const map: ColumnMapping = { ...AMOUNT_MAP, category: "Category" };
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Groceries", Amount: "50.00", Category: "Food", Reference: "REF-1" }),
      map,
      0,
    );
    expect(row.category).toBe("Food");
    expect(row.reference).toBe("REF-1");
  });
});

describe("explicit Type column is authoritative over amount sign", () => {
  const TYPED_MAP: ColumnMapping = { ...AMOUNT_MAP, type: "Type" };

  const cases: Array<{
    typeCell: string;
    amount: string;
    expectedType: string;
    expectedAmount: string;
    expectedError: boolean;
  }> = [
    { typeCell: "expense", amount: "+1500", expectedType: "expense", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "expense", amount: "-1500", expectedType: "expense", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "income", amount: "+1500", expectedType: "income", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "income", amount: "-1500", expectedType: "income", expectedAmount: "", expectedError: true },
    { typeCell: "transfer", amount: "+1500", expectedType: "transfer", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "transfer", amount: "-1500", expectedType: "transfer", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "", amount: "-1500", expectedType: "expense", expectedAmount: "1500.00", expectedError: false },
    { typeCell: "", amount: "+1500", expectedType: "income", expectedAmount: "1500.00", expectedError: false },
  ];

  it.each(cases)(
    "type=%j amount=%j -> type %j amount %j (error=%j)",
    ({ typeCell, amount, expectedType, expectedAmount, expectedError }) => {
      const values: Record<string, string> = {
        Date: "2026-01-05",
        Description: "Row",
        Amount: amount,
      };
      if (typeCell !== "") values.Type = typeCell;
      const row = normalizeImportRow(RAW(values), TYPED_MAP, 0);

      expect(row.errors.some((e) => e.includes("type conflicts with the amount sign"))).toBe(
        expectedError,
      );
      if (expectedError) {
        expect(row.amount).toBe("");
      } else {
        expect(row.errors).toEqual([]);
        expect(row.type).toBe(expectedType);
        expect(row.amount).toBe(expectedAmount);
      }
    },
  );

  it("rectifies the reported bug: type=expense with an unsigned positive amount is valid", () => {
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Office rent", Amount: "1500.00", Type: "expense" }),
      TYPED_MAP,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("expense");
    expect(row.amount).toBe("1500.00");
  });

  it("blank or unrecognized type cell falls back to the sign for that row", () => {
    for (const [typeCell, amount, expectedType] of [
      ["", "-1500", "expense"],
      ["", "+1500", "income"],
      ["misc", "-1500", "expense"],
    ] as const) {
      const values: Record<string, string> = { Date: "2026-01-05", Description: "Row", Amount: amount };
      if (typeCell !== "") values.Type = typeCell;
      const row = normalizeImportRow(RAW(values), TYPED_MAP, 0);
      expect(row.errors).toEqual([]);
      expect(row.type).toBe(expectedType);
      expect(row.amount).toBe("1500.00");
    }
  });

  it("documents precedence: an explicit Type label wins over the Debit/Credit pair", () => {
    const map: ColumnMapping = {
      date: "Date",
      description: "Description",
      debit: "Debit",
      credit: "Credit",
      type: "Type",
    };
    // The Credit side is populated but Type explicitly says "expense": the
    // recognized Type label is authoritative for direction; the amount still
    // comes from the populated Credit column.
    const row = normalizeImportRow(
      RAW({ Date: "2026-01-05", Description: "Sales", Credit: "12000.00", Type: "expense" }),
      map,
      0,
    );
    expect(row.errors).toEqual([]);
    expect(row.type).toBe("expense");
    expect(row.amount).toBe("12000.00");
  });
});

describe("end-to-end: explicit Type column with unsigned positive amounts (the reported bug)", () => {
  // Realistic bank/accounting export: a Type column plus single positive
  // Amount column. Row 20 is an EXACT in-file duplicate of row 1 (same
  // date/type/description/amount/reference). Row 21 is a NEAR duplicate of
  // row 4 (same description/amount/reference but a DIFFERENT date).
  const CSV = [
    "Date,Type,Description,Amount,Reference",
    "2026-01-02,expense,SHOPRITE MALL,15000.00,REF-001",
    "2026-01-02,expense,TOTALENERGIES FUEL,8500.00,REF-002",
    "2026-01-03,income,Client payment,150000.00,REF-003",
    "2026-01-03,expense,UBER TRIP,3500.00,REF-004",
    "2026-01-04,expense,AIRTEL RECHARGE 500MB,2500.00,REF-005",
    "2026-01-04,expense,MTN MOBILE MONEY,4800.00,REF-006",
    "2026-01-05,income,POS sales,62000.00,REF-007",
    "2026-01-05,expense,Office supplies,12200.00,REF-008",
    "2026-01-06,expense,JUMIA SHOPPING ORDER,18750.00,REF-009",
    "2026-01-06,expense,NETFLIX SUBSCRIPTION,17400.00,REF-010",
    "2026-01-07,income,Refund from vendor,9500.00,REF-011",
    "2026-01-07,expense,DHL SHIPMENT,24000.00,REF-012",
    "2026-01-08,expense,KFC BUCKET MEAL,13500.00,REF-013",
    "2026-01-08,expense,GLO DATA BUNDLE,11000.00,REF-014",
    "2026-01-09,expense,SPOTIFY PREMIUM,9900.00,REF-015",
    "2026-01-09,transfer,Own savings transfer,50000.00,REF-016",
    "2026-01-10,expense,9MOBILE DATA BUNDLE,6800.00,REF-017",
    "2026-01-10,income,Salary credit,250000.00,REF-018",
    "2026-01-11,expense,FIDELITY BANK CHARGES,1750.00,REF-019",
    "2026-01-02,expense,SHOPRITE MALL,15000.00,REF-001",
    "2026-01-13,expense,UBER TRIP,3500.00,REF-004",
  ].join("\n");

  const EXPECTED: Array<{ desc: string; type: string; amount: string }> = [
    { desc: "SHOPRITE MALL", type: "expense", amount: "15000.00" },
    { desc: "TOTALENERGIES FUEL", type: "expense", amount: "8500.00" },
    { desc: "Client payment", type: "income", amount: "150000.00" },
    { desc: "UBER TRIP", type: "expense", amount: "3500.00" },
    { desc: "AIRTEL RECHARGE 500MB", type: "expense", amount: "2500.00" },
    { desc: "MTN MOBILE MONEY", type: "expense", amount: "4800.00" },
    { desc: "POS sales", type: "income", amount: "62000.00" },
    { desc: "Office supplies", type: "expense", amount: "12200.00" },
    { desc: "JUMIA SHOPPING ORDER", type: "expense", amount: "18750.00" },
    { desc: "NETFLIX SUBSCRIPTION", type: "expense", amount: "17400.00" },
    { desc: "Refund from vendor", type: "income", amount: "9500.00" },
    { desc: "DHL SHIPMENT", type: "expense", amount: "24000.00" },
    { desc: "KFC BUCKET MEAL", type: "expense", amount: "13500.00" },
    { desc: "GLO DATA BUNDLE", type: "expense", amount: "11000.00" },
    { desc: "SPOTIFY PREMIUM", type: "expense", amount: "9900.00" },
    { desc: "Own savings transfer", type: "transfer", amount: "50000.00" },
    { desc: "9MOBILE DATA BUNDLE", type: "expense", amount: "6800.00" },
    { desc: "Salary credit", type: "income", amount: "250000.00" },
    { desc: "FIDELITY BANK CHARGES", type: "expense", amount: "1750.00" },
    { desc: "SHOPRITE MALL", type: "expense", amount: "15000.00" },
    { desc: "UBER TRIP", type: "expense", amount: "3500.00" },
  ];

  it("normalizes all 21 rows valid, auto-maps the Type column, and resolves the dedupe split exactly", () => {
    const parsed = parseCsv(CSV);
    expect(parsed.errors).toEqual([]);
    const mapping = detectColumns(parsed.headers);
    expect(mapping.type).toBe("Type");
    expect(mapping.amount).toBe("Amount");

    const normalized = parsed.rows.map((raw, i) => normalizeImportRow(raw, mapping, i));

    // The reported bug: ZERO of the positive-amount + type=expense rows may
    // fail. No row carries a "type conflicts with the amount sign" error.
    expect(normalized).toHaveLength(21);
    for (const row of normalized) {
      expect(
        row.errors.some((e) => e.includes("type conflicts with the amount sign")),
      ).toBe(false);
    }
    expect(normalized.every((row) => row.errors.length === 0)).toBe(true);

    // Per-row types and amounts.
    expect(normalized.map((r) => [r.description, r.type, r.amount])).toEqual(
      EXPECTED.map((e) => [e.desc, e.type, e.amount]),
    );

    // Empty existing-fingerprint set: all rows judged by the in-file key.
    const tags = tagDuplicates(normalized);
    const rows = buildImportPreview(normalized, new Map(), tags).rows;

    // in-file fingerprint excludes the date, so row 20 (exact dup of row 1)
    // AND row 21 (same desc/amount/ref, different date) are both duplicate.
    const dupRows = rows.filter((r) => r.duplicate === "duplicate_in_file");
    expect(dupRows.map((r) => r.description).sort()).toEqual(["SHOPRITE MALL", "UBER TRIP"]);

    // 21 valid, 2 in-file duplicates, 19 new (included by default).
    const summary = buildImportPreview(normalized, new Map(), tags).summary;
    expect(summary.total).toBe(21);
    expect(summary.valid).toBe(21);
    expect(summary.invalid).toBe(0);
    expect(summary.duplicates).toBe(2);
    expect(summary.readyToImport).toBe(19);

    const selected = rows.filter((r) => shouldIncludeByDefault(r));
    expect(selected).toHaveLength(19);
  });
});
