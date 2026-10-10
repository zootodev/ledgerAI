import { describe, expect, it, vi } from "vitest";
import {
  PDF_IMPORT_HEADERS,
  extractTransactionsFromText,
  parsePdf,
} from "@/lib/import/parse-pdf";
import { normalizeImportRow } from "@/lib/import/normalize";
import type { ColumnMapping, RawImportRow } from "@/lib/import/types";

const pdfMock = vi.hoisted(() => ({ text: "", params: null as unknown }));
const destroyMock = vi.hoisted(() => ({ destroy: vi.fn() }));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText(params?: unknown) {
      pdfMock.params = params ?? null;
      return { text: pdfMock.text };
    }
    async destroy() {
      destroyMock.destroy();
    }
  },
}));

const DEBIT_CREDIT_MAPPING: ColumnMapping = {
  date: "Date",
  description: "Description",
  debit: "Debit",
  credit: "Credit",
};

const twoColumnText = [
  "ACME BANK — STATEMENT OF ACCOUNT",
  "Account Name: Tunde Enterprises",
  "Date Description Debit Credit Balance",
  "05 Jan 2026 POS UBA ATM LAGOS 1,250.00 0.00 45,750.00",
  "06 Jan 2026 Customer payment 0.00 25,000.00 70,750.00",
  "08 Jan 2026 Transfer to savings 5,000.00 0.00 65,750.00",
].join("\n");

const singleAmountText = [
  "KUDA — TRANSACTION HISTORY",
  "Date Details Amount Balance",
  "05/01/2026 UBER TRIP NG 2,500.00 47,500.00",
  "07/01/2026 Salary from ACME Ltd 150,000.00 197,500.00",
  "10/01/2026 Transfer to landlord (3,500.00) 194,000.00",
  "2026-01-12 POS MTN Airtime 750.50 193,249.50",
  "16 Jan 2026 ATM cash withdrawal 1,250.00 Dr 196,999.50",
].join("\n");

function normalizeAll(rows: RawImportRow[]) {
  return rows.map((raw, index) =>
    normalizeImportRow(raw, DEBIT_CREDIT_MAPPING, index),
  );
}

describe("extractTransactionsFromText — two-column statements", () => {
  const rows = extractTransactionsFromText(twoColumnText);

  it("extracts each date+amount line as a row with synthetic headers", () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.sourceRow)).toEqual([4, 5, 6]);
    expect(rows[0].values).toEqual({
      Date: "2026-01-05",
      Description: "POS UBA ATM LAGOS",
      Debit: "1,250.00",
      Credit: "0.00",
    });
    expect(rows[1].values.Date).toBe("2026-01-06");
    expect(rows[2].values.Date).toBe("2026-01-08");
  });

  it("ignores header, narrative and account lines", () => {
    const values = rows.map((r) => r.values.Description);
    expect(values.join(" ")).not.toContain("Statement");
    expect(values.join(" ")).not.toContain("Tunde Enterprises");
  });

  it("flows through normalization as expense/income with no errors", () => {
    const normalized = normalizeAll(rows);
    expect(normalized[0]).toMatchObject({
      type: "expense",
      amount: "1250.00",
      errors: [],
    });
    expect(normalized[1]).toMatchObject({
      type: "income",
      amount: "25000.00",
      errors: [],
    });
    expect(normalized[2]).toMatchObject({
      type: "expense",
      amount: "5000.00",
      errors: [],
    });
  });
});

describe("extractTransactionsFromText — single-amount statements", () => {
  const rows = extractTransactionsFromText(singleAmountText);

  it("treats positive amounts as credit (income) and keeps balances out", () => {
    expect(rows).toHaveLength(5);
    expect(rows[0].values).toEqual({
      Date: "2026-01-05",
      Description: "UBER TRIP NG",
      Debit: "",
      Credit: "2,500.00",
    });
    expect(rows[1].values.Credit).toBe("150,000.00");
    expect(rows[3].values.Credit).toBe("750.50");
  });

  it("routes parenthesised negatives to the debit side", () => {
    expect(rows[2].values).toEqual({
      Date: "2026-01-10",
      Description: "Transfer to landlord",
      Debit: "3,500.00",
      Credit: "",
    });
  });

  it("honours a trailing Dr marker over the positive default", () => {
    expect(rows[4].values).toEqual({
      Date: "2026-01-16",
      Description: "ATM cash withdrawal",
      Debit: "1,250.00",
      Credit: "",
    });
  });

  it("normalizes to income/expense without ambiguity errors", () => {
    const normalized = normalizeAll(rows);
    expect(normalized.map((r) => r.type)).toEqual([
      "income",
      "income",
      "expense",
      "income",
      "expense",
    ]);
    expect(normalized.every((r) => r.errors.length === 0)).toBe(true);
    expect(normalized.map((r) => r.amount)).toEqual([
      "2500.00",
      "150000.00",
      "3500.00",
      "750.50",
      "1250.00",
    ]);
  });
});

