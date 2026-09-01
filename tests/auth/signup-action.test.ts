import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { redirect } from "next/navigation";
import { signUp as signUpService } from "@/lib/services/auth";
import { signupAction, type AuthFormState } from "@/lib/auth/actions";

const mockSignUp = vi.mocked(signUpService);

function formData(overrides: { email?: string; password?: string; name?: string } = {}) {
  const fd = new FormData();
  fd.set("email", overrides.email ?? "new@example.com");
  fd.set("password", overrides.password ?? "password123");
  if (overrides.name !== undefined) fd.set("name", overrides.name);
  return fd;
}

const prev: AuthFormState = {};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signupAction", () => {
  it("rejects missing credentials without calling Supabase", async () => {
    const result = await signupAction(prev, formData({ email: "" }));

    expect(result).toEqual({ error: "Email and password are required." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const result = await signupAction(prev, formData({ password: "short" }));

    expect(result).toEqual({ error: "Password must be at least 8 characters." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows a neutral message (never 'Account created') for an existing email", async () => {
    mockSignUp.mockResolvedValue({ ok: true, alreadyExists: true });

    const result = await signupAction(prev, formData());

    expect(result.success).toBeUndefined();
    expect(result.info).toContain("No account changes were made");
    expect(result.info).toContain("sign in below");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("shows the real Supabase error when signup fails", async () => {
    mockSignUp.mockResolvedValue({ ok: false, error: "User already registered" });

    const result = await signupAction(prev, formData());

    expect(result).toEqual({ error: "User already registered" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to the dashboard when a session is established (confirmations disabled)", async () => {
    mockSignUp.mockResolvedValue({ ok: true, session: true });
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(signupAction(prev, formData())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/overview");
  });

  it("confirms account creation only when a new account was actually created (confirmation enabled)", async () => {
    mockSignUp.mockResolvedValue({ ok: true, session: false });

    const result = await signupAction(prev, formData());

    expect(result).toEqual({
      success: "Account created! Check your inbox for a confirmation link to finish signing up.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("turns unexpected errors into a user-safe failure message", async () => {
    mockSignUp.mockRejectedValue(new Error("boom"));

    const result = await signupAction(prev, formData());

    expect(result).toEqual({ error: "boom" });
  });
});