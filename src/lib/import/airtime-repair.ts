// ============================================================
// LedgerAI — pure planning for the airtime/data type repair
// ------------------------------------------------------------
// A row flipped income -> expense must never keep an income category. This
// module decides the replacement category without touching the database so
// the same logic can be unit-tested and reused by the dry run and the apply
// path of scripts/fix-airtime-type.ts.
// ============================================================

import { categorizeByRules, REVIEW_THRESHOLD } from "@/lib/ai/rules";
import type { CategoryRuleDto } from "@/types";

export interface RepairCategory {
  id: string;
  name: string;
  type: string;
}

export interface RepairRow {
  id: string;
  description: string;
  categoryId: string | null;
}

export interface AirtimeCategoryPlan {
  /** Category after the repair; null only when no expense category exists. */
  categoryId: string | null;
  /** Decimal text for ai_confidence; null leaves the existing value alone. */
  aiConfidence: string | null;
  /** True when the stored category changes (income category removed). */
  recategorised: boolean;
  /** True when the row should be back in the low-confidence Review queue. */
  toReview: boolean;
}

/** The engine's own low-confidence value, safely below REVIEW_THRESHOLD. */
export const UNCERTAIN_CONFIDENCE = "0.5000";

function findCategory(categories: RepairCategory[], name: string, type = "expense") {
  const wanted = name.trim().toLowerCase();
  return categories.find(
    (category) =>
      category.type === type && category.name.trim().toLowerCase() === wanted,
  );
}

/**
 * Decide what to do with a row whose type is about to become "expense".
 *
 * A confident rules match gets that expense category and its real confidence.
 * Anything else is parked on the neutral expense "Other" category with a low
 * confidence so it is visible in Review. (Review only lists rows that have a
 * category id, so a bare null would silently hide the row from the queue.)
 */
export function planAirtimeCategoryReset(
  row: RepairRow,
  categories: RepairCategory[],
  businessRules: CategoryRuleDto[],
): AirtimeCategoryPlan {
  const current = categories.find((category) => category.id === row.categoryId);
  if (current?.type === "expense") {
    return {
      categoryId: row.categoryId,
      aiConfidence: null,
      recategorised: false,
      toReview: false,
    };
  }

  const match = categorizeByRules(row.description, undefined, businessRules, "expense");
  const matched = findCategory(categories, match.categoryName);
  if (match.confidence >= REVIEW_THRESHOLD && matched) {
    return {
      categoryId: matched.id,
      aiConfidence: match.confidence.toFixed(4),
      recategorised: matched.id !== row.categoryId,
      toReview: false,
    };
  }

  const fallback = findCategory(categories, "Other");
  return {
    categoryId: fallback?.id ?? null,
    aiConfidence: UNCERTAIN_CONFIDENCE,
    recategorised: (fallback?.id ?? null) !== row.categoryId,
    toReview: true,
  };
}
