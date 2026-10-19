"use client";

import { Badge } from "@/components/ui/badge";
import type { ImportException, ImportExceptionReason } from "@/lib/import/types";

const REASON_LABELS: Record<ImportExceptionReason, string> = {
  invalid: "Invalid",
  duplicate_existing: "Already in ledger",
  duplicate_in_file: "Duplicate in file",
  skipped: "Not a transaction",
  excluded: "Skipped",
};

const REASON_TONES: Record<
  ImportExceptionReason,
  "danger" | "info" | "default" | "warning"
> = {
  invalid: "danger",
  duplicate_existing: "info",
  duplicate_in_file: "default",
  skipped: "default",
  excluded: "warning",
};

/**
 * Compact, read-only list of rows that were not written during an import,
 * each labelled with why. Used by the post-import panel and the history.
 */
export function ImportExceptions({ exceptions }: { exceptions: ImportException[] }) {
  if (exceptions.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {exceptions.map((exception, index) => (
        <li
          key={`${exception.sourceRow}-${exception.reason}-${index}`}
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <Badge tone={REASON_TONES[exception.reason]}>
            {REASON_LABELS[exception.reason]}
          </Badge>
          <span className="whitespace-nowrap text-muted tabular-nums">
            Row {exception.displayRow}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-foreground"
            title={exception.description}
          >
            {exception.description || "—"}
          </span>
          {exception.date && (
            <span className="whitespace-nowrap text-muted tabular-nums">{exception.date}</span>
          )}
          {exception.messages.length > 0 && (
            <span className="text-danger">{exception.messages.join(" · ")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
