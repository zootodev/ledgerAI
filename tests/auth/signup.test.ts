import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
}));

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/auth/supabase";
import { getPrismaClient } from "@/lib/db/client";
import { signUp } from "@/lib/services/auth";

const signUpMock = vi.fn();
const exchangeMock = vi.fn();
const upsertMock = vi.fn();

const supabaseMock = { auth: { signUp: signUpMock, exchangeCodeForSession: exchangeMock } };

const NEW_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "new@example.com",
  identities: [{ id: "11111111-1111-4111-8111-111111111111" }],
};

function signUpResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: { user: NEW_USER, session: null, ...overrides },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSupabaseServer).mockResolvedValue(supabaseMock as never);
  vi.mocked(getPrismaClient).mockReturnValue({
    user: { upsert: upsertMock },
  } as never);
  upsertMock.mockResolvedValue({ id: NEW_USER.id });
});

describe("signUp service", () => {
  it("returns pending (no session) for a brand-new email when confirmation is enabled, and uses the request-aware callback URL", async () => {
    signUpMock.mockResolvedValue(signUpResponse());

    const result = await signUp({ email: "  New@Example.com ", password: "password123", name: "Ada" });

    expect(result).toEqual({ ok: true, session: false });
    expect(signUpMock).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      options: {
        data: { name: "Ada" },
        emailRedirectTo: "http://172.20.10.2:3000/auth/callback",
      },
    });
    // No session yet → no profile provisioned.
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns a session and provisions the profile when confirmation is disabled", async () => {
    signUpMock.mockResolvedValue(
      signUpResponse({ session: { access_token: "token" }, user: NEW_USER }),
    );

    const result = await signUp({ email: "new@example.com", password: "password123", name: "Ada" });

    expect(result).toEqual({ ok: true, session: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NEW_USER.id },
        create: expect.objectContaining({ id: NEW_USER.id, email: "new@example.com", name: "Ada" }),
      }),
    );
  });

  it("detects an existing confirmed email via empty identities and never claims a new account", async () => {
    // Supabase mirrors the existing account back with NO identities and no
    // session so callers cannot enumerate emails.
    signUpMock.mockResolvedValue(
      signUpResponse({ user: { ...NEW_USER, identities: [] } }),
    );

    const result = await signUp({ email: "exists@example.com", password: "password123" });

    expect(result).toEqual({ ok: true, alreadyExists: true });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does not create a profile/business for a duplicate signup (no onboarding)", async () => {
    signUpMock.mockResolvedValue(
      signUpResponse({ user: { ...NEW_USER, identities: [] } }),
    );

    const result = await signUp({ email: "exists@example.com", password: "password123" });

    expect(result.ok).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("surfaces real Supabase errors (e.g. weak password, autoconfirm 'User already registered')", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });

    const result = await signUp({ email: "exists@example.com", password: "password123" });

    expect(result).toEqual({ ok: false, error: "User already registered" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("treats a null user without an error as a generic failure (never a success claim)", async () => {
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });

    const result = await signUp({ email: "new@example.com", password: "password123" });

    expect(result).toEqual({
      ok: false,
      error: "Unable to create your account. Please try again.",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("lets an explicit redirectTo override the derived callback URL", async () => {
    signUpMock.mockResolvedValue(signUpResponse());

    await signUp({
      email: "new@example.com",
      password: "password123",
      redirectTo: "https://app.example.com/auth/custom",
    });

    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://app.example.com/auth/custom",
        }),
      }),
    );
  });
});