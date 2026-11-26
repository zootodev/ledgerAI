// ============================================================
// LedgerAI — low-confidence review grouping (pure, tenant-agnostic)
// ------------------------------------------------------------
// Groups pending review rows by the same merchant key the categorizer's
// learned rules use, plus the AI's suggested category. The service layer
// supplies only rows already scoped to the session's business.
// ============================================================

import { majorAmount } from "@/lib/finance/engine";
import { extractMerchantKey } from "@/lib/ai/merchant-key";
import { normalizeText } from "@/lib/import/normalize";

export interface ReviewRowInput {
  id: string;
  description: string;
  amount: string;
  date: string;
  categoryId: string | null;
  aiCategory: string | null;
  aiConfidence: number | null;
  type: "income" | "expense" | "transfer";
}

export interface ReviewGroup {
  /** Stable key derived from merchant key + suggested category. */
  key: string;
  merchant: string;
  rowCount: number;
  /** Absolute total in major currency units. */
  totalAmount: number;
  dateFrom: string;
  dateTo: string;
  suggestedCategory: string;
  /** First three descriptions, oldest first. */
  samples: string[];
  /** Every row in the group, including single-row override targets. */
  rows: ReviewRowInput[];
}

/** The same normalisation used when learning merchant category rules. */
export function reviewMerchantKey(description: string): string {
  return (
    extractMerchantKey(description) ??
    normalizeText(description).toUpperCase().slice(0, 48) ??
    "UNKNOWN"
  );
}

function groupKey(merchant: string, aiCategory: string | null): string {
  return `${merchant}\u0000${normalizeText(aiCategory ?? "No suggestion").toUpperCase()}`;
}

/**
 * Group low-confidence rows by normalised counterparty + suggested category.
 * Groups are ordered by absolute amount so the money that matters most is
 * reviewed first; the key tie-break keeps the order deterministic.
 */
export function groupLowConfidenceRows(rows: ReviewRowInput[]): ReviewGroup[] {
  const buckets = new Map<string, ReviewRowInput[]>();
  for (const row of rows) {
    const key = groupKey(reviewMerchantKey(row.description), row.aiCategory);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()]
    .map(([key, groupRows]): ReviewGroup => {
      const ordered = [...groupRows].sort((a, b) => a.date.localeCompare(b.date));
      const merchant = reviewMerchantKey(ordered[0].description);
      const suggested = normalizeText(ordered[0].aiCategory ?? "No suggestion");
      return {
        key,
        merchant,
        rowCount: ordered.length,
        totalAmount: ordered.reduce(
          (sum, row) => sum + Math.abs(majorAmount(row.amount)),
          0,
        ),
        dateFrom: ordered[0].date,
        dateTo: ordered[ordered.length - 1].date,
        suggestedCategory: suggested || "No suggestion",
        samples: ordered.slice(0, 3).map((row) => row.description),
        rows: ordered,
      };
    })
    .sort(
      (a, b) => b.totalAmount - a.totalAmount || a.merchant.localeCompare(b.merchant),
    );
}
