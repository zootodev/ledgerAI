import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/services", () => ({
  getAnalyticsSummary: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

import { getAnalyticsSummary } from "@/lib/services";
import {
  AnalyticsKpiGrid,
  KpiGridFallback,
  isEmptySummary,
  CASH_BALANCE_HELP,
} from "@/components/dashboard/kpi-grid";

const mockedGetAnalyticsSummary = vi.mocked(getAnalyticsSummary);

function makeSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    revenue: 1000,
    expenses: 400,
    transfers: 0,
    netProfit: 600,
    profitMargin: 60,
    cashBalance: 600,
    currency: "NGN",
    period: { from: null, to: null },
    prior: null,
    hasAnyTransactions: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isEmptySummary", () => {
  it("returns true when every KPI is zero", () => {
    expect(
      isEmptySummary(makeSummary({ revenue: 0, expenses: 0, transfers: 0, netProfit: 0, cashBalance: 0 })),
    ).toBe(true);
  });

  it("returns false when any KPI is non-zero", () => {
    expect(isEmptySummary(makeSummary({ revenue: 1 }))).toBe(false);
    expect(isEmptySummary(makeSummary({ transfers: 1 }))).toBe(false);
    expect(isEmptySummary(makeSummary({ cashBalance: -5 }))).toBe(false);
  });
});

describe("AnalyticsKpiGrid (Overview data integration)", () => {
  it("renders formatted live KPIs from the analytics service", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(makeSummary({ currency: "NGN" }));

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    expect(mockedGetAnalyticsSummary).toHaveBeenCalledTimes(1);
    expect(html).toContain("Revenue");
    expect(html).toContain("Expenses");
    expect(html).toContain("Net profit");
    expect(html).toContain("Cash balance");
    expect(html).toContain("1,000.00");
    expect(html).toContain("400.00");
    expect(html).toContain("600.00");
  });

  it("shows the Cash Balance help explanation verbatim", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(makeSummary({}));

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain(CASH_BALANCE_HELP);
  });

  it("shows the empty state when the business has no transactions", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({ revenue: 0, expenses: 0, transfers: 0, netProfit: 0, cashBalance: 0 }),
    );

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("No transactions yet");
    expect(html).toContain("Add transaction");
    expect(html).toContain("Import a statement");
  });

  it("distinguishes an empty period from a business with no data at all", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({
        revenue: 0,
        expenses: 0,
        transfers: 0,
        netProfit: 0,
        cashBalance: 0,
        hasAnyTransactions: true,
      }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("No activity in this period");
    expect(html).toContain("View all time");
    expect(html).not.toContain("No transactions yet");
  });

  it("shows prior-period deltas when a comparable period exists", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({
        revenue: 1000,
        expenses: 400,
        netProfit: 600,
        cashBalance: 600,
        period: { from: "2026-02-01", to: "2026-02-28" },
        prior: {
          revenue: 500,
          expenses: 500,
          netProfit: 500,
          cashBalance: 500,
          period: { from: "2026-01-04", to: "2026-01-31" },
        },
      }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("+100%"); // revenue 1000 vs 500
    expect(html).toContain("-20%"); // expenses 400 vs 500
  });

  it("never shows a period-over-period delta on the Cash balance card", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({
        revenue: 1000,
        expenses: 400,
        netProfit: 600,
        cashBalance: 600,
        // Prior is flat for the flow metrics but cash is half, so a naive
        // cash delta would read "+100%". A cash balance is a position, not a
        // flow, so no delta belongs on that card.
        prior: {
          revenue: 1000,
          expenses: 400,
          netProfit: 600,
          cashBalance: 300,
          period: { from: "2026-01-04", to: "2026-01-31" },
        },
      }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("Cash balance");
    expect(html).not.toContain("+100%");
    expect(html).not.toContain("-100%");
  });

  it("links each KPI to the matching records or report", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({ period: { from: "2026-02-01", to: "2026-02-28" } }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("/transactions?type=income");
    expect(html).toContain("/transactions?type=expense");
    expect(html).toContain("/reports?from=2026-02-01&amp;to=2026-02-28");
  });

  it("shows an em dash when both periods are zero, never a fabricated -100%", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({
        revenue: 0,
        expenses: 0,
        netProfit: 0,
        cashBalance: 0,
        hasAnyTransactions: true,
        period: { from: "2026-02-01", to: "2026-02-28" },
        prior: {
          revenue: 0,
          expenses: 0,
          netProfit: 0,
          cashBalance: 0,
          period: { from: "2026-01-04", to: "2026-01-31" },
        },
      }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain(">—<");
    expect(html).not.toContain("-100%");
    expect(html).not.toContain("NaN");
  });

  it("shows New when only the prior period is zero", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(
      makeSummary({
        revenue: 1000,
        expenses: 0,
        netProfit: 1000,
        cashBalance: 1000,
        period: { from: "2026-02-01", to: "2026-02-28" },
        prior: {
          revenue: 0,
          expenses: 0,
          netProfit: 0,
          cashBalance: 0,
          period: { from: "2026-01-04", to: "2026-01-31" },
        },
      }),
    );

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain(">New<");
    expect(html).not.toContain("-100%");
  });

  it("does not show the empty state when the summary is non-empty", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(makeSummary({}));

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    expect(html).not.toContain("No transactions yet");
  });

  it("renders the error state when the analytics service fails", async () => {
    mockedGetAnalyticsSummary.mockRejectedValue(new Error("DATABASE_URL"));

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("load your overview");
    expect(html).toContain("DATABASE_URL");
  });
});

describe("KpiGridFallback", () => {
  it("renders four placeholder KPI cards", () => {
    const html = renderToStaticMarkup(createElement(KpiGridFallback));
    expect(html).toContain("Revenue");
    expect(html).toContain("Expenses");
    expect(html).toContain("Net profit");
    expect(html).toContain("Cash balance");
  });
});