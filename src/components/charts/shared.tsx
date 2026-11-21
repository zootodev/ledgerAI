"use client";

import * as React from "react";
import { formatAmount } from "@/lib/finance/engine";

// Recharts injects tooltip props at runtime; typed loosely to match the
// render-props contract across line/bar/area/pie tooltips.
type ChartTooltipRenderProps = {
  active?: boolean;
  payload?: unknown[];
  label?: string | number;
};

/** Formats a single numeric chart value (e.g. currency-aware tooltips). */
export type ChartValueFormatter = (value: number) => string;

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  /** Recharts exposes the whole data row here; charts flag empty buckets. */
  payload?: { hasTransactions?: boolean };
}

/** Accessible chart tooltip matching the design system. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: ChartTooltipRenderProps & { format?: ChartValueFormatter }) {
  if (!active || !payload?.length) return null;
  const entries = payload as TooltipEntry[];
  // A zero-filled bucket is a real observation, not missing data. Charts pass
  // `hasTransactions: false` for months/periods with nothing recorded.
  const emptyBucket = entries.every((entry) => entry.payload?.hasTransactions === false);

  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2.5 shadow-popover">
      {label != null && (
        <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      )}
      {emptyBucket ? (
        <p className="text-sm text-secondary">No transactions recorded</p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-secondary">{entry.name}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {typeof entry.value === "number"
                  ? (format ?? formatValue)(entry.value)
                  : entry.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legend renderer that draws an inline-styled swatch for each series. */
export function ChartLegend(props: {
  payload?: Array<{ dataKey?: string | number; value?: string; color?: string }>;
  /** Series keys in draw order, so the legend never contradicts the bars. */
  order?: string[];
}) {
  const entries = props.order?.length
    ? [...(props.payload ?? [])].sort((a, b) => {
        const ai = props.order!.indexOf(String(a.dataKey));
        const bi = props.order!.indexOf(String(b.dataKey));
        return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
      })
    : props.payload;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {entries?.map((entry, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sr-only">, </span>}
          <span className="inline-flex items-center gap-1.5 text-sm text-secondary">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            {entry.value ?? entry.dataKey}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Semantic chart color by index (matches design tokens). */
export function chartColor(index: number): string {
  const palette = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
  ];
  return palette[index % palette.length];
}

/** Format a currency-agnostic number with grouping. */
export function formatValue(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString()
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Compact, currency-aware label for chart AXES only ("₦200k", "US$1.5m").
 * Tooltips use `tooltipCurrency` so no figure is ever rounded for display.
 * Uses the app's en-NG number locale so amounts stay symbolized
 * and grouped the same way as every other money figure.
 */
export function compactCurrency(value: number, currency?: string, format?: "currency" | "number"): string {
  const fmt = format ?? (currency ? "currency" : "number");
  if (fmt === "number" || !currency) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
    return value.toLocaleString();
  }
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
  // Intl emits a magnitude suffix like "KMBT"; the design uses lowercase.
  return formatted.replace(/([KMBT])$/, (m) => m.toLowerCase());
}

/**
 * Exact, unabridged tooltip figure. Axis ticks stay compact; tooltips use the
 * app's normal `formatAmount` so a reading of ₦104,120 is never shown as ₦105k.
 */
export function tooltipCurrency(
  value: number,
  currency?: string,
  format?: "currency" | "number",
): string {
  if (currency && format !== "number") return formatAmount(value, currency);
  return formatValue(value);
}

/**
 * Shape-preserving curve for every money line/area chart. A spline can pass
 * above or below the observations and imply amounts that never happened, so
 * money series must use this curve rather than a smoothing curve.
 */
export const MONEY_CURVE = "monotone" as const;

/** Shared axis tick style. */
export const tickStyle = { fill: "var(--text-muted)", fontSize: 12 };
/** Shared axis line style. */
export const axisStyle = { stroke: "var(--border)" };

type ChartRow = Record<string, number | string | boolean | undefined>;

const MONTHLY_LABEL = /^[A-Za-z]{3} \d{4}(?: \(.*\))?$/;

/** Monthly buckets carry a year in every label; daily buckets do not. */
export function isMonthlyChartData(data: ChartRow[], xKey: string): boolean {
  return data.length > 0 && data.every((row) => MONTHLY_LABEL.test(String(row[xKey] ?? "")));
}

/**
 * Recharts otherwise drops ticks it thinks will collide — which is how the
 * first partial month disappears from the profit line while still being
 * plotted. Force every monthly tick; keep the default for daily buckets.
 */
export function chartXAxisInterval(data: ChartRow[], xKey: string): 0 | "preserveStartEnd" {
  return isMonthlyChartData(data, xKey) ? 0 : "preserveStartEnd";
}

/** Axis-only short label; tooltips keep the full service-provided label. */
export function shortMonthTick(value: string): string {
  return value.replace(/^([A-Za-z]{3}) \d{4}( \(.*\))?$/, "$1$2");
}

/** Two-line monthly tick so long partial-month labels fit at 390px. */
export function MonthTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  const full = String(payload?.value ?? "");
  const match = full.match(
    /^([A-Za-z]{3}) \d{4}( \((?:from|to) \d{1,2}(?:st|nd|rd|th)?\))?$/,
  );
  const month = match?.[1] ?? shortMonthTick(full);
  const qualifier = match?.[2]?.replace(/^\((.*)\)$/, "$1") ?? "";
  return (
    <text x={x} y={y} dy={10} textAnchor="middle" fill="var(--text-muted)" fontSize={12}>
      <tspan x={x}>{month}</tspan>
      {qualifier && (
        <tspan x={x} dy={13} fontSize={10}>
          {qualifier}
        </tspan>
      )}
    </text>
  );
}
