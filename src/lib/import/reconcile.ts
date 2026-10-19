// ============================================================
// LedgerAI — Statement balance reconciliation
// ------------------------------------------------------------
// A statement that carries a running Balance column can be checked
// against itself: for every row, the previous balance plus the credit
// (income) minus the debit (expense) must equal the row's balance.
//
// This module turns that arithmetic into:
//   - a verification pass (checked / reconciled / mismatches), and
//   - a conservative correction: when a single row's balance only
//     works if its debit and credit sides are swapped, the row is
//     flipped and flagged "side corrected from balance" rather than
//     being reported as unreconciled.
//
// It is pure and never invents an amount: a row with no balance, or a
// gap containing an unverifiable row (a transfer, or a row with no
// balance), is left alone and simply not counted.
// ============================================================

import type { NormalizedImportRow } from "./types";
import { normalizeText } from "./normalize";

/** Absolute tolerance when comparing money, in major units (one kobo/cent). */
export const RECONCILE_TOLERANCE = 0.01;

/** Soft flag added to a row whose debit/credit sides were swapped. */
export const SIDE_CORRECTED_WARNING = "side corrected from balance";

export interface ReconcileMismatch {
  rowIndex: number;
  sourceRow: number;
  description: string;
  /** What the previous balance plus this row's movement says it should be. */
  expected: string;
  /** The balance the statement actually printed. */
  actual: string;
  /** actual - expected, in major units. */
  difference: string;
}

export interface ReconciliationSummary {
  /** Number of consecutive balance-to-balance checks performed. */
  checked: number;
  /** How many of those agreed (including corrected rows). */
  reconciled: number;
  mismatches: ReconcileMismatch[];
  /** Row indexes that failed their check (for the review filter). */
  mismatchRowIndexes: number[];
  /** How many rows had their debit/credit sides swapped. */
  corrected: number;
  /** Opening balance if the file printed one, else the first balance seen. */
  openingBalance: string | null;
  /** The last balance seen, when the statement carried one. */
  closingBalance: string | null;
}

export interface ReconcileResult {
  rows: NormalizedImportRow[];
  summary: ReconciliationSummary;
}

/**
 * The opening balance a statement prints as its own line ("Opening balance
 * 5,000.00"), when the file also carried a Balance column to read it from.
 * Callers pass this to `reconcileNormalizedRows` so the very first
 * transaction is verified against the printed opening figure.
 */
export function findOpeningBalance(rows: NormalizedImportRow[]): string | null {
  for (const row of rows) {
    const label = normalizeText(`${row.description} ${row.rawDate}`);
    if (/^opening\s+balance\b/i.test(label) || /^balance\s+b\/?f\b/i.test(label)) {
      if (row.balance !== null) return row.balance;
    }
  }
  return null;
}

function toNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fromNumber(value: number): string {
  return value.toFixed(2);
}

/** Income adds to the balance, expense subtracts; a transfer is unknown. */
function signedMovement(row: NormalizedImportRow): number | null {
  if (row.errors.length > 0) return null;
  const amount = toNumber(row.amount);
  if (amount === null) return null;
  if (row.type === "income") return amount;
  if (row.type === "expense") return -amount;
  return null; // transfer: direction cannot be known from the row alone
}

/** A row that can be used as a balance checkpoint. */
function checkpoint(row: NormalizedImportRow): number | null {
  if (row.errors.length > 0) return null;
  return toNumber(row.balance);
}

/**
 * Verify (and, where unambiguous, correct) the balances in a normalized
 * statement. Rows are expected in statement order. The input array is not
 * mutated; a shallow-copied array is returned with any corrections applied.
 */
export function reconcileNormalizedRows(
  rows: NormalizedImportRow[],
  openingBalance: string | null = null,
): ReconcileResult {
  const working = rows.map((row) => ({ ...row }));
  const summary: ReconciliationSummary = {
    checked: 0,
    reconciled: 0,
    mismatches: [],
    mismatchRowIndexes: [],
    corrected: 0,
    openingBalance: null,
    closingBalance: null,
  };

  const explicitOpening = toNumber(openingBalance);

  // anchorIndex -1 means "before the first row"; an explicit opening balance
  // anchors there so the very first transaction is verified too.
  let anchorIndex = -1;
  let anchorBalance: number | null = explicitOpening;
  if (explicitOpening !== null) {
    summary.openingBalance = fromNumber(explicitOpening);
  }

  for (let index = 0; index < working.length; index += 1) {
    const balance = checkpoint(working[index]);
    if (balance === null) continue;

    // The last checkpoint seen becomes the statement's closing balance.
    summary.closingBalance = fromNumber(balance);

    if (anchorBalance === null) {
      // No anchor yet: this is the first balance we have seen, so it becomes
      // the baseline for the rows that follow.
      anchorIndex = index;
      anchorBalance = balance;
      summary.openingBalance = fromNumber(balance);
      continue;
    }

    const span = working.slice(anchorIndex + 1, index + 1);
    const movements = span.map(signedMovement);

    // Unverifiable span (a transfer, an invalid row): move the anchor on
    // without claiming a result.
    if (movements.some((movement) => movement === null)) {
      anchorIndex = index;
      anchorBalance = balance;
      continue;
    }

    const expectedDelta = movements.reduce<number>((sum, m) => sum + (m ?? 0), 0);
    const actualDelta = balance - (anchorBalance ?? 0);
    summary.checked += 1;

    if (Math.abs(expectedDelta - actualDelta) <= RECONCILE_TOLERANCE) {
      summary.reconciled += 1;
    } else if (span.length === 1) {
      // A single row that only works with its sides swapped is almost always
      // a debit/credit column mix-up, not a bad statement.
      const correctedDelta = -(movements[0] ?? 0);
      if (Math.abs(correctedDelta - actualDelta) <= RECONCILE_TOLERANCE) {
        const swapTarget = span[0];
        const original = swapTarget.type;
        swapTarget.type = original === "income" ? "expense" : "income";
        swapTarget.warnings = [...swapTarget.warnings, SIDE_CORRECTED_WARNING];
        summary.corrected += 1;
        summary.reconciled += 1;
      } else {
        recordMismatch(summary, span, expectedDelta, actualDelta);
      }
    } else {
      recordMismatch(summary, span, expectedDelta, actualDelta);
    }

    anchorIndex = index;
    anchorBalance = balance;
  }

  return { rows: working, summary };
}

function recordMismatch(
  summary: ReconciliationSummary,
  span: NormalizedImportRow[],
  expectedDelta: number,
  actualDelta: number,
): void {
  const difference = actualDelta - expectedDelta;
  for (const row of span) {
    summary.mismatches.push({
      rowIndex: row.rowIndex,
      sourceRow: row.sourceRow,
      description: row.description,
      expected: fromNumber(expectedDelta),
      actual: fromNumber(actualDelta),
      difference: fromNumber(difference),
    });
    summary.mismatchRowIndexes.push(row.rowIndex);
  }
}
