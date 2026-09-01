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
import { getAnalyticsTrends } from "@/lib/services/analytics";
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

function makeRow(date: Date, type: string, amount: number) {
  return { type, date, _sum: { amount: makeDecimal(amount) } };
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

describe("getAnalyticsTrends (tenant-scoped trends)", () => {
  it("scopes the aggregation to the session-derived business id", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getAnalyticsTrends({});

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].where.businessId).toBe(businessA.id);
  });

  it("issues a single database aggregation per request", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getAnalyticsTrends({});

    expect(mockPrisma.transaction.groupBy).toHaveBeenCalledTimes(1);
  });

  it("groups into daily buckets", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-05T00:00:00.000Z"), "income", 100),
      makeRow(new Date("2026-01-05T00:00:00.000Z"), "expense", 40),
      makeRow(new Date("2026-01-06T00:00:00.000Z"), "income", 200),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points.map((p) => p.key)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(trends.points.map((p) => p.label)).toEqual(["Jan 5", "Jan 6"]);
  });

  it("groups into monthly buckets by default", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-10T00:00:00.000Z"), "income", 500),
      makeRow(new Date("2026-01-20T00:00:00.000Z"), "expense", 200),
      makeRow(new Date("2026-03-15T00:00:00.000Z"), "income", 700),
    ]);

    const trends = await getAnalyticsTrends({});

    expect(trends.points.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(trends.points.map((p) => p.label)).toEqual([
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
    ]);
  });

  it("aggregates revenue per bucket", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "income", 100),
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "income", 50),
      makeRow(new Date("2026-01-02T00:00:00.000Z"), "income", 25),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points[0].revenue).toBe(150);
    expect(trends.points[1].revenue).toBe(25);
  });

  it("aggregates expenses per bucket", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "expense", 40),
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "expense", 60),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points[0].expenses).toBe(100);
  });

  it("computes net profit per bucket via the engine", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "income", 1000),
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "expense", 400),
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "transfer", 300),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points[0].revenue).toBe(1000);
    expect(trends.points[0].expenses).toBe(400);
    expect(trends.points[0].transfers).toBe(300);
    expect(trends.points[0].netProfit).toBe(600);
  });

  it("computes profit margin per bucket (null when no revenue)", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "income", 1000),
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "expense", 400),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points[0].profitMargin).toBe(60);

    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-01T00:00:00.000Z"), "expense", 200),
    ]);

    const noRevenue = await getAnalyticsTrends({ groupBy: "day" });
    expect(noRevenue.points[0].profitMargin).toBeNull();
  });

  it("respects the inclusive dateFrom boundary", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getAnalyticsTrends({ dateFrom: "2026-02-01" });

    const [args] = mockPrisma.transaction.groupBy.mock.calls;
    expect(args[0].where.businessId).toBe(businessA.id);
    expect(args[0].where.date.gte).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });

  it("respects the inclusive dateTo boundary", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    await getAnalyticsTrends({ dateTo: "2026-02-28" });

    const [args] = mockPrisma.transaction.groupBy.mock.calls;
    expect(args[0].where.businessId).toBe(businessA.id);
    expect(args[0].where.date.lte).toEqual(new Date("2026-02-28T23:59:59.999Z"));
  });

  it("rejects an invalid date", async () => {
    await expect(
      getAnalyticsTrends({ dateFrom: "15/01/2026" }),
    ).rejects.toThrow("dateFrom");
    await expect(
      getAnalyticsTrends({ dateTo: "2026-13-40" }),
    ).rejects.toThrow("dateTo");
  });

  it("rejects a reversed date range", async () => {
    await expect(
      getAnalyticsTrends({ dateFrom: "2026-03-01", dateTo: "2026-02-01" }),
    ).rejects.toThrow("(dateFrom)");
  });

  it("returns no points for an empty range with no bounds", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const trends = await getAnalyticsTrends({});

    expect(trends.points).toEqual([]);
    expect(trends.period).toEqual({ from: null, to: null });
  });

  it("emits a flat zero line for an explicit range with no transactions", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const trends = await getAnalyticsTrends({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-03",
      groupBy: "day",
    });

    expect(trends.points).toHaveLength(3);
    for (const point of trends.points) {
      expect(point.revenue).toBe(0);
      expect(point.expenses).toBe(0);
      expect(point.netProfit).toBe(0);
      expect(point.profitMargin).toBeNull();
    }
    expect(trends.period).toEqual({ from: "2026-01-01", to: "2026-01-03" });
  });

  it("zero-fills missing buckets so a trend line does not jump gaps", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      makeRow(new Date("2026-01-05T00:00:00.000Z"), "income", 100),
      makeRow(new Date("2026-01-08T00:00:00.000Z"), "income", 50),
    ]);

    const trends = await getAnalyticsTrends({ groupBy: "day" });

    expect(trends.points.map((p) => p.key)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
    ]);
    expect(trends.points[1].revenue).toBe(0);
    expect(trends.points[2].revenue).toBe(0);
    expect(trends.points[3].revenue).toBe(50);
  });

  it("throws an authorization error when unauthenticated", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(getAnalyticsTrends({})).rejects.toBeInstanceOf(AuthorizationError);
  });
});