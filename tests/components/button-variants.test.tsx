import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ============================================================
// Item 7 of the pre-launch UX pass: navigation CTAs are a
// single interactive element. A <Button> inside a <Link> puts
// two interactive elements in one hit target (screen readers
// announce a button inside a link; keyboard activation can hit
// the inner button instead of navigating). Navigation CTAs are
// now a <Link> styled with buttonVariants(); modal-opening
// CTAs stay real Buttons.
// ============================================================

vi.mock("@/lib/services", () => ({
  getAnalyticsSummary: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { getAnalyticsSummary } from "@/lib/services";
import { AnalyticsKpiGrid } from "@/components/dashboard/kpi-grid";
import { buttonVariants } from "@/components/ui/button";

const mockedGetAnalyticsSummary = vi.mocked(getAnalyticsSummary);

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    revenue: 0,
    expenses: 0,
    transfers: 0,
    netProfit: 0,
    profitMargin: 0,
    cashBalance: 0,
    currency: "NGN",
    period: { from: null, to: null },
    prior: null,
    hasAnyTransactions: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buttonVariants", () => {
  it("renders the same look Button does (brand fill by default)", () => {
    const classes = buttonVariants();
    expect(classes).toContain("bg-brand");
    expect(classes).toContain("rounded-button");
    expect(classes).toContain("inline-flex");
  });

  it("supports the variants and sizes used by link CTAs", () => {
    expect(buttonVariants({ variant: "outline" })).toContain("border-border-strong");
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "md" })).toContain("h-9.5");
  });

  it("merges caller classes last so overrides win", () => {
    const classes = buttonVariants({ className: "custom-tail" });
    expect(classes.endsWith("custom-tail")).toBe(true);
  });
});

describe("empty-state CTAs are single elements (no button-in-link)", () => {
  it("KPI empty states render CTAs as links styled like buttons", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(makeSummary({}));

    const element = await AnalyticsKpiGrid({ currency: "NGN" });
    const html = renderToStaticMarkup(element as never);

    // Both CTAs are present…
    expect(html).toContain('href="/transactions"');
    expect(html).toContain('href="/import"');
    expect(html).toContain("Add transaction");
    expect(html).toContain("Import a statement");
    // …styled as buttons…
    expect(html).toContain("rounded-button");
    // …and no <button> is nested inside any <a>.
    for (const anchor of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
      expect(anchor).not.toContain("<button");
    }
  });

  it("KPI empty state for a period also avoids button-in-link nesting", async () => {
    mockedGetAnalyticsSummary.mockResolvedValue(makeSummary({ hasAnyTransactions: true }));

    const element = await AnalyticsKpiGrid({
      currency: "NGN",
      range: { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
    });
    const html = renderToStaticMarkup(element as never);

    expect(html).toContain("No activity in this period");
    expect(html).toContain('href="/overview?range=all"');
    for (const anchor of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
      expect(anchor).not.toContain("<button");
    }
  });
});
