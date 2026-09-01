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
} from "recharts";
import { ChartTooltip, ChartLegend, chartColor, tickStyle } from "@/components/charts/shared";
import { cn } from "@/lib/utils/cn";

export interface Series {
  key: string;
  name: string;
  color?: string;
  dashed?: boolean;
}

export interface LineChartProps {
  data: Record<string, number | string>[];
  xKey: string;
  series: Series[];
  height?: number;
  className?: string;
}

export function LineChart({
  data,
  xKey,
  series,
  height = 280,
  className,
}: LineChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickMargin={8}
            tick={tickStyle}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={tickStyle}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
          {series.length > 1 && <Legend content={<ChartLegend />} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? chartColor(i)}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact numeric formatting for axis labels (e.g. 1.2k, 3.4M, ₦). */
function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${v}`;
}
