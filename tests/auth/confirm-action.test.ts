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
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/login?error=missing_code");
  });

  it("rejects a missing token without touching Supabase", async () => {
    await confirmEmailAction(formData({ type: "recovery" }));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/login?error=missing_code");
  });

  it("refuses an external next (open-redirect protection)", async () => {
    await confirmEmailAction(
      formData({ token_hash: "abc123", type: "signup", next: "https://evil.example" }),
    );

    expect(redirectTarget()).toBe("http://172.20.10.2:3000/overview");
  });

  it("carries the link type through on a failed verification", async () => {
    verifyOtpMock.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

    await confirmEmailAction(formData({ token_hash: "abc123", type: "recovery" }));

    expect(redirectTarget()).toBe(
      "http://172.20.10.2:3000/login?error=auth_failed&type=recovery",
    );
    expect(mocks.ensureOnboarding).not.toHaveBeenCalled();
  });

  it("reports an unconfigured Supabase instead of a dead end", async () => {
    mocks.getSupabaseServer.mockResolvedValue(null);

    await confirmEmailAction(formData({ token_hash: "abc123", type: "recovery" }));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(redirectTarget()).toBe("http://172.20.10.2:3000/login?error=not_configured");
  });
});
