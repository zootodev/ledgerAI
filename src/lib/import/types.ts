// ============================================================
// LedgerAI — Import domain types
// ------------------------------------------------------------
// UI-independent types for the import pipeline:
// upload -> parse -> map -> normalize -> categorize -> dedupe ->
// preview -> commit. These types never leak Prisma/generated DB
// types into parser or domain code.
// ============================================================

export type ImportFileFormat = "csv" | "xlsx" | "pdf";

/** Maximum accepted upload size (5 MB). */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** The LedgerAI fields a source column can be mapped to. */
export type ImportField =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "reference"
  | "type"
  | "category";

export const IMPORT_FIELDS: readonly ImportField[] = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "balance",
  "reference",
  "type",
  "category",
];

/** Fields every import must resolve before rows can be committed. */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = [
  "date",
  "description",
];

/**
 * Statement-level figures printed by the bank. Every field is optional: a CSV
 * export usually has none, a PDF often has most of them. They are evidence for
 * reconciliation, never a source of transaction amounts.
 */
export interface StatementHeaderSummary {
  openingBalance: string | null;
  closingBalance: string | null;
  totalDebit: string | null;
  totalCredit: string | null;
  debitCount: number | null;
  creditCount: number | null;
  transactionCount: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

/** One independently importable table/account inside a PDF statement. */
export interface ImportSection {
  /** Stable, order-based id. Preview and commit re-parse the same bytes. */
  id: string;
  label: string;
  rowCount: number;
  header: StatementHeaderSummary;
  /** The first/main section is selected by default. */
  isDefault: boolean;
}

/** A source file read into its raw cells (header row + data rows). */
export interface ParsedImportFile {
  fileName: string;
  fileType: ImportFileFormat;
  /** Header row cells, de-duplicated so each name is unique. */
  headers: string[];
  rows: RawImportRow[];
  /** PDFs with more than one account/table expose one section per table. */
  sections?: ImportSection[];
  /** Statement-level identity/figures (PDF header, CSV summary rows). */
  statement?: StatementHeaderSummary;
}

/** One raw source row (values keyed by resolved header name). */
export interface RawImportRow {
  /** 1-based source line/row number in the original file. */
  sourceRow: number;
  values: Record<string, string>;
  /** Set for PDF rows that belong to one statement section. */
  sectionId?: string;
  /** Parser-level hard errors (e.g. direction could not be determined). */
  errors?: string[];
  /** Parser-level soft flags. */
  warnings?: string[];
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
  /**
   * Running/closing balance from a mapped Balance column, as a signed
   * major-units string ("1250.50", "-40.00"), or null when the column is
   * absent or unreadable. Used only to VERIFY the row ordering — never to
   * derive an amount.
   */
  balance: string | null;
  errors: string[];
  warnings: string[];
  /**
   * True when the row is a statement artifact (an opening/closing balance, a
   * total, a repeated page header) rather than a transaction. Such rows are
   * set aside instead of being reported as "could not be read".
   */
  skipped: boolean;
  /** Why the row was set aside, present only when `skipped`. */
  skipReason: string | null;
  /** Section this row belongs to (PDF multi-section statements only). */
  sectionId?: string | null;
  /** Statement time when the source carried one (used for mirror matching). */
  time?: string | null;
  /** Why a row was classified as an internal transfer. */
  transfer?: ImportTransferInfo | null;
}

export type ImportTransferKind = "mirrored" | "self" | "reversal" | "interest";

export interface ImportTransferInfo {
  kind: ImportTransferKind;
  reason: string;
}

/** Category suggestion produced by the deterministic rules engine. */
export interface ImportSuggestion {
  categoryName: string;
  confidence: number;
  needsReview: boolean;
  /** Human-readable evidence for the suggestion, shown on hover. */
  reason?: string;
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
  /** 1-based data-row ordinal for DISPLAY ("Row" column, duplicate hints).
   *  Presentational only: rowIndex stays the authoritative row identity. */
  displayRow: number;
  date: string;
  description: string;
  amount: string;
  type: ImportRowType;
  reference: string | null;
  category: string | null;
  /** Balance from the source row when a Balance column was mapped. */
  balance: string | null;
  /**
   * Whether the statement math agrees for this row:
   *  - true  -> previous balance + credit - debit matched the balance,
   *  - false -> it did not (see `reconcilesNote`),
   *  - null  -> there was no balance to check against.
   */
  reconciles: boolean | null;
  /** Soft note explaining a reconciled false / a corrected side. */
  reconcilesNote: string | null;
  suggestedCategory: string;
  confidence: number;
  /** Why the suggestion was made (shown on hover). */
  suggestionReason?: string | null;
  /** Internal-transfer explanation when applicable. */
  transfer?: ImportTransferInfo | null;
  time?: string | null;
  sectionId?: string | null;
  duplicate: DuplicateStatus;
  /** rowIndex (0-based data index) of the first in-file occurrence this
   *  row duplicates. Display numbering is derived (+1) at render time. */
  duplicateOfRow?: number;
  /** Hard validation errors (invalid date/amount/missing field). */
  errors: string[];
  /** Soft flags (ambiguous date, low-confidence category). */
  warnings: string[];
  valid: boolean;
  /**
   * True when the row is a statement artifact (opening/closing balance, a
   * total, a page header) rather than a transaction. Set aside — never shown
   * as "invalid" and never importable.
   */
  skipped: boolean;
  /** Why the row was set aside, present only when `skipped`. */
  skipReason: string | null;
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
  /** Statement artifacts set aside as "not a transaction". */
  skipped: number;
  /** Reconciliation counts, present only when a Balance column was read. */
  reconcileChecked: number;
  reconcileMismatches: number;
  /** Marks the whole file as reconciled (or not) for the review banner. */
  reconciled: boolean | null;
  /** True when this file carried a readable statement balance at all. */
  hasBalances: boolean;
  /** True when a balance chain or header totals gave us something to check. */
  hasReconciliation?: boolean;
  /** Header totals/counts that disagree with the parsed rows. */
  headerMismatches?: number;
  /** Requires an explicit acknowledgement before one-click import is enabled. */
  requiresAcknowledgement?: boolean;
  /** Human-readable "Parsed X of Y rows / totals differ by ₦Z" message. */
  acknowledgementMessage?: string | null;
  /** Internal moves set aside by mirror/self-transfer detection. */
  internalTransfers?: number;
}

/** Per-row user decision sent to the server at commit time. */
export interface ImportCommitSelectionRow {
  rowIndex: number;
  include: boolean;
  /** Explicit opt-in to commit a row that already exists in the ledger. */
  importAnyway?: boolean;
  categoryId: string | null;
  /** Review override for "Transfer (own account)" -> income/expense. */
  typeOverride?: "income" | "expense" | null;
}

/** Parsed + validated commit payload (server re-derives every row). */
export interface ImportCommitInput {
  fileName: string;
  fileType: ImportFileFormat;
  mapping: ColumnMapping;
  accountId: string | null;
  sectionId?: string | null;
  acknowledgeReconciliation?: boolean;
  selections: ImportCommitSelectionRow[];
}

export interface ImportCommitResult {
  total: number;
  imported: number;
  existingDuplicates: number;
  inFileDuplicates: number;
  invalid: number;
  skipped: number;
  excluded: number;
}

/** Minimal category shape used for suggestion -> id resolution. */
export interface ImportCategoryOption {
  id: string;
  name: string;
  type: "income" | "expense";
}

/** Why a row was not written to the ledger (post-import exception queue). */
export type ImportExceptionReason =
  | "invalid"
  | "duplicate_existing"
  | "duplicate_in_file"
  | "skipped"
  | "excluded";

/**
 * Rows that are statement artifacts rather than transactions are set aside
 * with this reason instead of being reported as "could not be read".
 */
export const NOT_A_TRANSACTION_REASON = "not a transaction";

/**
 * One non-committed row, surfaced after a commit so it can be reviewed later.
 * Deliberately carries only non-sensitive source values (no ids/credentials).
 */
export interface ImportException {
  /** 1-based source line/row number in the original file. */
  sourceRow: number;
  /** 1-based data-row ordinal, matching the review table's "Row" column. */
  displayRow: number;
  reason: ImportExceptionReason;
  description: string;
  /** Normalized date when valid, else the raw source text. */
  date: string;
  amount: string;
  /** Human-readable reasons (populated for invalid rows). */
  messages: string[];
}

/** Post-import exception queue entry kept on the Import record. */
export const MAX_IMPORT_EXCEPTIONS = 200;

/** Inclusive statement date range derived from a file's valid rows. */
export interface StatementPeriod {
  from: string | null;
  to: string | null;
}