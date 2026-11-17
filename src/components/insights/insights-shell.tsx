"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { InsightRow } from "@/components/insights/insight-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CalendarRange, FileUp } from "lucide-react";
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
  /** Client date-range control shown above the insights list. */
  rangeControl?: React.ReactNode;
  /** Optional override for the body area (e.g. a Suspense skeleton). */
  children?: React.ReactNode;
}

/** Insights page: a dated, numbered read of the books. */
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
        title: "Insights",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto min-w-0 max-w-6xl space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {businessName}
          </h1>
          <span className="text-xs text-muted">
            All accounts · {currency}
          </span>
        </div>

        {rangeControl}

        {children ? (
          children
        ) : error ? (
          <ErrorState
            title="Couldn't compute insights"
            description={error}
          />
        ) : insights.length === 0 ? (
          hasRange ? (
            <EmptyState
              title="No activity in this period"
              description="Nothing was recorded between these dates."
              action={
                <Link
                  href="/insights?range=all"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <CalendarRange className="h-4 w-4" aria-hidden="true" />
                  View all time
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No insights yet"
              description="Import a bank statement to see your first month."
              action={
                <Link
                  href="/import"
                  className={buttonVariants({ variant: "primary", size: "sm" })}
                >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  Import a statement
                </Link>
              }
            />
          )
        ) : (
          <>
            <ol className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {insights.map((insight, index) => (
                <InsightRow
                  key={`${insight.kind}-${insight.title}`}
                  insight={insight}
                  currency={currency}
                  index={index + 1}
                />
              ))}
            </ol>
            <p className="text-xs text-muted">
              Figures come from your recorded transactions. They are not
              accounting or tax advice.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
