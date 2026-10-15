import { describe, expect, it, vi, beforeEach } from "vitest";
import AskPage from "@/app/ask/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "USD" },
  prisma: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
});

describe("AskPage (hidden product surface)", () => {
  it("redirects an authenticated visit to the overview, not an Ask surface", async () => {
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    await expect(AskPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.ensureOnboarding).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  it("keeps normal auth protection: signed-out visitors go to /login", async () => {
    mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

    await expect(AskPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("keeps normal onboarding protection for unfinished profiles", async () => {
    mocks.ensureOnboarding.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(AskPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.requireAuthContext).not.toHaveBeenCalled();
  });
});
