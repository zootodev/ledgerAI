import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseXlsx } from "@/lib/import/parse-xlsx";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseXlsx", () => {
  it("round-trips headers, text and numeric cells", () => {
    const buffer = workbookBuffer([
      ["Date", "Description", "Amount"],
      ["2026-01-05", "UBER ride", 2500.5],
      ["2026-01-06", "Coffee shop", "500.00"],
    ]);
    const { headers, rows, errors } = parseXlsx(buffer);
    expect(errors).toHaveLength(0);
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].values.Description).toBe("UBER ride");
    expect(rows[0].values.Amount).toBe("2500.5");
    expect(rows[0].sourceRow).toBe(2);
  });

  it("converts real date cells to YYYY-MM-DD", () => {
    const buffer = workbookBuffer([
      ["Date", "Description"],
      [new Date(2026, 0, 5, 12, 0, 0), "Cab ride"],
    ]);
    const { rows } = parseXlsx(buffer);
    expect(rows[0].values.Date).toBe("2026-01-05");
  });

  it("skips completely empty rows before rows with data", () => {
    const buffer = workbookBuffer([
      ["Date", "Description"],
      [],
      ["", ""],
      ["2026-02-01", "Netflix"],
    ]);
    const { rows } = parseXlsx(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceRow).toBe(2);
  });

  it("renames repeated headers", () => {
    const buffer = workbookBuffer([
      ["Amount", "Amount", "Description"],
      [1, 2, "x"],
    ]);
    const { headers } = parseXlsx(buffer);
    expect(headers).toEqual(["Amount", "Amount (2)", "Description"]);
  });

  it("uses the first non-empty worksheet", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Description"],
      ["2026-01-05", "First sheet"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Data");
    const { rows } = parseXlsx(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    expect(rows[0].values.Description).toBe("First sheet");
  });

  it("throws a friendly error for garbage bytes", () => {
    expect(() => parseXlsx(new TextEncoder().encode("not an xlsx").buffer)).toThrow(
      /could not be read as a spreadsheet/i,
    );
  });
});