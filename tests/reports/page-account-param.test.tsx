import { describe, expect, it, vi, beforeEach } from "vitest";
import ReportsPage from "@/app/reports/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  listAccounts: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("@/lib/services", () => ({ listAccounts: mocks.listAccounts }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const OWNED = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "22222222-2222-4222-8222-222222222222";

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "NGN" },
  prisma: {},
};

function page(params: Record<string, string | string[]>) {
  return ReportsPage({ searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
  mocks.requireAuthContext.mockResolvedValue(SESSION);
  mocks.listAccounts.mockResolvedValue([{ id: OWNED, name: "Main account" }]);
});

describe("ReportsPage account filter — safe rejection of invalid account ids", () => {
  it("redirects a foreign account id away, keeping the range params", async () => {
    await expect(page({ from: "2026-09-01", to: "2026-09-30", accountId: FOREIGN })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/reports?from=2026-09-01&to=2026-09-30");
  });

  it("redirects a malformed account id away instead of rendering an empty report", async () => {
    await expect(page({ accountId: "not-a-uuid" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/reports");
  });

  it("redirects repeated account id params away too", async () => {
    await expect(page({ from: "2026-09-01", accountId: [OWNED, FOREIGN] })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/reports?from=2026-09-01");
  });

  it("renders normally for an account the business owns", async () => {
    const element = await page({ accountId: OWNED });
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders normally when no account id is given", async () => {
    const element = await page({ from: "2026-09-01" });
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
