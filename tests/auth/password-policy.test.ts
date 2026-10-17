import { describe, expect, it } from "vitest";
import {
  checkPasswordStrength,
  isCommonPassword,
  PASSWORD_MIN_LENGTH,
} from "@/lib/validation/password";

describe("isCommonPassword", () => {
  it("flags the classic favourites", () => {
    for (const password of ["password", "123456", "qwerty", "letmein", "iloveyou", "admin"]) {
      expect(isCommonPassword(password), password).toBe(true);
    }
  });

  it("is case- and padding-insensitive", () => {
    expect(isCommonPassword("PassWord")).toBe(true);
    expect(isCommonPassword("password1234")).toBe(true);
    expect(isCommonPassword("P@ssw0rd!")).toBe(true);
    expect(isCommonPassword("LetMeIn2026")).toBe(true);
  });

  it("flags repeated and sequential runs", () => {
    expect(isCommonPassword("aaaaaaaaaa")).toBe(true);
    expect(isCommonPassword("1111111111")).toBe(true);
    expect(isCommonPassword("abcdefghij")).toBe(true);
    expect(isCommonPassword("9876543210")).toBe(true);
  });

  it("flags product-name stuffing", () => {
    expect(isCommonPassword("ledgerai-secret")).toBe(true);
    expect(isCommonPassword("MyLedgerPassword")).toBe(true);
  });

  it("accepts genuinely random-looking passphrases", () => {
    expect(isCommonPassword("correct-horse-battery")).toBe(false);
    expect(isCommonPassword("Tr0ub4dor&3xample")).toBe(false);
    expect(isCommonPassword("Tzq7#vLm2!wQ")).toBe(false);
  });
});

describe("checkPasswordStrength", () => {
  it("requires the minimum length", () => {
    const result = checkPasswordStrength("short");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  });

  it("rejects empty input", () => {
    expect(checkPasswordStrength("").ok).toBe(false);
  });

  it("rejects common passwords that are long enough", () => {
    const result = checkPasswordStrength("password123");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("too common");
  });

  it("accepts a strong passphrase", () => {
    expect(checkPasswordStrength("correct-horse-battery")).toEqual({ ok: true });
    expect(checkPasswordStrength("Tzq7#vLm2!wQ")).toEqual({ ok: true });
  });

  it("rejects an absurdly long password", () => {
    expect(checkPasswordStrength("a".repeat(200)).ok).toBe(false);
  });
});
