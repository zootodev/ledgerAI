import { subDays, startOfMonth, startOfQuarter, startOfYear, format } from "date-fns";

export type RangePresetId =
  | "last7"
  | "last30"
  | "last90"
  | "month"
  | "quarter"
  | "year"
  | "all";

export interface PresetRange {
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

/**
 * Build the preset ranges for "today". Computed per call: a module-level
 * constant would freeze the dates at server start and serve stale ranges.
 */
export function buildPresetRangeMap(
  today: Date = new Date(),
): Record<RangePresetId, PresetRange> {
  const to = format(today, "yyyy-MM-dd");
  return {
    last7: { dateFrom: format(subDays(today, 6), "yyyy-MM-dd"), dateTo: to },
    last30: { dateFrom: format(subDays(today, 29), "yyyy-MM-dd"), dateTo: to },
    last90: { dateFrom: format(subDays(today, 89), "yyyy-MM-dd"), dateTo: to },
    month: { dateFrom: format(startOfMonth(today), "yyyy-MM-dd"), dateTo: to },
    quarter: { dateFrom: format(startOfQuarter(today), "yyyy-MM-dd"), dateTo: to },
    year: { dateFrom: format(startOfYear(today), "yyyy-MM-dd"), dateTo: to },
    all: { dateFrom: undefined, dateTo: undefined },
  };
}

export function resolvePresetRange(
  preset?: string,
  today: Date = new Date(),
): PresetRange | undefined {
  if (!preset || preset === "all") return undefined;
  const map = buildPresetRangeMap(today);
  return Object.prototype.hasOwnProperty.call(map, preset)
    ? map[preset as RangePresetId]
    : undefined;
}
