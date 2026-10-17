import { z } from "zod";

/**
 * Password policy for signup and password reset.
 *
 * Rules: at least 10 characters and not a well-known / trivially guessable
 * password. This is a *floor*, not a strength meter — Supabase Auth also
 * enforces its own leaked-password protection server-side. The denylist is
 * deliberately dependency-free and compact; `isCommonPassword` also strips
 * trailing digits/symbols and defeats single-character and sequential runs so
 * that padding a common word ("password" → "password1234") still trips it.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Common passwords + credential-stuffing favourites, compared lowercased. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "password1",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "p4ssw0rd",
  "pa$$word",
  "pa55word",
  "pass",
  "nopass",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "12345",
  "123123",
  "123321",
  "111111",
  "000000",
  "666666",
  "888888",
  "654321",
  "qwerty",
  "qwerty1",
  "qwerty12",
  "qwerty123",
  "qwertyuiop",
  "qazwsx",
  "qazwsxedc",
  "zaq12wsx",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "1qaz2wsx",
  "1qaz2wsx3edc",
  "abcd1234",
  "abc123",
  "1234abcd",
  "a1b2c3d4",
  "asdfgh",
  "asdfghjkl",
  "asdfghjkl123",
  "zxcvbnm",
  "letmein",
  "letmein1",
  "welcome",
  "welcome1",
  "welcome123",
  "admin",
  "admin123",
  "root",
  "root123",
  "toor",
  "changeme",
  "newpassword",
  "mypassword",
  "secret",
  "iloveyou",
  "iloveyou1",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman",
  "master",
  "shadow",
  "michael",
  "jennifer",
  "jordan",
  "harley",
  "ranger",
  "hunter",
  "buster",
  "soccer",
  "hockey",
  "killer",
  "george",
  "andrew",
  "charlie",
  "thomas",
  "robert",
  "access",
  "whatever",
  "flower",
  "loveme",
  "cheese",
  "computer",
  "michelle",
  "diamond",
  "freedom",
  "ginger",
  "matrix",
  "pepper",
  "silver",
  "summer",
  "winter",
  "banana",
  "chocolate",
  "cookie",
  "dallas",
  "liverpool",
  "arsenal",
  "chelsea",
  "test",
  "guest",
  "oracle",
  "login",
  "money",
  "god",
  "trustno1",
  "ledgerai",
  "ledger",
]);

/** True for a run of at least six strictly ascending/descending characters. */
function isSequential(value: string): boolean {
  if (value.length < 6) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i += 1) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}

/** True when the password is a known/guessable one (case-insensitive). */
export function isCommonPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (!normalized) return false;

  if (COMMON_PASSWORDS.has(normalized)) return true;

  // Defeat padding: "password1234", "p@ssw0rd!", "letmein2026" …
  const base = normalized.replace(/[0-9!@#$%^&*._\-+]+$/g, "");
  if (base.length >= 6 && COMMON_PASSWORDS.has(base)) return true;

  // A single repeated character (e.g. "aaaaaaaaaa", "1111111111").
  if (/^(.)\1+$/.test(normalized)) return true;

  // A simple ascending/descending run (e.g. "abcdefghij", "9876543210").
  if (isSequential(normalized)) return true;

  // Product-name stuffing.
  if (normalized.includes("ledgerai") || normalized.includes("ledger")) return true;

  return false;
}

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

/** Validate a candidate password against the policy. */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (isCommonPassword(password)) {
    return {
      ok: false,
      error: "That password is too common. Choose a stronger one.",
    };
  }
  return { ok: true };
}

/** Zod schema mirroring {@link checkPasswordStrength}. */
export const passwordSchema = z
  .string()
  .superRefine((value, ctx) => {
    const result = checkPasswordStrength(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
    }
  });
