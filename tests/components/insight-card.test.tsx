import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InsightCard } from "@/components/insights/insight-card";
import type { InspectInsight } from "@/lib/types/insights";

function revenueInsight(): InspectInsight {
  return {
    kind: "revenue",
    title: "Revenue grew 50%",
    description: "Income moved strongly ahead of the prior period.",
    metadata: { revenue: 900_000, priorRevenue: 600_000, percentChange: 50 },
    period: { from: "2026-06-01", to: "2026-06-30" },
  };
}

function format(value: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

describe("InsightCard currency", () => {
  it("renders backing money figures in the configured currency", () => {
    const html = renderToStaticMarkup(
      createElement(InsightCard, { insight: revenueInsight(), currency: "GBP" }),
    );

    expect(html).toContain(format(900_000, "GBP"));
    expect(html).toContain(format(600_000, "GBP"));
    expect(html).not.toContain("₦");
  });

  it("shows the insight period and drills through to transactions", () => {
    const html = renderToStaticMarkup(
      createElement(InsightCard, { insight: revenueInsight(), currency: "GBP" }),
    );

    expect(html).toContain("1 Jun 2026 – 30 Jun 2026");
    expect(html).toContain(
      'href="/transactions?dateFrom=2026-06-01&amp;dateTo=2026-06-30"',
    );
  });

  it("includes the category name in the drill-through search when present", () => {
    const insight: InspectInsight = {
      kind: "spending",
      title: "Rent increased 30%",
      description: "Rent rose sharply.",
      metadata: {
        categoryName: "Rent",
        amount: 120_000,
        priorAmount: 90_000,
        percentChange: 33.3,
      },
      period: { from: "2026-06-01", to: "2026-06-30" },
    };
    const html = renderToStaticMarkup(
      createElement(InsightCard, { insight, currency: "NGN" }),
    );

    expect(html).toContain("dateFrom=2026-06-01");
    expect(html).toContain("search=Rent");
  });

  it("labels an open-ended period as all time", () => {
    const insight: InspectInsight = {
      kind: "revenue",
      title: "Revenue grew 10%",
      description: "Income rose.",
      metadata: { revenue: 100, priorRevenue: 90, percentChange: 11.1 },
      period: { from: null, to: null },
    };
    const html = renderToStaticMarkup(
      createElement(InsightCard, { insight, currency: "NGN" }),
    );

    expect(html).toContain("All time");
    expect(html).toContain('href="/transactions"');
  });

  it("distinguishes a recommendation from a deterministic fact", () => {
    const insight: InspectInsight = {
      kind: "recommendation",
      title: "Review rent spend",
      description: "Rent is your largest category.",
      metadata: { categoryName: "Rent", amount: 120_000, shareOfExpenses: 45 },
      period: { from: "2026-06-01", to: "2026-06-30" },
    };
    const html = renderToStaticMarkup(
      createElement(InsightCard, { insight, currency: "NGN" }),
    );

    expect(html).toContain("Suggested next step based on this period");
  });
});
