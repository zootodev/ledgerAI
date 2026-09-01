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
import {
  requireAuthContext,
  getAuthContext,
  AuthorizationError,
} from "@/lib/services/auth-context";
import {
  listTransactions,
  getTransaction,
  deleteTransaction,
} from "@/lib/services/transactions";

const userA = {
  id: "auth-user-a",
  email: "a@example.com",
  name: "User A",
};

const userB = {
  id: "auth-user-b",
  email: "b@example.com",
  name: "User B",
};

const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };
const businessB = { id: "biz-b", name: "B Ltd", currency: "USD" };

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTransactionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tx-1",
    businessId: businessA.id,
    accountId: null,
    date: new Date("2026-01-15"),
    description: "Stripe payout",
    amount: makeDecimal(250.5),
    type: "income",
    categoryId: null,
    source: "stripe",
    reference: null,
    notes: null,
    aiCategory: null,
    aiConfidence: null,
    fingerprint: null,
    createdAt: new Date("2026-01-16"),
    updatedAt: new Date("2026-01-16"),
    ...overrides,
  };
}

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const mockPrisma = {
  business: {
    findFirst: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
});

describe("requireAuthContext (session -> tenant resolution)", () => {
  it("throws AuthorizationError when there is no session", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(requireAuthContext()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("throws Error when DATABASE_URL is not configured", async () => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockedGetPrismaClient.mockReturnValue(null);
    await expect(requireAuthContext()).rejects.toThrow("DATABASE_URL");
  });

  it("derives the business from the session user, never the client", async () => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);

    const ctx = await requireAuthContext();
    expect(ctx.business.id).toBe("biz-a");
    expect(mockPrisma.business.findFirst).toHaveBeenCalledWith({
      where: { userId: userA.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true },
    });
  });

  it("throws AuthorizationError when the user has no business yet", async () => {
    mockedGetCurrentUser.mockResolvedValue(userB);
    mockPrisma.business.findFirst.mockResolvedValue(null);
    await expect(requireAuthContext()).rejects.toThrow("No business");
  });

  it("getAuthContext returns null (not throws) when unauthenticated", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("getAuthContext returns null when no business exists", async () => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(null);
    await expect(getAuthContext()).resolves.toBeNull();
  });
});

describe("transactions service (tenant-isolated data access)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("scopes list queries to the session businessId", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransactionRow(),
    ]);
    mockPrisma.transaction.count.mockResolvedValue(1);

    const result = await listTransactions({});
    expect(result.total).toBe(1);
    expect(result.items[0].amount).toBe("250.50");

    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.businessId).toBe(businessA.id);
  });

  it("derives the same businessId for count as for findMany", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(7);

    await listTransactions({});
    const countWhere = mockPrisma.transaction.count.mock.calls[0][0].where;
    const findWhere = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(countWhere.businessId).toBe(businessA.id);
    expect(findWhere.businessId).toBe(businessA.id);
  });

  it("applies a free-text search alongside the tenant scope", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);

    await listTransactions({ search: "stripe" });
    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.businessId).toBe(businessA.id);
    expect(where.description.contains).toBe("stripe");
  });

  it("returns null for a transaction that is not owned by the session business", async () => {
    // Prisma filters by businessId; for an id owned by another tenant the
    // scoped where clause matches nothing → the service must see null.
    mockPrisma.transaction.findFirst.mockImplementation(
      ({ where }: { where: { id: string; businessId: string } }) => {
        if (where.id === "tx-9" && where.businessId === businessB.id) {
          return makeTransactionRow({ id: "tx-9", businessId: businessB.id });
        }
        return null;
      },
    );

    const result = await getTransaction("tx-9");
    expect(result).toBeNull();
    expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: "tx-9", businessId: businessA.id },
    });
  });

  it("returns null for a missing transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    await expect(getTransaction("nope")).resolves.toBeNull();
  });

  it("refuses to delete a transaction owned by another business", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    await expect(deleteTransaction("tx-b")).resolves.toBe(false);
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes a transaction owned by the session business", async () => {
    const owned = makeTransactionRow({ id: "tx-2" });
    mockPrisma.transaction.findFirst.mockResolvedValue(owned);
    mockPrisma.transaction.delete.mockResolvedValue(owned);

    await expect(deleteTransaction("tx-2")).resolves.toBe(true);
    expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: "tx-2" },
    });
  });

  it("paginates with clamped page size", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);

    await listTransactions({ page: 2, pageSize: 999 });
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(100);
  });

  it("serializes Decimal fields to strings without float drift", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransactionRow({
        amount: makeDecimal(1234567890.12),
        aiConfidence: makeDecimal(0.87),
      }),
    ]);
    mockPrisma.transaction.count.mockResolvedValue(1);

    const [row] = (await listTransactions({})).items;
    expect(row.amount).toBe("1234567890.12");
    expect(row.aiConfidence).toBe(0.87);
    expect(typeof row.amount).toBe("string");
  });
});