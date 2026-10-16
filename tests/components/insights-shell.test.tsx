import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { InspectInsight } from "@/lib/types/insights";

// The shell renders AppShell → Sidebar, which reads the active pathname.
vi.mock("next/navigation", () => ({
  usePathname: () => "/insights",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { InsightsShell } from "@/components/insights/insights-shell";

function render(props: Partial<React.ComponentProps<typeof InsightsShell>> = {}) {
  return renderToStaticMarkup(
    <InsightsShell
      userEmail="ada@example.com"
      businessName="Acme Studio"
      currency="NGN"
      insights={[]}
      {...props}
    />,
  );
}

function revenueInsight(): InspectInsight {
  return {
    kind: "revenue",
    title: "Revenue grew 50%",
    description: "Income moved ahead of the prior period.",
    metadata: { revenue: 900, priorRevenue: 600, percentChange: 50 },
    period: { from: "2026-06-01", to: "2026-06-30" },
  };
}

describe("InsightsShell empty states", () => {
  it("shows the generic onboarding empty state when no range is active", () => {
    const html = render();

    expect(html).toContain("No insights yet");
    expect(html).toContain("Import a statement");
    expect(html).not.toContain("No activity in this period");
    expect(html).not.toContain("/insights?range=all");
  });

  it("shows a range-aware empty state when a bounded range has no activity", () => {
    const html = render({ hasRange: true });

    expect(html).toContain("No activity in this period");
    expect(html).toContain("View all time");
    expect(html).toContain('href="/insights?range=all"');
    expect(html).not.toContain("No insights yet");
  });

  it("renders insights when present even while a range is active", () => {
    const html = render({ hasRange: true, insights: [revenueInsight()] });

    expect(html).toContain("Revenue grew 50%");
    expect(html).not.toContain("No activity in this period");
  });

  it("prefers the error state over the empty state", () => {
    const html = render({ hasRange: true, error: "We couldn’t compute your insights right now." });

    expect(html).toContain("Couldn’t compute insights");
    expect(html).not.toContain("No activity in this period");
  });
});
