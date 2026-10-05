import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {},
}));

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { AuthorizationError } from "@/lib/services/auth-context";
import {
  buildCategoryCsv,
  buildMonthlyCsv,
  buildSummaryCsv,
  getCategoryReport,
  getReportData,
} from "@/lib/services/reports";
import type { AnalyticsSummary, AnalyticsTrends } from "@/lib/services/analytics";

const userA = {
  id: "auth-user-a",
  email: "a@example.com",
  name: "User A",
};

const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function categoryGroup(type: string, categoryId: string | null, amount: number) {
  return { type, categoryId, _sum: { amount: makeDecimal(amount) } };
}

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
  category: { findMany: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
  mockedGetCurrentUser.mockResolvedValue(userA);
  mockPrisma.business.findFirst.mockResolvedValue(businessA);
  mockPrisma.category.findMany.mockResolvedValue([]);
});

describe("getReportData (composition)", () => {
  it("returns zeroed reports for a business with no transactions", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const data = await getReportData({});

    expect(data.summary.revenue).toBe(0);
    expect(data.summary.expenses).toBe(0);
    expect(data.monthly.points).toEqual([]);
    expect(data.category.income).toBe(0);
    expect(data.category.expenses).toBe(0);
    expect(data.category.rows).toEqual([]);
  });

  it("scopes every aggregation to the session-derived business id", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getReportData({});

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(4);
    for (const [args] of calls) {
      expect(args.where.businessId).toBe(businessA.id);
    }
  });

  it("rejects an invalid date range before querying", async () => {
    await expect(
      getReportData({ dateFrom: "15/01/2026" }),
    ).rejects.toThrow("dateFrom");
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("throws an authorization error when unauthenticated", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);

    await expect(getReportData({})).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("getCategoryReport (breakdown)", () => {
  it("breaks income and expenses into per-category rows with shares of the type total", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      categoryGroup("income", "c1", 400),
      categoryGroup("income", null, 200),
      categoryGroup("expense", "c2", 200),
      categoryGroup("expense", "c3", 100),
    ]);
    mockPrisma.category.findMany.mockResolvedValue([
      { id: "c1", name: "Sales" },
      { id: "c2", name: "Rent" },
      { id: "c3", name: "Transport" },
    ]);

    const report = await getCategoryReport({});

    expect(report.income).toBe(600);
    expect(report.expenses).toBe(300);
    expect(report.rows.map((r) => [r.name, r.type, r.amount, r.share])).toEqual([
      ["Sales", "income", 400, 66.67],
      ["Uncategorized", "income", 200, 33.33],
      ["Rent", "expense", 200, 66.67],
      ["Transport", "expense", 100, 33.33],
    ]);
  });

  it("reports null share when a type total is zero", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      categoryGroup("expense", null, 0),
    ]);

    const report = await getCategoryReport({});

    expect(report.expenses).toBe(0);
    expect(report.rows).toEqual([
      {
        categoryId: null,
        name: "Uncategorized",
        type: "expense",
        amount: 0,
        share: null,
      },
    ]);
  });

  it("filters to income/expense only and applies the date bounds", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getCategoryReport({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });

    const [args] = mockPrisma.transaction.groupBy.mock.calls[0];
    expect(args.where.businessId).toBe(businessA.id);
    expect(args.where.type).toEqual({ in: ["income", "expense"] });
    expect(args.where.date.gte).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(args.where.date.lte).toEqual(new Date("2026-02-28T23:59:59.999Z"));
  });
});

