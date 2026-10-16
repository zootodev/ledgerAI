import * as React from "react";
import Link from "next/link";
import { CalendarRange, DollarSign, FileUp, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getAnalyticsSummary, type AnalyticsQuery, type AnalyticsSummary } from "@/lib/services";
import { formatAmount, percentChange, round } from "@/lib/finance/engine";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";

/** Help text for the Cash Balance KPI (ledger-derived, not a bank statement). */
export const CASH_BALANCE_HELP =
  "Ledger-derived cash position based on recorded income and expenses. It does not represent a verified bank statement balance.";

/** A fully-zero summary means the business has no recorded transactions yet. */
export function isEmptySummary(summary: AnalyticsSummary): boolean {
  return (
    summary.revenue === 0 &&
    summary.expenses === 0 &&
    summary.transfers === 0 &&
    summary.netProfit === 0 &&
    summary.cashBalance === 0
  );
}

export interface KpiGridProps {
  currency: string;
  /** Optional validated date range; when omitted the KPIs report all time. */
  range?: AnalyticsQuery;
}

/** Signed percent delta string ("+12%", "-3%") or null when there is no baseline. */
function signedPercent(current: number, prior: number | null | undefined): string | null {
  if (prior === null || prior === undefined || prior <= 0) return null;
  const delta = percentChange(current, prior);
  if (delta === null) return null;
  const rounded = round(delta, 0);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded)}%`;
}

/** Link to the filtered transactions list for a KPI (dates use the transactions schema). */
function transactionsHref(type: "income" | "expense", period: AnalyticsSummary["period"]): string {
  const params = new URLSearchParams({ type });
  if (period.from) params.set("dateFrom", period.from);
  if (period.to) params.set("dateTo", period.to);
  return `/transactions?${params.toString()}`;
}

/** Link to the report for the same period (reports use from/to). */
function reportsHref(period: AnalyticsSummary["period"]): string {
  const params = new URLSearchParams();
  if (period.from) params.set("from", period.from);
  if (period.to) params.set("to", period.to);
  const qs = params.toString();
  return qs ? `/reports?${qs}` : "/reports";
}

/**
 * Server-rendered KPI cards for the Overview page. Fetches the Phase 5A
 * analytics summary (scoped to the session business) and formats values with
 * the existing engine, so no financial logic is duplicated here.
 */
export async function AnalyticsKpiGrid({ currency, range }: KpiGridProps) {
  let summary: AnalyticsSummary;
  try {
    summary = await getAnalyticsSummary(range ?? {});
  } catch (err) {
    return (
      <ErrorState
        title="Couldn't load your overview"
        description={err instanceof Error ? err.message : undefined}
      />
    );
  }

  const hasRange = Boolean(range?.dateFrom || range?.dateTo);
  const prior = summary.prior;
  const revenueDelta = signedPercent(summary.revenue, prior?.revenue);
  const expensesDelta = signedPercent(summary.expenses, prior?.expenses);
  const profitDelta = signedPercent(summary.netProfit, prior?.netProfit);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatAmount(summary.revenue, currency)}
          delta={revenueDelta}
          href={transactionsHref("income", summary.period)}
          icon={<DollarSign className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Expenses"
          value={formatAmount(summary.expenses, currency)}
          delta={expensesDelta}
          invertDelta
          href={transactionsHref("expense", summary.period)}
          icon={<TrendingDown className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Net profit"
          value={formatAmount(summary.netProfit, currency)}
          delta={profitDelta}
          href={reportsHref(summary.period)}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Cash balance"
          value={formatAmount(summary.cashBalance, currency)}
          hint={CASH_BALANCE_HELP}
          href={reportsHref(summary.period)}
          icon={<Wallet className="h-4.5 w-4.5" />}
        />
      </div>

      {isEmptySummary(summary) &&
        (summary.hasAnyTransactions && hasRange ? (
          <EmptyState
            icon={<CalendarRange className="h-6 w-6" />}
            title="No activity in this period"
            description="There are no transactions in the selected range. View all time or import a statement to see more."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/overview?range=all">
                  <Button variant="outline" leftIcon={<CalendarRange className="h-4 w-4" />}>
                    View all time
                  </Button>
                </Link>
                <Link href="/import">
                  <Button leftIcon={<FileUp className="h-4 w-4" />}>
                    Import a statement
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No transactions yet"
            description="Add your first income, expense, or transfer — or import a bank statement — and your overview will update here."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/transactions">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>
                    Add transaction
                  </Button>
                </Link>
                <Link href="/import">
                  <Button variant="outline" leftIcon={<FileUp className="h-4 w-4" />}>
                    Import a statement
                  </Button>
                </Link>
              </div>
            }
          />
        ))}
    </>
  );
}

/** Skeleton grid shown while the analytics summary is loading. */
export function KpiGridFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Revenue" value="—" loading />
      <StatCard label="Expenses" value="—" loading />
      <StatCard label="Net profit" value="—" loading />
      <StatCard label="Cash balance" value="—" loading />
    </div>
  );
}
