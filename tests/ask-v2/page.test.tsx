import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AskV2Page from "@/app/ask-v2/page";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn().mockResolvedValue(undefined),
  requireAuthContext: vi.fn(),
  signOutAction: vi.fn().mockResolvedValue(undefined),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  AskV2Chat: vi.fn((props: Record<string, unknown>) => {
    void props;
    return null;
  }),
  AskComingSoon: vi.fn((props: Record<string, unknown>) => {
    void props;
    return null;
  }),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("@/lib/auth/actions", () => ({ signOutAction: mocks.signOutAction }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/ask-v2/ask-v2-chat", () => ({
  AskV2Chat: mocks.AskV2Chat,
}));
vi.mock("@/components/ask-v2/ask-coming-soon", () => ({
  AskComingSoon: mocks.AskComingSoon,
}));

const ORIGINAL_ASK_V2_ENABLED = process.env.ASK_V2_ENABLED;

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "USD" },
  prisma: {},
};

beforeEach(() => {
  process.env.ASK_V2_ENABLED = "true";
  vi.clearAllMocks();
  mocks.AskV2Chat.mockImplementation((props: Record<string, unknown>) => {
    void props;
    return null;
  });
  mocks.AskComingSoon.mockImplementation((props: Record<string, unknown>) => {
    void props;
    return null;
  });
});

afterEach(() => {
  if (ORIGINAL_ASK_V2_ENABLED === undefined) {
    delete process.env.ASK_V2_ENABLED;
  } else {
    process.env.ASK_V2_ENABLED = ORIGINAL_ASK_V2_ENABLED;
  }
});

describe("AskV2Page", () => {
  it("passes only display data and the sign-out action to the chat shell", async () => {
    mocks.requireAuthContext.mockResolvedValue(SESSION);
    const element = await AskV2Page();
    renderToStaticMarkup(element);

    expect(mocks.ensureOnboarding).toHaveBeenCalledOnce();
    expect(mocks.AskV2Chat).toHaveBeenCalledTimes(1);
    const props = mocks.AskV2Chat.mock.calls[0][0];

    expect(props.userName).toBe("Ada Lovelace");
    expect(props.userEmail).toBe("ada@example.com");
    expect(props.businessName).toBe("Acme Studio");
    expect(props.currency).toBe("USD");
    expect(props.onSignOut).toBe(mocks.signOutAction);

    // The server must never hand its tenant-scoped ids to the browser.
    expect(props.userId).toBeUndefined();
    expect(props.businessId).toBeUndefined();
    expect(props.tenantId).toBeUndefined();
  });

  it("renders the presentation-only Coming Soon while ASK_V2_ENABLED is false", async () => {
    process.env.ASK_V2_ENABLED = "false";
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    const element = await AskV2Page();
    renderToStaticMarkup(element);

    expect(mocks.AskComingSoon).toHaveBeenCalledTimes(1);
    expect(mocks.AskV2Chat).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders the presentation-only Coming Soon while ASK_V2_ENABLED is absent (safe default OFF)", async () => {
    delete process.env.ASK_V2_ENABLED;
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    const element = await AskV2Page();
    renderToStaticMarkup(element);

    expect(mocks.AskComingSoon).toHaveBeenCalledTimes(1);
    expect(mocks.AskV2Chat).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the Coming Soon state behind authentication, like the assistant", async () => {
    process.env.ASK_V2_ENABLED = "false";
    mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.AskComingSoon).not.toHaveBeenCalled();
    expect(mocks.AskV2Chat).not.toHaveBeenCalled();
  });

  it("hands the Coming Soon only display data and never business/tenant ids", async () => {
    process.env.ASK_V2_ENABLED = "false";
    mocks.requireAuthContext.mockResolvedValue(SESSION);

    const element = await AskV2Page();
    renderToStaticMarkup(element);

    const props = mocks.AskComingSoon.mock.calls[0][0];
    expect(props.userName).toBe("Ada Lovelace");
    expect(props.userEmail).toBe("ada@example.com");
    expect(props.onSignOut).toBe(mocks.signOutAction);

    expect(props.businessName).toBeUndefined();
    expect(props.currency).toBeUndefined();
    expect(props.userId).toBeUndefined();
    expect(props.businessId).toBeUndefined();
    expect(props.tenantId).toBeUndefined();
  });

  it("redirects to /login when the session cannot be established", async () => {
    mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.AskV2Chat).not.toHaveBeenCalled();
  });

  it("redirects to /login when the account has no business", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new Error("No business is set up for this account."),
    );

    await expect(AskV2Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.AskV2Chat).not.toHaveBeenCalled();
  });
});