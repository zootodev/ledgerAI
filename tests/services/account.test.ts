import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPrismaClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: mocks.getPrismaClient }));
vi.mock("@/lib/auth/supabase-admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));
vi.mock("@/lib/services/auth", () => ({ signOut: mocks.signOut }));

import {
  deleteUserAccount,
  exportAccountData,
  exportToCsv,
} from "@/lib/services/account";

const USER = { id: "u-1", email: "owner@example.com", name: "Ada" };

function businessRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "b-1",
    userId: "u-1",
    name: "Ada Traders",
    type: "sole_trader",
    country: "NG",
    currency: "NGN",
    size: "small",
    goals: ["track cashflow"],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    accounts: [
      {
        id: "a-1",
        name: "GTBank",
        institution: "GTBank",
        currency: "NGN",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    categories: [
      {
        id: "c-1",
        name: "Sales",
        type: "income",
        isSystem: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    transactions: [
      {
        id: "t-1",
        accountId: "a-1",
        importId: null,
        date: new Date("2026-01-03T00:00:00Z"),
        description: "Customer payment",
        amount: { toString: () => "1500.5" },
        type: "income",
        categoryId: "c-1",
        source: "manual",
        reference: null,
        notes: "inv 1",
        aiCategory: null,
        aiConfidence: null,
        createdAt: new Date("2026-01-03T00:00:00Z"),
        updatedAt: new Date("2026-01-03T00:00:00Z"),
      },
    ],
    imports: [
      {
        id: "i-1",
        accountId: "a-1",
        filename: "jan.csv",
        fileType: "csv",
        status: "completed",
        transactionsFound: 10,
        transactionsImported: 10,
        errors: null,
        createdAt: new Date("2026-01-04T00:00:00Z"),
        completedAt: new Date("2026-01-04T00:01:00Z"),
      },
    ],
    insights: [
      {
        id: "in-1",
        type: "cashflow",
        title: "Strong month",
        description: "You did well",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T00:00:00Z"),
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
    ],
    categoryRules: [
      {
        id: "r-1",
        matchType: "contains",
        pattern: "uber",
        categoryId: "c-1",
        categoryName: "Transport",
        createdAt: new Date("2026-01-05T00:00:00Z"),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getPrismaClient.mockReturnValue({
    business: { findMany: vi.fn(async () => [businessRow()]) },
    user: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  });
  mocks.getSupabaseAdmin.mockReturnValue({
    auth: { admin: { deleteUser: vi.fn(async () => ({ data: { user: {} }, error: null })) } },
  });
  mocks.signOut.mockResolvedValue(undefined);
});

describe("exportAccountData", () => {
  it("returns null without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await exportAccountData()).toBeNull();
  });

  it("scopes every query to the signed-in user and serializes rows", async () => {
    const prisma = {
      business: { findMany: vi.fn(async () => [businessRow()]) },
    };
    mocks.getPrismaClient.mockReturnValue(prisma as never);

    const data = await exportAccountData();

    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-1" } }),
    );
    expect(data?.user.email).toBe("owner@example.com");
    expect(data?.businesses).toHaveLength(1);
    expect(data?.businesses[0].transactions[0].amount).toBe("1500.5");
    expect(data?.businesses[0].transactions[0].date).toBe("2026-01-03");
    expect(data?.businesses[0].imports[0].filename).toBe("jan.csv");
  });

  it("returns an empty set (not an error) when the user owns no business", async () => {
    mocks.getPrismaClient.mockReturnValue({
      business: { findMany: vi.fn(async () => []) },
    } as never);

    const data = await exportAccountData();

    expect(data?.businesses).toEqual([]);
  });
});

describe("exportToCsv", () => {
  it("emits a multi-section document with a header per entity", async () => {
    const data = (await exportAccountData())!;
    const csv = exportToCsv(data);

    expect(csv).toContain("# business Ada Traders");
    expect(csv).toContain("# accounts (1)");
    expect(csv).toContain("# categories (1)");
    expect(csv).toContain("# transactions (1)");
    expect(csv).toContain("# imports (1)");
    expect(csv).toContain("Customer payment");
    expect(csv).toContain("1500.5");
  });

  it("quotes cells that contain commas, quotes or newlines", async () => {
    mocks.getPrismaClient.mockReturnValue({
      business: {
        findMany: vi.fn(async () => [
          businessRow({
            transactions: [
              {
                id: "t-2",
                accountId: "a-1",
                importId: null,
                date: new Date("2026-01-03T00:00:00Z"),
                description: 'Paid "shop", cash',
                amount: { toString: () => "10" },
                type: "expense",
                categoryId: null,
                source: "manual",
                reference: null,
                notes: null,
                aiCategory: null,
                aiConfidence: null,
                createdAt: new Date("2026-01-03T00:00:00Z"),
                updatedAt: new Date("2026-01-03T00:00:00Z"),
              },
            ],
          }),
        ]),
      },
    } as never);

    const csv = exportToCsv((await exportAccountData())!);

    expect(csv).toContain('"Paid ""shop"", cash"');
  });
});

describe("deleteUserAccount", () => {
  it("refuses without the exact confirmation string", async () => {
    const result = await deleteUserAccount("delete please");
    expect(result.ok).toBe(false);
    expect(mocks.getPrismaClient).not.toHaveBeenCalled();
  });

  it("deletes the user row (cascading) and the auth user, then signs out", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const adminDelete = vi.fn(async () => ({ data: { user: {} }, error: null }));
    mocks.getPrismaClient.mockReturnValue({ user: { deleteMany } } as never);
    mocks.getSupabaseAdmin.mockReturnValue({
      auth: { admin: { deleteUser: adminDelete } },
    });

    const result = await deleteUserAccount("DELETE");

    expect(result).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "u-1" } });
    expect(adminDelete).toHaveBeenCalledWith("u-1");
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("accepts lowercase/whitespace confirmation", async () => {
    const result = await deleteUserAccount("  delete  ");
    expect(result).toEqual({ ok: true });
  });

  it("requires a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const result = await deleteUserAccount("DELETE");
    expect(result).toEqual({ ok: false, error: "You must be signed in." });
  });

  it("reports a safe error when the app-data deletion throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getPrismaClient.mockReturnValue({
      user: {
        deleteMany: vi.fn(async () => {
          throw new Error("db down");
        }),
      },
    } as never);

    const result = await deleteUserAccount("DELETE");

    expect(result.ok).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("surfaces a retry message when the auth user could not be deleted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getSupabaseAdmin.mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn(async () => ({ data: null, error: { message: "nope" } })),
        },
      },
    });

    const result = await deleteUserAccount("DELETE");

    expect(result.ok).toBe(false);
    expect(mocks.signOut).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
