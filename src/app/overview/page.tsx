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
  // charts below. Invalid or missing ranges degrade to all time.
  const range = parseOverviewRange(raw);

  return (
    <OverviewShell
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
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
          <OverviewCharts range={range} />
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
 * Validate/normalize the page range once. Invalid or missing ranges fall
 * back to all time so the Overview always renders meaningful data.
 */
function parseOverviewRange(search: OverviewSearchParams): AnalyticsQuery | undefined {
  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (!parsed.success) return undefined;
  const { dateFrom, dateTo } = parsed.data;
  if (!dateFrom && !dateTo) return undefined;
  return { dateFrom, dateTo };
}