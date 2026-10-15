import * as React from "react";
import Link from "next/link";
import { FileUp, Inbox, Sparkles, Tag } from "lucide-react";
import { getOverviewActionItems } from "@/lib/services/overview";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Server-rendered "needs your attention" panel for the Overview. Surfaces a
 * bounded set of actionable states from tenant-scoped counts: transactions
 * without a category, low-confidence categorizations, and the latest import
 * outcome. Renders nothing when there is nothing to act on, and never throws
 * (an Overview must keep rendering even if these counts fail).
 */
export async function OverviewActionItems() {
  let items: Awaited<ReturnType<typeof getOverviewActionItems>>;
  try {
    items = await getOverviewActionItems();
  } catch {
    return null;
  }

  const { uncategorizedCount, lowConfidenceCount, latestImport } = items;
  const hasAnything =
    uncategorizedCount > 0 || lowConfidenceCount > 0 || latestImport !== null;
  if (!hasAnything) return null;

  return (
    <section className="space-y-3" aria-label="Needs your attention">
      {uncategorizedCount > 0 && (
        <Alert tone="warning" title="Some transactions aren’t categorized">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {uncategorizedCount} transaction
              {uncategorizedCount === 1 ? "" : "s"} still need
              {uncategorizedCount === 1 ? "s" : ""} a category. Categories power
              your insights and reports.
            </span>
            <Link href="/transactions?uncategorized=1">
              <Button variant="outline" size="sm" leftIcon={<Tag className="h-3.5 w-3.5" />}>
                Review {uncategorizedCount}
              </Button>
            </Link>
          </div>
        </Alert>
      )}

      {lowConfidenceCount > 0 && (
        <Alert tone="info" title="Some categories are low-confidence">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {lowConfidenceCount} transaction
              {lowConfidenceCount === 1 ? "" : "s"} were auto-categorized with
              low confidence. Confirm or correct them to improve future
              suggestions.
            </span>
            <Link href="/transactions?lowConfidence=1">
              <Button variant="outline" size="sm" leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
                Review {lowConfidenceCount}
              </Button>
            </Link>
          </div>
        </Alert>
      )}

      {latestImport && (
        <Alert tone="success" title="Your latest import">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium text-foreground">{latestImport.filename}</span>
              {" — "}
              {latestImport.imported} of {latestImport.found} imported
              {latestImport.existingDuplicates > 0
                ? `, ${latestImport.existingDuplicates} duplicate${latestImport.existingDuplicates === 1 ? "" : "s"} skipped`
                : ""}
              {latestImport.invalidRows > 0
                ? `, ${latestImport.invalidRows} invalid row${latestImport.invalidRows === 1 ? "" : "s"}`
                : ""}
            </span>
            <Link href="/import">
              <Button variant="outline" size="sm" leftIcon={<FileUp className="h-3.5 w-3.5" />}>
                Import again
              </Button>
            </Link>
          </div>
        </Alert>
      )}
    </section>
  );
}
