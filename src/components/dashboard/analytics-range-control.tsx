"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange } from "lucide-react";
import { format, startOfMonth, startOfQuarter, startOfYear, subDays } from "date-fns";
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
  /** The explicit "all time" sentinel (writes ?range=all). */
  allTime?: boolean;
}

/**
 * Client date-range control for the Overview/Insights/Reports. Writes
 * ?from=&to= (or ?range=all) onto the URL so the server page re-validates the
 * range once and re-renders its data from the same source. No financial logic
 * lives here.
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
      { label: "Last 7 days", from: iso(subDays(today, 6)), to: iso(today) },
      { label: "Last 30 days", from: iso(subDays(today, 29)), to: iso(today) },
      { label: "This month", from: iso(startOfMonth(today)), to: iso(today) },
      { label: "This quarter", from: iso(startOfQuarter(today)), to: iso(today) },
      { label: "This year", from: iso(startOfYear(today)), to: iso(today) },
      { label: "All time", from: "", to: "", allTime: true },
    ];
  }, []);

  const rangeParam = params?.range;
  const isAllTime =
    rangeParam === "all" || (Array.isArray(rangeParam) && rangeParam.includes("all"));

  /** Push a new range onto the URL, preserving all unrelated parameters. */
  const apply = React.useCallback(
    (nextFrom: string, nextTo: string, allTime = false) => {
      const next = new URLSearchParams();
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) next.append(key, item);
        } else {
          next.set(key, value);
        }
      }
      if (allTime) next.set("range", "all");
      else next.delete("range");
      if (nextFrom) next.set("from", nextFrom);
      else next.delete("from");
      if (nextTo) next.set("to", nextTo);
      else next.delete("to");
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const activePreset = isAllTime
    ? presets.find((p) => p.allTime)
    : presets.find((p) => !p.allTime && p.from === (from ?? "") && p.to === (to ?? ""));
  // With no explicit range param and no bounds, empty from/to means all time.
  const effectiveActive = activePreset ?? (!from && !to ? presets.find((p) => p.allTime) : undefined);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3",
        "lg:flex-row lg:items-end lg:justify-between",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      {!from && !to ? (
        // "All time" has no explicit bounds, so blank date inputs would read as
        // an empty filter. Replace them with an explicit, non-editable label.
        <div className="flex items-center gap-1.5 rounded-field border border-border bg-surface-subtle/40 px-3 py-2 text-sm text-muted">
          <CalendarRange className="h-4 w-4 shrink-0" aria-hidden="true" />
          All recorded transactions
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              From
            </span>
            <Input
              type="date"
              value={from ?? ""}
              onChange={(e) => apply(e.target.value, to ?? "")}
              className="w-full"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              To
            </span>
            <Input
              type="date"
              value={to ?? ""}
              onChange={(e) => apply(from ?? "", e.target.value)}
              className="w-full"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const active = effectiveActive?.label === preset.label;
          return (
            <Button
              key={preset.label}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              onClick={() => apply(preset.from, preset.to, preset.allTime)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
