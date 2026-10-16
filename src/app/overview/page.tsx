import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { analyticsQuerySchema, type AnalyticsQuery } from "@/lib/validation/index";
import { OverviewShell } from "@/components/dashboard/overview-shell";
import { AnalyticsKpiGrid, KpiGridFallback } from "@/components/dashboard/kpi-grid";
import { OverviewCharts, ChartsFallback } from "@/components/dashboard/overview-charts";
import { OverviewActionItems } from "@/components/dashboard/overview-actions";
import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";

type OverviewSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<OverviewSearchParams>;
}) {
  // First authenticated visit: make sure the profile + business exist so
  // tenant isolation (user/business ownership) has rows to key on.
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const raw = await searchParams;
  // Single source of truth: one validated range drives BOTH the KPIs and the
  // charts below. Invalid ranges degrade to the useful default (this month);
  // ?range=all explicitly selects all time.
  const range = parseOverviewRange(raw);

  return (
    <OverviewShell
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      actions={
        <Suspense fallback={null}>
          <OverviewActionItems />
        </Suspense>
      }
      rangeControl={
        <AnalyticsRangeControl from={range?.dateFrom} to={range?.dateTo} params={raw} />
      }
      kpis={
        <Suspense fallback={<KpiGridFallback />}>
          <AnalyticsKpiGrid currency={ctx.business.currency} range={range} />
        </Suspense>
      }
      charts={
        <Suspense fallback={<ChartsFallback />}>
          <OverviewCharts currency={ctx.business.currency} range={range} />
        </Suspense>
      }
      onSignOut={signOutAction}
    />
  );
}

/** Extract a single string value from a search param entry. */
function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolve the Overview range. An explicit ?range=all keeps all time; a valid
 * ?from/?to wins; otherwise default to the current month so the page opens on
 * a useful, comparable period instead of a lifetime aggregate.
 */
function parseOverviewRange(search: OverviewSearchParams): AnalyticsQuery | undefined {
  if (singleParam(search.range) === "all") return undefined;

  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (parsed.success) {
    const { dateFrom, dateTo } = parsed.data;
    if (dateFrom || dateTo) return { dateFrom, dateTo };
  }
  return currentMonthRange();
}

/** Inclusive [first-of-month, today] window in local server time. */
function currentMonthRange(): AnalyticsQuery {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${day}`,
  };
}