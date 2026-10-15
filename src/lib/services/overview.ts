// ============================================================
// LedgerAI — Overview action items
// ------------------------------------------------------------
// Small, tenant-scoped counts that let the Overview surface a few
// actionable next steps (transactions needing review, the latest import
// outcome). Every query is scoped to the session-derived business id;
// nothing here performs financial math.
// ============================================================

import { requireAuthContext } from "@/lib/services/auth-context";
import { REVIEW_THRESHOLD } from "@/lib/ai/rules";

/** AI categorizations below the categorizer's review threshold need a look. */
export const LOW_CONFIDENCE_THRESHOLD = REVIEW_THRESHOLD;

export interface LatestImportOutcome {
  id: string;
  filename: string;
  imported: number;
  found: number;
  existingDuplicates: number;
  invalidRows: number;
  createdAt: string;
}

export interface OverviewActionItems {
  /** Non-transfer transactions with no category. */
  uncategorizedCount: number;
  /** Categorized transactions whose AI suggestion is low-confidence. */
  lowConfidenceCount: number;
  /** Most recent import run, or null when none exists. */
  latestImport: LatestImportOutcome | null;
}

/** Counts + latest import for the Overview's actionable-states panel. */
export async function getOverviewActionItems(): Promise<OverviewActionItems> {
  const { prisma, business } = await requireAuthContext();

  const [uncategorizedCount, lowConfidenceCount, latest] = await Promise.all([
    prisma.transaction.count({
      where: {
        businessId: business.id,
        categoryId: null,
        type: { not: "transfer" },
      },
    }),
    prisma.transaction.count({
      where: {
        businessId: business.id,
        categoryId: { not: null },
        aiConfidence: { lt: LOW_CONFIDENCE_THRESHOLD },
      },
    }),
    prisma.import.findFirst({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const raw = (latest?.errors ?? null) as
    | { invalidRows?: number; existingDuplicates?: number }
    | null;

  return {
    uncategorizedCount,
    lowConfidenceCount,
    latestImport: latest
      ? {
          id: latest.id,
          filename: latest.filename,
          imported: latest.transactionsImported,
          found: latest.transactionsFound,
          existingDuplicates:
            typeof raw?.existingDuplicates === "number" ? raw.existingDuplicates : 0,
          invalidRows: typeof raw?.invalidRows === "number" ? raw.invalidRows : 0,
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
  };
}
