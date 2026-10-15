import { describe, expect, it, vi, beforeEach } from "vitest";
import TransactionsPage from "@/app/transactions/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  listTransactions: vi.fn(),
  listAccounts: vi.fn(),
  listCategories: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("@/lib/services", () => ({
  listTransactions: mocks.listTransactions,
  listAccounts: mocks.listAccounts,
  listCategories: mocks.listCategories,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const OWNED = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "99999999-9999-4999-8999-999999999999";

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "GHS" },
  prisma: {},
};

function page(params: Record<string, string | string[]>) {
  return TransactionsPage({ searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
  mocks.requireAuthContext.mockResolvedValue(SESSION);
  mocks.listTransactions.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    pages: 1,
  });
  mocks.listAccounts.mockResolvedValue([{ id: OWNED, name: "Main account" }]);
  mocks.listCategories.mockResolvedValue([]);
});

describe("TransactionsPage account filter — consistent rejection with Reports", () => {
  it("renders normally when no account id is given", async () => {
    const element = await page({});
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders normally for an account the business owns", async () => {
    const element = await page({ accountId: OWNED });
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects a foreign account id away, keeping every other filter", async () => {
    await expect(
      page({ type: "income", dateFrom: "2026-09-01", accountId: FOREIGN }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/transactions?type=income&dateFrom=2026-09-01",
    );
  });

  it("redirects a malformed account id away instead of dropping the whole query", async () => {
    await expect(
      page({ dateFrom: "2026-09-01", accountId: "not-a-uuid" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    // The date range survives: only the bad account id is removed.
    expect(mocks.redirect).toHaveBeenCalledWith("/transactions?dateFrom=2026-09-01");
  });

  it("redirects repeated account id params away", async () => {
    await expect(page({ accountId: [OWNED, FOREIGN] })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/transactions");
  });

  it("does not redirect on a foreign account id when the account list failed to load", async () => {
    mocks.listAccounts.mockRejectedValue(new Error("accounts db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const element = await page({ accountId: FOREIGN });

    // Ownership cannot be verified without the account list, so the request is
    // left intact (still bounded by the session businessId) and the view shows
    // a retry warning instead of a redirect loop.
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect((element.props as { accountsError?: string }).accountsError).toBeTruthy();
    errorSpy.mockRestore();
  });
});
