import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MonthTick,
  chartXAxisInterval,
  isMonthlyChartData,
  shortMonthTick,
} from "@/components/charts/shared";

const MONTHLY = [
  { label: "Aug 2026 (from 24th)", netProfit: -10 },
  { label: "Sep 2026", netProfit: 20 },
  { label: "Oct 2026", netProfit: 30 },
  { label: "Nov 2026 (to 21st)", netProfit: 40 },
];

const DAILY = [
  { label: "Nov 20", netProfit: 10 },
  { label: "Nov 21", netProfit: 20 },
];

describe("monthly chart ticks", () => {
  it("forces every monthly tick so the first partial month is not dropped", () => {
    expect(isMonthlyChartData(MONTHLY, "label")).toBe(true);
    expect(chartXAxisInterval(MONTHLY, "label")).toBe(0);
  });

  it("keeps Recharts' default interval for daily buckets", () => {
    expect(isMonthlyChartData(DAILY, "label")).toBe(false);
    expect(chartXAxisInterval(DAILY, "label")).toBe("preserveStartEnd");
  });

  it("does not claim an empty series is monthly", () => {
    expect(isMonthlyChartData([], "label")).toBe(false);
  });

  it("shortens the year off axis labels but keeps the partial-month qualifier", () => {
    expect(shortMonthTick("Aug 2026 (from 24th)")).toBe("Aug (from 24th)");
    expect(shortMonthTick("Sep 2026")).toBe("Sep");
  });

  it("wraps a long qualifier onto a second line", () => {
    const html = renderToStaticMarkup(
      createElement(MonthTick, {
        x: 12,
        y: 30,
        payload: { value: "Aug 2026 (from 24th)" },
      }),
    );
    expect(html).toContain("Aug");
    expect(html).toContain("from 24th");
    expect(html.match(/<tspan/g)).toHaveLength(2);
  });
});
