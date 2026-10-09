/**
 * Application-layer rate limiting (SG1-03) backed by the shared Supabase
 * Postgres instance (the ONLY shared store the app already has). Serverless
 * instances have no in-memory state, so counters live in Postgres as one row
 * per (hashed scope+subject, fixed window).
 *
 * Properties:
 *   - atomic: a single Prisma upsert (INSERT ... ON CONFLICT DO UPDATE count+1)
 *     per decision, safe under parallel instances;
 *   - privacy: the stored key is a SHA-256 of scope+subject, so raw emails,
 *     IPs and ids are never persisted;
 *   - bounded: each key lives inside one window and stale rows are lacy-pruned;
 *   - fail-safe by availability: if the store is unreachable the limiter lets
 *     the request through (logged) rather than knocking out the whole app.
 *     Supabase Auth already throttles the /auth/v1 endpoints themselves.
 */
import { createHash, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { getPrismaClient } from "@/lib/db/client";

export interface RateLimitDecision {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const RATE_LIMIT_EXCEEDED_MESSAGE =
  "Too many requests. Please slow down and try again shortly.";

/**
 * Tuned-per-surface limits. Login/reset are double-keyed (per account+IP and
 * per IP) so one leaked credential cannot be sprayed; authenticated financial
 * surfaces are keyed by the business (identity) that already had to pass
 * requireAuthContext.
 */
export const RATE_LIMIT_POLICIES = {
  "auth:login:account": { limit: 10, windowMs: 15 * 60_000 },
  "auth:login:ip": { limit: 60, windowMs: 15 * 60_000 },
  "auth:signup:ip": { limit: 5, windowMs: 60 * 60_000 },
  "auth:reset:account": { limit: 5, windowMs: 60 * 60_000 },
  "auth:reset:ip": { limit: 10, windowMs: 60 * 60_000 },
  "ask:chat": { limit: 30, windowMs: 60_000 },
  "ask:v2:chat": { limit: 20, windowMs: 60_000 },
  "import:commit": { limit: 5, windowMs: 60_000 },
  "import:preview": { limit: 20, windowMs: 60_000 },
  "export:csv": { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

/** Record one request against a centrally-tuned policy identity key. */
export function consumeConfiguredLimit(
  policy: RateLimitPolicy,
  key: string,
): Promise<RateLimitDecision> {
  const { limit, windowMs } = RATE_LIMIT_POLICIES[policy];
  return consumeRateLimit({ scope: policy, key, limit, windowMs });
}

/**
 * Best-effort client IP for identity-keyed unauthenticated throttling (auth
 * endpoints). Never trusts a single header: prefers the left-most
 * x-forwarded-for value (set by the edge), falls back to x-real-ip.
 */
export async function getRequestClientIp(): Promise<string> {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return requestHeaders.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}

function hashKey(scope: string, key: string): string {
  return createHash("sha256").update(`rl:${scope}:${key}`).digest("hex");
}

/**
 * Record one request against `scope`/`key` in the current fixed window and
 * report whether it is still allowed. `limit`/`windowMs` must be positive.
 */
export async function consumeRateLimit(opts: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitDecision> {
  const { scope, key, limit, windowMs } = opts;
  const prisma = getPrismaClient();

  if (!prisma || !(limit >= 1) || !(windowMs >= 1)) {
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const windowStart = BigInt(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(Number(windowStart) + windowMs);
  const hashed = hashKey(scope, key);

  try {
    const bucket = await prisma.rateLimitBucket.upsert({
      where: { key_windowStart: { key: hashed, windowStart } },
      create: { key: hashed, windowStart, count: 1, expiresAt, updatedAt: new Date() },
      update: { count: { increment: 1 }, updatedAt: new Date() },
      select: { count: true },
    });

    const count = bucket.count;
    if (count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - now) / 1000),
      );
      return { ok: false, remaining: 0, retryAfterSeconds };
    }
    return { ok: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch (error) {
    console.error(
      "[rate-limit] store unavailable — failing open:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  } finally {
    schedulePrune(prisma);
  }
}

/** ~2% of decisions sweep expired buckets so the table stays bounded. */
function schedulePrune(prisma: object): void {
  if (randomInt(100) !== 0) return;
  const client = prisma as {
    rateLimitBucket: {
      deleteMany(args: { where: { expiresAt: { lt: Date } } }): Promise<unknown>;
    };
  };
  void client.rateLimitBucket
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
}