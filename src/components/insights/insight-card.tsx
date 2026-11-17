"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { round } from "@/lib/finance/engine";
import type { InspectInsight } from "@/lib/types/insights";
import { formatIsoDate } from "@/lib/utils/dates";

const KIND_LABELS: Record<InspectInsight["kind"], string> = {
  key: "Headline",
  revenue: "Revenue",
  spending: "Spending",
  profitability: "Profit",
  anomaly: "Unusual item",
  recommendation: "Suggested action",
};

/**
 * One numbered insight row. The figures sit on the same line as the prose,
 * so the page reads as a short set of notes rather than a card grid.
 */
export function InsightRow({
  insight,
  currency,
  index,
}: {
  insight: InspectInsight;
  /** ISO 4217 code from the session business; drives every money figure. */
  currency: string;
  /** 1-based position in the list. */
  index: number;
}) {
  const metaEntries = entryList(insight, currency);
  const href = transactionsHref(insight);

  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]">
      <span className="text-xs tabular-nums text-muted">
        {String(index).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-[15px] font-semibold text-foreground">
            {insight.title}
          </h3>
          <span className="text-xs text-muted">{KIND_LABELS[insight.kind]}</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary">
          {insight.description}
        </p>
        {metaEntries.length > 0 && (
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {metaEntries.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="text-xs text-muted">{periodLabel(insight.period)}</span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          View rows
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

/**
 * Drill-through to the transactions list scoped to this insight's period (and
 * category, when the insight names one). The transactions page reads
 * `dateFrom`/`dateTo`/`search`, so the figures on the row stay traceable.
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
  if (from && to) return `${formatIsoDate(from)} – ${formatIsoDate(to)}`;
  if (from) return `From ${formatIsoDate(from)}`;
  return `Up to ${formatIsoDate(to as string)}`;
}

/** Stable, humanized metadata entries for the row footer (fields to show). */
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

  // One decimal, matching the prose in the insight description exactly.
  const percent = (n: number) => `${round(n, 1).toLocaleString("en-NG")}%`;

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
