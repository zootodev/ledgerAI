import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { getAnalyticsTrends } from "@/lib/services/analytics";

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as never);
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "auth-user-a",
    email: "a@example.com",
    name: "User A",
  });
  mockPrisma.business.findFirst.mockResolvedValue({
    id: "biz-a",
    name: "A Ltd",
    currency: "NGN",
  });
  mockPrisma.transaction.groupBy.mockResolvedValue([]);
});

describe("getAnalyticsTrends partial-month labels (labels only)", () => {
  it("marks the first and last buckets of a mid-month range", async () => {
    const trends = await getAnalyticsTrends({
      dateFrom: "2026-08-24",
      dateTo: "2026-11-21",
      groupBy: "month",
    });

    expect(trends.points.map((p) => p.label)).toEqual([
      "Aug 2026 (from 24th)",
      "Sep 2026",
      "Oct 2026",
      "Nov 2026 (to 21st)",
    ]);
    // Bucket amounts are untouched by the label change.
    expect(trends.points.every((p) => p.revenue === 0 && p.expenses === 0)).toBe(true);
  });

  it("marks both boundaries when a range sits inside one month", async () => {
    const trends = await getAnalyticsTrends({
      dateFrom: "2026-08-24",
      dateTo: "2026-08-28",
      groupBy: "month",
    });

    expect(trends.points.map((p) => p.label)).toEqual([
      "Aug 2026 (from 24th to 28th)",
    ]);
  });

  it("leaves whole-month buckets alone", async () => {
    const trends = await getAnalyticsTrends({
      dateFrom: "2026-09-01",
      dateTo: "2026-10-31",
      groupBy: "month",
    });

    expect(trends.points.map((p) => p.label)).toEqual(["Sep 2026", "Oct 2026"]);
  });
});
