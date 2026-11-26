import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { format, startOfMonth, startOfQuarter, startOfYear, subDays } from "date-fns";
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
  // charts below. Invalid ranges degrade to the useful default (last 90 days,
  // so older-but-recent imports are visible); ?range=all selects all time.
  // A explicit ?preset= takes priority over date matching, so two presets
  // that share a window can never both claim the highlight.
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

/** Return dateFrom/dateTo for a preset, or undefined when the preset is "all". */
function presetToOverviewRange(preset: string | undefined): { dateFrom: string | undefined; dateTo: string | undefined } | undefined {
  if (!preset || preset === "all") return undefined;
  const today = new Date();
  // Local calendar days, matching the client presets and the displayed fields.
  // toISOString() shifts a UTC+ timezone's local midnight back a day, so
  // "This month" used to render 31/10 for a URL that asked for 2026-11-01.
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  const presetMap: Record<string, { dateFrom: string; dateTo: string }> = {
    "last7": { dateFrom: iso(subDays(today, 6)), dateTo: iso(today) },
    "last30": { dateFrom: iso(subDays(today, 29)), dateTo: iso(today) },
    "last90": { dateFrom: iso(subDays(today, 89)), dateTo: iso(today) },
    "month": { dateFrom: iso(startOfMonth(today)), dateTo: iso(today) },
    "quarter": { dateFrom: iso(startOfQuarter(today)), dateTo: iso(today) },
    "year": { dateFrom: iso(startOfYear(today)), dateTo: iso(today) },
  };
  const mapped = presetMap[preset];
  return mapped ? { dateFrom: mapped.dateFrom, dateTo: mapped.dateTo } : undefined;
}

/** Resolve the Overview range. An explicit ?range=all keeps all time; a valid
 * ?from/?to wins (so a user's chosen preset or manual dates always survive);
 * otherwise default to the last 90 days so recent imports are visible instead
 * of an all-zero current month. A explicit ?preset= takes priority over date
 * matching, so two presets that share a window can never both claim the highlight.
 */
function parseOverviewRange(search: OverviewSearchParams): AnalyticsQuery | undefined {
  // Read explicit preset first (e.g. ?preset=last30), then fall back to from/to.
  const preset = singleParam(search.preset);
  if (preset) {
    const range = presetToOverviewRange(preset);
    if (range) {
      const parsed = analyticsQuerySchema.safeParse(range);
      if (parsed.success) return parsed.data;
    }
  }

  if (singleParam(search.range) === "all") return undefined;

  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (parsed.success) {
    const { dateFrom, dateTo } = parsed.data;
    if (dateFrom || dateTo) return { dateFrom, dateTo };
  }
  return last90DaysRange();
}

/** Inclusive [today - 89 days, today] window in local server time. */
function last90DaysRange(): AnalyticsQuery {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 89);
  const iso = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return { dateFrom: iso(from), dateTo: iso(now) };
}