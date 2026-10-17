import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  ForgotPasswordForm: vi.fn(() => null as never),
  ResetPasswordForm: vi.fn(() => null as never),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: vi.fn(async () => ({
    auth: { getSession: mocks.getSession },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/auth/forgot-password-form", () => ({
  ForgotPasswordForm: mocks.ForgotPasswordForm,
}));

vi.mock("@/components/auth/reset-password-form", () => ({
  ResetPasswordForm: mocks.ResetPasswordForm,
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

const AUTHED = { id: "auth-user-a", email: "a@example.com", name: "User A" };

const VERIFIED = [{ id: "factor-1", status: "verified" }];
const UNVERIFIED = [{ id: "factor-1", status: "unverified" }];

/** Build a decodable access token carrying an `aal` claim. */
function accessToken(aal: "aal1" | "aal2"): string {
  const payload = Buffer.from(JSON.stringify({ aal })).toString("base64url");
  return `header.${payload}.signature`;
}

function session(aal: "aal1" | "aal2", factors: Array<{ status: string }>) {
  return { access_token: accessToken(aal), user: { id: "auth-user-a", factors } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ForgotPasswordForm.mockImplementation(() => null as never);
  mocks.ResetPasswordForm.mockImplementation(() => null as never);
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe("forgot-password page", () => {
  it("redirects an already-signed-in user away (no reset misuse while authed)", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);

    await expect(ForgotPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
    expect(mocks.ForgotPasswordForm).not.toHaveBeenCalled();
  });

  it("renders the reset-request form for signed-out visitors", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const element = await ForgotPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ForgotPasswordForm).toHaveBeenCalledTimes(1);
  });
});

describe("reset-password page", () => {
  it("locks the new-password form behind the recovery session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(ResetPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.ResetPasswordForm).not.toHaveBeenCalled();
  });

  it("renders the form for a validated recovery session with no second factor", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);
    mocks.getSession.mockResolvedValue({
      data: { session: session("aal1", []) },
      error: null,
    });

    const element = await ResetPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ResetPasswordForm).toHaveBeenCalledTimes(1);
  });

  it("renders the form for an unverified factor (2FA not actually set up)", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);
    mocks.getSession.mockResolvedValue({
      data: { session: session("aal1", UNVERIFIED) },
      error: null,
    });

    const element = await ResetPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ResetPasswordForm).toHaveBeenCalledTimes(1);
  });

  it("sends an aal1 recovery session on an MFA account to the challenge first", async () => {
    // Supabase refuses a password update without aal2, and this page is public,
    // so the proxy never steps it up — the page has to. The recovery session
    // verifyOtp hands back is exactly this: aal1 on a verified-factor account.
    mocks.getCurrentUser.mockResolvedValue(AUTHED);
    mocks.getSession.mockResolvedValue({
      data: { session: session("aal1", VERIFIED) },
      error: null,
    });

    await expect(ResetPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/mfa?next=%2Freset-password");
    expect(mocks.ResetPasswordForm).not.toHaveBeenCalled();
  });

  it("renders the form once the recovery session is at aal2", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);
    mocks.getSession.mockResolvedValue({
      data: { session: session("aal2", VERIFIED) },
      error: null,
    });

    const element = await ResetPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ResetPasswordForm).toHaveBeenCalledTimes(1);
  });
});
