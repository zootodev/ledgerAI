import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
  getSupabaseServer: vi.fn(),
  ensureOnboarding: vi.fn(),
  needsOnboarding: vi.fn(),
}));

const verifyOtpMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: mocks.getAppBaseUrl,
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: mocks.getSupabaseServer,
}));

vi.mock("@/lib/services/auth", () => ({
  ensureOnboarding: mocks.ensureOnboarding,
  needsOnboarding: mocks.needsOnboarding,
}));

import { confirmEmailAction } from "@/app/(auth)/auth/confirm/actions";

const supabaseMock = { auth: { verifyOtp: verifyOtpMock } };

/** Build the hidden-field payload the /auth/confirm form submits. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Build a decodable (unverified) JWT carrying the session's `aal` claim. */
function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.signature`;
}

/** A user with at least one verified second factor. */
const MFA_USER = { factors: [{ status: "verified" }] };

function redirectTarget(): string {
  return vi.mocked(mocks.redirect).mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppBaseUrl.mockResolvedValue("http://172.20.10.2:3000");
  mocks.getSupabaseServer.mockResolvedValue(supabaseMock as never);
  mocks.ensureOnboarding.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    email: "new@example.com",
  });
  mocks.needsOnboarding.mockResolvedValue(false);
  verifyOtpMock.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
});

describe("confirmEmailAction", () => {
  it("verifies the token once and lands a recovery next target on /reset-password", async () => {
    await confirmEmailAction(
      formData({ token_hash: "abc123", type: "recovery", next: "/reset-password" }),
    );

    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
    expect(mocks.ensureOnboarding).toHaveBeenCalledWith({ bounce: false });
    expect(mocks.needsOnboarding).not.toHaveBeenCalled();
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/reset-password");
  });

  it("sends a brand-new user to /onboarding when there is no next", async () => {
    mocks.needsOnboarding.mockResolvedValue(true);

    await confirmEmailAction(formData({ token_hash: "abc123", type: "signup" }));

    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/onboarding");
  });

  it("sends a returning user to /overview when there is no next", async () => {
    await confirmEmailAction(formData({ token_hash: "abc123", type: "email" }));

    expect(redirectTarget()).toBe("http://172.20.10.2:3000/overview");
  });

  it("rejects an unknown verification type without touching Supabase", async () => {
    await confirmEmailAction(formData({ token_hash: "abc123", type: "bogus" }));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(redirectTarget()).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=missing_code",
    );
  });

  it("rejects a missing token without touching Supabase", async () => {
    await confirmEmailAction(formData({ type: "recovery" }));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    // The type is valid but there is no token to spend; the error card still
    // offers the recovery action for that link family.
    expect(redirectTarget()).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=missing_code&type=recovery",
    );
  });

  it("refuses an external next (open-redirect protection)", async () => {
    await confirmEmailAction(
      formData({ token_hash: "abc123", type: "signup", next: "https://evil.example" }),
    );

    expect(redirectTarget()).toBe("http://172.20.10.2:3000/overview");
  });

  it("re-renders the failure on /auth/confirm with the link type, never on /login", async () => {
    // A signed-in visitor is bounced away from /login by the proxy, so the
    // failure must surface on a public page instead of a redirect to /login.
    verifyOtpMock.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

    await confirmEmailAction(formData({ token_hash: "abc123", type: "recovery" }));

    expect(redirectTarget()).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=auth_failed&type=recovery",
    );
    expect(redirectTarget()).not.toContain("/login");
    expect(mocks.ensureOnboarding).not.toHaveBeenCalled();
  });

  it("never leaks the one-time token into a failure URL", async () => {
    verifyOtpMock.mockResolvedValue({ data: { session: null }, error: { message: "used" } });

    await confirmEmailAction(
      formData({ token_hash: "super-secret-token", type: "signup", next: "/reset-password" }),
    );

    expect(redirectTarget()).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=auth_failed&type=signup",
    );
    expect(redirectTarget()).not.toContain("super-secret-token");
  });

  it("reports an unconfigured Supabase instead of a dead end", async () => {
    mocks.getSupabaseServer.mockResolvedValue(null);

    await confirmEmailAction(formData({ token_hash: "abc123", type: "recovery" }));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/login?error=not_configured");
  });

  describe("recovery + 2FA", () => {
    it("sends an MFA-enabled recovery session through the challenge before /reset-password", async () => {
      // The provider returns an aal1 session for a fresh email verification, and
      // Supabase refuses a password update without aal2.
      verifyOtpMock.mockResolvedValue({
        data: { user: MFA_USER, session: { access_token: jwt({ aal: "aal1" }) } },
        error: null,
      });

      await confirmEmailAction(
        formData({ token_hash: "abc123", type: "recovery", next: "/reset-password" }),
      );

      expect(redirectTarget()).toBe(
        "http://172.20.10.2:3000/auth/mfa?next=%2Freset-password",
      );
    });

    it("lands directly on /reset-password when the recovery session is already aal2", async () => {
      verifyOtpMock.mockResolvedValue({
        data: { user: MFA_USER, session: { access_token: jwt({ aal: "aal2" }) } },
        error: null,
      });

      await confirmEmailAction(
        formData({ token_hash: "abc123", type: "recovery", next: "/reset-password" }),
      );

      expect(redirectTarget()).toBe("http://172.20.10.2:3000/reset-password");
    });

    it("leaves non-reset targets to the proxy's step-up gate", async () => {
      // /overview is protected, so the proxy parks the aal1 session itself — the
      // action must not double-route it.
      verifyOtpMock.mockResolvedValue({
        data: { user: MFA_USER, session: { access_token: jwt({ aal: "aal1" }) } },
        error: null,
      });

      await confirmEmailAction(formData({ token_hash: "abc123", type: "signup" }));

      expect(redirectTarget()).toBe("http://172.20.10.2:3000/overview");
    });
  });
});
