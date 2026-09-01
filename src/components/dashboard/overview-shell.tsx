"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";

export interface OverviewShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** Client date-range control shown above the KPIs and charts. */
  rangeControl?: React.ReactNode;
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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1 text-muted">{businessName}</p>
          </div>
          <Badge tone="brand">{currency}</Badge>
        </div>

        {rangeControl}
        {kpis}
        {charts}
      </div>
    </AppShell>
  );
}