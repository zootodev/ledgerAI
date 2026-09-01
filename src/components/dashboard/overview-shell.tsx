"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";

export interface OverviewShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** Server-rendered KPI grid (Suspense-wrapped) shown under the header. */
  kpis: React.ReactNode;
  onSignOut?: () => void;
}

/** Authenticated overview shell: header + analytics KPI grid. */
export function OverviewShell({
  userName,
  userEmail,
  businessName,
  currency,
  kpis,
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

        {kpis}
      </div>
    </AppShell>
  );
}