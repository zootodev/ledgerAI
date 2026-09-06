"use client";

import { FileDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-border bg-surface-subtle/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.filename}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(item.createdAt)} · {item.fileType.toUpperCase()}
                  </p>
                  {item.errors && (
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="text-success">+{item.transactionsImported}</span>
                      {item.errors.existingDuplicates > 0 && (
                        <span className="text-muted">
                          {" · "}
                          {item.errors.existingDuplicates} already in ledger
                        </span>
                      )}
                      {item.errors.inFileDuplicates > 0 && (
                        <span className="text-muted">
                          {" · "}
                          {item.errors.inFileDuplicates} duplicate in file
                        </span>
                      )}
                      {item.errors.invalidRows > 0 && (
                        <span className="text-danger">
                          {" · "}
                          {item.errors.invalidRows} invalid
                        </span>
                      )}
                      {item.errors.excluded > 0 && (
                        <span className="text-muted">
                          {" · "}
                          {item.errors.excluded} excluded
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.status === "committed" ? "success" : "warning"}>
                    {item.status}
                  </Badge>
                  <span className="whitespace-nowrap text-sm text-muted tabular-nums">
                    {item.transactionsImported} / {item.transactionsFound} rows
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}