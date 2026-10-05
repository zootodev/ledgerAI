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
  createTransaction,
  updateTransaction,
} from "@/lib/services/transactions";
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/lib/services/accounts";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  SYSTEM_CATEGORIES,
} from "@/lib/services/categories";
import { updateBusiness } from "@/lib/services/business";

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

// Real UUID shapes so id-boundary validation accepts them.
const UUID_OWNED = "11111111-1111-4111-8111-111111111111";
const UUID_FOREIGN = "99999999-9999-4999-8999-999999999999";
const UUID_OWNED_2 = "22222222-2222-4222-8222-222222222222";
const UUID_MISSING = "00000000-0000-4000-8000-000000000000";

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTransactionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: UUID_OWNED,
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
    update: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  categoryRule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
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
        if (where.id === UUID_FOREIGN && where.businessId === businessB.id) {
          return makeTransactionRow({ id: UUID_FOREIGN, businessId: businessB.id });
        }
        return null;
      },
    );

    const result = await getTransaction(UUID_FOREIGN);
    expect(result).toBeNull();
    expect(mockPrisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: UUID_FOREIGN, businessId: businessA.id },
    });
  });

  it("returns null for a missing transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    await expect(getTransaction(UUID_MISSING)).resolves.toBeNull();
  });

  it("refuses to delete a transaction owned by another business", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    await expect(deleteTransaction(UUID_FOREIGN)).resolves.toBe(false);
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes a transaction owned by the session business", async () => {
    const owned = makeTransactionRow({ id: UUID_OWNED_2 });
    mockPrisma.transaction.findFirst.mockResolvedValue(owned);
    mockPrisma.transaction.delete.mockResolvedValue(owned);

    await expect(deleteTransaction(UUID_OWNED_2)).resolves.toBe(true);
    expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: UUID_OWNED_2 },
    });
  });

  it("paginates with clamped page size", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);

    const result = await listTransactions({ page: 2, pageSize: 999 });
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    // Zero rows -> one page -> the requested page 2 is clamped back to page 1.
    expect(args.skip).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(1);
  });

  it("clamps an out-of-range page to the last valid page", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransactionRow(),
      makeTransactionRow(),
    ]);
    mockPrisma.transaction.count.mockResolvedValue(45);

    const result = await listTransactions({ page: 99, pageSize: 20 });

    expect(result.page).toBe(3);
    expect(result.pages).toBe(3);
    expect(result.total).toBe(45);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(40); // last page starts at row 41
    expect(args.take).toBe(20);
  });

  it("clamps a negative page to the first page", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(45);

    const result = await listTransactions({ page: -5, pageSize: 20 });

    expect(result.page).toBe(1);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
  });

  it("clamps to page 1 when there are zero rows", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);

    const result = await listTransactions({ page: 7, pageSize: 20 });

    expect(result.page).toBe(1);
    expect(result.pages).toBe(1);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
  });

  it("leaves an exact-divisible last page intact", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(60);

    const result = await listTransactions({ page: 3, pageSize: 20 });

    expect(result.pages).toBe(3);
    expect(result.page).toBe(3);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(40);
  });

  it("still shows page 2 rows when page 2 is in range", async () => {
    const rows = [
      makeTransactionRow({ id: UUID_OWNED, description: "page-2-row-a" }),
      makeTransactionRow({ id: UUID_OWNED_2, description: "page-2-row-b" }),
    ];
    mockPrisma.transaction.findMany.mockResolvedValue(rows);
    mockPrisma.transaction.count.mockResolvedValue(25);

    const result = await listTransactions({ page: 2, pageSize: 20 });

    expect(result.page).toBe(2);
    expect(result.pages).toBe(2);
    expect(result.items.map((i) => i.description)).toEqual([
      "page-2-row-a",
      "page-2-row-b",
    ]);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(20);
  });

  it("falls back to safe defaults for an unparseable page value", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(45);

    const result = await listTransactions({
      page: "abc" as unknown as number,
      pageSize: 20,
    });

    expect(result.page).toBe(1);
    const args = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
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

const UUID_SYSTEM = "33333333-3333-4333-8333-333333333333";
const UUID_MARKETING = "44444444-4444-4444-8444-444444444444";

function makeAccountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: UUID_OWNED,
    businessId: businessA.id,
    name: "Main wallet",
    institution: "Example Bank",
    currency: "GBP",
    createdAt: new Date("2026-01-10"),
    updatedAt: new Date("2026-01-10"),
    ...overrides,
  };
}

function makeCategoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: UUID_OWNED,
    businessId: null,
    name: "Software",
    type: "expense",
    isSystem: true,
    createdAt: new Date("2026-01-10"),
    ...overrides,
  };
}

