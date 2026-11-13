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
import type { ReconciliationSummary } from "./reconcile";

export interface BuiltPreview {
  rows: ImportPreviewRow[];
  summary: ImportSummary;
  /**
   * Statement-balance reconciliation, when the file carried balances. Null
   * when there was nothing to check.
   */
  reconciliation: ReconciliationSummary | null;
}

export function buildImportPreview(
  normalized: NormalizedImportRow[],
  suggestions: Map<number, ImportSuggestion>,
  duplicateTags: Map<number, { duplicate: DuplicateStatus; duplicateOfRow?: number }>,
  reconciliation: ReconciliationSummary | null = null,
): BuiltPreview {
  const mismatchRowIndexes = new Set(reconciliation?.mismatchRowIndexes ?? []);
  const rows: ImportPreviewRow[] = normalized.map((row, index) => {
    const suggestion = suggestions.get(row.rowIndex) ?? {
      categoryName: "Other",
      confidence: 0,
      needsReview: true,
      reason: "no keyword match",
    };
    const tag = duplicateTags.get(row.rowIndex) ?? { duplicate: "new" as DuplicateStatus };

    const valid = row.errors.length === 0 && !row.skipped;
    const reconciles =
      row.balance === null ? null : !mismatchRowIndexes.has(row.rowIndex);
    const needsReview =
      valid &&
      (suggestion.needsReview ||
        reconciles === false ||
        (reconciliation?.requiresAcknowledgement ?? false));

    return {
      rowIndex: row.rowIndex,
      /* Presentational 1-based data-row ordinal; rowIndex stays untouched. */
      displayRow: index + 1,
      sourceRow: row.sourceRow,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      reference: row.reference,
      category: row.category,
      balance: row.balance,
      reconciles,
      reconcilesNote: reconciles === false ? "balance does not match the running total" : null,
      suggestedCategory: suggestion.categoryName,
      confidence: suggestion.confidence,
      suggestionReason: suggestion.reason ?? null,
      transfer: row.transfer ?? null,
      time: row.time ?? null,
      sectionId: row.sectionId ?? null,
      duplicate: tag.duplicate,
      duplicateOfRow: tag.duplicateOfRow,
      errors: [...row.errors],
      warnings: [...row.warnings],
      valid,
      skipped: row.skipped,
      skipReason: row.skipReason,
      needsReview,
    };
  });

  return { rows, summary: summarize(rows, reconciliation), reconciliation };
}

/** True when a row is included by default: valid AND not a duplicate. */
export function shouldIncludeByDefault(row: ImportPreviewRow): boolean {
  return row.valid && row.duplicate === "new";
}

function summarize(
  rows: ImportPreviewRow[],
  reconciliation: ReconciliationSummary | null,
): ImportSummary {
  let valid = 0;
  let duplicates = 0;
  let needsReview = 0;
  let readyToImport = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    if (!row.valid) continue;
    valid += 1;
    if (row.duplicate !== "new") duplicates += 1;
    if (row.needsReview) needsReview += 1;
    if (shouldIncludeByDefault(row)) readyToImport += 1;
  }

  const invalid = rows.length - valid - skipped;
  const hasBalances = reconciliation !== null && reconciliation.checked > 0;
  const hasReconciliation =
    reconciliation !== null &&
    (reconciliation.checked > 0 || reconciliation.headerChecks.length > 0);
  const internalTransfers = rows.filter(
    (row) => row.transfer?.kind === "mirrored" || row.skipReason === "internal transfer",
  ).length;
  return {
    total: rows.length,
    valid,
    invalid,
    duplicates,
    needsReview,
    readyToImport,
    toSkip: invalid + duplicates + skipped,
    skipped,
    reconcileChecked: reconciliation?.checked ?? 0,
    reconcileMismatches: reconciliation?.mismatches.length ?? 0,
    reconciled: hasReconciliation
      ? reconciliation.mismatches.length === 0 && reconciliation.headerMismatches.length === 0
      : null,
    hasBalances,
    hasReconciliation,
    headerMismatches: reconciliation?.headerMismatches.length ?? 0,
    requiresAcknowledgement: reconciliation?.requiresAcknowledgement ?? false,
    acknowledgementMessage: reconciliation?.message ?? null,
    internalTransfers,
  };
}