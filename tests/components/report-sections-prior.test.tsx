import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportData } from "@/lib/services/reports";

const mocks = vi.hoisted(() => ({ getReportData: vi.fn() }));

vi.mock("@/lib/services/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/reports")>();
  return { ...actual, getReportData: mocks.getReportData };
});

import { ReportSections } from "@/components/reports/report-sections";

const PERIOD = { from: "2026-09-01", to: "2026-09-30" };
const PRIOR_PERIOD = { from: "2026-08-01", to: "2026-08-31" };

function reportData(overrides: Partial<ReportData> = {}): ReportData {
  const prior = {
    revenue: 900_000,
    expenses: 100_000,
    netProfit: 800_000,
    cashBalance: 1_480_000,
    period: PRIOR_PERIOD,
  };
  return {
    summary: {
      revenue: 900_000,
      expenses: 120_000,
      transfers: 0,
      netProfit: 780_000,
      profitMargin: 86.7,
      cashBalance: 1_500_000,
      period: PERIOD,
      prior,
      hasAnyTransactions: true,
    },
    monthly: { points: [], period: PERIOD },
    category: { income: 900_000, expenses: 120_000, rows: [] },
    income: { total: 900_000, rows: [] },
    expense: { total: 120_000, rows: [] },
    profit: {
      revenue: 900_000,
      expenses: 120_000,
      netProfit: 780_000,
      profitMargin: 86.7,
      period: PERIOD,
      prior,
    },
    ...overrides,
  };
}

async function render(data: ReportData): Promise<string> {
  mocks.getReportData.mockResolvedValue(data);
  const element = await ReportSections({ currency: "NGN" });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  mocks.getReportData.mockReset();
});

describe("report prior-period deltas — metric-aware tone", () => {
  it("styles a higher expense as adverse and a higher profit as favorable", async () => {
    // Expenses rose 20% while revenue was flat and profit fell — the old
    // up=green/down=red tone would have painted the expense rise green.
    const html = await render(reportData());

    expect(html).toContain(
      `>+20%<span class="sr-only">up from the previous period — adverse for expenses`,
    );
    expect(html).toContain(
      `text-danger">-2%<span class="sr-only">down from the previous period — adverse for net profit`,
    );
    // A higher expense must never be styled as success anywhere.
    expect(html).not.toContain(`text-success">+20%`);
    // Flat revenue is muted and says so, not faked into a comparison.
    expect(html).toContain(
      `>0%<span class="sr-only">: unchanged from the previous period`,
    );
  });

  it("treats a falling expense as favorable and rising revenue as favorable", async () => {
    const data = reportData();
    const prior = {
      revenue: 900_000,
      expenses: 120_000,
      netProfit: 780_000,
      cashBalance: 1_480_000,
      period: PRIOR_PERIOD,
    };
    const html = await render(
      reportData({
        summary: {
          ...data.summary,
          revenue: 1_000_000,
          expenses: 100_000,
          netProfit: 900_000,
          prior,
        },
        profit: {
          ...data.profit,
          revenue: 1_000_000,
          expenses: 100_000,
          netProfit: 900_000,
          prior,
        },
      }),
    );

    expect(html).toContain(
      `text-success">+11%<span class="sr-only">up from the previous period — favorable for revenue`,
    );
    expect(html).toContain(
      `text-success">-17%<span class="sr-only">down from the previous period — favorable for expenses`,
    );
  });

  it("keeps a zero prior figure understandable instead of fabricating a percent", async () => {
    const html = await render(
      reportData({
        summary: {
          ...reportData().summary,
          prior: { ...reportData().summary.prior!, revenue: 0 },
        },
        profit: {
          ...reportData().profit,
          prior: { ...reportData().profit.prior!, revenue: 0 },
        },
      }),
    );

    expect(html).toContain(
      `—<span class="sr-only">: no prior figure to compare against`,
    );
    expect(html).not.toContain("+Infinity%");
    expect(html).not.toContain("NaN%");
  });

  it("explains an all-zero previous period instead of showing a wall of dashes", async () => {
    const html = await render(
      reportData({
        summary: {
          ...reportData().summary,
          prior: {
            revenue: 0,
            expenses: 0,
            netProfit: 0,
            cashBalance: 0,
            period: PRIOR_PERIOD,
          },
        },
        profit: {
          ...reportData().profit,
          prior: {
            revenue: 0,
            expenses: 0,
            netProfit: 0,
            cashBalance: 0,
            period: PRIOR_PERIOD,
          },
        },
      }),
    );

    expect(html).toContain(
      "No activity in the previous period, so there is nothing to compare against yet.",
    );
    expect(html).not.toContain(
      `—<span class="sr-only">: no prior figure to compare against`,
    );
    expect(html).not.toContain("-100%");
    expect(html).not.toContain("+0%");
  });

  it("renders no comparison block at all when the window has no prior period", async () => {
    const html = await render(
      reportData({
        summary: { ...reportData().summary, prior: null },
        profit: { ...reportData().profit, prior: null },
      }),
    );

    expect(html).not.toContain("vs previous period");
    expect(html).not.toContain("no prior figure to compare against");
  });
});

describe("report negative amounts and cash-balance note", () => {
  it("paints a negative net profit in the danger colour", async () => {
    const html = await render(
      reportData({
        summary: { ...reportData().summary, netProfit: -50_000, cashBalance: -10_000 },
        profit: { ...reportData().profit, netProfit: -50_000 },
      }),
    );
    const negative = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    }).format(-50_000);
    expect(html).toContain(`text-danger">${negative}`);
  });

  it("explains that cash balance is the end of the selected range", async () => {
    const html = await render(reportData());
    expect(html).toContain("Cash balance is as of the end of the selected range.");
  });
});
