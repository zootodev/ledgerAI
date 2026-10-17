"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Landmark } from "lucide-react";

export interface ReportsViewProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** Human window label ("All time", "1 Jun – 30 Jun 2026", …). */
  periodLabel?: string;
  /** Active account filter name, or null when reporting across all accounts. */
  accountName?: string | null;
  /** Client date-range control shown above the report sections. */
  rangeControl: React.ReactNode;
  /** Client account filter (rendered inline with the range control). */
  accountFilter?: React.ReactNode;
  /** Server-rendered report sections (Suspense-wrapped). */
  sections: React.ReactNode;
  /** Extra header actions (e.g. the print button). */
  actions?: React.ReactNode;
  onSignOut?: () => void;
}

/**
 * Authenticated reports shell: header + range/account controls + report
 * sections. The period and account context render OUTSIDE the print:hidden
 * block so printed reports carry their own window in the header.
 */
export function ReportsView({
  userName,
  userEmail,
  businessName,
  currency,
  periodLabel,
  accountName,
  rangeControl,
  accountFilter,
  sections,
  actions,
  onSignOut,
}: ReportsViewProps) {
  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Reports",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto min-w-0 max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Reports
            </h1>
            <p className="mt-1 text-muted">{businessName}</p>
            {periodLabel && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                {/* Prefixed so the period reads as context, not as a second
                    copy of the "All time" pill in the range control below. */}
                <span>Period: {periodLabel}</span>
                {accountName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                      {accountName}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
            <Badge tone="brand">{currency}</Badge>
          </div>
        </div>

        <div className="print:hidden">
          <div className="flex w-full flex-wrap items-end justify-between gap-3">
            {rangeControl}
            {accountFilter}
          </div>
        </div>
        {sections}
      </div>
    </AppShell>
  );
}