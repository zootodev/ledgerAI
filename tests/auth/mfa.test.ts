import { describe, expect, it } from "vitest";
import {
  hasVerifiedFactor,
  needsMfaStepUp,
  normalizeTotpCode,
  readAalFromAccessToken,
} from "@/lib/auth/mfa";

/** Build a decodable (unverified) JWT carrying `payload`. */
function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.signature`;
}

describe("hasVerifiedFactor", () => {
  it("is false for no user or no factors", () => {
    expect(hasVerifiedFactor(null)).toBe(false);
    expect(hasVerifiedFactor(undefined)).toBe(false);
    expect(hasVerifiedFactor({})).toBe(false);
    expect(hasVerifiedFactor({ factors: [] })).toBe(false);
  });

  it("is true only when a factor is verified", () => {
    expect(hasVerifiedFactor({ factors: [{ status: "unverified" }] })).toBe(false);
    expect(
      hasVerifiedFactor({ factors: [{ status: "unverified" }, { status: "verified" }] }),
    ).toBe(true);
  });
});

describe("needsMfaStepUp", () => {
  it("requires a step-up when a verified factor is not yet at aal2", () => {
    expect(needsMfaStepUp({ factors: [{ status: "verified" }] }, "aal1")).toBe(true);
    expect(needsMfaStepUp({ factors: [{ status: "verified" }] }, null)).toBe(true);
  });

  it("does not require a step-up at aal2", () => {
    expect(needsMfaStepUp({ factors: [{ status: "verified" }] }, "aal2")).toBe(false);
  });

  it("never requires a step-up without a verified factor", () => {
    expect(needsMfaStepUp({ factors: [{ status: "unverified" }] }, "aal1")).toBe(false);
    expect(needsMfaStepUp(null, "aal1")).toBe(false);
  });
});

describe("readAalFromAccessToken", () => {
  it("reads the aal claim from a well-formed token", () => {
    expect(readAalFromAccessToken(jwt({ aal: "aal1" }))).toBe("aal1");
    expect(readAalFromAccessToken(jwt({ aal: "aal2" }))).toBe("aal2");
  });

  it("returns null for missing, malformed or aal-less tokens", () => {
    expect(readAalFromAccessToken(null)).toBeNull();
    expect(readAalFromAccessToken(undefined)).toBeNull();
    expect(readAalFromAccessToken("")).toBeNull();
    expect(readAalFromAccessToken("not-a-jwt")).toBeNull();
    expect(readAalFromAccessToken("a.!!!.c")).toBeNull();
    expect(readAalFromAccessToken(jwt({ sub: "u1" }))).toBeNull();
  });

  it("handles unicode payloads without throwing", () => {
    expect(readAalFromAccessToken(jwt({ aal: "aal2", name: "Zoé 😀" }))).toBe("aal2");
  });
});

describe("normalizeTotpCode", () => {
  it("accepts a 6-digit code and strips whitespace", () => {
    expect(normalizeTotpCode("123456")).toBe("123456");
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
  });

  it("rejects anything that is not exactly 6 digits", () => {
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("1234567")).toBeNull();
    expect(normalizeTotpCode("12a456")).toBeNull();
    expect(normalizeTotpCode("")).toBeNull();
    expect(normalizeTotpCode(null)).toBeNull();
    expect(normalizeTotpCode(undefined)).toBeNull();
  });
});
