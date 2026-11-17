import * as React from "react";
import Link from "next/link";
import { CalendarRange, FileUp } from "lucide-react";
import { getAnalyticsSummary, type AnalyticsQuery, type AnalyticsSummary } from "@/lib/services";
import { formatAmount, percentChange, round } from "@/lib/finance/engine";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { buttonVariants } from "@/components/ui/button";

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

/**
 * The change badge shown on a KPI card.
 *
 * - `null` when there is no comparison window, or the baseline is negative
 *   (a percentage against a negative baseline is meaningless).
 * - "No change" when both periods are zero, so no percentage is fabricated.
 * - "New" when only the prior period is zero — there is no baseline to
 *   compute a percentage from, but the activity is genuinely new.
 * - otherwise the signed percentage ("+12%", "-3%").
 */
function changeBadge(current: number, prior: number | null | undefined): string | null {
  if (prior === null || prior === undefined) return null;
  if (prior === 0) return current === 0 ? "No change" : "New";
  if (prior < 0) return null;
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
  const revenueDelta = changeBadge(summary.revenue, prior?.revenue);
  const expensesDelta = changeBadge(summary.expenses, prior?.expenses);
  const profitDelta = changeBadge(summary.netProfit, prior?.netProfit);

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatAmount(summary.revenue, currency)}
          delta={revenueDelta}
          href={transactionsHref("income", summary.period)}
          compactOnMobile
        />
        <StatCard
          label="Expenses"
          value={formatAmount(summary.expenses, currency)}
          delta={expensesDelta}
          invertDelta
          href={transactionsHref("expense", summary.period)}
          compactOnMobile
        />
        <StatCard
          label="Net profit"
          value={formatAmount(summary.netProfit, currency)}
          delta={profitDelta}
          href={reportsHref(summary.period)}
          compactOnMobile
        />
        <StatCard
          label="Cash balance"
          value={formatAmount(summary.cashBalance, currency)}
          hint={CASH_BALANCE_HELP}
          href={reportsHref(summary.period)}
          compactOnMobile
        />
      </div>

      {isEmptySummary(summary) &&
        (summary.hasAnyTransactions && hasRange ? (
          <EmptyState
            icon={<CalendarRange className="h-6 w-6" />}
            title="No activity in this period"
            description="Nothing was recorded between these dates."
            action={
              <Link
                href="/overview?range=all"
                className={buttonVariants({ variant: "outline" })}
              >
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                View all time
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No transactions yet"
            description="Import a bank statement to start your books."
            action={
              <Link href="/import" className={buttonVariants()}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Import a statement
              </Link>
            }
          />
        ))}
    </>
  );
}

/** Skeleton grid shown while the analytics summary is loading. */
export function KpiGridFallback() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border xl:grid-cols-4">
      <StatCard label="Revenue" value="" loading compactOnMobile />
      <StatCard label="Expenses" value="" loading compactOnMobile />
      <StatCard label="Net profit" value="" loading compactOnMobile />
      <StatCard label="Cash balance" value="" loading compactOnMobile />
    </div>
  );
}
