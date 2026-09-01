"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartTooltip, ChartLegend, chartColor, tickStyle } from "@/components/charts/shared";
import { cn } from "@/lib/utils/cn";

export interface BarSeries {
  key: string;
  name: string;
  color?: string;
  stacked?: boolean;
}

export interface BarChartProps {
  data: Record<string, number | string>[];
  xKey: string;
  series: BarSeries[];
  height?: number;
  horizontal?: boolean;
  className?: string;
}

export function BarChart({
  data,
  xKey,
  series,
  height = 280,
  horizontal = false,
  className,
}: BarChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          {horizontal ? (
            <XAxis type="number" tickLine={false} axisLine={false} tick={tickStyle} />
          ) : (
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickMargin={8}
              tick={tickStyle}
            />
          )}
          {horizontal ? (
            <YAxis
              dataKey={xKey}
              type="category"
              tickLine={false}
              axisLine={false}
              width={80}
              tick={tickStyle}
            />
          ) : (
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={tickStyle}
            />
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-subtle)" }} />
          {series.length > 1 && <Legend content={<ChartLegend />} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? chartColor(i)}
              stackId={s.stacked ? "stack" : undefined}
              radius={s.stacked ? undefined : [4, 4, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
