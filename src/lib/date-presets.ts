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

export const presetRangeMap: Record<RangePresetId, PresetRange> = {
  "last7": {
    dateFrom: format(subDays(new Date(), 6), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "last30": {
    dateFrom: format(subDays(new Date(), 29), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "last90": {
    dateFrom: format(subDays(new Date(), 89), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "month": {
    dateFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "quarter": {
    dateFrom: format(startOfQuarter(new Date()), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "year": {
    dateFrom: format(startOfYear(new Date()), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  },
  "all": {
    dateFrom: undefined,
    dateTo: undefined,
  },
};

export function resolvePresetRange(preset?: string): PresetRange | undefined {
  if (!preset || preset === "all") return undefined;
  return presetRangeMap[preset as RangePresetId];
}