import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The shells render AppShell → Sidebar, which reads the active pathname.
vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { BusinessWideNote } from "@/components/dashboard/business-wide-note";
import { OverviewShell } from "@/components/dashboard/overview-shell";
import { InsightsShell } from "@/components/insights/insights-shell";

/**
 * Account scope is intentionally business-wide on Overview and Insights; the
 * single-account filter lives only on Reports and Transactions. These tests
 * pin the visible guidance (and its presence in both shells) so the difference
 * is never left implicit again.
 */
describe("BusinessWideNote", () => {
  it("states that totals are business-wide and points to the filtered views", () => {
    const html = renderToStaticMarkup(<BusinessWideNote />);
    expect(html).toContain("Totals across all accounts");
    expect(html).toContain("Reports or Transactions");
  });

  it("is composed into the Overview shell", () => {
    const html = renderToStaticMarkup(
      <OverviewShell
        userEmail="ada@example.com"
        businessName="Acme Studio"
        currency="GBP"
        kpis={<div />}
      />,
    );
    expect(html).toContain("Totals across all accounts");
  });

  it("is composed into the Insights shell", () => {
    const html = renderToStaticMarkup(
      <InsightsShell
        userEmail="ada@example.com"
        businessName="Acme Studio"
        currency="USD"
        insights={[]}
      />,
    );
    expect(html).toContain("Totals across all accounts");
  });
});
