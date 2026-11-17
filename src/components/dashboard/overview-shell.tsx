"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";

export interface OverviewShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** Client date-range control shown above the KPIs and charts. */
  rangeControl?: React.ReactNode;
  /** Server-rendered actionable-state panel (Suspense-wrapped). */
  actions?: React.ReactNode;
  /** Server-rendered KPI grid (Suspense-wrapped) shown under the header. */
  kpis: React.ReactNode;
  /** Server-rendered analytics charts (Suspense-wrapped). */
  charts?: React.ReactNode;
  onSignOut?: () => void;
}

/** Authenticated overview shell: header + range control + KPI grid + charts. */
export function OverviewShell({
  userName,
  userEmail,
  businessName,
  currency,
  rangeControl,
  actions,
  kpis,
  charts,
  onSignOut,
}: OverviewShellProps) {
  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Overview",
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

        {actions}
        {rangeControl}
        {kpis}
        {charts}
      </div>
    </AppShell>
  );
}
