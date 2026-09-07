import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportRowsTable } from "@/components/import/import-rows-table";
import type { ImportPreviewRow } from "@/lib/import/types";

function row(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowIndex: 0,
    displayRow: 1,
    sourceRow: 2,
    date: "2026-08-01",
    description: "Client payment",
    amount: "150000.00",
    type: "income",
    reference: null,
    category: null,
    suggestedCategory: "Other Income",
    confidence: 0.9,
    duplicate: "new",
    duplicateOfRow: undefined,
    errors: [],
    warnings: [],
    valid: true,
    needsReview: false,
    ...overrides,
  };
}

function renderTable(rows: ImportPreviewRow[]) {
  return renderToStaticMarkup(
    <ImportRowsTable
      rows={rows}
      currency="NGN"
      categories={[]}
      selections={{}}
      categoryOverrides={{}}
      onToggle={() => {}}
      onCategoryChange={() => {}}
    />,
  );
}

const IMPORT_CTRL = ">Import</span>";
const IMPORT_ANYWAY = "Import anyway";

describe("ImportRowsTable duplicate review UI", () => {
  it("shows an existing database duplicate with an explanation and an explicit Import anyway control", () => {
    const html = renderTable([
      row({ rowIndex: 0, duplicate: "duplicate_existing" }),
    ]);
    expect(html).toContain("Already exists");
    expect(html).toContain("This transaction matches one already in your ledger.");
    expect(html).toContain(IMPORT_ANYWAY);
    expect(html).toContain("Status");
  });

  it("shows an in-file duplicate with an explanation and an Import anyway control", () => {
    const html = renderTable([
      row({
        rowIndex: 1,
        sourceRow: 5,
        description: "Office supplies",
        amount: "25000.00",
        type: "expense",
        suggestedCategory: "Office",
        duplicate: "duplicate_in_file",
        duplicateOfRow: 0,
      }),
    ]);
    expect(html).toContain("Duplicate in this file");
    expect(html).toContain(
      "This transaction looks identical to another transaction in this upload.",
    );
    expect(html).toContain(IMPORT_ANYWAY);
  });

  it("keeps new rows plainly ready to import and never labels duplicates Valid", () => {
    const onlyNew = renderTable([row({ rowIndex: 0 })]);
    // New row: plain "Import" control, no duplicate/invalid wording.
    expect(onlyNew).toContain(IMPORT_CTRL);
    expect(onlyNew).not.toContain(IMPORT_ANYWAY);
    expect(onlyNew).not.toContain("Already exists");
    expect(onlyNew).not.toContain("Duplicate in this file");
    expect(onlyNew).not.toContain("Invalid");
    // The term "Valid" is not used anywhere in the review table.
    expect(onlyNew).not.toContain("Valid");

    // A duplicate row next to it gets only the duplicate treatment.
    const mixed = renderTable([
      row({ rowIndex: 0 }),
      row({
        rowIndex: 1,
        description: "Office supplies",
        amount: "25000.00",
        type: "expense",
        duplicate: "duplicate_in_file",
        duplicateOfRow: 0,
      }),
    ]);
    expect(mixed).toContain("Duplicate in this file");
    expect(mixed).toContain(IMPORT_ANYWAY);
    expect(mixed).not.toContain("Valid");
  });

  it("reserves the Invalid state and label for rows that fail parsing", () => {
    const html = renderTable([
      row({ rowIndex: 0, errors: ["invalid amount"], valid: false }),
    ]);
    expect(html).toContain("Invalid");
    // No import control at all for an invalid row.
    expect(html).not.toContain(IMPORT_ANYWAY);
    expect(html).not.toContain(IMPORT_CTRL);
    expect(html).not.toContain("Already exists");
    expect(html).not.toContain("Duplicate in this file");
  });

  it("numbers rows 1-based from the display ordinal (first data row is #1, last is #N)", () => {
    const html = renderTable([
      row({ rowIndex: 0, displayRow: 1, sourceRow: 2 }),
      row({ rowIndex: 1, displayRow: 2, sourceRow: 3, description: "UBER trip", amount: "2500.00" }),
      row({ rowIndex: 2, displayRow: 3, sourceRow: 4, description: "Office rent", amount: "120000.00" }),
    ]);
    expect(html).toContain("#1");
    expect(html).toContain("#2");
    expect(html).toContain("#3");
    // The first data row renders #1 (not the physical file line #2).
    const firstHashIdx = html.indexOf(">#");
    expect(html.slice(firstHashIdx, firstHashIdx + 3)).toBe(">#1");
  });

  it("shows the in-file duplicate's referenced row with 1-based display numbering while duplicateOfRow stays unchanged", () => {
    const duplicate = row({
      rowIndex: 2,
      displayRow: 3,
      description: "Office supplies",
      amount: "25000.00",
      type: "expense",
      duplicate: "duplicate_in_file",
      duplicateOfRow: 0,
    });
    const html = renderTable([
      row({ rowIndex: 0, displayRow: 1, description: "Office supplies", amount: "25000.00" }),
      duplicate,
    ]);

    // The leader is data row #1 (rowIndex 0), so the human-facing hint is #1.
    expect(html).toContain("Same as row #1 in this upload.");
    // The underlying value used for identity is untouched.
    expect(duplicate.duplicateOfRow).toBe(0);
    expect(html).not.toContain("Same as row #2 in this upload.");
  });
});