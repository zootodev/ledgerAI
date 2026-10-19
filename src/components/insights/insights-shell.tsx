"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { InsightCard } from "@/components/insights/insight-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { BusinessWideNote } from "@/components/dashboard/business-wide-note";
import { CalendarRange, Sparkles, FileQuestion, FileUp, Plus } from "lucide-react";
import type { InspectInsight } from "@/lib/types/insights";

export interface InsightsShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** All insights for the tenant (server-derived). */
  insights: InspectInsight[];
  /** Set when the server raised a clear error (e.g. query validation). */
  error?: string | null;
  /** True when a bounded date range is active (drives the empty state copy). */
  hasRange?: boolean;
  onSignOut?: () => void;
  /** Client date-range control shown above the insights grid. */
  rangeControl?: React.ReactNode;
  /** Optional override for the body area (e.g. a Suspense skeleton). */
  children?: React.ReactNode;
}

/** AI Insights page: disclaimer + either an empty/error state or a grid. */
export function InsightsShell({
  userName,
  userEmail,
  businessName,
  currency,
  insights,
  error,
  hasRange = false,
  onSignOut,
  rangeControl,
  children,
}: InsightsShellProps) {
  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "AI Insights",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto min-w-0 max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              AI Insights
            </h1>
            <p className="mt-1 text-muted">
              {businessName} · automatically derived from your verified
              transactions
            </p>
          </div>
        </div>

        {rangeControl}
        <BusinessWideNote variant="insights" />

        <Alert tone="info" title="Guidance, not accounting advice">
          Insights are computed from your recorded transactions and are meant
          to guide decisions — not a substitute for professional accounting or
          tax advice.
        </Alert>

        {children ? (
          children
        ) : error ? (
          <ErrorState
            title="Couldn’t compute insights"
            description={error}
          />
        ) : insights.length === 0 ? (
          hasRange ? (
            <EmptyState
              icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />}
              title="No activity in this period"
              description="There are no transactions in the selected range, so there's nothing to analyse yet. View all time or import a statement to see more."
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/insights?range=all"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <CalendarRange className="h-4 w-4" aria-hidden="true" />
                    View all time
                  </Link>
                  <Link
                    href="/import"
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    Import a statement
                  </Link>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
              title="No insights yet"
              description={
                <>
                  Insights appear once you have transactions. Import a statement
                  or add transactions manually and they’ll show up here. Your
                  figures are shown in {currency}.
                </>
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/import"
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    Import a statement
                  </Link>
                  <Link
                    href="/transactions"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add a transaction
                  </Link>
                </div>
              }
            />
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {insights.map((insight) => (
                <InsightCard
                  key={`${insight.kind}-${insight.title}`}
                  insight={insight}
                  currency={currency}
                />
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
              Numbers shown are deterministic — recomputed from your data
              every time; nothing is guessed.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}