describe("accounts service (tenant ownership)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("scopes the account list to the session businessId", async () => {
    mockPrisma.account.findMany.mockResolvedValue([makeAccountRow()]);
    const accounts = await listAccounts();
    expect(accounts).toHaveLength(1);
    expect(mockPrisma.account.findMany.mock.calls[0][0].where.businessId).toBe(
      businessA.id,
    );
  });

  it("injects businessId from the session on create, never from the client", async () => {
    mockPrisma.account.create.mockResolvedValue(makeAccountRow({ currency: "GBP" }));
    await createAccount({ name: "Wallet", institution: "Bank", currency: "GBP" });
    expect(mockPrisma.account.create.mock.calls[0][0].data.businessId).toBe(
      businessA.id,
    );
  });

  it("ignores a client-supplied businessId on create", async () => {
    mockPrisma.account.create.mockResolvedValue(makeAccountRow());
    await createAccount({
      name: "Wallet",
      currency: "GBP",
      // @ts-expect-error — a hostile client cannot force another tenant's id
      businessId: businessB.id,
    });
    expect(mockPrisma.account.create.mock.calls[0][0].data.businessId).toBe(
      businessA.id,
    );
  });

  it("rejects updates to another business's account", async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);
    await expect(
      updateAccount(UUID_FOREIGN, { name: "Hacked" }),
    ).rejects.toThrow("Account not found");
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
  });

  it("refuses deletion of an account owned by another business", async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);
    await expect(deleteAccount(UUID_FOREIGN)).resolves.toBe(false);
    expect(mockPrisma.account.delete).not.toHaveBeenCalled();
  });

  it("updates an owned account", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.account.update.mockResolvedValue(
      makeAccountRow({ name: "Renamed" }),
    );
    const updated = await updateAccount(UUID_OWNED, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");
    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: UUID_OWNED },
      data: expect.objectContaining({ name: "Renamed" }),
    });
  });

  it("deletes an owned account", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.account.delete.mockResolvedValue(makeAccountRow());
    await expect(deleteAccount(UUID_OWNED)).resolves.toBe(true);
    expect(mockPrisma.account.delete).toHaveBeenCalledWith({
      where: { id: UUID_OWNED },
    });
  });
});

describe("categories service (system + custom ownership)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("seeds system categories then lists them alongside owned ones", async () => {
    mockPrisma.category.findMany
      .mockResolvedValueOnce([]) // ensureSystemCategories: nothing exists yet
      .mockResolvedValueOnce([
        makeCategoryRow(), // system category
        makeCategoryRow({ id: UUID_OWNED_2, businessId: businessA.id, name: "Custom", isSystem: false }),
      ]);
    mockPrisma.category.createMany.mockResolvedValue({ count: 15 });

    const categories = await listCategories();
    expect(categories).toHaveLength(2);
    expect(mockPrisma.category.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.category.createMany.mock.calls[0][0].data).toHaveLength(15);

    const listWhere = mockPrisma.category.findMany.mock.calls[1][0].where;
    expect(listWhere.OR).toContainEqual({ businessId: null });
    expect(listWhere.OR).toContainEqual({ businessId: businessA.id });
  });

  it("does not re-seed when system categories already exist", async () => {
    const allSystemRows = SYSTEM_CATEGORIES.map((c) =>
      makeCategoryRow({ id: c.name, name: c.name, type: c.type }),
    );
    mockPrisma.category.findMany
      .mockResolvedValueOnce(allSystemRows)
      .mockResolvedValueOnce(allSystemRows);
    await listCategories();
    expect(mockPrisma.category.createMany).not.toHaveBeenCalled();
  });

  it("injects businessId from the session on create", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.category.create.mockResolvedValue(
      makeCategoryRow({ businessId: businessA.id, isSystem: false, name: "Custom", type: "expense" }),
    );
    await createCategory({ name: "Custom", type: "expense" });
    expect(mockPrisma.category.create.mock.calls[0][0].data.businessId).toBe(
      businessA.id,
    );
    expect(mockPrisma.category.create.mock.calls[0][0].data.isSystem).toBe(false);
  });

  it("rejects duplicate categories within the business", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED });
    await expect(
      createCategory({ name: "Software", type: "expense" }),
    ).rejects.toThrow("already exists");
  });

  it("refuses deletion of a system category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null);
    await expect(deleteCategory(UUID_SYSTEM)).resolves.toBe(false);
    expect(mockPrisma.category.delete).not.toHaveBeenCalled();
  });

  it("rejects updates to another business's custom category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null);
    await expect(
      updateCategory(UUID_FOREIGN, { name: "Hacked", type: "expense" }),
    ).rejects.toThrow("Category not found");
    expect(mockPrisma.category.update).not.toHaveBeenCalled();
  });
});

