// ============================================================
// LedgerAI — session lifetime + idle-timeout helpers
// ------------------------------------------------------------
// Supabase's built-in time-box / inactivity limits are Pro-plan
// features, so the app enforces them at the edge proxy:
//
//   * absolute lifetime comes from the *earliest* `amr` timestamp in
//     the verified access token (the original sign-in), not `iat`
//     (which moves on every refresh);
//   * idle time comes from a signed, httpOnly last-seen cookie that
//     is refreshed at most every five minutes.
//
// Everything here is pure/edge-safe: Web Crypto only, no Node APIs.
// ============================================================

export const LAST_SEEN_COOKIE = "ledgerai_last_seen";

/** Never write the last-seen cookie more often than this. */
export const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

export const DEFAULT_SESSION_MAX_AGE_DAYS = 14;
export const DEFAULT_SESSION_IDLE_HOURS = 72;

// Accepts `process.env` (which has an index signature) and small test objects.
type SessionLimitEnv = Record<string, string | undefined>;

export interface SessionLimits {
  maxAgeMs: number;
  idleMs: number;
  /**
   * Server-only HMAC key. `null` disables idle enforcement rather than
   * breaking the app when the deployment has not been configured yet;
   * the absolute lifetime still applies.
   */
  secret: string | null;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveSessionLimits(
  env: SessionLimitEnv = process.env,
): SessionLimits {
  const maxDays = positiveNumber(
    env.SESSION_MAX_AGE_DAYS,
    DEFAULT_SESSION_MAX_AGE_DAYS,
  );
  const idleHours = positiveNumber(
    env.SESSION_IDLE_HOURS,
    DEFAULT_SESSION_IDLE_HOURS,
  );

  return {
    maxAgeMs: maxDays * 24 * 60 * 60 * 1000,
    idleMs: idleHours * 60 * 60 * 1000,
    secret: env.SESSION_COOKIE_SECRET?.trim() || null,
  };
}

/** The subset of JWT claims needed to find the original sign-in time. */
export interface SessionClaims {
  amr?: ReadonlyArray<string | { timestamp?: unknown }> | null;
  iat?: unknown;
}

/**
 * Earliest authentication-method timestamp, in milliseconds. Supabase
 * records each method as `{ method, timestamp }` where timestamp is seconds
 * since the epoch. Older/custom tokens may carry only method strings; in that
 * case fall back to `iat` so the session still has a finite lifetime.
 */
export function earliestAmrTimestampMs(
  claims: SessionClaims | null | undefined,
): number | null {
  if (!claims) return null;

  const timestamps: number[] = [];
  for (const entry of claims.amr ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const timestamp = Number(entry.timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      timestamps.push(timestamp * 1000);
    }
  }

  if (timestamps.length > 0) return Math.min(...timestamps);

  const issuedAt = Number(claims.iat);
  return Number.isFinite(issuedAt) && issuedAt > 0
    ? issuedAt * 1000
    : null;
}

export type SessionExpiryReason = "absolute" | "idle";

export function sessionExpiryReason(input: {
  now: number;
  signedInAt: number | null;
  lastSeenAt: number | null;
  limits: Pick<SessionLimits, "maxAgeMs" | "idleMs">;
}): SessionExpiryReason | null {
  const { now, signedInAt, lastSeenAt, limits } = input;

  if (signedInAt !== null && now - signedInAt >= limits.maxAgeMs) {
    return "absolute";
  }
  if (lastSeenAt !== null && now - lastSeenAt >= limits.idleMs) {
    return "idle";
  }
  return null;
}

export function shouldRefreshLastSeen(
  lastSeenAt: number,
  now: number,
): boolean {
  return now - lastSeenAt >= LAST_SEEN_REFRESH_MS;
}

export interface LastSeenCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function lastSeenCookieOptions(
  maxAgeMs: number,
  secure: boolean,
): LastSeenCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(maxAgeMs / 1000),
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function lastSeenPayload(userId: string, timestampMs: number): string {
  return `v1.${userId}.${timestampMs}`;
}

/** Sign the last-seen value for one user. Format: `v1.<userId>.<ms>.<sig>`. */
export async function signLastSeen(
  secret: string,
  userId: string,
  timestampMs: number,
): Promise<string> {
  const payload = lastSeenPayload(userId, timestampMs);
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify the signed last-seen value and return its timestamp. Returns null
 * for a malformed value, a signature for another user, or a bad signature —
 * the caller treats all of those as "now" once.
 */
export async function verifyLastSeen(
  secret: string,
  userId: string,
  value: string,
): Promise<number | null> {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== userId) {
    return null;
  }

  const timestampMs = Number(parts[2]);
  if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) return null;

  const decoded = base64UrlDecode(parts[3]);
  if (!decoded) return null;
  // Copy into a plain ArrayBuffer-backed view: SubtleCrypto's BufferSource
  // type rejects a view that could alias a SharedArrayBuffer.
  const signature = new Uint8Array(decoded.length);
  signature.set(decoded);

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(lastSeenPayload(userId, timestampMs)),
  );
  return valid ? timestampMs : null;
}
