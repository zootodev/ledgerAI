// ============================================================
// LedgerAI — tool result schemas (Stage 2)
// ------------------------------------------------------------
// Single source for every verified tool-result contract. The registry
// parses its derivations through these before they are surfaced, so a
// malformed value can never cross the trust boundary.
// ============================================================

import {
  balanceResultSchema,
  categoryDistributionResultSchema,
  categoryExtremityResultSchema,
  categoryListResultSchema,
  expenseImpactResultSchema,
  periodComparisonResultSchema,
  summaryResultSchema,
  transactionCountResultSchema,
} from "@/lib/ask/contracts";

export const extractionSchemas = {
  summary: summaryResultSchema,
  balance: balanceResultSchema,
  categoryList: categoryListResultSchema,
  extremity: categoryExtremityResultSchema,
  distribution: categoryDistributionResultSchema,
  comparison: periodComparisonResultSchema,
  impact: expenseImpactResultSchema,
  count: transactionCountResultSchema,
} as const;

export type VerifiedToolResultKey = keyof typeof extractionSchemas;
export type VerifiedToolResult = {
  [K in VerifiedToolResultKey]: (typeof extractionSchemas)[K]["_output"];
}[VerifiedToolResultKey];