import * as React from "react";
import Link from "next/link";
import { DollarSign, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getAnalyticsSummary, type AnalyticsQuery, type AnalyticsSummary } from "@/lib/services";
import { formatAmount } from "@/lib/finance/engine";
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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatAmount(summary.revenue, currency)}
          icon={<DollarSign className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Expenses"
          value={formatAmount(summary.expenses, currency)}
          icon={<TrendingDown className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Net profit"
          value={formatAmount(summary.netProfit, currency)}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
        />
        <StatCard
          label="Cash balance"
          value={formatAmount(summary.cashBalance, currency)}
          hint={CASH_BALANCE_HELP}
          icon={<Wallet className="h-4.5 w-4.5" />}
        />
      </div>

      {isEmptySummary(summary) && (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No transactions yet"
          description="Add your first income, expense, or transfer and your overview will update here."
          action={
            <Link href="/transactions">
              <Button leftIcon={<Plus className="h-4 w-4" />}>
                Add transaction
              </Button>
            </Link>
          }
        />
      )}
    </>
  );
}

/** Skeleton grid shown while the analytics summary is loading. */
export function KpiGridFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Revenue" value="—" loading />
      <StatCard label="Expenses" value="—" loading />
      <StatCard label="Net profit" value="—" loading />
      <StatCard label="Cash balance" value="—" loading />
    </div>
  );
}