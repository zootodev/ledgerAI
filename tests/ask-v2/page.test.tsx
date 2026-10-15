import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import AskV2Page from "@/app/ask-v2/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn().mockResolvedValue({ id: "user-1", email: "ada@example.com" }),
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

const ORIGINAL_ASK_V2_ENABLED = process.env.ASK_V2_ENABLED;

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "USD" },
  prisma: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
});

afterEach(() => {
  if (ORIGINAL_ASK_V2_ENABLED === undefined) {
    delete process.env.ASK_V2_ENABLED;
  } else {
    process.env.ASK_V2_ENABLED = ORIGINAL_ASK_V2_ENABLED;
  }
});

describe("AskV2Page (hidden product surface)", () => {
  it("redirects an authenticated visit to the overview, not an Ask surface", async () => {
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.ensureOnboarding).toHaveBeenCalledOnce();
    expect(mocks.requireAuthContext).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  it("stays hidden even when the ASK_V2_ENABLED server gate is on", async () => {
    // The gate governs the Ask implementation, not product visibility: the
    // route must redirect either way.
    process.env.ASK_V2_ENABLED = "true";
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  it("keeps normal auth protection: signed-out visitors go to /login", async () => {
    mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("lets the onboarding bounce stand for unfinished profiles", async () => {
    mocks.ensureOnboarding.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.requireAuthContext).not.toHaveBeenCalled();
  });
});
