import { beforeEach, describe, expect, it, vi } from "vitest";

// One Headers instance per request, exactly as Next.js memoizes headers() for
// the Server Action and the re-render it includes in the same response.
const { requestHeadersRef } = vi.hoisted(() => ({
  requestHeadersRef: { current: new Headers() },
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));
vi.mock("@/lib/auth/supabase", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/auth/app-url", () => ({ getAppBaseUrl: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeadersRef.current),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import TransactionsPage from "@/app/transactions/page";
import { createTransactionAction } from "@/lib/actions/transactions";
import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";

const user = { id: "user-1", email: "ada@example.com", name: "Ada Lovelace" };
const business = {
  id: "biz-1",
  name: "Acme Studio",
  currency: "NGN",
  type: "Retail",
};

const transactionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  businessId: business.id,
  accountId: null,
  date: new Date("2026-10-01"),
  description: "Test sale",
  amount: { toString: () => "100.00" },
  type: "income",
  categoryId: null,
  source: "manual",
  reference: null,
  notes: null,
  aiCategory: null,
  aiConfidence: null,
  fingerprint: null,
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
};

const prismaMock = {
  user: { upsert: vi.fn() },
  business: { findFirst: vi.fn(), create: vi.fn() },
  transaction: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  account: { findMany: vi.fn(), findFirst: vi.fn() },
  category: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
};

function createFormData(): FormData {
  const form = new FormData();
  form.set("date", "2026-10-01");
  form.set("description", "Test sale");
  form.set("amount", "100.00");
  form.set("type", "income");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  requestHeadersRef.current = new Headers();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);

  prismaMock.user.upsert.mockResolvedValue({ id: user.id });
  prismaMock.business.findFirst.mockResolvedValue(business);
  prismaMock.business.create.mockResolvedValue(business);

  prismaMock.transaction.count.mockResolvedValue(0);
  prismaMock.transaction.groupBy.mockResolvedValue([]);
  prismaMock.transaction.findMany.mockResolvedValue([]);
  prismaMock.transaction.create.mockResolvedValue(transactionRow);

  prismaMock.account.findMany.mockResolvedValue([]);
  prismaMock.account.findFirst.mockResolvedValue(null);
  prismaMock.category.findMany.mockResolvedValue([]);
  prismaMock.category.findFirst.mockResolvedValue(null);
  prismaMock.category.createMany.mockResolvedValue({ count: 0 });
});

describe("/transactions business lookup", () => {
  it("GET render resolves the session business once", async () => {
    await TransactionsPage({ searchParams: Promise.resolve({}) });

    expect(prismaMock.business.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.business.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id } }),
    );
  });

  it("POST create resolves the session business once", async () => {
    const result = await createTransactionAction({}, createFormData());

    expect(result).toEqual({ ok: true });
    expect(prismaMock.business.findFirst).toHaveBeenCalledTimes(1);
  });

  it("POST create and the revalidated page share one lookup", async () => {
    // A server action's revalidatePath() re-renders /transactions in the same
    // request. Both the create and that render must reuse the one lookup.
    const actionResult = await createTransactionAction({}, createFormData());
    await TransactionsPage({ searchParams: Promise.resolve({}) });

    expect(actionResult).toEqual({ ok: true });
    expect(prismaMock.business.findFirst).toHaveBeenCalledTimes(1);
  });
});
