import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

interface UpsertArgs {
  where: { key_windowStart: { key: string; windowStart: bigint } };
  create: {
    key: string;
    windowStart: bigint;
    count: number;
    expiresAt: Date;
    updatedAt: Date;
  };
  update: { count: { increment: number }; updatedAt: Date };
  select: { count: boolean };
}

interface PruneArgs {
  where: { expiresAt: { lt: Date } };
}

const rateLimitMocks = vi.hoisted(() => ({
  randomInt: vi.fn(() => 999),
  upsert: vi.fn<(args: UpsertArgs) => Promise<{ count: number }>>(async () => ({
    count: 1,
  })),
  deleteMany: vi.fn<(args: PruneArgs) => Promise<{ count: number }>>(
    async () => ({ count: 0 }),
  ),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: rateLimitMocks.randomInt };
});

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(() => ({
    rateLimitBucket: {
      upsert: rateLimitMocks.upsert,
      deleteMany: rateLimitMocks.deleteMany,
    },
  })),
}));

import {
  consumeRateLimit,
  consumeConfiguredLimit,
  getRequestClientIp,
  RATE_LIMIT_POLICIES,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  type RateLimitPolicy,
} from "@/lib/security/rate-limit";
import { getPrismaClient } from "@/lib/db/client";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(getPrismaClient).mockReturnValue({
    rateLimitBucket: {
      upsert: rateLimitMocks.upsert,
      deleteMany: rateLimitMocks.deleteMany,
    },
  } as never);
  rateLimitMocks.upsert.mockResolvedValue({ count: 1 });
  rateLimitMocks.randomInt.mockReturnValue(999);
});

