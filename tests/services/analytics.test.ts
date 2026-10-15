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
import { getAnalyticsSummary } from "@/lib/services/analytics";
import { AuthorizationError } from "@/lib/services/auth-context";

const userA = {
  id: "auth-user-a",
  email: "a@example.com",
  name: "User A",
};

const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeGroup(type: string, amount: number) {
  return { type, _sum: { amount: makeDecimal(amount) } };
}

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
  mockedGetCurrentUser.mockResolvedValue(userA);
  mockPrisma.business.findFirst.mockResolvedValue(businessA);
});

describe("getAnalyticsSummary (tenant-scoped KPIs)", () => {
  it("computes revenue, expenses and net profit from groupBy subtotals", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeGroup("income", 1000),
      makeGroup("expense", 400),
      makeGroup("transfer", 300),
    ]);

    const summary = await getAnalyticsSummary({});

    expect(summary.revenue).toBe(1000);
    expect(summary.expenses).toBe(400);
    expect(summary.transfers).toBe(300);
    expect(summary.netProfit).toBe(600);
    expect(summary.profitMargin).toBe(60);
    expect(summary.cashBalance).toBe(600);
  });

  it("reports null profit margin when there is no revenue", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeGroup("expense", 200),
    ]);

    const summary = await getAnalyticsSummary({});
    expect(summary.revenue).toBe(0);
    expect(summary.expenses).toBe(200);
    expect(summary.netProfit).toBe(-200);
    expect(summary.profitMargin).toBeNull();
  });

  it("scopes every aggregation to the session-derived business id", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getAnalyticsSummary({});

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [args] of calls) {
      expect(args.where.businessId).toBe(businessA.id);
    }
  });

  it("narrows every aggregation to one account while keeping the business bound", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([]) // period
      .mockResolvedValueOnce([]) // balance
      .mockResolvedValueOnce([]) // prior period
      .mockResolvedValueOnce([]); // prior balance

    await getAnalyticsSummary({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(4);
    for (const [args] of calls) {
      // The business id is still the isolation boundary; the account id only
      // narrows the owner's own rows.
      expect(args.where.businessId).toBe(businessA.id);
      expect(args.where.accountId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    }
  });

  it("reflects the date range: period is capped by dateTo but balance ignores dateFrom", async () => {
    // Four groupBy calls for a bounded range: period, balance, prior period,
    // prior balance.
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeGroup("income", 500)]) // period
      .mockResolvedValueOnce([makeGroup("income", 500)]) // balance
      .mockResolvedValueOnce([makeGroup("income", 300)]) // prior period
      .mockResolvedValueOnce([makeGroup("income", 300)]); // prior balance

    await getAnalyticsSummary({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    const [periodArgs, balanceArgs] = calls;

    expect(periodArgs[0].where.date.gte).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(periodArgs[0].where.date.lte).toEqual(new Date("2026-02-28T23:59:59.999Z"));

    // Balance snapshot ignores dateFrom but still caps at dateTo.
    expect(balanceArgs[0].where.date.lte).toEqual(new Date("2026-02-28T23:59:59.999Z"));
    expect(balanceArgs[0].where.date.gte).toBeUndefined();
  });

  it("computes the prior period as the same-length span before the window", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeGroup("income", 500), makeGroup("expense", 200)]) // period
      .mockResolvedValueOnce([makeGroup("income", 500), makeGroup("expense", 200)]) // balance
      .mockResolvedValueOnce([makeGroup("income", 400), makeGroup("expense", 100)]) // prior period
      .mockResolvedValueOnce([
        makeGroup("income", 900),
        makeGroup("expense", 300),
      ]); // prior balance

    const summary = await getAnalyticsSummary({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });

    expect(summary.prior).not.toBeNull();
    expect(summary.prior?.revenue).toBe(400);
    expect(summary.prior?.expenses).toBe(100);
    expect(summary.prior?.netProfit).toBe(300);
    expect(summary.prior?.cashBalance).toBe(600);
    expect(summary.prior?.period).toEqual({ from: "2026-01-04", to: "2026-01-31" });

    // Prior queries are scoped to the session business and bounded.
    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls[2][0].where.businessId).toBe(businessA.id);
    expect(calls[2][0].where.date.gte).toEqual(new Date("2026-01-04T00:00:00.000Z"));
    expect(calls[2][0].where.date.lte).toEqual(new Date("2026-01-31T23:59:59.999Z"));
  });

  it("has no prior period for an all-time window", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const summary = await getAnalyticsSummary({});

    expect(summary.prior).toBeNull();
    expect(mockPrisma.transaction.groupBy).toHaveBeenCalledTimes(2);
  });

  it("computes bank balance as the as-of cumulative net position", async () => {
    const periodGroups = [makeGroup("income", 300), makeGroup("expense", 100)];
    const balanceGroups = [
      makeGroup("income", 3000),
      makeGroup("expense", 1200),
      makeGroup("transfer", 900),
    ];
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(periodGroups)
      .mockResolvedValueOnce(balanceGroups);

    const summary = await getAnalyticsSummary({ dateTo: "2026-03-01" });

    expect(summary.revenue).toBe(300);
    expect(summary.expenses).toBe(100);
    expect(summary.netProfit).toBe(200);
    // As-of balance: cumulative income − expenses, transfers excluded.
    expect(summary.cashBalance).toBe(1800);
    expect(summary.period).toEqual({ from: null, to: "2026-03-01" });
  });

  it("defaults to zeroes for a business with no transactions", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const summary = await getAnalyticsSummary({});

    expect(summary.revenue).toBe(0);
    expect(summary.expenses).toBe(0);
    expect(summary.transfers).toBe(0);
    expect(summary.netProfit).toBe(0);
    expect(summary.profitMargin).toBeNull();
    expect(summary.cashBalance).toBe(0);
  });

  it("throws an authorization error when unauthenticated", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(getAnalyticsSummary({})).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects an invalid date range", async () => {
    await expect(
      getAnalyticsSummary({ dateFrom: "15/01/2026" }),
    ).rejects.toThrow("dateFrom");
    await expect(
      getAnalyticsSummary({ dateTo: "1/1/2026" }),
    ).rejects.toThrow("dateTo");
  });
});