"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  ChartTooltip,
  ChartLegend,
  chartColor,
  tickStyle,
  MONEY_CURVE,
  type ChartValueFormatter,
  compactCurrency,
  tooltipCurrency,
  MonthTick,
  chartXAxisInterval,
  isMonthlyChartData,
} from "@/components/charts/shared";
import { cn } from "@/lib/utils/cn";

export interface Series {
  key: string;
  name: string;
  color?: string;
  dashed?: boolean;
}

export interface LineChartProps {
  data: Record<string, number | string | boolean>[];
  xKey: string;
  series: Series[];
  height?: number;
  className?: string;
  /** Currency for formatting axis ticks and tooltip values. */
  currency?: string;
  /** Format to use; defaults to currency when currency is set, else number. */
  format?: "currency" | "number";
  /** Draw a dashed y=0 reference so loss months read clearly. */
  zeroLine?: boolean;
  /** Colour each observation green above zero, red below it. */
  signDots?: boolean;
}

/** One observed point, coloured by the sign of its value. */
function SignDot(props: { cx?: number; cy?: number; value?: number | string }) {
  const { cx, cy, value } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return <g />;
  const amount = typeof value === "number" ? value : Number(value);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={amount < 0 ? "var(--danger)" : "var(--success)"}
      stroke="var(--surface)"
      strokeWidth={1}
    />
  );
}

export function LineChart({
  data,
  xKey,
  series,
  height = 280,
  className,
  currency,
  format = currency ? "currency" : "number",
  zeroLine = false,
  signDots = false,
}: LineChartProps) {
  /** Axis ticks stay compact; the tooltip formatter is exact. */
  const valueFormatter: ChartValueFormatter | undefined = React.useMemo(
    () => (v: number) => compactCurrency(v, currency, format),
    [currency, format],
  );
  const tooltipFormatter: ChartValueFormatter | undefined = React.useMemo(
    () => (v: number) => tooltipCurrency(v, currency, format),
    [currency, format],
  );
  const monthlyTicks = React.useMemo(() => isMonthlyChartData(data, xKey), [data, xKey]);
  const tickInterval = React.useMemo(() => chartXAxisInterval(data, xKey), [data, xKey]);
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        {/*
         * A line's last point sits at the plot edge, while a bar's last tick
         * is inset by half a band. Reserve that extra room so a two-line
         * partial-month tick ("to 26th") is not clipped by the card.
         */}
        <RLineChart data={data} margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickMargin={8}
            tick={monthlyTicks ? <MonthTick /> : tickStyle}
            interval={tickInterval}
            height={monthlyTicks ? 42 : undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={tickStyle}
            tickFormatter={valueFormatter}
          />
          {zeroLine && (
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="4 4" />
          )}
          <Tooltip content={<ChartTooltip format={tooltipFormatter} />} cursor={{ stroke: "var(--border-strong)" }} />
          {series.length > 1 && (
            <Legend content={<ChartLegend order={series.map((s) => s.key)} />} />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type={MONEY_CURVE}
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? chartColor(i)}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              dot={signDots ? <SignDot /> : false}
              activeDot={{ r: 4 }}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}


