import { describe, expect, it, vi, beforeEach } from "vitest";

// ============================================================
// Cross-boundary tenant-isolation proof (launch hardening)
// ------------------------------------------------------------
// Two tenants, A and B. Every entry point — server actions, route handlers and
// direct service/ID access — must derive the tenant from the SESSION and never
// from anything the client can supply. The mocked Prisma layer behaves like a
// real database: a query scoped to business A never returns B's rows.
// ============================================================

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));

vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));

vi.mock("@/lib/services/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/reports")>();
  return { ...actual, getReportData: vi.fn() };
});

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 10, retryAfterSeconds: 0 })),
  getRequestClientIp: vi.fn(async () => "203.0.113.7"),
}));

vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, ...rateLimitMocks };
});

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { getReportData } from "@/lib/services/reports";
import { getTransaction, deleteTransaction } from "@/lib/services/transactions";
import {
  createTransactionAction,
  updateTransactionAction,
  deleteTransactionAction,
} from "@/lib/actions/transactions";
import { GET as exportReport } from "@/app/reports/export/route";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const userB = { id: "auth-user-b", email: "b@example.com", name: "User B" };

const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };
const businessB = { id: "biz-b", name: "B Ltd", currency: "USD" };

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "99999999-9999-4999-8999-999999999999";
const UUID_MISSING = "00000000-0000-4000-8000-000000000000";

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTransactionRow(businessId: string, overrides: Record<string, unknown> = {}) {
  const id = businessId === businessA.id ? UUID_A : UUID_B;
  return {
    id,
    businessId,
    accountId: null,
    date: new Date("2026-01-15"),
    description: businessId === businessA.id ? "A income" : "B income",
    amount: makeDecimal(100),
    type: "income",
    categoryId: null,
    source: "manual",
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

// A Prisma double that enforces businessId scoping like the real DB would.
const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  account: { findFirst: vi.fn() },
  category: { findFirst: vi.fn() },
  categoryRule: { upsert: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as never);

  // business.findFirst is always scoped by userId; return the matching tenant.
  mockPrisma.business.findFirst.mockImplementation(
    ({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === userA.id ? businessA : businessB),
  );

  // transaction.findFirst honours the businessId scope (the whole point).
  mockPrisma.transaction.findFirst.mockImplementation(
    ({ where }: { where: { id: string; businessId: string } }) => {
      if (where.id === UUID_A) {
        return Promise.resolve(
          where.businessId === businessA.id ? makeTransactionRow(businessA.id) : null,
        );
      }
      if (where.id === UUID_B) {
        return Promise.resolve(
          where.businessId === businessB.id ? makeTransactionRow(businessB.id) : null,
        );
      }
      return Promise.resolve(null);
    },
  );
});

function formData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("date", overrides.date ?? "2026-08-01");
  fd.set("description", overrides.description ?? "Sales receipt");
  fd.set("amount", overrides.amount ?? "1000.00");
  fd.set("type", overrides.type ?? "income");
  if (overrides.id) fd.set("id", overrides.id);
  if (overrides.accountId) fd.set("accountId", overrides.accountId);
  if (overrides.categoryId) fd.set("categoryId", overrides.categoryId);
  return fd;
}

describe("server actions isolate tenants (users A and B)", () => {
  it("user A's create is scoped to A's business", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    mockPrisma.transaction.create.mockResolvedValue(makeTransactionRow(businessA.id));

    const result = await createTransactionAction({}, formData());

    expect(result.ok).toBe(true);
    expect(mockPrisma.transaction.create.mock.calls[0][0].data.businessId).toBe(businessA.id);
  });

  it("user B cannot create against A's account id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userB);
    // The scoped account lookup (business B) never finds A's account.
    mockPrisma.account.findFirst.mockResolvedValue(null);

    const result = await createTransactionAction({}, formData({ accountId: UUID_A }));

    expect(result.error).toContain("Account not found");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("user B cannot update A's transaction by id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userB);

    const result = await updateTransactionAction({}, formData({ id: UUID_A, description: "Hack" }));

    expect(result.error).toBe("Transaction not found.");
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it("user B cannot delete A's transaction by id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userB);

    await deleteTransactionAction(formData({ id: UUID_A }));

    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
  });

  it("user A can update their own transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    mockPrisma.transaction.update.mockResolvedValue(makeTransactionRow(businessA.id));

    const result = await updateTransactionAction({}, formData({ id: UUID_A, description: "Edited" }));

    expect(result.ok).toBe(true);
    const updateWhere = mockPrisma.transaction.update.mock.calls[0][0].where;
    expect(updateWhere.id).toBe(UUID_A);
  });
});

describe("direct ID access is tenant-scoped", () => {
  it("returns null when reading a foreign transaction id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);

    await expect(getTransaction(UUID_B)).resolves.toBeNull();
    // And it queried with A's business scope, never B's.
    expect(mockPrisma.transaction.findFirst.mock.calls[0][0].where).toEqual({
      id: UUID_B,
      businessId: businessA.id,
    });
  });

  it("returns null for a missing id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    await expect(getTransaction(UUID_MISSING)).resolves.toBeNull();
  });

  it("refuses to delete a foreign transaction id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    await expect(deleteTransaction(UUID_B)).resolves.toBe(false);
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
  });
});

describe("route handlers ignore client-supplied tenant ids", () => {
  const reportData = {
    summary: {
      revenue: 0,
      expenses: 0,
      transfers: 0,
      netProfit: 0,
      profitMargin: 0,
      cashBalance: 0,
      period: { from: "2026-01-01", to: "2026-01-31" },
      prior: null,
      hasAnyTransactions: false,
    },
    monthly: { points: [], period: { from: null, to: null } },
    category: { income: 0, expenses: 0, rows: [] },
    income: { total: 0, rows: [] },
    expense: { total: 0, rows: [] },
    profit: { points: [], totals: { revenue: 0, expenses: 0, netProfit: 0 } },
  };

  it("words a report for the session business, not a client businessId param", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    vi.mocked(getReportData).mockResolvedValue(reportData as never);

    const response = await exportReport(
      new Request(`http://localhost:3000/reports/export?type=summary&businessId=${businessB.id}`),
    );

    expect(response.status).toBe(200);
    // The tenant comes from requireAuthContext (the session), so a businessId
    // query param is inert and never reaches the data layer.
    expect(vi.mocked(getReportData).mock.calls[0][0]).not.toHaveProperty("businessId");
    // And the account scope is checked against the session business id.
    expect(mockPrisma.business.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: userA.id } }),
    );
  });

  it("rejects an accountId that belongs to another tenant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    mockPrisma.account.findFirst.mockResolvedValue(null); // scoped to A → not found

    const response = await exportReport(
      new Request(`http://localhost:3000/reports/export?type=summary&accountId=${UUID_B}`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown account." });
    // Scoping is derived from the session business, never a query param.
    expect(mockPrisma.account.findFirst.mock.calls[0][0].where.businessId).toBe(businessA.id);
    expect(getReportData).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated export to sign-in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await exportReport(
      new Request("http://localhost:3000/reports/export?type=summary"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
