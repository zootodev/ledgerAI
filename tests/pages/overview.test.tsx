import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/lib/services/auth", () => ({
  ensureOnboarding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn().mockResolvedValue({
    user: { name: "Ada", email: "ada@example.com" },
    business: { name: "Acme", currency: "NGN" },
  }),
}));

vi.mock("@/lib/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getAnalyticsSummary: vi.fn().mockResolvedValue({
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
  }),
  getNetProfitChart: vi.fn().mockResolvedValue([]),
  getCashFlowChart: vi.fn().mockResolvedValue([]),
}));

// Make date-fns stable for the default "this month" range
const today = new Date("2026-10-16T12:00:00Z");
vi.useFakeTimers();
vi.setSystemTime(today);

import OverviewPage from "@/app/overview/page";

describe("OverviewPage (server)", () => {
  it("renders without throwing when searchParams are empty", async () => {
    await expect(
      OverviewPage({ searchParams: Promise.resolve({}) }),
    ).resolves.toBeTruthy();
  });

  it("renders without throwing when searchParams contain no from/to/range", async () => {
    await expect(
      OverviewPage({
        searchParams: Promise.resolve({ foo: "bar" } as Record<string, string>),
      }),
    ).resolves.toBeTruthy();
  });

  it("resolves presets to local calendar days, matching the URL and date fields", async () => {
    const shell = (await OverviewPage({
      searchParams: Promise.resolve({ preset: "month" }),
    })) as ReactElement<{
      rangeControl: ReactElement<{ from?: string; to?: string }>;
    }>;

    // Fake time is 2026-10-16. In a UTC+ timezone, toISOString() would turn
    // the local 1 October midnight into 30 September and desync URL/content.
    expect(shell.props.rangeControl.props.from).toBe("2026-10-01");
    expect(shell.props.rangeControl.props.to).toBe("2026-10-16");
  });
});
