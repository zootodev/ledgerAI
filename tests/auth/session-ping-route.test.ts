import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  cookiesGet: vi.fn(),
  getSupabaseServer: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: mocks.getSupabaseServer,
}));

import { POST } from "@/app/api/session/ping/route";
import {
  LAST_SEEN_COOKIE,
  signLastSeen,
  verifyLastSeen,
} from "@/lib/auth/session-limits";

const SECRET = "test-session-cookie-secret";
const NOW = new Date("2026-05-10T12:00:00.000Z").getTime();

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/session/ping", {
    method: "POST",
    headers,
  });
}

function setCookieValue(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  return header?.match(new RegExp(`${LAST_SEEN_COOKIE}=([^;]+)`))?.[1] ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  process.env.SESSION_COOKIE_SECRET = SECRET;
  delete process.env.SESSION_IDLE_MINUTES;
  delete process.env.SESSION_MAX_AGE_HOURS;

  mocks.cookies.mockResolvedValue({ get: mocks.cookiesGet });
  mocks.cookiesGet.mockReturnValue(undefined);
  mocks.getSupabaseServer.mockResolvedValue({
    auth: { getUser: mocks.getUser },
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.SESSION_COOKIE_SECRET;
  vi.clearAllMocks();
});

describe("POST /api/session/ping", () => {
  it("returns a bodyless, uncached 204 and signs a fresh last-seen cookie", async () => {
    const response = await request();
    const result = await POST(response);

    expect(result.status).toBe(204);
    expect(result.headers.get("cache-control")).toBe("no-store");
    await expect(result.text()).resolves.toBe("");

    const value = setCookieValue(result);
    expect(value).not.toBeNull();
    await expect(verifyLastSeen(SECRET, "u-1", value ?? "")).resolves.toBe(NOW);
  });

  it("rejects a request with no session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await POST(request());

    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toBe("no-store");
    await expect(result.text()).resolves.toBe("");
    expect(result.headers.get("set-cookie")).toBeNull();
  });

  it("refuses cross-origin requests", async () => {
    const result = await POST(request({ origin: "https://elsewhere.example" }));

    expect(result.status).toBe(403);
    expect(result.headers.get("cache-control")).toBe("no-store");
    await expect(result.text()).resolves.toBe("");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not rewrite a last-seen cookie younger than five minutes", async () => {
    const value = await signLastSeen(SECRET, "u-1", NOW - 60 * 1000);
    mocks.cookiesGet.mockReturnValue({ value });

    const result = await POST(request());

    expect(result.status).toBe(204);
    expect(result.headers.get("set-cookie")).toBeNull();
  });

  it("refreshes a last-seen cookie that is at least five minutes old", async () => {
    const stale = await signLastSeen(SECRET, "u-1", NOW - 6 * 60 * 1000);
    mocks.cookiesGet.mockReturnValue({ value: stale });

    const result = await POST(request());

    expect(result.status).toBe(204);
    await expect(
      verifyLastSeen(SECRET, "u-1", setCookieValue(result) ?? ""),
    ).resolves.toBe(NOW);
  });

  it("repairs a tampered last-seen cookie for the active session", async () => {
    const tampered = `${await signLastSeen(SECRET, "u-1", NOW - 60 * 1000)}x`;
    mocks.cookiesGet.mockReturnValue({ value: tampered });

    const result = await POST(request());

    expect(result.status).toBe(204);
    await expect(
      verifyLastSeen(SECRET, "u-1", setCookieValue(result) ?? ""),
    ).resolves.toBe(NOW);
  });
});
