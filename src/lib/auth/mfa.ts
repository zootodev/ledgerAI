// ============================================================
// LedgerAI — MFA / authenticator-assurance helpers (launch hardening)
// ------------------------------------------------------------
// Pure, dependency-free decisions used by the proxy gate, the login
// action and the /auth/mfa challenge page. They operate on the values
// Supabase exposes (the user's enrolled factors and the `aal` claim of
// the access token) so the step-up rule lives in exactly one place and
// is unit-testable without a network.
//
// Supabase semantics:
//   - a session starts at `aal1` (password only);
//   - `nextLevel` is `aal2` when the user has at least one VERIFIED
//     factor, i.e. the account *requires* a second factor;
//   - `currentLevel` is `aal2` once the challenge has been completed for
//     this session.
// ============================================================

/**
 * The one authenticated route an `aal1` session may reach: the second-factor
 * challenge. Defined here so the proxy gate, the post-verification routing and
 * the challenge page all agree on a single path.
 */
export const MFA_CHALLENGE_PATH = "/auth/mfa";

/** The subset of a Supabase user we need to decide whether 2FA is set up. */
export interface FactorBearing {
  factors?: ReadonlyArray<{ status?: string }> | null;
}

/** True when the user has at least one verified MFA factor enrolled. */
export function hasVerifiedFactor(user: FactorBearing | null | undefined): boolean {
  if (!user) return false;
  return (user.factors ?? []).some((factor) => factor?.status === "verified");
}

/**
 * Whether this session must complete an MFA challenge before it may reach a
 * protected surface: the account has a verified factor but the session is not
 * yet at `aal2`.
 */
export function needsMfaStepUp(
  user: FactorBearing | null | undefined,
  currentLevel: string | null | undefined,
): boolean {
  return hasVerifiedFactor(user) && currentLevel !== "aal2";
}

/** Base64url → UTF-8 string, safe on the Edge runtime (atob, no Buffer). */
function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  // Reinterpret the raw bytes as UTF-8 so non-ASCII claims survive.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Read the `aal` claim from a Supabase access token. The signature is NOT
 * verified here — the token was already validated by `getUser()`; this only
 * extracts the session's assurance level for the step-up decision. Returns
 * null for a missing/malformed token.
 */
export function readAalFromAccessToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { aal?: unknown };
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

/** Normalize a user-supplied 6-digit TOTP code, or null when malformed. */
export function normalizeTotpCode(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** Codes GoTrue reports for "this account change needs an aal2 session". */
const AAL2_ERROR_CODES = new Set([
  "mfa_required",
  "aal2_required",
  "aal2_verification_required",
]);

/**
 * GoTrue's refusal sentence, e.g. "AAL2 session is required to update email or
 * password when MFA is enabled." GoTrue only ever raises assurance-level
 * errors for MFA accounts, so the `aal2` token alone is a safe signal and keeps
 * working if the surrounding sentence is reworded.
 */
const AAL2_MESSAGE = /\baal2\b|\bassurance\s+level\s*(?:2|two)\b/i;

/**
 * True when Supabase rejected an authenticated account change (password or
 * email update) because the session is only `aal1` on an account with a
 * verified second factor. The account is fine — the session just is not strong
 * enough yet — so callers turn this into a step-up instruction instead of
 * showing the raw provider text.
 */
export function isAal2RequiredError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return AAL2_MESSAGE.test(error);

  const candidate = error as {
    message?: unknown;
    msg?: unknown;
    code?: unknown;
    error_code?: unknown;
  };
  const code = String(candidate.error_code ?? candidate.code ?? "").toLowerCase();
  if (AAL2_ERROR_CODES.has(code)) return true;

  return AAL2_MESSAGE.test(`${candidate.message ?? candidate.msg ?? ""}`);
}