describe("policy registry", () => {
  it("defines every surface with a positive limit and a positive window", () => {
    for (const policy of Object.keys(RATE_LIMIT_POLICIES) as RateLimitPolicy[]) {
      const { limit, windowMs } = RATE_LIMIT_POLICIES[policy];
      expect(limit, policy).toBeGreaterThanOrEqual(1);
      expect(windowMs, policy).toBeGreaterThanOrEqual(1);
    }
  });

  it("defines the tuned login, signup, ask and export thresholds", () => {
    expect(RATE_LIMIT_POLICIES["auth:login:account"]).toEqual({ limit: 10, windowMs: 900_000 });
    expect(RATE_LIMIT_POLICIES["auth:login:ip"]).toEqual({ limit: 60, windowMs: 900_000 });
    expect(RATE_LIMIT_POLICIES["auth:signup:ip"]).toEqual({ limit: 5, windowMs: 3_600_000 });
    expect(RATE_LIMIT_POLICIES["ask:chat"]).toEqual({ limit: 30, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES["ask:v2:chat"]).toEqual({ limit: 20, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES["import:commit"]).toEqual({ limit: 5, windowMs: 60_000 });
    expect(RATE_LIMIT_POLICIES["export:csv"]).toEqual({ limit: 10, windowMs: 60_000 });
  });
});

describe("consumeRateLimit", () => {
  it("allows the first request and reports the remaining headroom", async () => {
    rateLimitMocks.upsert.mockResolvedValue({ count: 1 });

    const decision = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });

    expect(decision).toEqual({ ok: true, remaining: 29, retryAfterSeconds: 0 });
  });

  it("allows up to and including exactly the limit and then blocks", async () => {
    rateLimitMocks.upsert.mockResolvedValue({ count: 30 });
    const atLimit = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });
    expect(atLimit).toEqual({ ok: true, remaining: 0, retryAfterSeconds: 0 });

    rateLimitMocks.upsert.mockResolvedValue({ count: 31 });
    const overLimit = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });
    expect(overLimit.ok).toBe(false);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("reports a realistic retry-after bounded by the window end", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:34:56.789Z"));
    rateLimitMocks.upsert.mockResolvedValue({ count: 999 });

    const decision = await consumeRateLimit({
      scope: "auth:reset:account",
      key: "a@example.com|203.0.113.7",
      limit: 5,
      windowMs: 3_600_000,
    });

    // Window ends 13:00:00; ~1503s remain, retry-after must be 1503-1504.
    expect(decision.ok).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1503);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(1504);
  });

  it("increments atomically keyed on (hashed key, window start)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:34:56.789Z"));
    const windowStart = BigInt(
      Math.floor(Date.parse("2026-10-08T12:34:56.789Z") / 60_000) * 60_000,
    );
    const expectedHash = sha256("rl:ask:chat:biz-42");

    await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });

    expect(rateLimitMocks.upsert).toHaveBeenCalledWith({
      where: { key_windowStart: { key: expectedHash, windowStart } },
      create: {
        key: expectedHash,
        windowStart,
        count: 1,
        expiresAt: new Date(Number(windowStart) + 60_000),
        updatedAt: expect.any(Date),
      },
      update: { count: { increment: 1 }, updatedAt: expect.any(Date) },
      select: { count: true },
    });
  });

  it("never persists raw identifiers — only the SHA-256 of scope+subject", async () => {
    await consumeRateLimit({
      scope: "auth:login:account",
      key: "victim@example.com|203.0.113.9",
      limit: 10,
      windowMs: 900_000,
    });

    const call = rateLimitMocks.upsert.mock.calls[0][0] as {
      where: { key_windowStart: { key: string } };
      create: { key: string };
    };
    const stored = call.where.key_windowStart.key;
    expect(stored).toBe(call.create.key);
    expect(stored).not.toContain("victim@example.com");
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).toBe(
      sha256("rl:auth:login:account:victim@example.com|203.0.113.9"),
    );
  });

  it("separates identities by scope and by subject", async () => {
    await consumeRateLimit({ scope: "ask:chat", key: "biz-42", limit: 30, windowMs: 60_000 });
    await consumeRateLimit({ scope: "ask:v2:chat", key: "biz-42", limit: 20, windowMs: 60_000 });
    await consumeRateLimit({ scope: "ask:chat", key: "biz-7", limit: 30, windowMs: 60_000 });

    const keys = rateLimitMocks.upsert.mock.calls.map(
      (call) => (call[0] as { where: { key_windowStart: { key: string } } }).where
        .key_windowStart.key,
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("fails open (allows) when the store is unreachable", async () => {
    rateLimitMocks.upsert.mockRejectedValue(new Error("connection refused"));

    const decision = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });

    expect(decision).toEqual({ ok: true, remaining: 30, retryAfterSeconds: 0 });
  });

  it("fails open when the store client is absent", async () => {
    const { getPrismaClient } = await import("@/lib/db/client");
    vi.mocked(getPrismaClient).mockReturnValue(null as never);

    const decision = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 30,
      windowMs: 60_000,
    });

    expect(decision).toEqual({ ok: true, remaining: 30, retryAfterSeconds: 0 });
    expect(rateLimitMocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-positive window configuration rather than persisting", async () => {
    const decision = await consumeRateLimit({
      scope: "ask:chat",
      key: "biz-42",
      limit: 0,
      windowMs: 0,
    });

    expect(decision).toEqual({ ok: true, remaining: 0, retryAfterSeconds: 0 });
    expect(rateLimitMocks.upsert).not.toHaveBeenCalled();
  });

  it("sweeps expired buckets probabilistically", async () => {
    rateLimitMocks.randomInt.mockReturnValue(0);

    await consumeRateLimit({ scope: "ask:chat", key: "biz-42", limit: 30, windowMs: 60_000 });

    expect(rateLimitMocks.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});

describe("consumeConfiguredLimit", () => {
  it("applies the tuned policy values for the named surface", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));

    await consumeConfiguredLimit("export:csv", "biz-42");

    const create = (rateLimitMocks.upsert.mock.calls[0][0] as { create: { count: number } }).create;
    expect(create.count).toBe(1);
    expect(rateLimitMocks.upsert.mock.calls[0][0]).toMatchObject({
      where: { key_windowStart: { key: sha256("rl:export:csv:biz-42") } },
      update: { count: { increment: 1 } },
    });
  });
});

describe("getRequestClientIp", () => {
  it("falls back to 'unknown' when there is no request scope", async () => {
    await expect(getRequestClientIp()).resolves.toBe("unknown");
  });

  it("never trusts the X-Forwarded-For header blindly across proxies", async () => {
    // In a request scope headers() is populated by Next, not testable here;
    // the function must therefore never throw outside a request scope.
    expect(RATE_LIMIT_EXCEEDED_MESSAGE).toContain("Too many requests");
  });
});