// ============================================================
// LedgerAI — Import domain types
// ------------------------------------------------------------
// UI-independent types for the import pipeline:
// upload -> parse -> map -> normalize -> categorize -> dedupe ->
// preview -> commit. These types never leak Prisma/generated DB
// types into parser or domain code.
// ============================================================

export type ImportFileFormat = "csv" | "xlsx";

/** Maximum accepted upload size (5 MB). */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** The LedgerAI fields a source column can be mapped to. */
export type ImportField =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "reference"
  | "type"
  | "category";

export const IMPORT_FIELDS: readonly ImportField[] = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "reference",
  "type",
  "category",
];

/** Fields every import must resolve before rows can be committed. */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = [
  "date",
  "description",
];

/** A source file read into its raw cells (header row + data rows). */
export interface ParsedImportFile {
  fileName: string;
  fileType: ImportFileFormat;
  /** Header row cells, de-duplicated so each name is unique. */
  headers: string[];
  rows: RawImportRow[];
}

/** One raw source row (values keyed by resolved header name). */
export interface RawImportRow {
  /** 1-based source line/row number in the original file. */
  sourceRow: number;
  values: Record<string, string>;
}

/** User-chosen column mapping: header name -> LedgerAI field. */
export type ColumnMapping = Partial<Record<ImportField, string>>;

export type ImportRowType = "income" | "expense" | "transfer";

export const IMPORT_ROW_TYPES: readonly ImportRowType[] = [
  "income",
  "expense",
  "transfer",
];

/** A parsed + normalized + validated candidate row. */
export interface NormalizedImportRow {
  /** Index into ParsedImportFile.rows. */
  rowIndex: number;
  sourceRow: number;
  date: string;
  rawDate: string;
  description: string;
  amount: string;
  type: ImportRowType;
  reference: string | null;
  /** Source-file category text, when a category column was mapped. */
  category: string | null;
  errors: string[];
  warnings: string[];
}

/** Category suggestion produced by the deterministic rules engine. */
export interface ImportSuggestion {
  categoryName: string;
  confidence: number;
  needsReview: boolean;
  /** Set when the suggestion came from a learned business rule. */
  businessRule?: {
    categoryId: string | null;
    categoryName: string;
  } | null;
}

export type DuplicateStatus =
  | "new"
  | "duplicate_existing"
  | "duplicate_in_file";

/** Full per-row preview state shown in the wizard and committed. */
export interface ImportPreviewRow {
  rowIndex: number;
  sourceRow: number;
  date: string;
  description: string;
  amount: string;
  type: ImportRowType;
  reference: string | null;
  category: string | null;
  suggestedCategory: string;
  confidence: number;
  duplicate: DuplicateStatus;
  /** sourceRow of the first in-file occurrence this row duplicates. */
  duplicateOfRow?: number;
  /** Hard validation errors (invalid date/amount/missing field). */
  errors: string[];
  /** Soft flags (ambiguous date, low-confidence category). */
  warnings: string[];
  valid: boolean;
  needsReview: boolean;
}

/** Aggregate counts shown in the preview/review/confirm steps. */
export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  needsReview: number;
  readyToImport: number;
  toSkip: number;
}

/** Per-row user decision sent to the server at commit time. */
export interface ImportCommitSelectionRow {
  rowIndex: number;
  include: boolean;
  /** Explicit opt-in to commit a row that already exists in the ledger. */
  importAnyway?: boolean;
  categoryId: string | null;
}

/** Parsed + validated commit payload (server re-derives every row). */
export interface ImportCommitInput {
  fileName: string;
  fileType: ImportFileFormat;
  mapping: ColumnMapping;
  accountId: string | null;
  selections: ImportCommitSelectionRow[];
}

export interface ImportCommitResult {
  total: number;
  imported: number;
  existingDuplicates: number;
  inFileDuplicates: number;
  invalid: number;
  excluded: number;
}

/** Minimal category shape used for suggestion -> id resolution. */
export interface ImportCategoryOption {
  id: string;
  name: string;
  type: "income" | "expense";
}