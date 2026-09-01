"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  PieChart as RPieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { ChartTooltip, ChartLegend, chartColor, formatValue } from "@/components/charts/shared";
import { cn } from "@/lib/utils/cn";

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  height?: number;
  /** Inner radius as a fraction of maxRadius (0–1). Default 0.6 for a donut. */
  innerRadius?: number;
  centerLabel?: { value: string; caption?: string };
  className?: string;
}

export function DonutChart({
  data,
  height = 280,
  innerRadius = 0.6,
  centerLabel,
  className,
}: DonutChartProps) {
  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div className="relative w-full">
        <ResponsiveContainer width="100%" height={height}>
          <RPieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={`${innerRadius * 100}%`}
              outerRadius="80%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? chartColor(i)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </RPieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {centerLabel.value}
            </p>
            {centerLabel.caption && (
              <p className="text-xs text-muted">{centerLabel.caption}</p>
            )}
          </div>
        )}
      </div>
      <ChartLegend
        payload={data.map((d) => ({
          value: d.name,
          color: d.color ?? chartColor(data.indexOf(d)),
        }))}
      />
    </div>
  );
}

export { formatValue };
