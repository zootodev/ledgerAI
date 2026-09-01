"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowLeftRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  DataTable,
  type Column,
  type SortState,
} from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TransactionForm, type TransactionFormValues } from "@/components/transactions/transaction-form";
import { deleteTransactionAction } from "@/lib/actions/transactions";
import { formatAmount, majorAmount } from "@/lib/finance/engine";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from "@/lib/validation/transaction";
import type { ListTransactionsResult, TransactionServiceData } from "@/lib/services/transactions";
import type { AccountServiceData } from "@/lib/services/accounts";
import type { CategoryServiceData } from "@/lib/services/categories";
import type { TransactionListQuery } from "@/lib/validation/transaction";

export interface TransactionsViewProps {
  result: ListTransactionsResult;
  params: TransactionListQuery;
  accounts: AccountServiceData[];
  categories: CategoryServiceData[];
  currency: string;
  title: string;
  /** Locks the list to a single transaction type (income/expense pages). */
  lockedType?: "income" | "expense";
  userName?: string;
  userEmail: string;
  businessName: string;
  onSignOut?: () => void;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

const typeTone: Record<string, "success" | "danger" | "default"> = {
  income: "success",
  expense: "danger",
  transfer: "default",
};

export function TransactionsView({
  result,
  params,
  accounts,
  categories,
  currency,
  title,
  lockedType,
  userName,
  userEmail,
  businessName,
  onSignOut,
}: TransactionsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [searchText, setSearchText] = React.useState(params.search ?? "");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionFormValues | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TransactionServiceData | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoriesById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const hasFilters = Boolean(
    params.search ||
      (!lockedType && params.type) ||
      params.accountId ||
      params.categoryId ||
      params.dateFrom ||
      params.dateTo,
  );

  /** Push a query-patch onto the URL, keeping the other current filters. */
  const push = React.useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      const next = new URLSearchParams();
      for (const [k, v] of Object.entries(params) as [string, unknown][]) {
        if (v !== undefined && v !== null && v !== "") next.set(k, String(v));
      }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.set("page", "1");
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const handleSort = (key: string, direction: "asc" | "desc") => {
    push({ sortBy: key, sortDir: direction });
  };

  const handlePageChange = (page: number) => {
    push({ page: String(page) }, false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (tx: TransactionServiceData) => {
    setEditing({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      accountId: tx.accountId ?? "",
      categoryId: tx.categoryId ?? "",
      reference: tx.reference ?? "",
      notes: tx.notes ?? "",
    });
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    toast.success({
      title: editing ? "Transaction updated" : "Transaction added",
    });
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("id", deleteTarget.id);
      await deleteTransactionAction(fd);
      setDeleteTarget(null);
      toast.success({ title: "Transaction deleted" });
      router.refresh();
    } catch (e) {
      toast.error({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const renderAmount = (tx: TransactionServiceData) => {
    const value = majorAmount(tx.amount);
    const formatted = formatAmount(value, currency);
    if (tx.type === "income") return <span className="font-medium tabular-nums text-success">+{formatted}</span>;
    if (tx.type === "expense") return <span className="font-medium tabular-nums text-danger">−{formatted}</span>;
    return <span className="font-medium tabular-nums text-secondary">{formatted}</span>;
  };

  const columns: Column<TransactionServiceData>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (t) => t.date,
      cell: (t) => (
        <span className="whitespace-nowrap tabular-nums">{formatDate(t.date)}</span>
      ),
    },
    {
      key: "description",
      header: "Description",
      sortValue: (t) => t.description.toLowerCase(),
      cell: (t) => (
        <div>
          <p className="font-medium text-foreground">{t.description}</p>
          {t.reference && (
            <p className="text-xs text-muted">Ref: {t.reference}</p>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (t) => {
        const c = t.categoryId ? categoriesById.get(t.categoryId) : undefined;
        return c ? (
          <Badge tone={c.type === "income" ? "brand" : "info"}>{c.name}</Badge>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "account",
      header: "Account",
      cell: (t) => {
        const a = t.accountId ? accountsById.get(t.accountId) : undefined;
        return a ? (
          <span className="text-secondary">{a.name}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      cell: (t) => (
        <Badge tone={typeTone[t.type]}>
          {TRANSACTION_TYPE_LABELS[t.type]}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (t) => Number(t.amount),
      cell: renderAmount,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <div
          className="inline-flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${t.description}`}
            onClick={() => openEdit(t)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${t.description}`}
            onClick={() => setDeleteTarget(t)}
          >
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  const currentSort: SortState = {
    key: params.sortBy,
    direction: params.sortDir,
  };

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title,
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {lockedType ? TRANSACTION_TYPE_LABELS[lockedType] : "All transactions"}
            </h1>
            <p className="mt-1 text-muted">
              {result.total} {result.total === 1 ? "record" : "records"} · {businessName}
            </p>
          </div>
          <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
            Add transaction
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                push({ search: searchText });
              }}
            >
              <label className="flex min-w-[200px] flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Search
                </span>
                <Input
                  type="search"
                  placeholder="Search descriptions…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-56"
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </label>
              {!lockedType && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    Type
                  </span>
                  <Select
                    value={params.type ?? ""}
                    onChange={(e) =>
                      push({ type: e.target.value || undefined })
                    }
                    className="w-36"
                    aria-label="Filter by type"
                  >
                    <option value="">All types</option>
                    {TRANSACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TRANSACTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Account
                </span>
                <Select
                  value={params.accountId ?? ""}
                  onChange={(e) =>
                    push({ accountId: e.target.value || undefined })
                  }
                  className="w-44"
                  aria-label="Filter by account"
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Category
                </span>
                <Select
                  value={params.categoryId ?? ""}
                  onChange={(e) =>
                    push({ categoryId: e.target.value || undefined })
                  }
                  className="w-40"
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  From
                </span>
                <Input
                  type="date"
                  value={params.dateFrom ?? ""}
                  onChange={(e) => push({ dateFrom: e.target.value || undefined })}
                  className="w-40"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  To
                </span>
                <Input
                  type="date"
                  value={params.dateTo ?? ""}
                  onChange={(e) => push({ dateTo: e.target.value || undefined })}
                  className="w-40"
                />
              </label>
              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchText("");
                    push({
                      search: undefined,
                      type: undefined,
                      accountId: undefined,
                      categoryId: undefined,
                      dateFrom: undefined,
                      dateTo: undefined,
                    });
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </form>
          </div>

          <DataTable
            columns={columns}
            data={result.items}
            rowKey={(t) => t.id}
            sort={currentSort}
            onSort={handleSort}
            pagination={{
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
              onPageChange: handlePageChange,
            }}
            loading={isPending}
            onRowClick={openEdit}
            empty={
              <EmptyState
                icon={<ArrowLeftRight className="h-6 w-6" />}
                title={hasFilters ? "No matching transactions" : "No transactions yet"}
                description={
                  hasFilters
                    ? "Try adjusting or clearing your filters."
                    : "Add your first transaction to start tracking income and expenses."
                }
                action={
                  !hasFilters ? (
                    <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                      Add transaction
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </Card>
      </div>

      {formOpen && (
        <TransactionForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          transaction={editing}
          defaultType={lockedType}
          accounts={accounts}
          categories={categories}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        pending={deleting}
        title="Delete transaction?"
        description={
          deleteTarget ? (
            <>
              &ldquo;{deleteTarget.description}&rdquo; on{" "}
              {formatDate(deleteTarget.date)} will be permanently removed.
            </>
          ) : undefined
        }
      />
    </AppShell>
  );
}