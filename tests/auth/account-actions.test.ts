import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

vi.mock("@/lib/services/auth", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerificationEmail: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/lib/services/mfa", () => ({
  startTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
  verifyMfaChallenge: vi.fn(),
  disableTotp: vi.fn(),
}));

vi.mock("@/lib/services/account", () => ({
  deleteUserAccount: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "u-1", email: "u@example.com" })),
}));

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 5, retryAfterSeconds: 0 })),
  getRequestClientIp: vi.fn(async () => "203.0.113.7"),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));

import {
  resendVerificationEmail as resendService,
  signIn as signInService,
  signOutEverywhere as signOutEverywhereService,
} from "@/lib/services/auth";
import { deleteUserAccount as deleteUserService } from "@/lib/services/account";
import {
  deleteAccountAction,
  loginAction,
  resendVerificationAction,
  signOutEverywhereAction,
  type AccountActionState,
  type AuthFormState,
} from "@/lib/auth/actions";

const mockResend = vi.mocked(resendService);
const mockSignIn = vi.mocked(signInService);
const mockSignOutEverywhere = vi.mocked(signOutEverywhereService);
const mockDeleteUser = vi.mocked(deleteUserService);

const prevAuth: AuthFormState = {};
const prevAccount: AccountActionState = {};

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 5,
    retryAfterSeconds: 0,
  });
});

describe("resendVerificationAction", () => {
  it("rejects a missing email without touching Supabase", async () => {
    const fd = new FormData();
    fd.set("email", "");

    const result = await resendVerificationAction(prevAuth, fd);

    expect(result).toEqual({ error: "Enter your email address." });
    expect(mockResend).not.toHaveBeenCalled();
  });

  it("stays neutral on success (no enumeration hint)", async () => {
    mockResend.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("email", "a@example.com");

    const result = await resendVerificationAction(prevAuth, fd);

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("If that email needs confirming");
    expect(mockResend).toHaveBeenCalledWith("a@example.com");
  });

  it("stays neutral even when the provider fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockResend.mockResolvedValue({ ok: false, error: "rate limited" });
    const fd = new FormData();
    fd.set("email", "a@example.com");

    const result = await resendVerificationAction(prevAuth, fd);

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("If that email needs confirming");
    errorSpy.mockRestore();
  });

  it("blocks before Supabase when throttled", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const fd = new FormData();
    fd.set("email", "a@example.com");

    const result = await resendVerificationAction(prevAuth, fd);

    expect(result.error).toContain("Too many requests");
    expect(mockResend).not.toHaveBeenCalled();
  });
});

describe("signOutEverywhereAction", () => {
  it("revokes all sessions and returns to the login page", async () => {
    mockSignOutEverywhere.mockResolvedValue(undefined);

    await expect(signOutEverywhereAction()).rejects.toThrow("REDIRECT:/login");
    expect(mockSignOutEverywhere).toHaveBeenCalled();
  });
});

describe("deleteAccountAction", () => {
  it("passes the typed confirmation through and redirects home on success", async () => {
    mockDeleteUser.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("confirm", "DELETE");

    await expect(deleteAccountAction(prevAccount, fd)).rejects.toThrow("REDIRECT:/?deleted=1");
    expect(mockDeleteUser).toHaveBeenCalledWith("DELETE");
  });

  it("surfaces the service error and never redirects", async () => {
    mockDeleteUser.mockResolvedValue({
      ok: false,
      error: 'Type "DELETE" exactly to confirm account deletion.',
    });
    const fd = new FormData();
    fd.set("confirm", "nope");

    const result = await deleteAccountAction(prevAccount, fd);

    expect(result.error).toContain("DELETE");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("loginAction email verification", () => {
  function loginForm() {
    const fd = new FormData();
    fd.set("email", "  User@Example.com ");
    fd.set("password", "whatever-strong");
    return fd;
  }

  it("sends an unconfirmed account to the resend-verification screen", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "x", emailNotConfirmed: true });

    await expect(loginAction(prevAuth, loginForm())).rejects.toThrow(
      "REDIRECT:/verify-email?email=user%40example.com",
    );
  });

  it("never reveals existence for wrong credentials", async () => {
    mockSignIn.mockResolvedValue({
      ok: false,
      error: "Invalid email, password, or account not found.",
    });

    const result = await loginAction(prevAuth, loginForm());

    expect(result.error).toContain("Invalid email");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("signupAction rate limiting", () => {
  it("blocks a repeated signup for the same email/IP", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    const fd = new FormData();
    fd.set("email", "new@example.com");
    fd.set("password", "correct-horse-battery");
    fd.set("acceptTerms", "on");

    const result = await (await import("@/lib/auth/actions")).signupAction(prevAuth, fd);

    expect(result.error).toContain("Too many requests");
  });
});
