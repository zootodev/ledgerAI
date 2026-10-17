import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServer: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: mocks.getSupabaseServer,
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import {
  confirmTotpEnrollment,
  disableTotp,
  getMfaStatus,
  startTotpEnrollment,
  verifyMfaChallenge,
} from "@/lib/services/mfa";

function buildSupabase() {
  const mfa = {
    listFactors: vi.fn(async () => ({
      data: { all: [], totp: [], phone: [] },
      error: null,
    })),
    enroll: vi.fn(async () => ({
      data: {
        id: "factor-1",
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
          secret: "JBSWY3DPEHPK3PXP",
          uri: "otpauth://totp/LedgerAI?secret=JBSWY3DPEHPK3PXP",
        },
        friendly_name: "Authenticator app",
      },
      error: null,
    })),
    challengeAndVerify: vi.fn(async () => ({
      data: { access_token: "t", refresh_token: "r", user: {} },
      error: null,
    })),
    unenroll: vi.fn(async () => ({ data: { id: "factor-1" }, error: null })),
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    })),
  };
  return { supabase: { auth: { mfa } }, mfa };
}

let current: ReturnType<typeof buildSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  current = buildSupabase();
  mocks.getSupabaseServer.mockResolvedValue(current.supabase);
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", email: "a@example.com" });
});

describe("startTotpEnrollment", () => {
  it("removes leftover unverified factors, then enrolls a fresh one", async () => {
    current.mfa.listFactors.mockResolvedValue({
      data: {
        all: [],
        totp: [
          { id: "stale", status: "unverified", friendly_name: null, created_at: "x" },
          { id: "keep", status: "verified", friendly_name: null, created_at: "x" },
        ],
        phone: [],
      },
      error: null,
    } as never);

    const result = await startTotpEnrollment();

    expect(current.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(current.mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(result).toEqual({
      ok: true,
      value: {
        factorId: "factor-1",
        qrCode: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
        secret: "JBSWY3DPEHPK3PXP",
        uri: "otpauth://totp/LedgerAI?secret=JBSWY3DPEHPK3PXP",
      },
    });
  });

  it("fails safely when Supabase is not configured", async () => {
    mocks.getSupabaseServer.mockResolvedValue(null);

    const result = await startTotpEnrollment();

    expect(result.ok).toBe(false);
    expect(current.mfa.enroll).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await startTotpEnrollment();

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
    expect(current.mfa.enroll).not.toHaveBeenCalled();
  });

  it("maps a provider enroll error to a safe message", async () => {
    current.mfa.enroll.mockResolvedValue({ data: null, error: { message: "boom" } } as never);

    const result = await startTotpEnrollment();

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("confirmTotpEnrollment", () => {
  it("rejects a malformed code before calling Supabase", async () => {
    const result = await confirmTotpEnrollment("factor-1", "12ab");

    expect(result).toEqual({ ok: false, error: "Enter the 6-digit code from your app." });
    expect(current.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("verifies the challenge with the normalized code", async () => {
    const result = await confirmTotpEnrollment("factor-1", " 123 456 ");

    expect(current.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: "123456",
    });
    expect(result).toEqual({ ok: true });
  });

  it("never leaks the provider message on a wrong code", async () => {
    current.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    } as never);

    const result = await confirmTotpEnrollment("factor-1", "000000");

    expect(result).toEqual({ ok: false, error: "That code didn't match. Try the next one." });
  });
});

describe("verifyMfaChallenge", () => {
  it("fails when the session has no verified factor", async () => {
    current.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: "x", status: "unverified" }], phone: [] },
      error: null,
    } as never);

    const result = await verifyMfaChallenge("123456");

    expect(result).toEqual({ ok: false, error: "No two-factor method is enrolled." });
    expect(current.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("challenges the verified factor and succeeds", async () => {
    current.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: "factor-1", status: "verified" }], phone: [] },
      error: null,
    } as never);

    const result = await verifyMfaChallenge("123456");

    expect(current.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: "123456",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a malformed code without a provider round-trip", async () => {
    const result = await verifyMfaChallenge("abc");

    expect(result.ok).toBe(false);
    expect(current.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe("disableTotp", () => {
  beforeEach(() => {
    current.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: "factor-1", status: "verified" }], phone: [] },
      error: null,
    } as never);
  });

  it("does NOT unenroll when the confirmation code is wrong", async () => {
    current.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { message: "Invalid TOTP code entered" },
    } as never);

    const result = await disableTotp("000000");

    expect(current.mfa.unenroll).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "That code didn't match. Try again." });
  });

  it("unenrolls the verified factor only after a valid code", async () => {
    const result = await disableTotp("123456");

    expect(current.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: "123456",
    });
    expect(current.mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(result).toEqual({ ok: true });
  });

  it("refuses to disable when nothing is enabled", async () => {
    current.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [], phone: [] },
      error: null,
    } as never);

    const result = await disableTotp("123456");

    expect(result).toEqual({
      ok: false,
      error: "Two-factor authentication isn't enabled.",
    });
    expect(current.mfa.unenroll).not.toHaveBeenCalled();
  });
});

describe("getMfaStatus", () => {
  it("reports enabled + assurance levels from Supabase", async () => {
    current.mfa.listFactors.mockResolvedValue({
      data: {
        all: [],
        totp: [
          {
            id: "factor-1",
            status: "verified",
            friendly_name: "My phone",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        phone: [],
      },
      error: null,
    } as never);

    const status = await getMfaStatus();

    expect(status.enabled).toBe(true);
    expect(status.currentLevel).toBe("aal2");
    expect(status.nextLevel).toBe("aal2");
    expect(status.factors).toHaveLength(1);
    expect(status.factors[0].friendlyName).toBe("My phone");
  });

  it("returns a safe empty status when Supabase is absent", async () => {
    mocks.getSupabaseServer.mockResolvedValue(null);

    const status = await getMfaStatus();

    expect(status).toEqual({
      enabled: false,
      currentLevel: null,
      nextLevel: null,
      factors: [],
    });
  });
});