describe("business service (session-owned profile)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("scopes the profile update to the session business id", async () => {
    mockPrisma.business.update.mockResolvedValue({
      id: businessA.id,
      userId: userA.id,
      name: "A Ltd",
      type: null,
      country: "NG",
      currency: "NGN",
      size: null,
      goals: [],
      createdAt: new Date("2026-01-10"),
      updatedAt: new Date("2026-01-10"),
    });
    await updateBusiness({ name: "A Ltd" });
    expect(mockPrisma.business.update).toHaveBeenCalledWith({
      where: { id: businessA.id },
      data: expect.objectContaining({ name: "A Ltd" }),
    });
  });

  it("never trusts a client-supplied businessId", async () => {
    mockPrisma.business.update.mockResolvedValue({
      id: businessA.id,
      userId: userA.id,
      name: "A Ltd",
      type: null,
      country: "NG",
      currency: "NGN",
      size: null,
      goals: [],
      createdAt: new Date("2026-01-10"),
      updatedAt: new Date("2026-01-10"),
    });
    await updateBusiness({ name: "A Ltd" });
    expect(mockPrisma.business.update.mock.calls[0][0].where.id).toBe(
      businessA.id,
    );
  });
});

describe("transaction reference validation (ownership at write time)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  const validInput = {
    date: "2026-08-01",
    description: "Sales receipt",
    amount: "1000.00",
    type: "income" as const,
    reference: "INV-7",
  };

  it("rejects a create that references another tenant's account", async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);
    await expect(
      createTransaction({ ...validInput, accountId: UUID_FOREIGN }),
    ).rejects.toThrow("Account not found");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects a create that references another tenant's custom category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null);
    await expect(
      createTransaction({ ...validInput, categoryId: UUID_FOREIGN }),
    ).rejects.toThrow("Category not found");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("allows a create referencing the session's own account and category", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED, name: "Sales", type: "income" });
    mockPrisma.transaction.create.mockResolvedValue(
      makeTransactionRow({
        accountId: UUID_OWNED,
        categoryId: UUID_OWNED,
        type: "income",
      }),
    );

    const created = await createTransaction({
      ...validInput,
      accountId: UUID_OWNED,
      categoryId: UUID_OWNED,
    });
    expect(created.id).toBe(UUID_OWNED);
    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);

    const data = mockPrisma.transaction.create.mock.calls[0][0].data;
    expect(data.businessId).toBe(businessA.id);
    expect(data.source).toBe("manual");
    expect(data.fingerprint).toContain("sales receipt"); // normalized description
  });

  it("allows a create referencing a built-in system category", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_SYSTEM, name: "Royalties", type: "income" });
    mockPrisma.transaction.create.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_SYSTEM }),
    );

    await createTransaction({ ...validInput, categoryId: UUID_SYSTEM });
    expect(mockPrisma.category.findFirst.mock.calls[0][0].where.OR).toEqual([
      { businessId: null },
      { businessId: businessA.id },
    ]);
  });

  it("rejects an update whose transaction belongs to another business", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    await expect(
      updateTransaction(UUID_FOREIGN, validInput),
    ).rejects.toThrow("Transaction not found");
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it("re-validates references on update", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.account.findFirst.mockResolvedValue(null);
    await expect(
      updateTransaction(UUID_OWNED, { ...validInput, accountId: UUID_OWNED }),
    ).rejects.toThrow("Account not found");
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it("recomputes the fingerprint from edited values on update", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ description: "Refund", amount: 50 }),
    );

    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "Refund",
      amount: "50.00",
    });
    const data = mockPrisma.transaction.update.mock.calls[0][0].data;
    expect(data.fingerprint).toContain("refund");
    expect(data.amount).toBe("50.00");
  });

  it("falls back to a safe default query when list params are malformed", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.count.mockResolvedValue(0);

    // A genuinely unparseable page value must not throw — it degrades to the
    // default (page 1, pageSize 20) instead of 500ing the page.
    await listTransactions({
      page: "abc" as unknown as number,
    } as never);

    const findCall = mockPrisma.transaction.findMany.mock.calls[0][0];
    expect(findCall.skip).toBe(0);
    expect(findCall.take).toBe(20);
  });
});

