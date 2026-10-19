"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  buildRangePresets,
  paramsToSearchParams,
  resolveActivePresetId,
  type RangePresetId,
  withRangeSelection,
} from "@/lib/analytics/range-preset";
import { cn } from "@/lib/utils/cn";

export interface AnalyticsRangeControlProps {
  /** Currently applied range (validated server-side). */
  from?: string;
  to?: string;
  /** Current search params so unrelated parameters are preserved on update. */
  params?: Record<string, string | string[] | undefined>;
}

/**
 * Client date-range control for the Overview/Insights/Reports. Writes
 * ?from=&to= plus ?preset= (or ?range=all) onto the URL so the server page
 * re-validates the range once and re-renders its data from the same source.
 * No financial logic lives here.
 */
export function AnalyticsRangeControl({
  from,
  to,
  params,
}: AnalyticsRangeControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const presets = React.useMemo(() => buildRangePresets(new Date()), []);

  const rangeParam = params?.range;
  const isAllTime =
    rangeParam === "all" || (Array.isArray(rangeParam) && rangeParam.includes("all"));

  /**
   * Push a new selection onto the URL, preserving all unrelated parameters.
   * A preset click passes its id (recorded as ?preset=); a manual From/To edit
   * omits it, which clears any stored preset.
   */
  const apply = React.useCallback(
    (nextFrom: string, nextTo: string, presetId?: RangePresetId) => {
      const next = withRangeSelection(paramsToSearchParams(params), {
        from: nextFrom,
        to: nextTo,
        presetId,
      });
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const activePresetId = resolveActivePresetId({
    preset: params?.preset,
    from,
    to,
    allTime: isAllTime,
    presets,
  });

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
          const active = activePresetId === preset.id;
          return (
            <Button
              key={preset.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={active}
              onClick={() => apply(preset.from, preset.to, preset.id)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
