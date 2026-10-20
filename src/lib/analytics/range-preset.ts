// ============================================================
// Analytics date-range presets (Overview / Reports / Insights)
// ------------------------------------------------------------
// Pure, presentation-only helpers for the shared range control.
// They resolve which preset chip is active and how a selection is
// written onto the URL. No financial logic lives here.
//
// Why this module exists: two presets can resolve to the SAME
// calendar window (on 2026-10-18 both "This month" and "This
// quarter" start on the 1st). Matching the applied from/to alone
// therefore cannot tell them apart, so an explicit ?preset= param
// is recorded and preferred over date matching.
// ============================================================

import { format, startOfMonth, startOfQuarter, startOfYear, subDays } from "date-fns";

export const RANGE_PRESET_IDS = [
  "last7",
  "last30",
  "last90",
  "month",
  "quarter",
  "year",
  "all",
] as const;

export type RangePresetId = (typeof RANGE_PRESET_IDS)[number];

export interface RangePreset {
  id: RangePresetId;
  label: string;
  /** Inclusive ISO date (yyyy-MM-dd); empty for the all-time sentinel. */
  from: string;
  to: string;
  /** The explicit "all time" sentinel (writes ?range=all). */
  allTime?: boolean;
}

/** The preset chips, computed against `today` so they can be tested with a fixed date. */
export function buildRangePresets(today: Date): RangePreset[] {
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  return [
    { id: "last7", label: "Last 7 days", from: iso(subDays(today, 6)), to: iso(today) },
    { id: "last30", label: "Last 30 days", from: iso(subDays(today, 29)), to: iso(today) },
    { id: "last90", label: "Last 90 days", from: iso(subDays(today, 89)), to: iso(today) },
    { id: "month", label: "This month", from: iso(startOfMonth(today)), to: iso(today) },
    { id: "quarter", label: "This quarter", from: iso(startOfQuarter(today)), to: iso(today) },
    { id: "year", label: "This year", from: iso(startOfYear(today)), to: iso(today) },
    { id: "all", label: "All time", from: "", to: "", allTime: true },
  ];
}

/** True when `value` is one of the known preset ids. */
export function isRangePresetId(value: unknown): value is RangePresetId {
  return (
    typeof value === "string" && (RANGE_PRESET_IDS as readonly string[]).includes(value)
  );
}

/** First value of a Next.js search param (which may be an array). */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Which preset chip should be highlighted.
 *
 * The explicit ?preset= wins, so two presets that share a window can never
 * both claim the highlight. Only when it is absent (or invalid) do we fall
 * back to matching the applied bounds — the pre-?preset= behaviour, kept so
 * older links still highlight something sensible.
 */
export function resolveActivePresetId(opts: {
  preset?: string | string[] | undefined;
  from?: string;
  to?: string;
  /** True when ?range=all was applied. */
  allTime?: boolean;
  presets: RangePreset[];
}): RangePresetId | undefined {
  const { preset, from, to, allTime, presets } = opts;

  const explicit = firstValue(preset);
  if (isRangePresetId(explicit)) return explicit;

  if (allTime) return "all";

  const hasBounds = Boolean(from || to);
  if (!hasBounds) return "all";

  const match = presets.find(
    (p) => !p.allTime && p.from === (from ?? "") && p.to === (to ?? ""),
  );
  return match?.id;
}

/** Copy a Next.js `searchParams` record into a mutable URLSearchParams. */
export function paramsToSearchParams(
  params?: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

/**
 * Merge a range selection into the current search params.
 *
 * A preset click records ?preset=<id>; a manual From/To edit (no presetId)
 * clears it so the highlight falls back to matching the applied bounds. Only
 * the all-time preset writes ?range=all, which the server pages read.
 */
export function withRangeSelection(
  current: URLSearchParams,
  opts: { from: string; to: string; presetId?: RangePresetId },
): URLSearchParams {
  const next = new URLSearchParams(current);
  const { from, to, presetId } = opts;

  if (presetId) next.set("preset", presetId);
  else next.delete("preset");

  if (presetId === "all") next.set("range", "all");
  else next.delete("range");

  if (from) next.set("from", from);
  else next.delete("from");

  if (to) next.set("to", to);
  else next.delete("to");

  return next;
}
