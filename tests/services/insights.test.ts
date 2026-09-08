import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { getInsights } from "@/lib/services/insights";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTypeGroup(type: string, amount: number) {
  return { type, _sum: { amount: makeDecimal(amount) } };
}

function makeCategoryGroup(categoryId: string | null, amount: number, count: number) {
  return { categoryId, _sum: { amount: makeDecimal(amount) }, _count: count };
}

const mockedRequireAuthContext = vi.mocked(requireAuthContext);

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn(), findFirst: vi.fn() },
  category: { findMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  // mockReset (not just clearAllMocks) also drains leftover mockResolvedValueOnce
  // queues so state never leaks between tests.
  mockPrisma.business.findFirst.mockReset();
  mockPrisma.transaction.groupBy.mockReset();
  mockPrisma.transaction.findFirst.mockReset();
  mockPrisma.category.findMany.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
});

/** Seed the ordered prisma responses for a period with a largest expense. */
function seedAggregations() {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000), makeTypeGroup("expense", 600_000)])
    .mockResolvedValueOnce([makeTypeGroup("income", 800_000), makeTypeGroup("expense", 650_000)]) // prior
    .mockResolvedValueOnce([makeCategoryGroup("cat-inventory", 200_000, 3)]) // prior categories
    .mockResolvedValueOnce([
      makeCategoryGroup("cat-inventory", 300_000, 4),
      makeCategoryGroup("cat-transport", 120_000, 2),
    ]); // current categories

  mockPrisma.transaction.findFirst.mockResolvedValue({
    amount: makeDecimal(250_000),
    category: { name: "Inventory" },
  });

  mockPrisma.category.findMany.mockResolvedValue([
    { id: "cat-inventory", name: "Inventory" },
    { id: "cat-transport", name: "Transportation" },
  ]);
}

describe("getInsights (aggregation -> engine -> narration pipeline)", () => {
  it("returns insight DTOs with kind, title, description and an echoed period", async () => {
    seedAggregations();

    const insights = await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });

    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(i).toHaveProperty("kind");
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
      expect(i.period).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    }
  });

  it("names the top expense category in the key insight", async () => {
    seedAggregations();

    const insights = await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    const key = insights.find((i) => i.kind === "key");

    expect(key?.title).toContain("Inventory");
    expect(key?.description).toContain("50%"); // 300k of 600k expenses
  });

  it("derives a spending insight with the category delta", async () => {
    seedAggregations();

    const insights = await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    const spending = insights.find((i) => i.kind === "spending");

    expect(spending?.title).toContain("Inventory");
    expect(spending?.metadata.percentChange).toBe(50); // 300k vs prior 200k
  });

  it("scopes every aggregation to the session-derived business id", async () => {
    seedAggregations();
    await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });

    const groupByCalls = mockPrisma.transaction.groupBy.mock.calls;
    expect(groupByCalls.length).toBeGreaterThanOrEqual(4);
    for (const [args] of groupByCalls) {
      expect(args.where.businessId).toBe(businessA.id);
    }
    expect(mockPrisma.transaction.findFirst.mock.calls[0][0].where.businessId).toBe(businessA.id);
  });

  it("uses an inclusive date range across current and prior periods", async () => {
    seedAggregations();
    await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls[0][0].where.date.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-06-30T23:59:59.999Z"));
    // Prior period is the same span ending the day before this period starts.
    expect(calls[1][0].where.date.lte).toEqual(new Date("2026-05-31T23:59:59.999Z"));
  });

  it("throws on an invalid date range", async () => {
    await expect(getInsights({ dateFrom: "not-a-date" })).rejects.toThrow();
  });

  it("treats a missing range as all time (no date predicate)", async () => {
    seedAggregations();
    await getInsights({});

    const first = mockPrisma.transaction.groupBy.mock.calls[0][0];
    expect(first.where.businessId).toBe(businessA.id);
    expect(first.where.date).toBeUndefined();
  });

  it("keeps only the given bound when just dateFrom is provided (no prior fetch)", async () => {
    seedAggregations();
    await getInsights({ dateFrom: "2026-06-01" });

    const groupByCalls = mockPrisma.transaction.groupBy.mock.calls;
    expect(groupByCalls[0][0].where.date.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(groupByCalls[0][0].where.date.lte).toBeUndefined();
    // Current type groups + category groups only: no prior-period query.
    expect(groupByCalls).toHaveLength(2);
  });

  it("returns an empty list (empty state) when the window has no activity", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.category.findMany.mockResolvedValue([]);

    const insights = await getInsights({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });
    expect(insights).toEqual([]);
  });

  it("still works when there are no transactions in the period", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockPrisma.category.findMany.mockResolvedValue([]);

    const insights = await getInsights({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    expect(Array.isArray(insights)).toBe(true);
  });
});