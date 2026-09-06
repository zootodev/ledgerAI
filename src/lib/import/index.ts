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
  parseDate,
  inferTypeFromLabel,
  normalizeText,
  isAbsentAmountCell,
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