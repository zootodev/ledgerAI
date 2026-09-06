// ============================================================
// LedgerAI — Import deduplication
// ------------------------------------------------------------
// Reuses the finance engine's transactionFingerprint for a consistent
// notion of "same business event". Two distinct checks apply:
//
//   1. Existing DB: exact fingerprint (date + type + description +
//      amount + reference) already recorded for the business.
//   2. In-file: the same transaction appearing more than once inside
//      the current file. Statements frequently repeat the same
//      merchant/amount on different days (e.g. an identical charge
//      credited twice), so the in-file key deliberately ignores the
//      date — the row is surfaced as a candidate duplicate and the
//      user decides whether to keep or drop it. The date stays part
//      of the exact fingerprint used against the database.
//
// Policy:
//   - first VALID occurrence of an in-file key is "new"; later
//     identical valid rows are "duplicate_in_file". Invalid rows
//     never block an identical valid import, and an invalid first
//     occurrence is not a leader.
//   - rows whose exact fingerprint already exists for the business
//     are "duplicate_existing" (strongest signal).
// ============================================================

import { transactionFingerprint } from "@/lib/finance/engine";
import type { DuplicateStatus, NormalizedImportRow } from "./types";

export interface DuplicateTag {
  duplicate: DuplicateStatus;
  duplicateOfRow?: number;
}

/** Canonical two-decimal digit amount for fingerprint comparison. */
export function canonicalAmount(amount: string): string {
  const cleaned = amount.trim().replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return cleaned;
  return parsed.toFixed(2);
}

/** Exact (date-bearing) fingerprint used for existing-database matching. */
export function fingerprintOf(row: NormalizedImportRow): string {
  return transactionFingerprint({
    date: row.date,
    type: row.type,
    description: row.description,
    amount: canonicalAmount(row.amount),
    reference: row.reference,
  });
}

/**
 * In-file duplicate key: type + description + amount + reference, with the
 * date intentionally omitted. Two rows that share this key are the same
 * business event for review purposes even when their dates differ.
 */
export function inFileFingerprint(row: NormalizedImportRow): string {
  return transactionFingerprint({
    date: "",
    type: row.type,
    description: row.description,
    amount: canonicalAmount(row.amount),
    reference: row.reference,
  });
}

/**
 * Tag normalized rows with duplicate status. Rows with hard errors are
 * never promoted via in-file priority: an invalid first occurrence does
 * not shadow a valid identical row elsewhere in the file.
 */
export function tagDuplicates(
  rows: NormalizedImportRow[],
  existingFingerprints: ReadonlySet<string> = new Set<string>(),
): Map<number, DuplicateTag> {
  const tags = new Map<number, DuplicateTag>();
  const seenInFile = new Map<string, number>(); // in-file key -> rowIndex

  for (const row of rows) {
    if (row.errors.length > 0) {
      // Skip in-file dedupe rules for invalid rows entirely; their tag
      // will be resolved below against existing only.
      continue;
    }
    const fp = fingerprintOf(row);

    if (existingFingerprints.has(fp)) {
      tags.set(row.rowIndex, { duplicate: "duplicate_existing" });
      // Do not record as an in-file leader when it already exists.
      continue;
    }

    const key = inFileFingerprint(row);
    const earlier = seenInFile.get(key);
    if (earlier !== undefined) {
      tags.set(row.rowIndex, {
        duplicate: "duplicate_in_file",
        duplicateOfRow: earlier,
      });
    } else {
      seenInFile.set(key, row.rowIndex);
      tags.set(row.rowIndex, { duplicate: "new" });
    }
  }

  // Invalid rows: still mark existing-duplicates when the exact fingerprint
  // matches something already in the DB (they are skipped regardless).
  for (const row of rows) {
    if (row.errors.length === 0) continue;
    if (tags.has(row.rowIndex)) continue;
    if (existingFingerprints.has(fingerprintOf(row))) {
      tags.set(row.rowIndex, { duplicate: "duplicate_existing" });
    } else {
      tags.set(row.rowIndex, { duplicate: "new" });
    }
  }

  return tags;
}