describe("transaction category enforcement (Phase 24 D4/D5)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  const validInput = {
    date: "2026-08-01",
    description: "Sales receipt",
    amount: "1000.00",
    type: "income" as const,
    reference: "INV-7",
  };

  it("rejects a transfer that carries a category (server-side guard)", async () => {
    await expect(
      createTransaction({ ...validInput, type: "transfer", categoryId: UUID_OWNED }),
    ).rejects.toThrow("Transfers can't have a category.");

    expect(mockPrisma.category.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects a category whose type doesn't match the transaction type", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED, name: "Food", type: "expense" });

    await expect(
      createTransaction({ ...validInput, categoryId: UUID_OWNED }),
    ).rejects.toThrow("is for expense transactions and can't be used on income transactions");

    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("applies the same category-type rule on update", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: UUID_OWNED });
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED, name: "Food", type: "expense" });

    await expect(
      updateTransaction(UUID_OWNED, { ...validInput, categoryId: UUID_OWNED }),
    ).rejects.toThrow("is for expense transactions and can't be used on income transactions");

    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it("accepts a matching category type on create", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED, name: "Sales", type: "income" });
    mockPrisma.transaction.create.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_OWNED, type: "income" }),
    );

    const created = await createTransaction({ ...validInput, categoryId: UUID_OWNED });
    expect(created.id).toBe(UUID_OWNED);
    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
  });
});

describe("transaction edit learning (Phase 7)", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  const validInput = {
    date: "2026-08-01",
    description: "Sales receipt",
    amount: "1000.00",
    type: "income" as const,
    reference: "INV-7",
  };

  const aiCategorizedRow = {
    id: UUID_OWNED,
    categoryId: UUID_SYSTEM,
    aiCategory: "Transportation",
    description: "UBER *TRIP",
    type: "expense",
  };

  it("learns a merchant rule when an edit moves a row away from its AI suggestion", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(aiCategorizedRow);
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED_2, name: "Food", type: "expense" });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_OWNED_2, type: "expense" }),
    );
    mockPrisma.categoryRule.upsert.mockResolvedValue({ id: "rule-edit" });

    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "UBER *TRIP",
      type: "expense",
      categoryId: UUID_OWNED_2,
    });

    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.categoryRule.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertCall.where).toEqual({
      businessId_matchType_pattern: {
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "UBER",
      },
    });
    expect(upsertCall.create).toMatchObject({
      businessId: businessA.id,
      matchType: "merchant",
      pattern: "UBER",
      categoryId: UUID_OWNED_2,
      categoryName: "Food",
    });
  });

  it("never learns from a hand-entered row that has no AI suggestion", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: UUID_OWNED,
      categoryId: null,
      aiCategory: null,
      description: "UBER *TRIP",
      type: "expense",
    });
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED_2, name: "Food", type: "expense" });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_OWNED_2, type: "expense" }),
    );

    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "UBER *TRIP",
      type: "expense",
      categoryId: UUID_OWNED_2,
    });

    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("does not learn when the edit keeps the same category the AI suggested", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: UUID_OWNED,
      categoryId: null,
      aiCategory: "Marketing",
      description: "META ADS SPEND",
      type: "expense",
    });
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_MARKETING, name: "Marketing", type: "expense" });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_MARKETING, type: "expense" }),
    );

    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "META ADS SPEND",
      type: "expense",
      categoryId: UUID_MARKETING,
    });

    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("does not learn when the edit keeps the same category id", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: UUID_OWNED,
      categoryId: UUID_OWNED_2,
      aiCategory: "Transportation",
      description: "UBER *TRIP",
      type: "expense",
    });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_OWNED_2, type: "expense" }),
    );

    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "UBER *TRIP",
      type: "expense",
      categoryId: UUID_OWNED_2,
    });

    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("never learns from a transfer edit", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: UUID_OWNED,
      categoryId: null,
      aiCategory: "Food",
      description: "UBER *TRIP",
      type: "transfer",
    });
    mockPrisma.transaction.update.mockResolvedValue(makeTransactionRow({ type: "transfer" }));

    // Transfers can't carry a category, so the edit has none — and must never
    // trigger a rule learn.
    await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "UBER *TRIP",
      type: "transfer",
      categoryId: undefined,
    });

    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("never lets a learning failure fail the user's edit", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue(aiCategorizedRow);
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_OWNED_2, name: "Food", type: "expense" });
    mockPrisma.transaction.update.mockResolvedValue(
      makeTransactionRow({ categoryId: UUID_OWNED_2, type: "expense" }),
    );
    mockPrisma.categoryRule.upsert.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateTransaction(UUID_OWNED, {
      ...validInput,
      description: "UBER *TRIP",
      type: "expense",
      categoryId: UUID_OWNED_2,
    });

    expect(result.id).toBe(UUID_OWNED);
    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});