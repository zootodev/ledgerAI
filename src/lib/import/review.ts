// ============================================================
// LedgerAI — Import review helpers
// ------------------------------------------------------------
// Pure, UI-independent helpers for the review step:
//   - focus filters over the preview rows,
//   - the statement's date span (for period + overlap warnings).
//
// No financial math and no DB access live here; the commit layer still
// re-derives every row from the original bytes.
// ============================================================

import type { ImportPreviewRow, StatementPeriod } from "./types";

/** Review-table focus views. */
export type ImportReviewView = "all" | "review" | "duplicates" | "invalid";

export const IMPORT_REVIEW_VIEWS: readonly ImportReviewView[] = [
  "all",
  "review",
  "duplicates",
  "invalid",
];

export const IMPORT_REVIEW_VIEW_LABELS: Record<ImportReviewView, string> = {
  all: "All rows",
  review: "Needs review",
  duplicates: "Duplicates",
  invalid: "Invalid",
};

/** True when the row is a (existing or in-file) duplicate. */
export function isDuplicateRow(row: ImportPreviewRow): boolean {
  return row.duplicate !== "new";
}

/** Keep only the rows matching a focus view (view "all" keeps everything). */
export function filterPreviewRows(
  rows: ImportPreviewRow[],
  view: ImportReviewView,
): ImportPreviewRow[] {
  switch (view) {
    case "review":
      return rows.filter((r) => r.valid && r.needsReview);
    case "duplicates":
      return rows.filter((r) => r.valid && isDuplicateRow(r));
    case "invalid":
      return rows.filter((r) => !r.valid);
    default:
      return rows;
  }
}

/** Per-view row counts for the filter toolbar badges. */
export function countByView(rows: ImportPreviewRow[]): Record<ImportReviewView, number> {
  let review = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const row of rows) {
    if (!row.valid) {
      invalid += 1;
      continue;
    }
    if (row.needsReview) review += 1;
    if (isDuplicateRow(row)) duplicates += 1;
  }
  return { all: rows.length, review, duplicates, invalid };
}

/**
 * The statement's inclusive date span, derived from VALID rows only (an
 * invalid row may carry an empty/parsed-away date). Returns null bounds when
 * there are no valid dated rows.
 */
export function summarizeStatementPeriod(rows: ImportPreviewRow[]): StatementPeriod {
  let from: string | null = null;
  let to: string | null = null;
  for (const row of rows) {
    if (!row.valid || !row.date) continue;
    if (from === null || row.date < from) from = row.date;
    if (to === null || row.date > to) to = row.date;
  }
  return { from, to };
}

/**
 * True when two inclusive ISO date ranges intersect. A null bound on either
 * range means "unbounded" on that side, so any overlap on the other side
 * still counts. Returns false when either range is entirely absent.
 */
export function periodsOverlap(a: StatementPeriod, b: StatementPeriod): boolean {
  if (a.from === null && a.to === null) return false;
  if (b.from === null && b.to === null) return false;
  // Non-overlap: a ends before b starts, or a starts after b ends.
  if (a.to !== null && b.from !== null && a.to < b.from) return false;
  if (a.from !== null && b.to !== null && a.from > b.to) return false;
  return true;
}
