import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
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
  requestPasswordReset as requestPasswordResetService,
  updatePassword as updatePasswordService,
} from "@/lib/services/auth";
import {
  forgotPasswordAction,
  updatePasswordAction,
  type AuthFormState,
} from "@/lib/auth/actions";

const mockRequestPasswordReset = vi.mocked(requestPasswordResetService);
const mockUpdatePassword = vi.mocked(updatePasswordService);

const prev: AuthFormState = {};

function formData(overrides: Record<string, string | undefined> = {}) {
  const fd = new FormData();
  fd.set("email", overrides.email ?? "user@example.com");
  fd.set("password", overrides.password ?? "password123");
  fd.set("confirm", overrides.confirm ?? "password123");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forgotPasswordAction", () => {
  it("rejects a missing email without calling Supabase", async () => {
    const result = await forgotPasswordAction(prev, formData({ email: "" }));

    expect(result).toEqual({ error: "Enter your email address." });
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("always shows a neutral success message so emails cannot be enumerated", async () => {
    mockRequestPasswordReset.mockResolvedValue({ ok: true });

    const result = await forgotPasswordAction(prev, formData({ email: " a@example.com " }));

    expect(result.success).toContain("If an account exists");
    expect(mockRequestPasswordReset).toHaveBeenCalledWith("a@example.com");
  });

  it("stays neutral when the provider reports a failure (no enumeration)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequestPasswordReset.mockResolvedValue({ ok: false, error: "Email not found" });

    const result = await forgotPasswordAction(prev, formData());

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("If an account exists");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("stays neutral when the request throws unexpectedly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequestPasswordReset.mockRejectedValue(new Error("boom"));

    const result = await forgotPasswordAction(prev, formData());

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("If an account exists");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shows the identical neutral message for known and unknown accounts", async () => {
    mockRequestPasswordReset.mockResolvedValueOnce({ ok: true });
    const known = await forgotPasswordAction(prev, formData({ email: "known@example.com" }));

    mockRequestPasswordReset.mockResolvedValueOnce({
      ok: false,
      error: "Email not found",
    });
    const unknown = await forgotPasswordAction(prev, formData({ email: "unknown@example.com" }));

    expect(known).not.toHaveProperty("error");
    expect(unknown).not.toHaveProperty("error");
    expect(known.success).toBe(unknown.success);
  });

  it("blocks the request before touching Supabase when throttled", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 47,
    });

    const result = await forgotPasswordAction(prev, formData());

    expect(result.error).toContain("Too many requests");
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("updatePasswordAction", () => {
  it("rejects an empty form", async () => {
    const result = await updatePasswordAction(
      prev,
      formData({ password: "", confirm: "" }),
    );

    expect(result).toEqual({ error: "Enter and confirm your new password." });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const result = await updatePasswordAction(
      prev,
      formData({ password: "tiny", confirm: "tiny" }),
    );

    expect(result).toEqual({ error: "Password must be at least 8 characters." });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const result = await updatePasswordAction(
      prev,
      formData({ password: "password123", confirm: "password124" }),
    );

    expect(result).toEqual({ error: "Passwords don't match." });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("confirms the update on success", async () => {
    mockUpdatePassword.mockResolvedValue({ ok: true });

    const result = await updatePasswordAction(
      prev,
      formData({ password: "brand-new-password", confirm: "brand-new-password" }),
    );

    expect(mockUpdatePassword).toHaveBeenCalledWith("brand-new-password");
    expect(result.success).toContain("has been updated");
  });

  it("surfaces an expired-session error from the service", async () => {
    mockUpdatePassword.mockResolvedValue({
      ok: false,
      error: "Your password-reset session has expired. Please request a new link.",
    });

    const result = await updatePasswordAction(
      prev,
      formData({ password: "brand-new-password", confirm: "brand-new-password" }),
    );

    expect(result.error).toContain("expired");
  });
});