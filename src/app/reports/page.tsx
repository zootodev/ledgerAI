import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listAccounts } from "@/lib/services";
import { reportPeriodLabel } from "@/lib/services/reports";
import { analyticsQuerySchema, type AnalyticsQuery } from "@/lib/validation/index";
import { resolveAccountScope, urlWithoutAccountId } from "@/lib/validation/account-scope";
import { startOfMonth, startOfQuarter, startOfYear, subDays, format } from "date-fns";
import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";
import { ReportsView } from "@/components/reports/reports-view";
import { ReportsAccountFilter } from "@/components/reports/reports-account-filter";
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

  // Account filter: only an account the session business owns is honored.
  const accounts = await listAccounts();
  const scope = resolveAccountScope(
    raw.accountId,
    accounts.map((a) => a.id),
  );
  const accountId = scope.accountId;
  const account = accounts.find((a) => a.id === accountId) ?? null;

  // A foreign or malformed account id is rejected SAFELY by removing it from
  // the URL, so the address bar and the rendered filter always agree (never a
  // silently-empty or silently-widened report). The service layer still bounds
  // every account-scoped aggregation by the session businessId.
  if (scope.rejected) {
    redirect(urlWithoutAccountId("/reports", raw));
  }

  return (
    <ReportsView
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      periodLabel={reportPeriodLabel({
        from: range?.dateFrom ?? null,
        to: range?.dateTo ?? null,
      })}
      accountName={account?.name ?? null}
      rangeControl={
        <AnalyticsRangeControl from={range?.dateFrom} to={range?.dateTo} params={raw} />
      }
      accountFilter={
        accounts.length > 0 ? (
          <ReportsAccountFilter accounts={accounts} value={accountId} />
        ) : undefined
      }
      sections={
        <Suspense fallback={<ReportsFallback />}>
          <ReportSections
            range={range}
            currency={ctx.business.currency}
            accountId={accountId}
          />
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

/** Map a preset id to its dateFrom/dateTo, or return undefined for "all". */
function presetToRange(preset: string | undefined): { dateFrom: string | undefined; dateTo: string | undefined } {
  const today = new Date();
  if (preset === "all" || !preset) return { dateFrom: undefined, dateTo: undefined };
  // Map preset id to from/to dates using format for ISO strings
  const presetMap: Record<string, { dateFrom: string; dateTo: string }> = {
    "last7": { dateFrom: format(subDays(today, 6), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
    "last30": { dateFrom: format(subDays(today, 29), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
    "last90": { dateFrom: format(subDays(today, 89), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
    "month": { dateFrom: format(startOfMonth(today), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
    "quarter": { dateFrom: format(startOfQuarter(today), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
    "year": { dateFrom: format(startOfYear(today), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd") },
  };
  const mapped = presetMap[preset as string];
  return { dateFrom: mapped?.dateFrom, dateTo: mapped?.dateTo };
}

/** Validate/normalize the page range once. Invalid/missing ranges fall back to all time. */
function parseReportRange(search: ReportsSearchParams): AnalyticsQuery | undefined {
  // Read explicit preset first (e.g. ?preset=last30), then fall back to from/to.
  const preset = singleParam(search.preset);
  if (preset) {
    const { dateFrom, dateTo } = presetToRange(preset);
    const parsed = analyticsQuerySchema.safeParse({ dateFrom, dateTo });
    if (parsed.success) return parsed.data;
    return undefined;
  }
  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (!parsed.success) return undefined;
  const { dateFrom, dateTo } = parsed.data;
  if (!dateFrom && !dateTo) return undefined;
  return { dateFrom, dateTo };
}