// ============================================================
// LedgerAI — Import pipeline barrel
// ============================================================

export * from "./types";
export {
  parseCsv,
  type ParsedCsvResult,
  type RowParseError,
} from "./parse-csv";
export {
  parseXlsx,
  type ParsedXlsxResult,
} from "./parse-xlsx";
export {
  detectColumns,
  validateMapping,
  type MappingIssue,
} from "./mapping";
export {
  normalizeImportRow,
  parseAmount,
  parseBalance,
  parseDate,
  inferTypeFromLabel,
  normalizeText,
  isAbsentAmountCell,
  isNonTransactionLine,
} from "./normalize";
export {
  tagDuplicates,
  fingerprintOf,
  canonicalAmount,
  type DuplicateTag,
} from "./dedupe";
export {
  categorizeImportRow,
  categorizeImportRows,
  matchByName,
  resolveRulesForRow,
  fallbackCategoryName,
} from "./categorize";
export {
  buildImportPreview,
  shouldIncludeByDefault,
  type BuiltPreview,
} from "./preview";
export {
  filterPreviewRows,
  countByView,
  summarizeStatementPeriod,
  periodsOverlap,
  isDuplicateRow,
  isUnreconciledRow,
  isSkippedRow,
  IMPORT_REVIEW_VIEWS,
  IMPORT_REVIEW_VIEW_LABELS,
  type ImportReviewView,
} from "./review";
export {
  reconcileNormalizedRows,
  findOpeningBalance,
  RECONCILE_TOLERANCE,
  SIDE_CORRECTED_WARNING,
  type ReconciliationSummary,
  type ReconcileMismatch,
  type ReconcileResult,
} from "./reconcile";