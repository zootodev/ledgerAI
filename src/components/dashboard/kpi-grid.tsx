import * as React from "react";
import Link from "next/link";
import { CalendarRange, FileUp } from "lucide-react";
import { getAnalyticsSummary, type AnalyticsQuery, type AnalyticsSummary } from "@/lib/services";
import { formatAmount, percentChange, round } from "@/lib/finance/engine";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { buttonVariants } from "@/components/ui/button";

/** Cash balance is a point-in-time snapshot, unlike the three flow KPIs. */
export const CASH_BALANCE_HELP = "All time, not just this range";

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
 * Human label for the comparison window, derived from the applied range so the
 * badge says "previous 90 days" / "last month" to match what the user picked.
 */
export function priorPeriodLabel(period: {
  from: string | null;
  to: string | null;
}): string {
  if (!period.from || !period.to) return "previous period";
  const from = new Date(`${period.from}T00:00:00.000Z`);
  const to = new Date(`${period.to}T00:00:00.000Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
    return "previous period";
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const monthStart = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1);
  const monthEnd = Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0);
  const yearStart = Date.UTC(from.getUTCFullYear(), 0, 1);
  const yearEnd = Date.UTC(to.getUTCFullYear(), 11, 31);

  if (from.getTime() === monthStart && to.getTime() === monthEnd && from.getUTCFullYear() === to.getUTCFullYear()) {
    return "last month";
  }
  if (from.getTime() === yearStart && to.getTime() === yearEnd && from.getUTCFullYear() === to.getUTCFullYear()) {
    return "last year";
  }
  return days === 1 ? "previous day" : `previous ${days} days`;
}

export interface BadgeContext {
  /** Comparison window as a phrase, e.g. "previous 90 days". */
  comparison?: string;
  /** Profit can cross zero; flow metrics normally cannot. */
  kind?: "profit" | "flow";
}

export interface ChangeBadgeParts {
  /** Short badge text (the percentage or a plain-words comparison). */
  label: string;
  /** Small subtitle carrying the prior figure and comparison window. */
  detail: string;
}

/**
 * The change badge shown on a KPI card. Presentation only — every figure
 * comes from the same analytics summary that produced the tile value.
 *
 * - `null` when there is no comparison window at all.
 * - "No change" when both periods (or the rounded delta) are zero, so a
 *   fabricated "-100%" can never appear next to a flat-zero tile.
 * - "New" when only the prior period is zero (no baseline to divide by).
 * - For profit, a signed currency delta ("+₦50,892.21 vs previous 90 days"):
 *   percentages are meaningless when the baseline is negative or zero.
 * - Plain words for flow metrics when the sign flips — a percentage against
 *   a negative flow is meaningless.
 * - Otherwise one signed percentage, including changes above 100%.
 */
export function changeBadge(
  current: number,
  prior: number | null | undefined,
  currency: string,
  context: BadgeContext = {},
): ChangeBadgeParts | null {
  if (prior === null || prior === undefined) return null;
  const comparison = context.comparison ?? "previous period";
  const priorAmount = formatAmount(prior, currency);
  const detail = `was ${priorAmount}`;

  if (current === 0 && prior === 0) return { label: "No change", detail };

  // Profit can cross (or start below) zero, so a percentage would be either
  // meaningless or absurd. Give the actual change in money instead; the sign
  // alone says whether profit improved, and StatCard colours it accordingly.
  if (context.kind === "profit") {
    const difference = round(current - prior, 2);
    if (difference === 0) return { label: "No change", detail };
    return {
      label: `${difference > 0 ? "+" : "-"}${formatAmount(Math.abs(difference), currency)} vs ${comparison}`,
      detail,
    };
  }

  if (prior === 0) return { label: "New", detail };

  const crossedZero = prior < 0 || current < 0;
  if (crossedZero) {
    const direction = current > prior ? "Up" : "Down";
    return { label: `${direction} from ${priorAmount}`, detail };
  }

  const delta = percentChange(current, prior);
  if (delta === null) return null;
  const rounded = round(delta, 0);
  if (rounded === 0) return { label: "No change", detail };
  return {
    label: `${rounded > 0 ? "+" : "-"}${Math.abs(rounded)}% vs ${comparison}`,
    detail,
  };
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
  const comparison = prior ? priorPeriodLabel(summary.period) : undefined;
  const badgeContext = { comparison, kind: "flow" as const };
  const revenueBadge = changeBadge(summary.revenue, prior?.revenue, currency, badgeContext);
  const expensesBadge = changeBadge(summary.expenses, prior?.expenses, currency, badgeContext);
  const profitBadge = changeBadge(summary.netProfit, prior?.netProfit, currency, {
    ...badgeContext,
    kind: "profit",
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatAmount(summary.revenue, currency)}
          delta={revenueBadge?.label}
          detail={revenueBadge?.detail}
          href={transactionsHref("income", summary.period)}
          compactOnMobile
        />
        <StatCard
          label="Expenses"
          value={formatAmount(summary.expenses, currency)}
          delta={expensesBadge?.label}
          detail={expensesBadge?.detail}
          invertDelta
          href={transactionsHref("expense", summary.period)}
          compactOnMobile
        />
        <StatCard
          label="Net profit"
          value={formatAmount(summary.netProfit, currency)}
          delta={profitBadge?.label}
          detail={profitBadge?.detail}
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
