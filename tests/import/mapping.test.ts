import { describe, expect, it } from "vitest";
import { detectColumns, validateMapping } from "@/lib/import/mapping";

describe("detectColumns", () => {
  it("detects a standard statement header", () => {
    const mapping = detectColumns([
      "Transaction Date",
      "Description",
      "Amount",
      "Reference",
    ]);
    expect(mapping).toEqual({
      date: "Transaction Date",
      description: "Description",
      amount: "Amount",
      reference: "Reference",
    });
  });

  it("maps debit/credit columns for a withdrawal/deposit style file", () => {
    const mapping = detectColumns([
      "Date",
      "Narration",
      "Withdrawal",
      "Deposit",
      "Balance",
    ]);
    expect(mapping.date).toBe("Date");
    expect(mapping.description).toBe("Narration");
    expect(mapping.debit).toBe("Withdrawal");
    expect(mapping.credit).toBe("Deposit");
    expect(mapping.amount).toBeUndefined();
    expect(mapping.type).toBeUndefined();
  });

  it("falls back to token matches for less standard headers", () => {
    const mapping = detectColumns(["TXN DATE", "DETAILS", "Amount", "Ref"]);
    expect(mapping.date).toBe("TXN DATE");
    expect(mapping.description).toBe("DETAILS");
    expect(mapping.amount).toBe("Amount");
    expect(mapping.reference).toBe("Ref");
  });

  it("never maps an unrecognized column", () => {
    const mapping = detectColumns(["Branch Code", "Bank Name", "Customer ID"]);
    expect(mapping).toEqual({});
  });

  it("uses each column at most once", () => {
    const mapping = detectColumns(["Date", "Transaction Date"]);
    expect(mapping.date).toBe("Date");
  });
});

describe("detectColumns pair-header aliases", () => {
  it("auto-maps an Income/Expense pair without a single Amount field", () => {
    const mapping = detectColumns(["Date", "Description", "Income", "Expense"]);
    expect(mapping.date).toBe("Date");
    expect(mapping.description).toBe("Description");
    expect(mapping.credit).toBe("Income");
    expect(mapping.debit).toBe("Expense");
    expect(mapping.amount).toBeUndefined();
  });

  it("auto-maps Money In / Money Out headers case-insensitively", () => {
    const mapping = detectColumns(["date", "Details", "money in", "Money Out"]);
    expect(mapping.credit).toBe("money in");
    expect(mapping.debit).toBe("Money Out");
  });

  it("ignores punctuation and underscores in pair headers", () => {
    const mapping = detectColumns(["Date", "Description", "Money_In", "Money-Out", "CR.", "DR."]);
    expect(mapping.credit).toBe("Money_In");
    expect(mapping.debit).toBe("Money-Out");
    expect(mapping.reference).toBeUndefined();
  });

  it("auto-maps CR/DR and paid-in/paid-out aliases", () => {
    const mapping = detectColumns(["Date", "Narration", "Paid In", "Paid Out"]);
    expect(mapping.credit).toBe("Paid In");
    expect(mapping.debit).toBe("Paid Out");
  });

  it.each([
    [["Date", "Description", "Amt"], "Amt"],
    [["Date", "Description", "Total"], "Total"],
    [["Date", "Description", "Naira"], "Naira"],
    [["Date", "Description", "NGN"], "NGN"],
    [["Date", "Description", "Value"], "Value"],
  ])("detects single-amount aliases for %j", (headers, expectedAmount) => {
    const mapping = detectColumns(headers as string[]);
    expect(mapping.amount).toBe(expectedAmount);
    expect(mapping.debit).toBeUndefined();
    expect(mapping.credit).toBeUndefined();
  });
});

describe("validateMapping", () => {
  const headers = ["Date", "Description", "Amount", "Debit", "Credit"];

  it("accepts a single Amount mapping", () => {
    expect(
      validateMapping(
        { date: "Date", description: "Description", amount: "Amount" },
        headers,
      ),
    ).toEqual([]);
  });

  it("accepts a Debit/Credit pair without Amount", () => {
    expect(
      validateMapping(
        { date: "Date", description: "Description", debit: "Debit", credit: "Credit" },
        headers,
      ),
    ).toEqual([]);
  });

  it("requires date and description", () => {
    const issues = validateMapping({ amount: "Amount" }, headers);
    const fields = issues.map((i) => i.field);
    expect(fields).toContain("date");
    expect(fields).toContain("description");
  });

  it("requires an amount source", () => {
    const issues = validateMapping({ date: "Date", description: "Description" }, headers);
    expect(issues.some((i) => i.message.includes("amount source"))).toBe(true);
  });

  it("flags references to columns that do not exist", () => {
    const issues = validateMapping(
      { date: "Date", description: "Description", amount: "Value" },
      headers,
    );
    expect(issues.some((i) => i.message.includes("Value"))).toBe(true);
  });
});