describe("extractTransactionsFromText — Moniepoint money-in/out statements", () => {
  const moniepointText = [
    "IFEOLUWANI JOSHUA OLUFUNMILAYO HOUSE 16, NORTHGATE, IBADAN",
    "Account Number 2034321500",
    "Opening Balance ₦22,035.20",
    "Date/Time Money In Money Out Category To/From Description Balance",
    "08/01/26 06:24:32 ₦2,000.00 outward transfer Squad Checkout/08240 Gtbank Plc data ₦20,035.20",
    "08/01/26 10:14:07 ₦10,000.00 inward transfer Alexander Olufunmilayo Opay transfer from alexander ₦30,035.20",
    "09/01/26 09:35:25 ₦3,000.00 outward transfer Oladele Toyin Fcmb ysushq ₦12,835.20",
    "09/01/26 21:27:42 ₦500.00 outward transfer Timileyin Opay hais ₦7,335.20",
  ].join("\n");

  const rows = extractTransactionsFromText(moniepointText);

  it("reads two-digit-year dates and sends outward/inward rows to the right side", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.values.Date)).toEqual([
      "2026-01-08",
      "2026-01-08",
      "2026-01-09",
      "2026-01-09",
    ]);
    expect(rows[0].values).toEqual({
      Date: "2026-01-08",
      Description: "outward transfer Squad Checkout/08240 Gtbank Plc data",
      Debit: "2,000.00",
      Credit: "",
    });
    expect(rows[1].values).toEqual({
      Date: "2026-01-08",
      Description: "inward transfer Alexander Olufunmilayo Opay transfer from alexander",
      Debit: "",
      Credit: "10,000.00",
    });
    expect(rows[2].values.Debit).toBe("3,000.00");
    expect(rows[3].values.Debit).toBe("500.00");
  });

  it("keeps the running balance and summary lines out of the rows", () => {
    expect(rows.map((r) => r.values.Credit)).toEqual(["", "10,000.00", "", ""]);
    expect(rows.map((r) => r.values.Description).join(" ")).not.toContain("Opening");
    expect(rows.map((r) => r.values.Description).join(" ")).not.toContain("Account Number");
  });
});

describe("extractTransactionsFromText — fragmented Moniepoint layout", () => {
  // The deployed PDF text layer breaks every cell onto its own line (~18 chars
  // per line), so no physical line ever holds a date and an amount together.
  const fragmentedText = [
    "IFEOLUWANI JOSHUA OLUFUNMILAYO",
    "Account Number 2034321500",
    "Opening Balance",
    "₦22,035.20",
    "Summary",
    "Money In",
    "Money Out",
    "₦1,788,993.56",
    "₦1,811,020.79",
    "Date/Time",
    "Money In",
    "Money Out",
    "Category",
    "To/From",
    "Description",
    "Balance",
    "08/01/26",
    "06:24:32",
    "₦2,000.00",
    "outward",
    "transfer",
    "Squad Checkout/08240",
    "data",
    "₦20,035.20",
    "08/01/26",
    "10:14:07",
    "₦10,000.00",
    "inward",
    "transfer",
    "Alexander Tolani Olufunmilayo",
    "transfer from alexander",
    "₦30,035.20",
    "09/01/26",
    "09:35:25",
    "₦3,000.00",
    "outward",
    "transfer",
    "Oladele Toyin",
    "Fcmb",
    "₦12,835.20",
  ].join("\n");

  const rows = extractTransactionsFromText(fragmentedText);

  it("rebuilds rows from column positions when every cell is its own line", () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.values.Date)).toEqual([
      "2026-01-08",
      "2026-01-08",
      "2026-01-09",
    ]);
    expect(rows[0]).toMatchObject({
      values: {
        Debit: "2,000.00",
        Credit: "",
        Description: "outward transfer Squad Checkout/08240 data",
      },
    });
    expect(rows[1]).toMatchObject({
      values: {
        Debit: "",
        Credit: "10,000.00",
        Description: "inward transfer Alexander Tolani Olufunmilayo transfer from alexander",
      },
    });
    expect(rows[2]).toMatchObject({
      values: { Debit: "3,000.00", Credit: "" },
    });
  });

  it("never turns the opening balance or summary into a transaction", () => {
    const amounts = rows.flatMap((r) => [r.values.Debit, r.values.Credit]);
    expect(amounts).not.toContain("22,035.20");
    expect(amounts).not.toContain("1,788,993.56");
    expect(amounts).not.toContain("1,811,020.79");
    expect(amounts).not.toContain("20,035.20");
    expect(amounts).not.toContain("30,035.20");
  });
});

