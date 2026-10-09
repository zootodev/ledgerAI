import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { analyticsQuerySchema, type AnalyticsQuery } from "@/lib/validation/index";
import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";
import { ReportsView } from "@/components/reports/reports-view";
import { PrintButton } from "@/components/reports/print-button";
import { ReportSections, ReportsFallback } from "@/components/reports/report-sections";

type ReportsSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportsSearchParams>;
}) {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const raw = await searchParams;
  // Single source of truth: one validated range drives every section below.
  // Invalid or missing ranges degrade to all time.
  const range = parseReportRange(raw);

  return (
    <ReportsView
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      rangeControl={
        <AnalyticsRangeControl from={range?.dateFrom} to={range?.dateTo} params={raw} />
      }
      sections={
        <Suspense fallback={<ReportsFallback />}>
          <ReportSections range={range} currency={ctx.business.currency} />
        </Suspense>
      }
      actions={<PrintButton />}
      onSignOut={signOutAction}
    />
  );
}

/** Extract a single string value from a search param entry. */
function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Validate/normalize the page range once. Invalid/missing ranges fall back to all time. */
function parseReportRange(search: ReportsSearchParams): AnalyticsQuery | undefined {
  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (!parsed.success) return undefined;
  const { dateFrom, dateTo } = parsed.data;
  if (!dateFrom && !dateTo) return undefined;
  return { dateFrom, dateTo };
}