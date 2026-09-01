"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";

export interface OverviewShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  onSignOut?: () => void;
}

/** Temporary protected overview rendered for Phase 3. Real KPIs arrive in Phase 5. */
export function OverviewShell({
  userName,
  userEmail,
  businessName,
  currency,
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue" value="—”" icon={<DollarSign className="h-4.5 w-4.5" />} loading={false} />
          <StatCard label="Expenses" value="—”" icon={<TrendingDown className="h-4.5 w-4.5" />} />
          <StatCard label="Net profit" value="—”" icon={<TrendingUp className="h-4.5 w-4.5" />} />
          <StatCard label="Bank balance" value="—”" icon={<Wallet className="h-4.5 w-4.5" />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account secured</CardTitle>
            <CardDescription>
              You&apos;re signed in and your business workspace is ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-secondary">
              This is the authenticated overview shell from Phase 3 (Database + Auth).
              Live KPIs, charts, and analytics arrive in later phases. Data access is
              tenant-isolated: every query is scoped to your business.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}