import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface PageLoadingProps {
  /** Header title shown while the route's own shell loads. */
  title: string;
  children: React.ReactNode;
}

/**
 * Shell-preserving route fallback. Each `loading.tsx` renders this so the
 * sidebar and top bar stay put during navigation and only the content area
 * shows a skeleton — matching the destination page's layout as closely as is
 * practical.
 */
export function PageLoading({ title, children }: PageLoadingProps) {
  return (
    <AppShell header={{ title }}>
      <div className="mx-auto min-w-0 max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" height={28} />
            <Skeleton className="h-4 w-56" height={16} />
          </div>
          <Skeleton className="h-8 w-28" height={32} />
        </div>
        {children}
      </div>
    </AppShell>
  );
}

/** Four KPI tile placeholders, matching the overview KPI grid. */
export function KpiSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-3.5 w-20" height={14} />
          <Skeleton className="mt-3 h-6 w-28" height={24} />
          <Skeleton className="mt-2 h-3.5 w-16" height={14} />
        </Card>
      ))}
    </div>
  );
}

/** Two chart-card placeholders, matching the overview charts grid. */
export function ChartSkeletons() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-40" height={16} />
          </CardHeader>
          <CardContent>
            <Skeleton height={240} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A filter bar + data-table placeholder for the transaction list routes. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-9 w-40" height={36} />
        <Skeleton className="h-9 w-32" height={36} />
        <Skeleton className="h-9 w-36" height={36} />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-24" height={16} />
            <Skeleton className="h-4 flex-1" height={16} />
            <Skeleton className="h-4 w-20" height={16} />
            <Skeleton className="h-4 w-16" height={16} />
          </div>
        ))}
      </div>
    </Card>
  );
}
