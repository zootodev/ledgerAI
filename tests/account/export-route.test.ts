import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  exportAccountData: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock("@/lib/services/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/account")>();
  return { ...actual, exportAccountData: mocks.exportAccountData };
});

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 10, retryAfterSeconds: 0 })),
  getRequestClientIp: vi.fn(async () => "203.0.113.7"),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));

import { exportToCsv } from "@/lib/services/account";
import { GET } from "@/app/account/export/route";

const USER = { id: "u-1", email: "owner@example.com", name: "Ada" };

const EXPORT = {
  exportedAt: "2026-02-01T00:00:00.000Z",
  user: { id: "u-1", email: "owner@example.com", name: "Ada" },
  businesses: [
    {
      id: "b-1",
      name: "Ada Traders",
      type: "sole_trader",
      country: "NG",
      currency: "NGN",
      size: "small",
      goals: ["cashflow"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      accounts: [],
      categories: [],
      transactions: [],
      imports: [],
      insights: [],
      categoryRules: [],
    },
  ],
};

function request(query = "") {
  return new Request(`http://localhost:3000/account/export${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.exportAccountData.mockResolvedValue(EXPORT);
  rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 10,
    retryAfterSeconds: 0,
  });
});

describe("GET /account/export", () => {
  it("redirects anonymous callers to sign in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(mocks.exportAccountData).not.toHaveBeenCalled();
  });

  it("returns JSON as a download by default", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(JSON.parse(body).businesses[0].name).toBe("Ada Traders");
  });

  it("returns a multi-section CSV when format=csv", async () => {
    const response = await GET(request("?format=csv"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const body = await response.text();
    expect(body).toBe(exportToCsv(EXPORT));
    expect(body).toContain("# business Ada Traders");
  });

  it("throttles repeated exports", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.exportAccountData).not.toHaveBeenCalled();
  });

  it("scopes the request by the session user, not any client input", async () => {
    await GET(request("?userId=someone-else&format=json"));

    expect(mocks.exportAccountData).toHaveBeenCalledTimes(1);
    expect(mocks.exportAccountData).toHaveBeenCalledWith();
  });
});
