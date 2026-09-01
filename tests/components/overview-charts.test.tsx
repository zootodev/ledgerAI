import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/services", () => ({
  getAnalyticsTrends: vi.fn(),
}));

import { getAnalyticsTrends } from "@/lib/services";
import { OverviewCharts, ChartsFallback } from "@/components/dashboard/overview-charts";

const mockedGetAnalyticsTrends = vi.mocked(getAnalyticsTrends);

function makeTrends() {
  return {
    points: [
      { key: "2026-01", label: "Jan 2026", revenue: 1000, expenses: 400, transfers: 0, netProfit: 600, profitMargin: 60 },
      { key: "2026-02", label: "Feb 2026", revenue: 2000, expenses: 800, transfers: 0, netProfit: 1200, profitMargin: 60 },
    ],
    period: { from: null, to: null },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OverviewCharts (Overview chart integration)", () => {
  it("renders both chart cards when trend data is available", async () => {
    mockedGetAnalyticsTrends.mockResolvedValue(makeTrends());

    const element = await OverviewCharts({});
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("Revenue vs expenses");
    expect(html).toContain("Net profit trend");
  });

  it("calls the trend service with the page range and a sensible groupBy", async () => {
    mockedGetAnalyticsTrends.mockResolvedValue(makeTrends());

    await OverviewCharts({ range: { dateFrom: "2026-01-01", dateTo: "2026-01-15" } });

    expect(mockedGetAnalyticsTrends).toHaveBeenCalledWith({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-15",
      groupBy: "day",
    });
  });

  it("falls back to monthly buckets for wide ranges", async () => {
    mockedGetAnalyticsTrends.mockResolvedValue(makeTrends());

    await OverviewCharts({ range: { dateFrom: "2026-01-01", dateTo: "2026-04-01" } });

    expect(mockedGetAnalyticsTrends).toHaveBeenCalledWith({
      dateFrom: "2026-01-01",
      dateTo: "2026-04-01",
      groupBy: "month",
    });
  });

  it("requests all-time monthly trends when no range is provided", async () => {
    mockedGetAnalyticsTrends.mockResolvedValue(makeTrends());

    await OverviewCharts({});

    expect(mockedGetAnalyticsTrends).toHaveBeenCalledWith({ groupBy: "month" });
  });

  it("shows the empty state when there are no trend points", async () => {
    mockedGetAnalyticsTrends.mockResolvedValue({ points: [], period: { from: null, to: null } });

    const element = await OverviewCharts({});
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("No chart data yet");
    expect(html).not.toContain("Revenue vs expenses");
  });

  it("shows the error state when the trend service fails", async () => {
    mockedGetAnalyticsTrends.mockRejectedValue(new Error("DATABASE_URL"));

    const element = await OverviewCharts({});
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("load your charts");
    expect(html).toContain("DATABASE_URL");
  });
});

describe("ChartsFallback", () => {
  it("renders two placeholder chart cards", () => {
    const html = renderToStaticMarkup(createElement(ChartsFallback));
    expect(html).toContain("Revenue vs expenses");
    expect(html).toContain("Net profit trend");
  });
});