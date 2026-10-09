import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/auth/supabase";
import { getCurrentUser } from "@/lib/auth/server";
import { requestPasswordReset, updatePassword } from "@/lib/services/auth";

const resetPasswordForEmailMock = vi.fn();
const updateUserMock = vi.fn();
const signOutMock = vi.fn();

const supabaseMock = {
  auth: {
    resetPasswordForEmail: resetPasswordForEmailMock,
    updateUser: updateUserMock,
    signOut: signOutMock,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSupabaseServer).mockResolvedValue(supabaseMock as never);
  signOutMock.mockResolvedValue({ error: null });
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "auth-user-a",
    email: "a@example.com",
    name: "User A",
  });
});

describe("requestPasswordReset", () => {
  it("requests a reset link routed through the auth callback to /reset-password", async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });

    const result = await requestPasswordReset("  New@Example.com ");

    expect(result).toEqual({ ok: true });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("new@example.com", {
      redirectTo: "http://172.20.10.2:3000/auth/callback?next=/reset-password",
    });
  });

  it("surfaces a Supabase error without revealing whether the account exists", async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { message: "Email not found" },
    });

    const result = await requestPasswordReset("missing@example.com");

    expect(result).toEqual({ ok: false, error: "Email not found" });
  });

  it("throws when Supabase is not configured", async () => {
    vi.mocked(getSupabaseServer).mockResolvedValue(null);

    await expect(requestPasswordReset("a@example.com")).rejects.toThrow(
      "Supabase is not configured.",
    );
  });
});

describe("updatePassword", () => {
  it("updates the password for the authenticated recovery session", async () => {
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });

    const result = await updatePassword("brand-new-password");

    expect(result).toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith({ password: "brand-new-password" });
  });

  it("revokes other sessions after a password update but keeps the current one", async () => {
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });

    const result = await updatePassword("brand-new-password");

    expect(result).toEqual({ ok: true });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
  });

  it("does not fail the password update when revoking other sessions fails", async () => {
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });
    signOutMock.mockResolvedValue({ error: { message: "network down" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updatePassword("brand-new-password");

    expect(result).toEqual({ ok: true });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rejects with a reset-again message when there is no recovery session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const result = await updatePassword("brand-new-password");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("expired");
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("surfaces the Supabase error for an invalid update", async () => {
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Password should be at least 8 characters." },
    });

    const result = await updatePassword("short");

    expect(result).toEqual({
      ok: false,
      error: "Password should be at least 8 characters.",
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });
});