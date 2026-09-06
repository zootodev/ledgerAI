import { describe, expect, it } from "vitest";
import { buildImportPreview, shouldIncludeByDefault } from "@/lib/import/preview";
import type { ImportPreviewRow, ImportSuggestion, NormalizedImportRow } from "@/lib/import/types";

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

const suggestion = (overrides: Partial<ImportSuggestion> = {}): ImportSuggestion => ({
  categoryName: "Transportation",
  confidence: 0.94,
  needsReview: false,
  ...overrides,
});

describe("buildImportPreview", () => {
  it("attaches suggestions and duplicate tags to rows", () => {
    const rows = [row({ rowIndex: 0 }), row({ rowIndex: 1, description: "Rent payment" })];
    const duplicates = new Map<number, { duplicate: "new" | "duplicate_in_file"; duplicateOfRow?: number }>([
      [1, { duplicate: "duplicate_in_file", duplicateOfRow: 0 }],
    ]);
    const suggestions = new Map<number, ImportSuggestion>([
      [0, suggestion()],
      [1, suggestion({ categoryName: "Rent", confidence: 0.9 })],
    ]);

    const { rows: previewRows, summary } = buildImportPreview(rows, suggestions, duplicates);

    expect(previewRows[0]).toMatchObject({
      valid: true,
      duplicate: "new",
      suggestedCategory: "Transportation",
      confidence: 0.94,
    });
    expect(previewRows[1].duplicate).toBe("duplicate_in_file");
    expect(previewRows[1].duplicateOfRow).toBe(0);
    expect(summary.total).toBe(2);
    expect(summary.duplicates).toBe(1);
    expect(summary.readyToImport).toBe(1);
  });

  it("marks invalid rows and counts them separately", () => {
    const textRow = row({ rowIndex: 0, errors: ["invalid amount"] });
    const { rows, summary } = buildImportPreview(
      [textRow],
      new Map(),
      new Map([[0, { duplicate: "new" }]]),
    );
    expect(rows[0].valid).toBe(false);
    expect(summary.invalid).toBe(1);
    expect(summary.valid).toBe(0);
  });

  it("flags low-confidence suggestions as needing review", () => {
    const textRow = row({ rowIndex: 0, description: "Strange vendor" });
    const { rows } = buildImportPreview(
      [textRow],
      new Map([[0, suggestion({ categoryName: "Other", confidence: 0.4, needsReview: true })]]),
      new Map([[0, { duplicate: "new" }]]),
    );
    expect(rows[0].needsReview).toBe(true);
  });
});

describe("shouldIncludeByDefault", () => {
  const preview = (overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow => ({
    rowIndex: 0,
    sourceRow: 2,
    date: "2026-01-05",
    description: "UBER ride",
    amount: "2500.00",
    type: "income" as const,
    reference: null,
    category: null,
    suggestedCategory: "Transportation",
    confidence: 0.94,
    duplicate: "new" as const,
    errors: [],
    warnings: [],
    valid: true,
    needsReview: false,
    ...overrides,
  });

  it("includes valid new rows by default", () => {
    expect(shouldIncludeByDefault(preview({}))).toBe(true);
  });

  it("excludes duplicates and invalid rows by default", () => {
    expect(shouldIncludeByDefault(preview({ duplicate: "duplicate_existing" }))).toBe(false);
    expect(shouldIncludeByDefault(preview({ duplicate: "duplicate_in_file" }))).toBe(false);
    expect(shouldIncludeByDefault(preview({ valid: false }))).toBe(false);
  });
});