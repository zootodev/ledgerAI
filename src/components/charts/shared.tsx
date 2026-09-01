"use client";

// Recharts injects tooltip props at runtime; typed loosely to match the
// render-props contract across line/bar/area/pie tooltips.
type ChartTooltipRenderProps = {
  active?: boolean;
  payload?: unknown[];
  label?: string | number;
};

/** Accessible chart tooltip matching the design system. */
export function ChartTooltip({ active, payload, label }: ChartTooltipRenderProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2.5 shadow-popover">
      {label != null && (
        <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      )}
      <div className="flex flex-col gap-1">
        {(payload as Array<{
          name?: string | number;
          value?: number | string;
          color?: string;
        }>).map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-secondary">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {typeof entry.value === "number" ? formatValue(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend renderer that draws an inline-styled swatch for each series. */
export function ChartLegend(props: {
  payload?: Array<{ dataKey?: string | number; value?: string; color?: string }>;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {props.payload?.map((entry, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-sm text-secondary">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.value ?? entry.dataKey}
        </span>
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

/** Shared axis tick style. */
export const tickStyle = { fill: "var(--text-muted)", fontSize: 12 };
/** Shared axis line style. */
export const axisStyle = { stroke: "var(--border)" };
