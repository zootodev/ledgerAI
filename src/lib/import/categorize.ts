// ============================================================
// LedgerAI — Import categorization
// ------------------------------------------------------------
// Wraps the deterministic AI service (rules-based, no API key) for
// import suggestions. Order of preference for a suggested category:
//
//   1. Transfer rows          -> no category ("Transfer" sentinel).
//   2. File category text     -> trusted (the file already says so).
//   3. Rules categorization   -> AI on the normalized description.
//
// Categorization is suggestions only — the review step and the commit
// layer remain the source of truth.
// ============================================================

import { getAIService } from "@/lib/ai/provider";
import type {
  ImportSuggestion,
  NormalizedImportRow,
} from "./types";

const TRANSFER_CATEGORY = "Transfer";
const FILE_CATEGORY_CONFIDENCE = 0.9;

export async function categorizeImportRow(
  row: NormalizedImportRow,
): Promise<ImportSuggestion> {
  if (row.type === "transfer") {
    return { categoryName: TRANSFER_CATEGORY, confidence: 1, needsReview: false };
  }

  if (row.category) {
    return {
      categoryName: row.category,
      confidence: FILE_CATEGORY_CONFIDENCE,
      needsReview: false,
    };
  }

  const { categorizer } = getAIService();
  const result = await categorizer.categorize(row.description);
  return {
    categoryName: result.categoryName,
    confidence: result.confidence,
    needsReview: result.needsReview,
  };
}

export async function categorizeImportRows(
  rows: NormalizedImportRow[],
): Promise<Map<number, ImportSuggestion>> {
  const suggestions = new Map<number, ImportSuggestion>();
  await Promise.all(
    rows.map(async (row) => {
      suggestions.set(row.rowIndex, await categorizeImportRow(row));
    }),
  );
  return suggestions;
}