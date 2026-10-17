import { describe, expect, it, vi, beforeEach } from "vitest";
import AskPage from "@/app/ask/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));

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
  it("404s an authenticated visit instead of silently redirecting to the app", async () => {
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    await expect(AskPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.ensureOnboarding).toHaveBeenCalledOnce();
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps normal auth protection: signed-out visitors go to /login", async () => {
    mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

    await expect(AskPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.notFound).not.toHaveBeenCalled();
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
