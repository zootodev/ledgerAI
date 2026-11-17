"use client";

import { StatCard } from "@/components/ui/stat-card";
import type { ImportSummary } from "@/lib/import/types";

/** Compact at-a-glance counts for the review and confirm steps. */
export function ImportSummaryCards({
  summary,
}: {
  summary: ImportSummary;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Rows found" value={String(summary.total)} />
      <StatCard label="Ready to import" value={String(summary.readyToImport)} />
      <StatCard label="Duplicates" value={String(summary.duplicates)} />
      <StatCard label="Needs review" value={String(summary.needsReview)} />
      <StatCard label="Invalid rows" value={String(summary.invalid)} />
    </div>
  );
}
