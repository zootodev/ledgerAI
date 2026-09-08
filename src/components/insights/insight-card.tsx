"use client";

import * as React from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InspectInsight } from "@/lib/types/insights";
import { cn } from "@/lib/utils/cn";

const KIND_CONFIG: Record<
  InspectInsight["kind"],
  { label: string; icon: LucideIcon; tone: "brand" | "info" | "success" | "warning" | "danger"; iconClasses: string }
> = {
  key: { label: "Key insight", icon: Sparkles, tone: "brand", iconClasses: "text-brand" },
  revenue: { label: "Revenue", icon: TrendingUp, tone: "success", iconClasses: "text-success" },
  spending: { label: "Spending", icon: TrendingDown, tone: "warning", iconClasses: "text-warning" },
  profitability: { label: "Profitability", icon: Wallet, tone: "info", iconClasses: "text-info" },
  anomaly: { label: "Anomaly", icon: AlertTriangle, tone: "danger", iconClasses: "text-danger" },
  recommendation: { label: "Recommendation", icon: Lightbulb, tone: "info", iconClasses: "text-info" },
};

/** One insight card: icon + badge + title + narration + backing numbers. */
export function InsightCard({ insight }: { insight: InspectInsight }) {
  const config = KIND_CONFIG[insight.kind];
  const Icon = config.icon;
  const metaEntries = entryList(insight);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-subtle">
            <Icon className={cn("h-5 w-5", config.iconClasses)} aria-hidden="true" />
          </span>
          <Badge tone={config.tone}>{config.label}</Badge>
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">{insight.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-secondary">{insight.description}</p>
        </div>

        {metaEntries.length > 0 && (
          <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
            {metaEntries.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                  {label}
                </dt>
                <dd className="truncate text-sm font-medium tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/** Stable, humanized metadata entries for the card footer (fields to show). */
function entryList(insight: InspectInsight): [string, string][] {
  const m = insight.metadata;
  const out: [string, string][] = [];

  const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  });

  const add = (label: string, v: unknown, fmt?: (n: number) => string): void => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    out.push([label, fmt ? fmt(v) : money.format(v)]);
  };

  const percent = (n: number) => `${n.toLocaleString("en-NG")}%`;

  switch (insight.kind) {
    case "revenue":
      add("Revenue", m.revenue);
      add("Prior period", m.priorRevenue);
      add("Change", m.percentChange, percent);
      break;
    case "profitability":
      add("Net profit", m.netProfit);
      add("Margin", m.profitMargin, percent);
      add("Margin change", m.marginChange, percent);
      break;
    case "anomaly":
      add("Amount", m.amount);
      add("Share of expenses", m.shareOfExpenses, percent);
      add("Share of category", m.shareOfCategory, percent);
      break;
    case "spending":
      add("This period", m.amount);
      add("Prior period", m.priorAmount);
      add("Change", m.percentChange, percent);
      break;
    case "key":
      add("Revenue", m.revenue);
      add("Expenses", m.expenses);
      add("Net", m.netProfit);
      add("Margin", m.profitMargin, percent);
      break;
    case "recommendation":
      add("Amount", m.amount);
      add("Share of expenses", m.shareOfExpenses, percent);
      break;
  }
  return out;
}