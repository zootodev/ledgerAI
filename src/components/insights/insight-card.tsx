"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  CalendarRange,
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
export function InsightCard({
  insight,
  currency,
}: {
  insight: InspectInsight;
  /** ISO 4217 code from the session business; drives every money figure. */
  currency: string;
}) {
  const config = KIND_CONFIG[insight.kind];
  const Icon = config.icon;
  const metaEntries = entryList(insight, currency);
  const href = transactionsHref(insight);

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
          {insight.kind === "recommendation" && (
            <p className="mt-1.5 text-xs italic text-muted">
              Suggested next step based on this period — review before acting.
            </p>
          )}
        </div>

        <div className="mt-auto space-y-3 border-t border-border pt-3">
          {metaEntries.length > 0 && (
            <dl className="grid grid-cols-2 gap-2">
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-muted">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {periodLabel(insight.period)}
            </span>
            <Link
              href={href}
              className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              View transactions
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Drill-through to the transactions list scoped to this insight's period (and
 * category, when the insight names one). The transactions page reads
 * `dateFrom`/`dateTo`/`search`, so the figures on the card stay traceable.
 */
function transactionsHref(insight: InspectInsight): string {
  const params = new URLSearchParams();
  const { from, to } = insight.period;
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  const categoryName = insight.metadata.categoryName;
  if (typeof categoryName === "string" && categoryName.length > 0) {
    params.set("search", categoryName);
  }
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

/** Human period caption; null bounds mean open-ended ("all time"). */
function periodLabel(period: InspectInsight["period"]): string {
  const { from, to } = period;
  if (!from && !to) return "All time";
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  return `Up to ${formatDay(to as string)}`;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

/** Stable, humanized metadata entries for the card footer (fields to show). */
function entryList(insight: InspectInsight, currency: string): [string, string][] {
  const m = insight.metadata;
  const out: [string, string][] = [];

  const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
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