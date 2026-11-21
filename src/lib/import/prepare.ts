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
import {
  findOpeningBalance,
  orderRowsByBalanceChain,
  reconcileNormalizedRows,
  type ReconciliationSummary,
} from "./reconcile";
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

/**
 * Reconcile, and if the printed row order does not form a balance chain, try
 * to reconstruct the ledger order from the balances themselves. The reordered
 * result is used only when it fully reconciles and checks at least as many
 * rows, so ordinary statements keep their printed order.
 */
function reconcileRows(
  rows: NormalizedImportRow[],
  opening: string | null,
  header: StatementHeaderSummary | null,
): ReturnType<typeof reconcileNormalizedRows> {
  const first = reconcileNormalizedRows(rows, opening, header);
  if (first.summary.mismatches.length === 0) return first;

  const reordered = orderRowsByBalanceChain(
    first.rows,
    first.summary.openingBalance ?? opening,
  );
  if (!reordered) return first;

  const retry = reconcileNormalizedRows(reordered, opening, header);
  if (
    retry.summary.mismatches.length === 0 &&
    retry.summary.checked >= first.summary.checked
  ) {
    return retry;
  }
  return first;
}

const POS_TRANSFER_PREFIX = /^pos\s+transfer\s*[-:]?\s*/i;

function extractPairedPayee(description: string): string | null {
  const match = /\btransfer\s+to\b\s*[:\-]?\s*(.+)$/i.exec(description.trim());
  if (!match) return null;
  let value = match[1].replace(POS_TRANSFER_PREFIX, "").trim();
  value = value.replace(/^[\s:;\-|]+/, "").replace(/[\s:;\-|]+$/, "").trim();
  return value.length > 0 ? value : null;
}

/**
 * OPay records some payments as a set-aside "Transfer to ..." line paired with
 * the real debit on the same date and amount. Borrow the payee for
 * categorisation context, but never change amounts/types/dates or unskip the
 * set-aside row. Only applied to OPay statements.
 */
export function applyOpayPairedPayees(
  rows: NormalizedImportRow[],
  bank?: string | null,
): void {
  if (bank !== "opay") return;

  const usedSetAside = new Set<number>();

  for (const debit of rows) {
    if (debit.skipped) continue;
    if (debit.errors.length > 0) continue;
    if (debit.type !== "expense") continue;
    if (!debit.date || !debit.amount) continue;

    let best: NormalizedImportRow | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of rows) {
      if (candidate === debit) continue;
      if (!candidate.skipped) continue;
      if (usedSetAside.has(candidate.rowIndex)) continue;
      if (candidate.date !== debit.date) continue;
      if (candidate.amount !== debit.amount) continue;

      const payee = extractPairedPayee(candidate.description);
      if (!payee) continue;

      const distance = Math.abs(candidate.rowIndex - debit.rowIndex);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    if (!best) continue;
    const payee = extractPairedPayee(best.description);
    if (!payee) continue;
    debit.pairedPayee = payee;
    usedSetAside.add(best.rowIndex);
  }
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
    const reconciled = reconcileRows(
      normalized,
      header.openingBalance ?? findOpeningBalance(normalized),
      hasStatementSummary(header) ? header : null,
    );
    const transfers = detectInternalTransfers(reconciled.rows, {
      holderName: options.holderName,
      businessName: options.businessName,
    });
    applyOpayPairedPayees(transfers.rows, parsed.bank);
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
    const reconciled = reconcileRows(
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
  applyOpayPairedPayees(transfers.rows, parsed.bank);

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
