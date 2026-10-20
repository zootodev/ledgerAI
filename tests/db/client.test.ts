import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    opts: unknown;
    constructor(opts: unknown) {
      this.opts = opts;
    }
  },
}));

import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaClient, requirePrisma, resolvePoolMax } from "@/lib/db/client";

const mockedPrismaPg = vi.mocked(PrismaPg);

// A mock URL exercising the real code path (picks up DATABASE_URL, builds
// pool config). Not a real credential.
const MOCK_URL = "postgresql://user:secret@db.example.com:5432/postgres";

beforeEach(() => {
  process.env.DATABASE_URL = MOCK_URL;
  Reflect.deleteProperty(globalThis, "prisma");
  mockedPrismaPg.mockReset();
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  Reflect.deleteProperty(globalThis, "prisma");
});

describe("getPrismaClient", () => {
  it("reuses a single client across repeated calls and builds one adapter", () => {
    const a = getPrismaClient();
    const b = getPrismaClient();

    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(mockedPrismaPg).toHaveBeenCalledTimes(1);
  });

  it("configures the pool for the Supabase PgBouncer connection", () => {
    getPrismaClient();

    const config = mockedPrismaPg.mock.calls[0][0] as Record<string, unknown>;
    const options = mockedPrismaPg.mock.calls[0][1] as Record<string, unknown>;

    expect(config.connectionString).toBe(MOCK_URL);
    expect(config.keepAlive).toBe(true);
    expect(config.keepAliveInitialDelayMillis).toBe(30_000);
    expect(config.connectionTimeoutMillis).toBe(10_000);
    expect(config.idleTimeoutMillis).toBe(30_000);
    expect(config.max).toBe(5);
    expect(config.maxUses).toBe(1_000);
    expect(config.application_name).toBe("ledgerai");

    expect(typeof options.onPoolError).toBe("function");
    expect(typeof options.onConnectionError).toBe("function");
    // Transaction-pooler requirement: without a statement-name generator the
    // adapter issues unnamed statements, which PgBouncer transaction mode
    // supports. Setting one would break on port 6543.
    expect(options.statementNameGenerator).toBeUndefined();
  });

  it("passes the adapter produced by PrismaPg into the PrismaClient", () => {
    const client = getPrismaClient();

    const adapter = mockedPrismaPg.mock.results[0].value;
    expect(client).not.toBeNull();
    expect((client as unknown as { opts?: { adapter?: unknown } }).opts?.adapter).toBe(
      adapter,
    );
  });

  it("returns null without a DATABASE_URL and constructs nothing", () => {
    delete process.env.DATABASE_URL;

    expect(getPrismaClient()).toBeNull();
    expect(mockedPrismaPg).not.toHaveBeenCalled();
  });

  it("reuses the same client across module re-evaluation (HMR-safe)", async () => {
    const m1 = await import("@/lib/db/client");
    const client1 = m1.getPrismaClient();
    const callsBefore = mockedPrismaPg.mock.calls.length;

    vi.resetModules();

    const m2 = await import("@/lib/db/client");

    const client2 = m2.getPrismaClient();
    expect(client2).toBe(client1);
    expect(mockedPrismaPg.mock.calls.length).toBe(callsBefore);
  });
});

describe("resolvePoolMax", () => {
  it("defaults to 1 in production (transaction pooler) and 5 elsewhere", () => {
    expect(resolvePoolMax({ NODE_ENV: "production" })).toBe(1);
    expect(resolvePoolMax({ NODE_ENV: "development" })).toBe(5);
    expect(resolvePoolMax({ NODE_ENV: "test" })).toBe(5);
    expect(resolvePoolMax({})).toBe(5);
  });

  it("honours a positive DB_POOL_MAX override", () => {
    expect(resolvePoolMax({ DB_POOL_MAX: "3", NODE_ENV: "production" })).toBe(3);
    expect(resolvePoolMax({ DB_POOL_MAX: " 7 ", NODE_ENV: "development" })).toBe(7);
  });

  it("ignores an invalid DB_POOL_MAX instead of building a broken pool", () => {
    for (const value of ["", "0", "-2", "abc", "2.5", "3abc"]) {
      expect(resolvePoolMax({ DB_POOL_MAX: value, NODE_ENV: "production" })).toBe(1);
    }
  });
});

describe("requirePrisma", () => {
  it("throws a clear error when DATABASE_URL is not configured", () => {
    delete process.env.DATABASE_URL;

    expect(() => requirePrisma()).toThrow("DATABASE_URL is not configured.");
  });
});