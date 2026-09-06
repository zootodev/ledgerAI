// ============================================================
// LedgerAI — Import preview builder
// ------------------------------------------------------------
// Assembles the prepared import: normalized rows + duplicate tags +
// category suggestions into the shape the review step renders and the
// commit layer trusts. Defaults follow the approved policy:
//
//   - valid + new                      -> included
//   - valid + duplicate                -> skipped (opt-in)
//   - invalid                          -> never importable
//   - low-confidence category          -> included but flagged
//
// The wizard renders this and lets the user override inclusion and the
// per-row category before committing.
// ============================================================

import type {
  DuplicateStatus,
  ImportPreviewRow,
  ImportSuggestion,
  ImportSummary,
  NormalizedImportRow,
} from "./types";

export interface BuiltPreview {
  rows: ImportPreviewRow[];
  summary: ImportSummary;
}

export function buildImportPreview(
  normalized: NormalizedImportRow[],
  suggestions: Map<number, ImportSuggestion>,
  duplicateTags: Map<number, { duplicate: DuplicateStatus; duplicateOfRow?: number }>,
): BuiltPreview {
  const rows: ImportPreviewRow[] = normalized.map((row) => {
    const suggestion = suggestions.get(row.rowIndex) ?? {
      categoryName: "Other",
      confidence: 0,
      needsReview: true,
    };
    const tag = duplicateTags.get(row.rowIndex) ?? { duplicate: "new" as DuplicateStatus };

    const valid = row.errors.length === 0;
    const needsReview = valid && suggestion.needsReview;

    return {
      rowIndex: row.rowIndex,
      sourceRow: row.sourceRow,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      reference: row.reference,
      category: row.category,
      suggestedCategory: suggestion.categoryName,
      confidence: suggestion.confidence,
      duplicate: tag.duplicate,
      duplicateOfRow: tag.duplicateOfRow,
      errors: [...row.errors],
      warnings: [...row.warnings],
      valid,
      needsReview,
    };
  });

  return { rows, summary: summarize(rows) };
}

/** True when a row is included by default: valid AND not a duplicate. */
export function shouldIncludeByDefault(row: ImportPreviewRow): boolean {
  return row.valid && row.duplicate === "new";
}

function summarize(rows: ImportPreviewRow[]): ImportSummary {
  let valid = 0;
  let duplicates = 0;
  let needsReview = 0;
  let readyToImport = 0;

  for (const row of rows) {
    if (!row.valid) continue;
    valid += 1;
    if (row.duplicate !== "new") duplicates += 1;
    if (row.needsReview) needsReview += 1;
    if (shouldIncludeByDefault(row)) readyToImport += 1;
  }

  const invalid = rows.length - valid;
  return {
    total: rows.length,
    valid,
    invalid,
    duplicates,
    needsReview,
    readyToImport,
    toSkip: invalid + duplicates,
  };
}