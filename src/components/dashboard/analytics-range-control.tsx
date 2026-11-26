"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
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

export interface RangeSelection {
  from: string;
  to: string;
  presetId?: RangePresetId;
}

/**
 * Pure URL builder for a range selection. The bounds come from the selection
 * itself (never from the previously rendered `from`/`to`), so every click
 * writes its own range instead of the one before it.
 */
export function buildRangeHref(
  current: URLSearchParams | Record<string, string | string[] | undefined> | undefined,
  pathname: string,
  selection: RangeSelection,
): string {
  const base =
    current instanceof URLSearchParams
      ? new URLSearchParams(current)
      : paramsToSearchParams(current);
  const next = withRangeSelection(base, selection);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
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
  const [isPending, startTransition] = React.useTransition();
  // Highlight the clicked pill immediately; server props arrive one
  // navigation later and must not make the click look like it did nothing.
  const [optimisticPreset, setOptimisticPreset] = React.useState<{
    id: RangePresetId;
    /** The applied params this click replaces — discarded once they change. */
    replaces: string;
  } | null>(null);
  /**
   * The search string of the last href this control pushed. A second click
   * before the first render lands builds from THIS, not from the stale
   * `from`/`to` props. Reset on popstate so Back/Forward start from the URL
   * the browser just restored.
   */
  const lastPushedSearch = React.useRef<string | null>(null);

  React.useEffect(() => {
    const resetForHistory = () => {
      lastPushedSearch.current = null;
      setOptimisticPreset(null);
    };
    window.addEventListener("popstate", resetForHistory);
    return () => window.removeEventListener("popstate", resetForHistory);
  }, []);

  const presets = React.useMemo(() => buildRangePresets(new Date()), []);

  const rangeParam = params?.range;
  const isAllTime =
    rangeParam === "all" || (Array.isArray(rangeParam) && rangeParam.includes("all"));

  /**
   * Let the App Router own the navigation. `pushState` + `refresh()` looked
   * instant, but Next syncs a manual pushState into its router state
   * asynchronously, so refresh() re-rendered the PREVIOUS URL's searchParams
   * and the tiles stayed one click behind. One `router.push` fetches the RSC
   * payload for the href we just built; `startTransition` exposes that wait.
   * The ref carries the pending href across clicks made before it renders.
   */
  const apply = React.useCallback(
    (nextFrom: string, nextTo: string, presetId?: RangePresetId) => {
      if (typeof window === "undefined") return;
      const currentSearch =
        lastPushedSearch.current ?? window.location.search ?? paramsToSearchParams(params).toString();
      const href = buildRangeHref(new URLSearchParams(currentSearch), pathname, {
        from: nextFrom,
        to: nextTo,
        presetId,
      });
      const question = href.indexOf("?");
      lastPushedSearch.current = question >= 0 ? href.slice(question + 1) : "";
      startTransition(() => {
        router.push(href, { scroll: false });
      });
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

  const appliedKey = `${Array.isArray(params?.preset) ? params?.preset.join(",") : params?.preset ?? ""}|${from ?? ""}|${to ?? ""}`;
  const displayedPresetId =
    optimisticPreset && (optimisticPreset.replaces === appliedKey || isPending)
      ? optimisticPreset.id
      : activePresetId;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3",
        "lg:flex-row lg:items-end lg:justify-between",
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
            <span className="text-xs font-medium text-muted">
              From
            </span>
            <DateField
              value={from}
              onIsoChange={(iso) => {
                setOptimisticPreset(null);
                apply(iso, to ?? "");
              }}
              className="w-full"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">
              To
            </span>
            <DateField
              value={to}
              onIsoChange={(iso) => {
                setOptimisticPreset(null);
                apply(from ?? "", iso);
              }}
              className="w-full"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const active = displayedPresetId === preset.id;
          return (
            <Button
              key={preset.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={active}
              data-pending={active && isPending ? "true" : undefined}
              rightIcon={
                active && isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : undefined
              }
              onClick={() => {
                setOptimisticPreset({ id: preset.id, replaces: appliedKey });
                apply(preset.from, preset.to, preset.id);
              }}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
