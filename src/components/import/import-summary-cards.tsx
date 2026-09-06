"use client";

import {
  CheckCircle2,
  Copy,
  Eye,
  Rows3,
  XCircle,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { ImportSummary } from "@/lib/import/types";

/** Compact at-a-glance counts for the review and confirm steps. */
export function ImportSummaryCards({
  summary,
}: {
  summary: ImportSummary;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        label="Rows found"
        value={String(summary.total)}
        icon={<Rows3 className="h-4.5 w-4.5" />}
      />
      <StatCard
        label="Ready to import"
        value={String(summary.readyToImport)}
        icon={<CheckCircle2 className="h-4.5 w-4.5" />}
      />
      <StatCard
        label="Duplicates"
        value={String(summary.duplicates)}
        icon={<Copy className="h-4.5 w-4.5" />}
      />
      <StatCard
        label="Needs review"
        value={String(summary.needsReview)}
        icon={<Eye className="h-4.5 w-4.5" />}
      />
      <StatCard
        label="Invalid rows"
        value={String(summary.invalid)}
        icon={<XCircle className="h-4.5 w-4.5" />}
      />
    </div>
  );
}