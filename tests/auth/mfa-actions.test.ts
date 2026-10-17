import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://localhost:3000"),
}));

vi.mock("@/lib/services/auth", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/lib/services/mfa", () => ({
  startTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
  verifyMfaChallenge: vi.fn(),
  disableTotp: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 5, retryAfterSeconds: 0 })),
  getRequestClientIp: vi.fn(async () => "203.0.113.7"),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));

import { signIn as signInService } from "@/lib/services/auth";
import {
  confirmTotpEnrollment as confirmService,
  disableTotp as disableService,
  startTotpEnrollment as startService,
  verifyMfaChallenge as verifyService,
} from "@/lib/services/mfa";
import {
  enrollMfaAction,
  confirmMfaAction,
  disableMfaAction,
  verifyMfaAction,
  loginAction,
  type AuthFormState,
  type MfaEnrollState,
  type MfaFormState,
} from "@/lib/auth/actions";

const mockSignIn = vi.mocked(signInService);
const mockStart = vi.mocked(startService);
const mockConfirm = vi.mocked(confirmService);
const mockVerify = vi.mocked(verifyService);
const mockDisable = vi.mocked(disableService);

const prevForm: MfaFormState = {};
const prevEnroll: MfaEnrollState = {};
const prevAuth: AuthFormState = {};

/** Mimic Next's redirect(): it throws, so code after it never runs. */
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

describe("verifyMfaAction", () => {
  // `next` is re-validated with the shared post-auth sanitizer, which returns an
  // absolute same-origin URL (and the overview fallback for anything external).
  it("verifies the code then continues to the requested internal page", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");
    fd.set("next", "/transactions");

    await expect(verifyMfaAction(prevForm, fd)).rejects.toThrow(
      "REDIRECT:http://localhost:3000/transactions",
    );
    expect(mockVerify).toHaveBeenCalledWith("123456");
  });

  it("rejects an external next target and falls back to /overview", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");
    fd.set("next", "https://evil.example.com");

    await expect(verifyMfaAction(prevForm, fd)).rejects.toThrow(
      "REDIRECT:http://localhost:3000/overview",
    );
  });

  it("rejects a protocol-relative next target", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");
    fd.set("next", "//evil.example.com");

    await expect(verifyMfaAction(prevForm, fd)).rejects.toThrow(
      "REDIRECT:http://localhost:3000/overview",
    );
  });

  it("rejects an absolute same-path target on another origin", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");
    fd.set("next", "http://localhost:3001/transactions");

    await expect(verifyMfaAction(prevForm, fd)).rejects.toThrow(
      "REDIRECT:http://localhost:3000/overview",
    );
  });

  it("continues to the password-reset page after a recovery step-up", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");
    fd.set("next", "/reset-password");

    await expect(verifyMfaAction(prevForm, fd)).rejects.toThrow(
      "REDIRECT:http://localhost:3000/reset-password",
    );
  });

  it("returns the error and does not redirect on a bad code", async () => {
    mockVerify.mockResolvedValue({ ok: false, error: "That code didn't match. Try again." });
    const fd = new FormData();
    fd.set("code", "000000");

    const result = await verifyMfaAction(prevForm, fd);

    expect(result).toEqual({ error: "That code didn't match. Try again." });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("enrollMfaAction", () => {
  it("returns the QR/secret/factor id for display", async () => {
    mockStart.mockResolvedValue({
      ok: true,
      value: { factorId: "f1", qrCode: "data:image/svg+xml,x", secret: "S", uri: "otpauth://x" },
    });

    const result = await enrollMfaAction(prevEnroll, new FormData());

    expect(result).toEqual({ factorId: "f1", qrCode: "data:image/svg+xml,x", secret: "S" });
  });

  it("surfaces the service error", async () => {
    mockStart.mockResolvedValue({ ok: false, error: "nope" });

    const result = await enrollMfaAction(prevEnroll, new FormData());

    expect(result).toEqual({ error: "nope" });
  });
});

describe("confirmMfaAction", () => {
  it("confirms enrollment, revalidates and reports success", async () => {
    mockConfirm.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("factorId", "f1");
    fd.set("code", "123456");

    const result = await confirmMfaAction(prevForm, fd);

    expect(mockConfirm).toHaveBeenCalledWith("f1", "123456");
    expect(revalidateMock).toHaveBeenCalledWith("/settings/security");
    expect(result).toEqual({ success: "Two-factor authentication is on." });
  });

  it("surfaces a wrong-code error without revalidating", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: "That code didn't match. Try the next one." });

    const result = await confirmMfaAction(prevForm, new FormData());

    expect(result.error).toContain("didn't match");
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("disableMfaAction", () => {
  it("requires a code and turns 2FA off on success", async () => {
    mockDisable.mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("code", "123456");

    const result = await disableMfaAction(prevForm, fd);

    expect(mockDisable).toHaveBeenCalledWith("123456");
    expect(revalidateMock).toHaveBeenCalledWith("/settings/security");
    expect(result).toEqual({ success: "Two-factor authentication is off." });
  });

  it("does not report success when the service refuses", async () => {
    mockDisable.mockResolvedValue({ ok: false, error: "That code didn't match. Try again." });

    const result = await disableMfaAction(prevForm, new FormData());

    expect(result.error).toContain("didn't match");
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("loginAction with MFA", () => {
  function loginForm(email = "user@example.com", password = "password123") {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    return fd;
  }

  it("redirects to the MFA challenge when the account requires a step-up", async () => {
    mockSignIn.mockResolvedValue({ ok: true, mfaRequired: true });

    await expect(loginAction(prevAuth, loginForm())).rejects.toThrow("REDIRECT:/auth/mfa");
  });

  it("goes straight to the app when no step-up is needed", async () => {
    mockSignIn.mockResolvedValue({ ok: true });

    await expect(loginAction(prevAuth, loginForm())).rejects.toThrow("REDIRECT:/overview");
  });

  it("returns the generic error and never redirects on bad credentials", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "Invalid email, password, or account not found." });

    const result = await loginAction(prevAuth, loginForm());

    expect(result.error).toContain("Invalid email");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
