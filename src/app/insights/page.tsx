import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext, AuthorizationError } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { getInsights } from "@/lib/services/insights";
import { analyticsQuerySchema, type AnalyticsQuery } from "@/lib/validation/index";
import { InsightsShell } from "@/components/insights/insights-shell";
import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "AI Insights",
};

type InsightsSearchParams = Record<string, string | string[] | undefined>;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<InsightsSearchParams>;
}) {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const raw = await searchParams;
  // One validated range drives the insights below; missing/invalid ranges
  // degrade to all time, mirroring the Overview page.
  const range = parseInsightsRange(raw);

  return (
    <Suspense
      fallback={
        <InsightsShell
          userEmail={ctx.user.email}
          businessName={ctx.business.name}
          currency={ctx.business.currency}
          insights={[]}
          rangeControl={
            <AnalyticsRangeControl from={range?.dateFrom} to={range?.dateTo} params={raw} />
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border bg-surface p-5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="mt-4 h-4 w-2/3" height={16} />
                <Skeleton className="mt-2 h-12 w-full" height={48} />
              </div>
            ))}
          </div>
        </InsightsShell>
      }
    >
      <InsightsLoader
        userName={ctx.user.name ?? undefined}
        userEmail={ctx.user.email}
        businessName={ctx.business.name}
        currency={ctx.business.currency}
        params={raw}
        range={range}
      />
    </Suspense>
  );
}

async function InsightsLoader({
  userName,
  userEmail,
  businessName,
  currency,
  params,
  range,
}: {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  params: InsightsSearchParams;
  range: AnalyticsQuery | undefined;
}) {
  let insights: Awaited<ReturnType<typeof getInsights>> = [];
  let error: string | null = null;

  try {
    insights = await getInsights(range ?? {});
  } catch (e) {
    // A vanished session means the login page should handle it, not an
    // error card. Anything else is rendered as a generic message: raw
    // server/DB errors are never surfaced to the client.
    if (e instanceof AuthorizationError) redirect("/login");
    error = "We couldn’t compute your insights right now. Please try again.";
  }

  return (
    <InsightsShell
      userName={userName}
      userEmail={userEmail}
      businessName={businessName}
      currency={currency}
      insights={insights}
      error={error}
      onSignOut={signOutAction}
      rangeControl={
        <AnalyticsRangeControl from={range?.dateFrom} to={range?.dateTo} params={params} />
      }
    />
  );
}

/** Extract a single string value from a search param entry. */
function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Validate/normalize the page range once. Missing or invalid ranges return
 * undefined (all time), matching the Overview behavior and picker presets.
 */
function parseInsightsRange(search: InsightsSearchParams): AnalyticsQuery | undefined {
  const parsed = analyticsQuerySchema.safeParse({
    dateFrom: singleParam(search.from),
    dateTo: singleParam(search.to),
  });
  if (!parsed.success) return undefined;
  const { dateFrom, dateTo } = parsed.data;
  if (!dateFrom && !dateTo) return undefined;
  return { dateFrom, dateTo };
}