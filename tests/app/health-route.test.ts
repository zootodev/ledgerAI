import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getPrismaClient: mocks.getPrismaClient }));

// The route memoizes its DB probe in module scope, so each test reloads the
// module to start from a clean cache.
async function loadRoute() {
  vi.resetModules();
  return (await import("@/app/api/health/route")).GET;
}

function queryRawOk() {
  // The route uses a tagged template: prisma.$queryRaw`SELECT 1`.
  return vi.fn(async () => [{ "?column?": 1 }]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    mocks.getPrismaClient.mockReturnValue({ $queryRaw: queryRawOk() });
    const GET = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok" },
    });
  });

  it("is never cached", async () => {
    mocks.getPrismaClient.mockReturnValue({ $queryRaw: queryRawOk() });
    const GET = await loadRoute();

    const response = await GET();

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports degraded with 503 when the database errors", async () => {
    mocks.getPrismaClient.mockReturnValue({
      $queryRaw: vi.fn(async () => {
        throw new Error("connection refused: postgres://user:pass@host/db");
      }),
    });
    const GET = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "degraded",
      checks: { database: "down" },
    });
  });

  it("reports degraded when no database is configured", async () => {
    mocks.getPrismaClient.mockReturnValue(null);
    const GET = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
  });

  it("never leaks error text, hosts or credentials", async () => {
    mocks.getPrismaClient.mockReturnValue({
      $queryRaw: vi.fn(async () => {
        throw new Error("postgres://user:pass@host/db SELECT * FROM users");
      }),
    });
    const GET = await loadRoute();

    const body = await (await GET()).text();

    expect(body).not.toContain("postgres");
    expect(body).not.toContain("pass");
    expect(body).not.toContain("SELECT");
    expect(body).not.toContain("users");
  });

  it("memoizes the database probe within the TTL (no query amplification)", async () => {
    const queryRaw = queryRawOk();
    mocks.getPrismaClient.mockReturnValue({ $queryRaw: queryRaw });
    const GET = await loadRoute();

    await GET();
    await GET();
    await GET();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
