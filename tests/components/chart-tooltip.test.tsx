import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatAmount } from "@/lib/finance/engine";
import {
  ChartTooltip,
  compactCurrency,
  tooltipCurrency,
} from "@/components/charts/shared";

describe("chart tooltip amounts", () => {
  it("returns the exact amount from the app's normal formatAmount", () => {
    expect(tooltipCurrency(104_120, "NGN")).toBe(formatAmount(104_120, "NGN"));
    expect(tooltipCurrency(104_120.5, "NGN")).toContain("104,120.5");
  });

  it("keeps compact figures on axis ticks only", () => {
    expect(compactCurrency(105_000, "NGN")).toBe("₦105k");
    expect(tooltipCurrency(105_000, "NGN")).not.toContain("105k");
  });

  it("renders exact values in the tooltip instead of compact ones", () => {
    const html = renderToStaticMarkup(
      createElement(ChartTooltip, {
        active: true,
        label: "Aug 2026 (from 24th)",
        payload: [
          {
            name: "Revenue",
            value: 104_120,
            color: "var(--success)",
            payload: { hasTransactions: true },
          },
        ],
        format: (value: number) => tooltipCurrency(value, "NGN"),
      }),
    );
    expect(html).toContain("Aug 2026 (from 24th)");
    expect(html).toContain(formatAmount(104_120, "NGN"));
    expect(html).not.toContain("₦105k");
  });

  it("says No transactions recorded for a zero-filled bucket", () => {
    const html = renderToStaticMarkup(
      createElement(ChartTooltip, {
        active: true,
        label: "Feb 2026",
        payload: [
          { name: "Revenue", value: 0, payload: { hasTransactions: false } },
          { name: "Expenses", value: 0, payload: { hasTransactions: false } },
        ],
      }),
    );
    expect(html).toContain("No transactions recorded");
    expect(html).not.toContain("₦0");
  });
});
