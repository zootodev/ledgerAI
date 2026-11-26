"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Undo2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  acceptAllRemainingAction,
  applyReviewGroupAction,
  listMoreReviewGroupsAction,
  undoReviewGroupAction,
} from "@/lib/actions/review";
import {
  confirmTransactionCategoryAction,
  setTransactionCategoryAction,
} from "@/lib/actions/transactions";
import { formatAmount, majorAmount } from "@/lib/finance/engine";
import type { ReviewGroup } from "@/lib/review/groups";
import type { CategoryServiceData } from "@/lib/services/categories";
import type { TransactionActionState } from "@/lib/actions/transactions";

export interface ReviewViewProps {
  initialGroups: ReviewGroup[];
  totalGroups: number;
  totalRows: number;
  totalAmount: number;
  categories: CategoryServiceData[];
  currency: string;
  userName?: string;
  userEmail: string;
  businessName?: string;
  onSignOut: () => void | Promise<void>;
}

const UNDO_TOKEN_KEY = "ledgerai-review-undo";

const shortDate = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function ReviewView({
  initialGroups,
  totalGroups,
  totalRows,
  totalAmount,
  categories,
  currency,
  userName,
  userEmail,
  onSignOut,
}: ReviewViewProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [groups, setGroups] = React.useState(initialGroups);
  const [loadedCount, setLoadedCount] = React.useState(initialGroups.length);
  const [doneCount, setDoneCount] = React.useState(0);
  const [total, setTotal] = React.useState(totalGroups);
  const [remainingRows, setRemainingRows] = React.useState(totalRows);
  const [remainingAmount, setRemainingAmount] = React.useState(totalAmount);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [rowPendingId, setRowPendingId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selection, setSelection] = React.useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [acceptingAll, setAcceptingAll] = React.useState(false);

  const money = (value: number) => formatAmount(majorAmount(value), currency);

  const notifyApplied = (affected: number, cleared: number) => {
    success({
      title: `${affected} ${affected === 1 ? "row" : "rows"} reviewed`,
      description: (
        <span className="flex flex-wrap items-center gap-1">
          {cleared > 0 && <span>{cleared} cleared automatically. </span>}
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
            onClick={() => void handleUndo()}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Undo
          </button>
        </span>
      ),
      duration: 10_000,
    });
  };

  async function handleUndo() {
    const fd = new FormData();
    fd.set("token", window.sessionStorage.getItem(UNDO_TOKEN_KEY) ?? "");
    const result = await undoReviewGroupAction(fd);
    window.sessionStorage.removeItem(UNDO_TOKEN_KEY);
    if (!result.ok) {
      showError({ title: "Couldn't undo", description: result.error });
      return;
    }
    const refreshFd = new FormData();
    refreshFd.set("offset", "0");
    const refreshed = await listMoreReviewGroupsAction(refreshFd);
    if (refreshed.ok) {
      setGroups(refreshed.groups ?? []);
      setLoadedCount((refreshed.groups ?? []).length);
      setTotal(refreshed.totalGroups ?? total);
      setRemainingRows(refreshed.totalRows ?? remainingRows);
      setRemainingAmount(refreshed.totalAmount ?? remainingAmount);
      setDoneCount((count) => Math.max(0, count - 1));
    }
    success({ title: `${result.restored ?? 0} rows restored`, duration: 5_000 });
    router.refresh();
  }

  async function applyGroup(group: ReviewGroup, categoryId?: string) {
    setPendingKey(group.key);
    try {
      const fd = new FormData();
      fd.set("groupKey", group.key);
      if (categoryId) fd.set("categoryId", categoryId);
      const result = await applyReviewGroupAction(fd);
      if (!result.ok) {
        showError({ title: "Couldn't review this group", description: result.error });
        return;
      }
      setGroups((current) => current.filter((item) => item.key !== group.key));
      setDoneCount((count) => count + 1);
      setRemainingRows((count) => Math.max(0, count - (result.affected ?? 0)));
      setRemainingAmount((value) => Math.max(0, value - group.totalAmount));
      if (result.undoToken) window.sessionStorage.setItem(UNDO_TOKEN_KEY, result.undoToken);
      notifyApplied(result.affected ?? 0, result.clearedByCascade ?? 0);
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  async function applyRow(
    groupKey: string,
    rowId: string,
    categoryId: string | undefined,
  ) {
    setRowPendingId(rowId);
    try {
      const fd = new FormData();
      fd.set("id", rowId);
      const result: TransactionActionState = categoryId
        ? await setTransactionCategoryAction(fdWith(fd, "categoryId", categoryId))
        : await confirmTransactionCategoryAction(fd);
      if (!result.ok) {
        showError({ title: "Couldn't update this row", description: result.error });
        return;
      }
      setGroups((current) =>
        current.map((group) =>
          group.key !== groupKey
            ? group
            : {
                ...group,
                rows: group.rows.filter((row) => row.id !== rowId),
                rowCount: group.rowCount - 1,
                totalAmount: Math.max(
                  0,
                  group.totalAmount - Math.abs(Number(group.rows.find((r) => r.id === rowId)?.amount ?? 0)),
                ),
              },
        ),
      );
      setRemainingRows((count) => Math.max(0, count - 1));
      success({ title: categoryId ? "Category updated" : "Suggestion accepted" });
      router.refresh();
    } finally {
      setRowPendingId(null);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const fd = new FormData();
      fd.set("offset", String(loadedCount));
      const result = await listMoreReviewGroupsAction(fd);
      if (!result.ok || !result.groups) {
        showError({ title: "Couldn't load more groups", description: result.error });
        return;
      }
      setGroups((current) => [...current, ...result.groups!]);
      setLoadedCount((count) => count + result.groups!.length);
    } finally {
      setLoadingMore(false);
    }
  }

  async function acceptAll() {
    setAcceptingAll(true);
    try {
      const result = await acceptAllRemainingAction(new FormData());
      if (!result.ok) {
        showError({ title: "Couldn't accept all suggestions", description: result.error });
        return;
      }
      setGroups([]);
      setLoadedCount(0);
      setDoneCount(total);
      setRemainingRows(0);
      setRemainingAmount(0);
      setConfirmOpen(false);
      if (result.undoToken) window.sessionStorage.setItem(UNDO_TOKEN_KEY, result.undoToken);
      notifyApplied(result.affected ?? 0, result.clearedByCascade ?? 0);
      router.refresh();
    } finally {
      setAcceptingAll(false);
    }
  }

  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (total === 0) {
    return (
      <AppShell
        onSignOut={onSignOut}
        header={{ title: "Review", user: userName ? { name: userName, email: userEmail } : null }}
      >
        <Card className="mx-auto max-w-2xl p-6 text-center">
          <CardTitle>Nothing to review</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Every low-confidence category has been checked. New imports will appear here when
            a suggestion needs a second look.
          </p>
          <Link href="/overview" className="mt-4 inline-block text-sm text-primary underline">
            Back to Overview
          </Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{ title: "Quick review", user: userName ? { name: userName, email: userEmail } : null }}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Quick category review
            </h1>
            <p
              className="text-sm text-muted"
              aria-live="polite"
              aria-label={`${doneCount} of ${total} groups done, ${remainingRows} rows left, ${money(remainingAmount)}`}
              data-review-progress
            >
              {doneCount}{" "}of {total} groups done · {remainingRows}{" "}
              rows left · {money(remainingAmount)}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle sm:w-56">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (doneCount / Math.max(1, total)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Alert tone="info" className="min-w-0 flex-1">
            Same merchant and suggestion are grouped together. Accepting or correcting a group
            teaches the rule for future imports; every row in the group is updated in one go.
          </Alert>
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={acceptingAll || remainingRows === 0}
          >
            Accept all remaining suggestions
          </Button>
        </div>

        <div className="space-y-3">
          {groups.map((group) => {
            const allowed = categories.filter((category) =>
              group.rows.every((row) => row.type === category.type),
            );
            const open = expanded.has(group.key);
            return (
              <Card key={group.key} className="min-w-0" data-review-group={group.key}>
                <CardHeader className="gap-2">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="break-words">{group.label}</CardTitle>
                      <p
                        className="mt-1 text-xs text-muted"
                        aria-label={`${group.rowCount} ${group.rowCount === 1 ? "row" : "rows"}, ${group.typeLabel}, ${shortDate(group.dateFrom)} to ${shortDate(group.dateTo)}, ${money(group.totalAmount)}`}
                      >
                        {group.rowCount}{" "}
                        {group.rowCount === 1 ? "row" : "rows"} · {group.typeLabel} ·{" "}
                        {shortDate(group.dateFrom)}–{shortDate(group.dateTo)} ·{" "}
                        {money(group.totalAmount)}
                      </p>
                    </div>
                    <Badge tone="default" variant="soft" className="shrink-0">
                      Suggested: {group.suggestedCategory}
                    </Badge>
                  </div>
                  <ul className="min-w-0 space-y-0.5 text-sm text-muted">
                    {group.samples.map((sample, index) => (
                      <li key={`${group.key}-sample-${index}`} className="break-words">
                        {sample}
                      </li>
                    ))}
                  </ul>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={pendingKey === group.key}
                      onClick={() => void applyGroup(group)}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Accept all {group.rowCount}
                    </Button>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Select
                        aria-label={`Category for ${group.label}`}
                        value={selection[group.key] ?? ""}
                        onChange={(event) =>
                          setSelection((current) => ({
                            ...current,
                            [group.key]: event.target.value,
                          }))
                        }
                        placeholder="Pick another category"
                        className="min-w-0"
                      >
                        {allowed.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={pendingKey === group.key}
                        disabled={!selection[group.key]}
                        onClick={() => void applyGroup(group, selection[group.key])}
                      >
                        Apply to all
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(group.key)}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                    {open ? "Hide rows" : `See all ${group.rowCount} rows`}
                  </button>

                  {open && (
                    <ul className="space-y-2 border-t border-border pt-3">
                      {group.rows.map((row) => {
                        const rowCategories = categories.filter(
                          (category) => category.type === row.type,
                        );
                        return (
                          <li
                            key={row.id}
                            className="flex min-w-0 flex-col gap-2 rounded-field bg-surface-subtle p-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-sm text-foreground">
                                {row.description}
                              </p>
                              <p className="text-xs text-muted">
                                {shortDate(row.date)} · {money(Math.abs(Number(row.amount)))} ·{" "}
                                {row.type}
                              </p>
                            </div>
                            <div className="flex min-w-0 items-center gap-2">
                              <Select
                                aria-label={`Category for ${row.description}`}
                                defaultValue=""
                                className="min-w-0"
                              >
                                {rowCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={rowPendingId === row.id}
                                onClick={(event) => {
                                  const select = event.currentTarget.parentElement?.querySelector("select");
                                  void applyRow(group.key, row.id, select?.value || undefined);
                                }}
                              >
                                Save row
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {groups.length === 0 && (
          <Alert tone="success" title="All loaded groups reviewed">
            {remainingRows > 0 ? "Do 10 more to keep going." : "Nothing left in Review."}
          </Alert>
        )}

        {loadedCount < total && (
          <Button variant="outline" onClick={() => void loadMore()} loading={loadingMore}>
            Do 10 more
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void acceptAll()}
        title="Accept all remaining suggestions?"
        description={
          <span>
            This accepts the suggested category for {remainingRows} transactions totalling{" "}
            {money(remainingAmount)}. You can undo it for about 10 seconds.
          </span>
        }
        notice="Only categories change. Transaction types stay exactly as imported."
        confirmLabel="Accept all"
        confirmVariant="primary"
        pending={acceptingAll}
      />
    </AppShell>
  );
}

function fdWith(fd: FormData, key: string, value: string): FormData {
  fd.set(key, value);
  return fd;
}
