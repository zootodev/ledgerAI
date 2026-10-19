"use client";

import { FileDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportExceptions } from "@/components/import/import-exceptions";
import type { ImportHistoryItem } from "@/lib/services/imports";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface SummaryPart {
  key: string;
  text: string;
  /** Optional tone class; omitted parts render in the inherited muted colour. */
  tone?: string;
}

type ImportOutcome = "full" | "partial" | "none";

/**
 * How an import went. "none" means nothing landed in the ledger (every row was
 * a duplicate or invalid), "partial" means only some rows landed, and "full"
 * means every row in the file did.
 */
function importOutcome(item: ImportHistoryItem): ImportOutcome {
  if (item.transactionsImported <= 0) return "none";
  if (item.transactionsFound > 0 && item.transactionsImported >= item.transactionsFound) {
    return "full";
  }
  return "partial";
}

/** Tone + copy for the leading "N of M imported" summary part. */
function importedSummary(item: ImportHistoryItem): SummaryPart {
  const outcome = importOutcome(item);
  if (outcome === "none") {
    return { key: "imported", text: "No rows imported", tone: "text-danger-strong" };
  }
  const counts = `${item.transactionsImported} of ${item.transactionsFound} imported`;
  if (outcome === "partial") {
    return { key: "imported", text: `Partial import — ${counts}`, tone: "text-warning-strong" };
  }
  return { key: "imported", text: counts, tone: "text-success-strong" };
}

/**
 * One consistent row summary for every import — "14 of 16 imported · 1 invalid
 * · 1 excluded" — so the newest and oldest rows read the same way instead of
 * the latest row showing a bare "+14". The leading part is coloured by outcome:
 * green for a full import, amber for a partial one, red when nothing landed.
 */
function summaryParts(item: ImportHistoryItem): SummaryPart[] {
  const parts: SummaryPart[] = [importedSummary(item)];
  const errors = item.errors;
  if (errors) {
    if (errors.invalidRows > 0) {
      parts.push({ key: "invalid", text: `${errors.invalidRows} invalid`, tone: "text-danger-strong" });
    }
    if (errors.skipped > 0) {
      parts.push({ key: "skipped", text: `${errors.skipped} not a transaction` });
    }
    if (errors.excluded > 0) {
      parts.push({ key: "excluded", text: `${errors.excluded} excluded` });
    }
    if (errors.existingDuplicates > 0) {
      parts.push({
        key: "existingDuplicates",
        text: `${errors.existingDuplicates} already in ledger`,
      });
    }
    if (errors.inFileDuplicates > 0) {
      parts.push({
        key: "inFileDuplicates",
        text: `${errors.inFileDuplicates} duplicate in file`,
      });
    }
  }
  return parts;
}

/** Badge tone for the import status, honest about a low-yield commit. */
function statusTone(item: ImportHistoryItem): "success" | "warning" | "danger" {
  if (item.status !== "committed") return "warning";
  const outcome = importOutcome(item);
  if (outcome === "full") return "success";
  return outcome === "partial" ? "warning" : "danger";
}

export function ImportHistory({ items }: { items: ImportHistoryItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-subtle" aria-hidden="true" />
          Recent imports
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<FileDown className="h-5 w-5" />}
            title="Nothing imported yet"
            description="Imported statements will appear here with their row counts."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-field border border-border bg-surface-subtle/40 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.filename}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(item.createdAt)} · {item.fileType.toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {summaryParts(item).map((part, i) => (
                        <span key={part.key}>
                          {i > 0 && <span className="text-muted"> · </span>}
                          <span className={part.tone}>{part.text}</span>
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(item)}>
                      {item.status}
                    </Badge>
                  </div>
                </div>
                {item.errors && item.errors.exceptions.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted">
                      {item.errors.exceptions.length} row
                      {item.errors.exceptions.length === 1 ? "" : "s"} not imported — view details
                    </summary>
                    <div className="mt-2">
                      <ImportExceptions exceptions={item.errors.exceptions} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}