describe("extractTransactionsFromText — date formats and skips", () => {
  it("parses every supported date format into ISO", () => {
    const text = [
      "05.01.2026 Dot format 10.00 0.00",
      "5 February 2026 Text month 20.00 0.00",
      "March 7, 2026 Month first 30.00 0.00",
      "2026/03/09 ISO slash 40.00 0.00",
      "05-Jan-2026 Hyphen day-first 50.00 0.00",
      "Jan-05-2026 Hyphen month-first 60.00 0.00",
    ].join("\n");
    const rows = extractTransactionsFromText(text);
    expect(rows.map((r) => r.values.Date)).toEqual([
      "2026-01-05",
      "2026-02-05",
      "2026-03-07",
      "2026-03-09",
      "2026-01-05",
      "2026-01-05",
    ]);
  });

  it("skips lines with no date and lines with no well-formed amount", () => {
    const text = [
      "Account Number 0123456789",
      "09 Jan 2026 — no movements on this day",
      "11 Jan 2026 Reference 1234 processed",
      "12 Jan 2026 POS SHOP 5,000.00",
    ].join("\n");
    const rows = extractTransactionsFromText(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].values.Description).toBe("POS SHOP");
  });

  it("only treats debit/credit keywords on the SAME line as a layout signal", () => {
    const text = [
      "Debit card withdrawals are shown below",
      "Credit interest is added monthly",
      "05/01/2026 Salary 100,000.00 100,000.00",
    ].join("\n");
    const rows = extractTransactionsFromText(text);
    expect(rows).toHaveLength(1);
    // Single-amount mode: positive -> credit, not "first amount = debit".
    expect(rows[0].values.Credit).toBe("100,000.00");
    expect(rows[0].values.Debit).toBe("");
  });

  it("returns an empty list when the text has no statement rows", () => {
    expect(extractTransactionsFromText("Thank you for banking with us.\n")).toEqual([]);
  });
});

describe("parsePdf", () => {
  it("returns synthetic headers and extracted rows", async () => {
    pdfMock.text = twoColumnText;
    const result = await parsePdf(new Uint8Array([1, 2, 3]));
    expect(result.headers).toEqual([...PDF_IMPORT_HEADERS]);
    expect(result.headers).toEqual(["Date", "Description", "Debit", "Credit"]);
    expect(result.rows).toHaveLength(3);
    expect(destroyMock.destroy).toHaveBeenCalled();
  });

  it("requests line-enforced extraction so EOL-less statements still split by row", async () => {
    pdfMock.text = twoColumnText;
    await parsePdf(new Uint8Array([1, 2, 3]));
    expect(pdfMock.params).toEqual({ lineEnforce: true, itemJoiner: " " });
  });

  it("throws an actionable error when no transactions can be found", async () => {
    pdfMock.text = [
      "Dear Customer,",
      "Your monthly statement dated 05 Jan 2026 has been generated for your account",
      "with reference number 123456789012. The opening balance for this period was",
      "250,000.00 and you made several purchases, withdrawals and transfers during",
      "the month. Please contact your branch if you have any questions about any",
      "transaction listed in the enclosed pages. Thank you for banking with us.",
    ].join("\n");
    await expect(parsePdf(new Uint8Array([1]))).rejects.toThrow(
      /couldn't find any transactions in this PDF/,
    );
  });

  it("tells the user the PDF is a scanned image when there is no text layer", async () => {
    pdfMock.text = "   ";
    await expect(parsePdf(new Uint8Array([1, 2]))).rejects.toThrow(
      /no readable text layer/,
    );
  });
});
