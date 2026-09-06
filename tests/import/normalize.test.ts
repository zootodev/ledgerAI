import { describe, expect, it } from "vitest";
import {
  normalizeText,
  parseAmount,
  parseDate,
  inferTypeFromLabel,
  normalizeImportRow,
} from "@/lib/import/normalize";
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