describe("CSV report serializers", () => {
  it("serializes the summary (machine-readable numbers, blank null margin)", () => {
    const summary: AnalyticsSummary = {
      revenue: 12000.5,
      expenses: 8000,
      transfers: 0,
      netProfit: 4000.5,
      profitMargin: 33.38,
      cashBalance: 5000.5,
      period: { from: "2026-01-01", to: "2026-01-31" },
    };
    expect(buildSummaryCsv(summary)).toBe(
      [
        "Metric,Value",
        "Report period from,2026-01-01",
        "Report period to,2026-01-31",
        "Revenue,12000.50",
        "Expenses,8000.00",
        "Transfers,0.00",
        "Net profit,4000.50",
        "Profit margin (%),33.38",
        "Cash balance,5000.50",
      ].join("\r\n") + "\r\n",
    );
  });

  it("serializes the monthly trend using YYYY-MM keys and blanks the null margin", () => {
    const trends: AnalyticsTrends = {
      points: [
        {
          key: "2026-01",
          label: "Jan 2026",
          revenue: 12000,
          expenses: 7000,
          transfers: 0,
          netProfit: 5000,
          profitMargin: 41.67,
        },
        {
          key: "2026-02",
          label: "Feb 2026",
          revenue: 0,
          expenses: 500,
          transfers: 0,
          netProfit: -500,
          profitMargin: null,
        },
      ],
      period: { from: "2026-01-01", to: "2026-02-28" },
    };
    expect(buildMonthlyCsv(trends)).toBe(
      [
        "Month,Revenue,Expenses,Transfers,Net profit,Profit margin (%)",
        "2026-01,12000.00,7000.00,0.00,5000.00,41.67",
        "2026-02,0.00,500.00,0.00,-500.00,",
      ].join("\r\n") + "\r\n",
    );
  });

  it("serializes the category breakdown and escapes names", () => {
    const report = {
      income: 600,
      expenses: 300,
      rows: [
        {
          categoryId: "c1",
          name: 'Sales, "Spring"',
          type: "income" as const,
          amount: 400,
          share: 66.67,
        },
        {
          categoryId: null,
          name: "Uncategorized",
          type: "expense" as const,
          amount: 50,
          share: null,
        },
      ],
    };
    expect(buildCategoryCsv(report)).toBe(
      'Type,Category,Amount,% of type\r\nincome,"Sales, ""Spring""",400.00,66.67\r\nexpense,Uncategorized,50.00,\r\n',
    );
  });

  it("neutralizes formula-looking category names in the exported CSV", () => {
    const report = {
      income: 300,
      expenses: 0,
      rows: [
        {
          categoryId: "c1",
          name: '=HYPERLINK("https://evil.example")',
          type: "income" as const,
          amount: 100,
          share: 33.33,
        },
        {
          categoryId: "c2",
          name: "@sum(A1)",
          type: "income" as const,
          amount: 200,
          share: 66.67,
        },
      ],
    };
    expect(buildCategoryCsv(report)).toBe(
      'Type,Category,Amount,% of type\r\nincome,"\'=HYPERLINK(""https://evil.example"")",100.00,33.33\r\nincome,\'@sum(A1),200.00,66.67\r\n',
    );
  });

  it("keeps legitimate negative figures numeric (never prefixed) in exports", () => {
    const trends: AnalyticsTrends = {
      points: [
        {
          key: "2026-03",
          label: "Mar 2026",
          revenue: 0,
          expenses: 2500,
          transfers: 0,
          netProfit: -2500,
          profitMargin: null,
        },
      ],
      period: { from: "2026-03-01", to: "2026-03-31" },
    };
    expect(buildMonthlyCsv(trends)).toContain(
      "2026-03,0.00,2500.00,0.00,-2500.00,",
    );
  });
});

describe("getCategoryReport + CSV export (formula-injection isolation)", () => {
  it("neutralizes a malicious category name leaving getCategoryReport untouched", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      categoryGroup("income", "c1", 100),
    ]);
    mockPrisma.category.findMany.mockResolvedValue([
      { id: "c1", name: '=IMPORTXML("https://evil.example")' },
    ]);

    const report = await getCategoryReport({});
    expect(report.rows[0].name).toBe('=IMPORTXML("https://evil.example")');
    expect(buildCategoryCsv(report)).toBe(
      'Type,Category,Amount,% of type\r\nincome,"\'=IMPORTXML(""https://evil.example"")",100.00,100.00\r\n',
    );
  });
});