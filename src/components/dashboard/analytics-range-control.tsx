"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { format, startOfMonth, startOfYear, subDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface AnalyticsRangeControlProps {
  /** Currently applied range (validated server-side). */
  from?: string;
  to?: string;
  /** Current search params so unrelated parameters are preserved on update. */
  params?: Record<string, string | string[] | undefined>;
}

interface Preset {
  label: string;
  from: string;
  to: string;
}

/**
 * Client date-range control for the Overview. Writes ?from=&to= onto the URL
 * so the server page re-validates the range once and re-renders both the KPIs
 * and charts from the same source. No financial logic lives here.
 */
export function AnalyticsRangeControl({
  from,
  to,
  params,
}: AnalyticsRangeControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const presets = React.useMemo<Preset[]>(() => {
    const today = new Date();
    const iso = (d: Date) => format(d, "yyyy-MM-dd");
    return [
      { label: "Last 30 days", from: iso(subDays(today, 29)), to: iso(today) },
      { label: "This month", from: iso(startOfMonth(today)), to: iso(today) },
      { label: "This year", from: iso(startOfYear(today)), to: iso(today) },
      { label: "All time", from: "", to: "" },
    ];
  }, []);

  /** Push a new range onto the URL, preserving all unrelated parameters. */
  const apply = React.useCallback(
    (nextFrom: string, nextTo: string) => {
      const next = new URLSearchParams();
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) next.append(key, item);
        } else {
          next.set(key, value);
        }
      }
      if (nextFrom) next.set("from", nextFrom);
      else next.delete("from");
      if (nextTo) next.set("to", nextTo);
      else next.delete("to");
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const activePreset = presets.find(
    (p) => p.from === (from ?? "") && p.to === (to ?? ""),
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-card border border-border bg-surface p-3",
        "lg:flex-row lg:items-end lg:justify-between",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            From
          </span>
          <Input
            type="date"
            value={from ?? ""}
            onChange={(e) => apply(e.target.value, to ?? "")}
            className="w-full sm:w-40"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            To
          </span>
          <Input
            type="date"
            value={to ?? ""}
            onChange={(e) => apply(from ?? "", e.target.value)}
            className="w-full sm:w-40"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const active = activePreset?.label === preset.label;
          return (
            <Button
              key={preset.label}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              onClick={() => apply(preset.from, preset.to)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}