"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";

export interface ReportsViewProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  /** Client date-range control shown above the report sections. */
  rangeControl: React.ReactNode;
  /** Server-rendered report sections (Suspense-wrapped). */
  sections: React.ReactNode;
  onSignOut?: () => void;
}

/** Authenticated reports shell: header + range control + report sections. */
export function ReportsView({
  userName,
  userEmail,
  businessName,
  currency,
  rangeControl,
  sections,
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
          </div>
          <Badge tone="brand">{currency}</Badge>
        </div>

        {rangeControl}
        {sections}
      </div>
    </AppShell>
  );
}