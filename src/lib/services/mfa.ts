// ============================================================
// LedgerAI — MFA service layer (TOTP via Supabase Auth MFA)
// ------------------------------------------------------------
// Thin, server-only wrappers around `supabase.auth.mfa` that the server
// actions call. Every function resolves the Supabase SSR client from the
// request cookies, so the operation always runs against the caller's own
// session — a factor id is never trusted from the client without first
// being confirmed to belong to that session's verified factor set.
// ============================================================

import { getSupabaseServer } from "@/lib/auth/supabase";
import { getCurrentUser } from "@/lib/auth/server";
import { normalizeTotpCode } from "@/lib/auth/mfa";

export interface MfaFactorInfo {
  id: string;
  friendlyName: string | null;
  status: string;
  createdAt: string | null;
}

export interface MfaStatus {
  /** True when at least one TOTP factor is verified for this user. */
  enabled: boolean;
  currentLevel: string | null;
  nextLevel: string | null;
  factors: MfaFactorInfo[];
}

export type MfaResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { value?: undefined } : { value: T }))
  | { ok: false; error: string };

const NOT_CONFIGURED = "Two-factor authentication isn't available right now.";

async function requireClient() {
  const supabase = await getSupabaseServer();
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return supabase;
}

/** The id of the session user's first VERIFIED totp factor, or null. */
async function firstVerifiedFactorId(
  supabase: Awaited<ReturnType<typeof requireClient>>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  const verified = (data?.totp ?? []).find((factor) => factor.status === "verified");
  return verified?.id ?? null;
}

/** Current 2FA status for the signed-in user (enabled flag + factor list). */
export async function getMfaStatus(): Promise<MfaStatus> {
  const empty: MfaStatus = {
    enabled: false,
    currentLevel: null,
    nextLevel: null,
    factors: [],
  };

  const supabase = await getSupabaseServer();
  if (!supabase) return empty;
  const user = await getCurrentUser();
  if (!user) return empty;

  const [aal, listed] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const factors: MfaFactorInfo[] = (listed.data?.totp ?? []).map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    status: factor.status,
    createdAt: factor.created_at ?? null,
  }));

  return {
    enabled: factors.some((factor) => factor.status === "verified"),
    currentLevel: aal.data?.currentLevel ?? null,
    nextLevel: aal.data?.nextLevel ?? null,
    factors,
  };
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG data URI returned by Supabase; safe to render in an <img>. */
  qrCode: string;
  /** Base32 secret, shown as a manual-entry fallback. */
  secret: string;
  uri: string;
}

/**
 * Begin (or restart) TOTP enrollment for the signed-in user. Any leftover
 * *unverified* totp factors are removed first so a user who abandoned a
 * previous attempt never ends up with several half-enrolled factors.
 */
export async function startTotpEnrollment(
  friendlyName = "Authenticator app",
): Promise<MfaResult<TotpEnrollment>> {
  let supabase;
  try {
    supabase = await requireClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : NOT_CONFIGURED };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: listed } = await supabase.auth.mfa.listFactors();
  for (const factor of listed?.totp ?? []) {
    if (factor.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't start two-factor setup." };
  }

  return {
    ok: true,
    value: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
  };
}

/**
 * Confirm a pending (unverified) enrollment with a code from the
 * authenticator app. On success Supabase marks the factor verified and
 * promotes the current session to `aal2`.
 */
export async function confirmTotpEnrollment(
  factorId: string,
  code: string,
): Promise<MfaResult> {
  let supabase;
  try {
    supabase = await requireClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : NOT_CONFIGURED };
  }

  const normalized = normalizeTotpCode(code);
  if (!normalized) return { ok: false, error: "Enter the 6-digit code from your app." };
  if (!factorId) return { ok: false, error: "Start two-factor setup again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalized,
  });
  if (error) return { ok: false, error: "That code didn't match. Try the next one." };
  return { ok: true };
}

/**
 * Complete the login-time challenge: verify a code against the session's
 * verified factor, which promotes the session to `aal2`.
 */
export async function verifyMfaChallenge(code: string): Promise<MfaResult> {
  let supabase;
  try {
    supabase = await requireClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : NOT_CONFIGURED };
  }

  const normalized = normalizeTotpCode(code);
  if (!normalized) return { ok: false, error: "Enter the 6-digit code from your app." };

  const factorId = await firstVerifiedFactorId(supabase);
  if (!factorId) return { ok: false, error: "No two-factor method is enrolled." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalized,
  });
  if (error) return { ok: false, error: "That code didn't match. Try again." };
  return { ok: true };
}

/**
 * Disable 2FA. Requires a CURRENT code (proving access to the second factor)
 * before the verified factor is removed — a stolen session alone cannot turn
 * 2FA off.
 */
export async function disableTotp(code: string): Promise<MfaResult> {
  let supabase;
  try {
    supabase = await requireClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : NOT_CONFIGURED };
  }

  const normalized = normalizeTotpCode(code);
  if (!normalized) return { ok: false, error: "Enter the 6-digit code from your app." };

  const factorId = await firstVerifiedFactorId(supabase);
  if (!factorId) return { ok: false, error: "Two-factor authentication isn't enabled." };

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalized,
  });
  if (verifyError) return { ok: false, error: "That code didn't match. Try again." };

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
