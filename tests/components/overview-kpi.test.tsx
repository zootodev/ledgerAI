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