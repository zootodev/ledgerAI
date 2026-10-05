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

  it("maps a Supabase error onto the form", async () => {
    mockRequestPasswordReset.mockResolvedValue({ ok: false, error: "Rate limit exceeded" });

    const result = await forgotPasswordAction(prev, formData());

    expect(result).toEqual({ error: "Rate limit exceeded" });
  });

  it("turns an unexpected failure into a user-safe message", async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error("boom"));

    const result = await forgotPasswordAction(prev, formData());

    expect(result).toEqual({ error: "boom" });
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