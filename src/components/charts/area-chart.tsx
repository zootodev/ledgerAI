"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart as RAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartTooltip, ChartLegend, chartColor, tickStyle } from "@/components/charts/shared";
import { cn } from "@/lib/utils/cn";

export interface AreaSeries {
  key: string;
  name: string;
  color?: string;
}

export interface AreaChartProps {
  data: Record<string, number | string>[];
  xKey: string;
  series: AreaSeries[];
  height?: number;
  className?: string;
}

export function AreaChart({
  data,
  xKey,
  series,
  height = 280,
  className,
}: AreaChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient
                key={s.key}
                id={`grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color ?? chartColor(i)} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color ?? chartColor(i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
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
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
          {series.length > 1 && <Legend content={<ChartLegend />} />}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? chartColor(i)}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
            />
          ))}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
