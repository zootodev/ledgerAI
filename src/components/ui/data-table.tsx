"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SortDirection = "asc" | "desc";

export interface Column<T> {
  key: string;
  header?: React.ReactNode;
  /** Optional sort accessor — if set, the column is sortable. */
  sortValue?: (row: T) => string | number;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export type SortState = { key: string; direction: SortDirection } | null;

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Client-side sorting takes over when this is undefined. */
  sort?: SortState;
  onSort?: (key: string, direction: SortDirection) => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  empty?: React.ReactNode;
  error?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  rowKey,
  sort,
  onSort,
  pagination,
  loading = false,
  empty,
  error,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const isControlled = sort !== undefined;
  const [localSort, setLocalSort] = React.useState<SortState>(null);
  const effectiveSort = isControlled ? sort : localSort;
  const pageSize = pagination?.pageSize ?? 10;

  const sortedData = React.useMemo(() => {
    if (isControlled) return data;
    if (!effectiveSort) return data;
    const col = columns.find((c) => c.key === effectiveSort.key);
    if (!col?.sortValue) return data;
    return [...data].sort((a, b) => {
      const av = String(col.sortValue!(a));
      const bv = String(col.sortValue!(b));
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return effectiveSort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, isControlled, effectiveSort, columns]);

  const totalCount = pagination?.total ?? data.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / (pagination?.pageSize ?? pageSize)),
  );
  const currentPage = pagination?.page ?? 1;

  const displayedData = React.useMemo(() => {
    if (pagination) {
      const start = (pagination.page - 1) * pagination.pageSize;
      return sortedData.slice(start, start + pagination.pageSize);
    }
    return sortedData;
  }, [sortedData, pagination]);

  const handleSortClick = (col: Column<T>) => {
    if (!col.sortValue) return;
    const next: SortDirection =
      effectiveSort?.key === col.key && effectiveSort.direction === "asc"
        ? "desc"
        : "asc";
    if (onSort) {
      onSort(col.key, next);
    } else {
      setLocalSort({ key: col.key, direction: next });
    }
  };

  const handlePageChange = (page: number) => {
    if (pagination) pagination.onPageChange(page);
  };

  // Horizontal overflow cue: fade the right edge when the table content
  // extends past the wrapper and the user hasn't scrolled to the end.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollCue = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setCanScrollRight(scrollable && !atEnd);
  }, []);

  React.useEffect(() => {
    updateScrollCue();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollCue, { passive: true });
    const observer = new ResizeObserver(updateScrollCue);
    observer.observe(el);
    window.addEventListener("resize", updateScrollCue);
    return () => {
      el.removeEventListener("scroll", updateScrollCue);
      observer.disconnect();
      window.removeEventListener("resize", updateScrollCue);
    };
  }, [updateScrollCue]);

  const renderSortIcon = (col: Column<T>) => {
    if (!col.sortValue) return null;
    if (effectiveSort?.key === col.key) {
      return effectiveSort.direction === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
      );
    }
    return <ChevronsUpDown className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />;
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-card border border-border bg-surface">
        <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-subtle/60">
                {columns.map((col) => {
                  const sortable = !!col.sortValue;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={
                        effectiveSort?.key === col.key
                          ? effectiveSort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={cn(
                        "px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted",
                        alignClass[col.align ?? "left"],
                        col.headerClassName,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => (sortable ? handleSortClick(col) : undefined)}
                        className={cn(
                          "inline-flex items-center gap-1",
                          col.align === "right" && "flex-row-reverse",
                          sortable ? "cursor-pointer hover:text-foreground" : "cursor-default",
                        )}
                      >
                        {col.header}
                        {renderSortIcon(col)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`loading-${i}`} className="border-b border-border last:border-0">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-surface-subtle" />
                      </td>
                    ))}
                  </tr>
                ))
              : error
                ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8">
                        {error}
                      </td>
                    </tr>
                  )
                : displayedData.length === 0
                  ? (
                      <tr>
                        <td colSpan={columns.length} className="px-4 py-8">
                          {empty ?? (
                            <p className="text-center text-sm text-muted">
                              No records found.
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  : displayedData.map((row) => (
                      <tr
                        key={rowKey(row)}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={cn(
                          "border-b border-border transition-colors last:border-0",
                          onRowClick && "cursor-pointer hover:bg-surface-subtle/60",
                        )}
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={cn(
                              "px-4 py-3 align-middle text-foreground",
                              alignClass[col.align ?? "left"],
                              col.className,
                            )}
                          >
                            {col.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
          </tbody>
        </table>
        </div>
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
          />
        )}
      </div>

      {pagination && totalPages > 1 && !loading && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-muted">
            Showing{" "}
            <span className="font-medium text-foreground tabular-nums">
              {(currentPage - 1) * pageSize + 1}
            </span>
            {" – "}
            <span className="font-medium text-foreground tabular-nums">
              {Math.min(currentPage * pageSize, totalCount)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground tabular-nums">
              {totalCount}
            </span>
          </p>
          <div className="flex items-center gap-1">
            <PageButton
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </PageButton>
            <PageButton
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </PageButton>
            <span className="px-2 text-muted tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <PageButton
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </PageButton>
            <PageButton
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PageButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-field text-secondary",
        "transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
