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

import type { NormalizedImportRow, StatementHeaderSummary } from "./types";
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

export interface HeaderCheck {
  kind: "debitTotal" | "creditTotal" | "transactionCount" | "debitCount" | "creditCount" | "opening" | "closing";
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
  difference: string | null;
}

export interface ParsedTotals {
  debit: string;
  credit: string;
  count: number;
  debitCount: number;
  creditCount: number;
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
  /** Header figures the file printed (PDF or CSV/XLSX summary rows). */
  header: StatementHeaderSummary | null;
  /** Parsed transaction totals used for the header comparison. */
  parsedTotals: ParsedTotals;
  /** Every header check, passed or failed. */
  headerChecks: HeaderCheck[];
  /** Only the failed header checks. */
  headerMismatches: HeaderCheck[];
  /** True when the statement's own totals/counts disagree with the rows. */
  requiresAcknowledgement: boolean;
  /** Human-readable warning shown in review. */
  message: string | null;
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
  header: StatementHeaderSummary | null = null,
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
    header,
    parsedTotals: { debit: "0.00", credit: "0.00", count: 0, debitCount: 0, creditCount: 0 },
    headerChecks: [],
    headerMismatches: [],
    requiresAcknowledgement: false,
    message: null,
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

  summary.parsedTotals = parsedTotals(working);
  if (header) {
    summary.headerChecks = headerChecks(summary, header);
    summary.headerMismatches = summary.headerChecks.filter((check) => !check.ok);
    summary.requiresAcknowledgement = summary.headerMismatches.length > 0;
    summary.message = acknowledgementMessage(summary);
  }

  return { rows: working, summary };
}

function parsedTotals(rows: NormalizedImportRow[]): ParsedTotals {
  let debit = 0;
  let credit = 0;
  let count = 0;
  let debitCount = 0;
  let creditCount = 0;
  for (const row of rows) {
    if (row.skipped || row.errors.length > 0) continue;
    const amount = toNumber(row.amount);
    if (amount === null || amount === 0) continue;
    count += 1;
    if (row.type === "expense") {
      debit += amount;
      debitCount += 1;
    } else if (row.type === "income") {
      credit += amount;
      creditCount += 1;
    }
  }
  return {
    debit: fromNumber(debit),
    credit: fromNumber(credit),
    count,
    debitCount,
    creditCount,
  };
}

function headerChecks(
  summary: ReconciliationSummary,
  header: StatementHeaderSummary,
): HeaderCheck[] {
  const checks: HeaderCheck[] = [];
  const compareMoney = (
    kind: HeaderCheck["kind"],
    label: string,
    expected: string | null,
    actual: string | null,
  ) => {
    if (expected === null) return;
    const expectedNumber = toNumber(expected);
    const actualNumber = toNumber(actual);
    if (expectedNumber === null) return;
    const difference =
      actualNumber === null ? expectedNumber : Math.abs(expectedNumber - actualNumber);
    checks.push({
      kind,
      label,
      expected: fromNumber(expectedNumber),
      actual: actualNumber === null ? "unknown" : fromNumber(actualNumber),
      ok: actualNumber !== null && Math.abs(expectedNumber - actualNumber) <= RECONCILE_TOLERANCE,
      difference: fromNumber(difference),
    });
  };
  const compareCount = (
    kind: HeaderCheck["kind"],
    label: string,
    expected: number | null,
    actual: number,
  ) => {
    if (expected === null) return;
    checks.push({
      kind,
      label,
      expected: String(expected),
      actual: String(actual),
      ok: expected === actual,
      difference: expected === actual ? null : String(Math.abs(expected - actual)),
    });
  };

  compareMoney("debitTotal", "Total debits", header.totalDebit, summary.parsedTotals.debit);
  compareMoney("creditTotal", "Total credits", header.totalCredit, summary.parsedTotals.credit);
  compareCount(
    "transactionCount",
    "Transactions",
    header.transactionCount,
    summary.parsedTotals.count,
  );
  compareCount("debitCount", "Debit rows", header.debitCount, summary.parsedTotals.debitCount);
  compareCount("creditCount", "Credit rows", header.creditCount, summary.parsedTotals.creditCount);
  compareMoney("opening", "Opening balance", header.openingBalance, summary.openingBalance);
  compareMoney("closing", "Closing balance", header.closingBalance, summary.closingBalance);
  return checks;
}

function acknowledgementMessage(summary: ReconciliationSummary): string | null {
  if (summary.headerMismatches.length === 0) return null;
  const countCheck = summary.headerMismatches.find(
    (check) => check.kind === "transactionCount",
  );
  const expectedCount = summary.header?.transactionCount;
  const moneyMismatches = summary.headerMismatches.filter((check) =>
    ["debitTotal", "creditTotal", "opening", "closing"].includes(check.kind),
  );
  const largestDifference = moneyMismatches.reduce((largest, check) => {
    const numeric = Number(check.difference ?? 0);
    return Number.isFinite(numeric) && numeric > largest ? numeric : largest;
  }, 0);
  const parsedCount = summary.parsedTotals.count;
  if (countCheck && expectedCount !== null) {
    return `Parsed ${parsedCount} of ${expectedCount} rows / totals differ by ₦${largestDifference.toFixed(2)}. Review before importing`;
  }
  return `Parsed ${parsedCount} rows / totals differ by ₦${largestDifference.toFixed(2)}. Review before importing`;
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
