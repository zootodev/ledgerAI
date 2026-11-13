// ============================================================
// LedgerAI — shared preview/commit preparation
// ------------------------------------------------------------
// Both the browser preview and the server commit use this function so they
// cannot disagree about sections, reconciliation or transfer classification.
// The server still re-parses the original bytes; this module only derives the
// rows from a parsed file.
// ============================================================

import type {
  ColumnMapping,
  ImportSection,
  NormalizedImportRow,
  ParsedImportFile,
  StatementHeaderSummary,
} from "./types";
import { normalizeImportRow } from "./normalize";
import { findOpeningBalance, reconcileNormalizedRows, type ReconciliationSummary } from "./reconcile";
import { detectInternalTransfers, type TransferSummary } from "./transfers";
import { hasStatementSummary, summarizeRawRows } from "./statement-summary";

export interface PrepareImportOptions {
  /** PDF section selected by the user. First/default section otherwise. */
  selectedSectionId?: string | null;
  /** Profile/personal name used for own-account transfer recognition. */
  holderName?: string | null;
  businessName?: string | null;
}

export interface PreparedImport {
  /** Rows belonging to the selected section (or the whole file). */
  rows: NormalizedImportRow[];
  reconciliation: ReconciliationSummary | null;
  transfers: TransferSummary;
  /** Selected section, or null for CSV/XLSX and single-table statements. */
  section: ImportSection | null;
  /** All sections available for selection. */
  sections: ImportSection[];
}

function sectionForRawRow(
  rawSectionId: string | undefined,
  sections: ImportSection[],
): ImportSection | null {
  if (sections.length === 0) return null;
  return sections.find((section) => section.id === rawSectionId) ?? sections[0];
}

/** Prepare one file for preview or commit. */
export function prepareImport(
  parsed: ParsedImportFile,
  mapping: ColumnMapping,
  options: PrepareImportOptions = {},
): PreparedImport {
  const sections = parsed.sections ?? [];
  const hasSections = sections.length > 0;

  if (!hasSections) {
    const header = parsed.statement ?? summarizeRawRows(parsed.rows);
    const normalized = parsed.rows.map((raw, index) =>
      normalizeImportRow(raw, mapping, index),
    );
    const reconciled = reconcileNormalizedRows(
      normalized,
      header.openingBalance ?? findOpeningBalance(normalized),
      hasStatementSummary(header) ? header : null,
    );
    const transfers = detectInternalTransfers(reconciled.rows, {
      holderName: options.holderName,
      businessName: options.businessName,
    });
    return {
      rows: transfers.rows,
      reconciliation: reconciled.summary,
      transfers: transfers.summary,
      section: null,
      sections: [],
    };
  }

  // Normalize and reconcile every section first: transfer detection needs to
  // see the other section's mirror entry, even though only one section will
  // be imported at a time.
  const normalizedBySection = new Map<string, NormalizedImportRow[]>();
  const reconciliationBySection = new Map<string, ReconciliationSummary>();
  const allRows: NormalizedImportRow[] = [];

  for (const section of sections) {
    const normalized = parsed.rows
      .map((raw, index) => ({ raw, index }))
      .filter(({ raw }) => sectionForRawRow(raw.sectionId, sections)?.id === section.id)
      .map(({ raw, index }) => normalizeImportRow(raw, mapping, index));
    const reconciled = reconcileNormalizedRows(
      normalized,
      section.header.openingBalance ?? findOpeningBalance(normalized),
      hasStatementSummary(section.header) ? section.header : null,
    );
    normalizedBySection.set(section.id, reconciled.rows);
    reconciliationBySection.set(section.id, reconciled.summary);
    allRows.push(...reconciled.rows);
  }

  const transfers = detectInternalTransfers(allRows, {
    holderName: options.holderName,
    businessName: options.businessName,
    sections,
  });

  // The selected section is stable by id. A missing/stale id falls back to
  // the statement's designated default, never to "import everything".
  const selected =
    sections.find((section) => section.id === options.selectedSectionId) ??
    sections.find((section) => section.isDefault) ??
    sections[0];

  return {
    rows: transfers.rows.filter((row) => row.sectionId === selected.id),
    reconciliation: reconciliationBySection.get(selected.id) ?? null,
    transfers: transfers.summary,
    section: selected,
    sections,
  };
}

/** Build a synthetic header summary for tests/preview from a plain row set. */
export function summaryForRows(rows: { values: Record<string, string> }[]): StatementHeaderSummary {
  return summarizeRawRows(
    rows.map((row, index) => ({ sourceRow: index + 1, values: row.values })),
  );
}
