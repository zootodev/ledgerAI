import { describe, expect, it, vi, beforeEach } from "vitest";

// Real requireAuthContext + real report services, fake prisma. This drives the
// full demand path (route -> auth context -> service aggregation -> CSV
// builders) with two session-bearing tenants, proving reports and CSV exports
// can never leak between business A and business B.

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {},
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://localhost:3000"),
}));

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { getReportData } from "@/lib/services/reports";
import { GET } from "@/app/reports/export/route";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const userB = { id: "auth-user-b", email: "b@example.com", name: "User B" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };
const businessB = { id: "biz-b", name: "B Ltd", currency: "USD" };

const CATEGORY_A_HOUSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_A_PARTNER = "abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY_B_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CATEGORY_B_TRAVEL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

let activeBiz = businessA;

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
  category: { findMany: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as never);
  activeBiz = businessA;

  vi.mocked(getCurrentUser).mockImplementation(async () =>
    activeBiz.id === businessA.id ? userA : userB,
  );
  mockPrisma.business.findFirst.mockImplementation(
    async ({ where }: { where: { userId: string } }) =>
      where.userId === userA.id ? businessA : businessB,
  );

  // groupBy returns the ACTIVE tenant's rows, mirroring a Postgres row set
  // pre-filtered by businessId. Every call receives where.businessId from the
  // real service, so the implementation keys off it like a real query would.
  mockPrisma.transaction.groupBy.mockImplementation(
    async ({ by, where }: { by: string[]; where: { businessId?: string } }) => {
      const isA = where.businessId === businessA.id;
      if (by.includes("date")) {
        return isA
          ? [
              { type: "income", date: new Date("2026-06-05"), _sum: { amount: makeDecimal(300) } },
              { type: "expense", date: new Date("2026-06-06"), _sum: { amount: makeDecimal(50) } },
            ]
          : [
              { type: "income", date: new Date("2026-07-05"), _sum: { amount: makeDecimal(700) } },
              { type: "expense", date: new Date("2026-07-06"), _sum: { amount: makeDecimal(100) } },
            ];
      }
      if (by.length === 1 && by[0] === "type") {
        return isA
          ? [
              { type: "income", _sum: { amount: makeDecimal(300) } },
              { type: "expense", _sum: { amount: makeDecimal(50) } },
            ]
          : [
              { type: "income", _sum: { amount: makeDecimal(700) } },
              { type: "expense", _sum: { amount: makeDecimal(100) } },
            ];
      }
      return isA
        ? [
            { categoryId: CATEGORY_A_HOUSE, type: "income", _sum: { amount: makeDecimal(300) } },
            { categoryId: CATEGORY_A_PARTNER, type: "expense", _sum: { amount: makeDecimal(50) } },
          ]
        : [
            { categoryId: CATEGORY_B_CLIENT, type: "income", _sum: { amount: makeDecimal(700) } },
            { categoryId: CATEGORY_B_TRAVEL, type: "expense", _sum: { amount: makeDecimal(100) } },
          ];
    },
  );

  mockPrisma.category.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) => {
      const owner =
        activeBiz.id === businessA.id
          ? [
              [CATEGORY_A_HOUSE, "Sales"],
              [CATEGORY_A_PARTNER, "Partner fees"],
            ]
          : [
              [CATEGORY_B_CLIENT, "Consulting"],
              [CATEGORY_B_TRAVEL, "Travel"],
            ];
      return owner
        .filter(([id]) => where.id.in.includes(id))
        .map(([id, name]) => ({ id, name }));
    },
  );
});

function exportRequest(query: string) {
  return new Request(`http://localhost:3000/reports/export?${query}`);
}

async function csvBody(request: Request): Promise<string> {
  const response = await GET(request);
  expect(response.status).toBe(200);
  return response.text();
}

describe("dual-business Reports/export tenant isolation (real service pipeline)", () => {
  it("locks every aggregation to the session-derived business id for A and B", async () => {
    await getReportData({});
    const callsA = mockPrisma.transaction.groupBy.mock.calls;
    expect(callsA).toHaveLength(4);
    for (const [args] of callsA) {
      expect(args.where.businessId).toBe(businessA.id);
    }

    activeBiz = businessB;
    await getReportData({});
    const callsB = mockPrisma.transaction.groupBy.mock.calls.slice(4);
    expect(callsB).toHaveLength(4);
    for (const [args] of callsB) {
      expect(args.where.businessId).toBe(businessB.id);
    }
  });

  it("exports a summary CSV scoped to the requesting session", async () => {
    const aCsv = await csvBody(exportRequest("type=summary"));
    expect(aCsv).toContain("Revenue,300.00");
    expect(aCsv).toContain("Expenses,50.00");
    expect(aCsv).not.toContain("700.00");

    activeBiz = businessB;
    const bCsv = await csvBody(exportRequest("type=summary"));
    expect(bCsv).toContain("Revenue,700.00");
    expect(bCsv).toContain("Expenses,100.00");
    expect(bCsv).not.toContain("300.00");
  });

  it("exports a monthly CSV with only the owning tenant's buckets", async () => {
    const aCsv = await csvBody(exportRequest("type=monthly"));
    expect(aCsv).toContain("2026-06,300.00");
    expect(aCsv).not.toContain("2026-07");

    activeBiz = businessB;
    const bCsv = await csvBody(exportRequest("type=monthly"));
    expect(bCsv).toContain("2026-07,700.00");
    expect(bCsv).not.toContain("2026-06");
  });

  it("never exposes another tenant's category names in the category export", async () => {
    const aCsv = await csvBody(exportRequest("type=category"));
    expect(aCsv).toContain("Sales");
    expect(aCsv).toContain("Partner fees");
    expect(aCsv).not.toContain("Consulting");
    expect(aCsv).not.toContain("Travel");

    activeBiz = businessB;
    const bCsv = await csvBody(exportRequest("type=category"));
    expect(bCsv).toContain("Consulting");
    expect(bCsv).toContain("Travel");
    expect(bCsv).not.toContain("Sales");
    expect(bCsv).not.toContain("Partner fees");
  });

  it("identity comes from the server session, never the query string", async () => {
    // Requesting with no businessId in the URL still yields the session tenant's
    // data (business A), and even a spoofed param is ignored by the route.
    const spoofed = await csvBody(exportRequest("type=summary&businessId=biz-b"));
    expect(spoofed).toContain("Revenue,300.00");
    expect(spoofed).not.toContain("700.00");
  });
});