import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/parse-csv";

describe("parseCsv", () => {
  it("parses headers and data rows, trimming cell whitespace", () => {
    const { headers, rows, errors } = parseCsv(
      "Date, Description, Amount\n2026-01-05, UBER ride , 2500.00\n",
    );
    expect(errors).toHaveLength(0);
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].values.Description).toBe("UBER ride");
    expect(rows[0].sourceRow).toBe(2);
  });

  it("skips blank lines but keeps physical source-row numbers", () => {
    const { rows } = parseCsv("Date,Amount\n\n\n2026-01-05,10.00\n\n2026-01-06,20.00\n");
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceRow).toBe(4);
    expect(rows[1].sourceRow).toBe(6);
  });

  it("renames repeated headers so each column stays referenceable", () => {
    const { headers } = parseCsv("Amount,Amount,Description\n1,2,x\n");
    expect(headers).toEqual(["Amount", "Amount (2)", "Description"]);
  });

  it("returns empty rows for a header-only file", () => {
    const result = parseCsv("Date,Description\n");
    expect(result.headers).toEqual(["Date", "Description"]);
    expect(result.rows).toHaveLength(0);
  });

  it("keeps quoted commas and newlines intact", () => {
    const { rows } = parseCsv('Date,Description\n2026-01-05,"Coffee, deluxe"\n');
    expect(rows[0].values.Description).toBe("Coffee, deluxe");
  });

  it("reports parse errors rather than throwing", () => {
    const { errors } = parseCsv('Date,Description\n2026-01-05,"unterminated\n');
    expect(errors.length).toBeGreaterThan(0);
  });
});