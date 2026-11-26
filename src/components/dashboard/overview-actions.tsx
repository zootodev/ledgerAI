import * as React from "react";
import Link from "next/link";
import { FileUp, Inbox, Tag } from "lucide-react";
import { getOverviewActionItems, LOW_CONFIDENCE_THRESHOLD } from "@/lib/services/overview";
import { countPhrase } from "@/lib/utils/pluralise";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

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

  const { uncategorizedCount, lowConfidenceCount, lowConfidenceGroups, latestImport } = items;
  const hasAnything =
    uncategorizedCount > 0 || lowConfidenceCount > 0 || latestImport !== null;
  if (!hasAnything) return null;

  // Shown so "low confidence" is measurable rather than vague. This is the
  // same threshold the Review queue uses.
  const reviewPercent = Math.round(LOW_CONFIDENCE_THRESHOLD * 100);

  return (
    <section className="space-y-3" aria-label="Needs your attention">
      {uncategorizedCount > 0 && (
        <Alert tone="warning" title="Some rows still need a category">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {countPhrase(uncategorizedCount, "transaction", { verb: ["has", "have"] })} no
              category yet. Reports group spending by category.
            </span>
            <Link
              href="/transactions?uncategorized=1"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Review {uncategorizedCount}
            </Link>
          </div>
        </Alert>
      )}

      {lowConfidenceCount > 0 && (
        <Alert tone="info" title="Some categories need a second look">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {countPhrase(lowConfidenceCount, "transaction")} in{" "}
              {countPhrase(lowConfidenceGroups, "group")} need a quick check, about 2 minutes.
              Accept a suggestion or correct a whole group, and the next import learns the
              pattern. Under {reviewPercent}% goes to Review.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {/* Plain anchor: works before hydration and cannot be swallowed by an overlay. */}
              <a
                href="/review"
                className={buttonVariants({ variant: "primary", size: "sm" })}
                data-start-review
              >
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                Start review
              </a>
              <Link
                href="/transactions?lowConfidence=1"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Review row by row
              </Link>
            </div>
          </div>
        </Alert>
      )}

      {latestImport && (
        <Alert tone="success" title="Latest import">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-words font-medium text-foreground">
                    {latestImport.filename}
                  </span>
                </span>{" "}
                <span className="text-sm text-muted">
                  {latestImport.imported} of {countPhrase(latestImport.found, "row")} imported
                  {latestImport.existingDuplicates > 0
                    ? `, ${countPhrase(latestImport.existingDuplicates, "duplicate")} skipped`
                    : ""}
                  {latestImport.invalidRows > 0
                    ? `, ${countPhrase(latestImport.invalidRows, "invalid row")}`
                    : ""}
                </span>
              </div>
            </div>
            <Link
              href="/import"
              className={buttonVariants({ variant: "outline", size: "sm", className: "self-start sm:self-auto" })}
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              Import again
            </Link>
          </div>
        </Alert>
      )}
    </section>
  );
}
