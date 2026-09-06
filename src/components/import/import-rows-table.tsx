"use client";

import * as React from "react";
import { AlertTriangle, Copy } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAmount, majorAmount } from "@/lib/finance/engine";
import { TRANSACTION_TYPE_LABELS } from "@/lib/validation/transaction";
import type { ImportPreviewRow } from "@/lib/import/types";
import type { CategoryServiceData } from "@/lib/services/categories";
import { cn } from "@/lib/utils/cn";

export interface ImportRowsTableProps {
  rows: ImportPreviewRow[];
  currency: string;
  categories: CategoryServiceData[];
  /** Row index -> include. */
  selections: Record<number, boolean>;
  /** Row index -> chosen category id ("" = keep the suggestion). */
  categoryOverrides: Record<number, string>;
  onToggle: (rowIndex: number, include: boolean) => void;
  onCategoryChange: (rowIndex: number, categoryId: string) => void;
}

const PAGE_SIZE = 20;
const typeTone: Record<string, "success" | "danger" | "default"> = {
  income: "success",
  expense: "danger",
  transfer: "default",
};

export function ImportRowsTable({
  rows,
  currency,
  categories,
  selections,
  categoryOverrides,
  onToggle,
  onCategoryChange,
}: ImportRowsTableProps) {
  const [page, setPage] = React.useState(1);

  // Return to the first page whenever a different preview is shown, by
  // adjusting state during the render (the recommended React pattern).
  const [prevRows, setPrevRows] = React.useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }

  const columns: Column<ImportPreviewRow>[] = [
    {
      key: "include",
      header: "Import",
      className: "min-w-36",
      headerClassName: "min-w-36",
      cell: (row) => {
        if (!row.valid) {
          return <span className="text-xs text-muted">—</span>;
        }
        const isDuplicate =
          row.duplicate === "duplicate_existing" ||
          row.duplicate === "duplicate_in_file";
        const checked = !!selections[row.rowIndex];
        return (
          <Checkbox
            checked={checked}
            onChange={(e) => onToggle(row.rowIndex, e.target.checked)}
            label={
              <span className={cn("transition-colors", checked && "font-medium text-brand-strong")}>
                {isDuplicate ? "Import anyway" : "Import"}
              </span>
            }
          />
        );
      },
    },
    {
      key: "sourceRow",
      header: "Row",
      sortValue: (row) => row.sourceRow,
      className: "min-w-14 text-muted tabular-nums",
      headerClassName: "min-w-14",
      cell: (row) => <span className="tabular-nums">#{row.sourceRow}</span>,
    },
    {
      key: "date",
      header: "Date",
      sortValue: (row) => row.date,
      className: "min-w-28",
      headerClassName: "min-w-28",
      cell: (row) => (
        <span
          className={cn(
            "whitespace-nowrap tabular-nums",
            row.warnings.length > 0 && "text-warning underline decoration-dotted",
          )}
          title={row.warnings.length > 0 ? row.warnings.join(" · ") : undefined}
        >
          {row.date}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      sortValue: (row) => row.description.toLowerCase(),
      className: "min-w-52",
      headerClassName: "min-w-52",
      cell: (row) => (
        <div className="min-w-0 max-w-72">
          <p className="truncate font-medium text-foreground" title={row.description}>
            {row.description}
          </p>
          {row.reference && <p className="text-xs text-muted">Ref: {row.reference}</p>}
          {row.errors.length > 0 && (
            <p className="text-xs text-danger">{row.errors.join(" · ")}</p>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => Number(row.amount),
      className: "min-w-24",
      headerClassName: "min-w-24",
      cell: (row) => (
        <span
          className={cn(
            "font-medium tabular-nums",
            row.type === "income"
              ? "text-success"
              : row.type === "expense"
                ? "text-danger"
                : "text-secondary",
          )}
        >
          {row.type === "income" ? "+" : row.type === "expense" ? "−" : ""}
          {formatAmount(majorAmount(row.amount), currency)}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "min-w-20",
      headerClassName: "min-w-20",
      cell: (row) => (
        <Badge tone={typeTone[row.type]}>{TRANSACTION_TYPE_LABELS[row.type]}</Badge>
      ),
    },
    {
      key: "category",
      header: "Category",
      className: "min-w-48",
      headerClassName: "min-w-48",
      cell: (row) => {
        if (row.type === "transfer") {
          return <span className="text-muted">Transfer — none</span>;
        }
        return (
          <Select
            value={categoryOverrides[row.rowIndex] ?? ""}
            onChange={(e) => onCategoryChange(row.rowIndex, e.target.value)}
            className="w-44"
            aria-label={`Category for row ${row.sourceRow}`}
          >
            <option value="">
              Use suggestion · {row.suggestedCategory ?? "Other"}
            </option>
            <option disabled>──────────</option>
            {categories
              .filter((c) => c.type === row.type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isSystem ? `${c.name} (system)` : c.name}
                </option>
              ))}
          </Select>
        );
      },
    },
    {
      key: "flags",
      header: "Status",
      className: "min-w-56",
      headerClassName: "min-w-56",
      cell: (row) => {
        const existing = row.duplicate === "duplicate_existing";
        const inFile = row.duplicate === "duplicate_in_file";
        return (
          <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap items-center gap-1">
              {existing && (
                <Badge tone="info">
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Already exists
                </Badge>
              )}
              {inFile && (
                <Badge tone="default">
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Duplicate in this file
                </Badge>
              )}
              {row.needsReview && (
                <Badge tone="warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Review
                </Badge>
              )}
              {!row.valid && <Badge tone="danger">Invalid</Badge>}
            </div>
            {existing && (
              <p className="max-w-64 text-xs text-muted">
                This transaction matches one already in your ledger.
              </p>
            )}
            {inFile && (
              <p className="max-w-64 text-xs text-muted">
                This transaction looks identical to another transaction in this upload.
              </p>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowKey={(row) => `row-${row.rowIndex}`}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: rows.length,
        onPageChange: setPage,
      }}
      empty={
        <EmptyState
          icon={<Copy className="h-6 w-6" />}
          title="No rows to show"
          description="Select a file with rows to populate the preview."
        />
      }
    />
  );
}