import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
  redirect: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.next,
    redirect: mocks.redirect,
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import {
  LAST_SEEN_COOKIE,
  signLastSeen,
  verifyLastSeen,
} from "@/lib/auth/session-limits";
import { proxy } from "@/proxy";

const SECRET = "test-session-cookie-secret";
const NOW = new Date("2026-05-10T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type CookiePair = { name: string; value: string; options: CookieOptions };

let lastResponse:
  | { headers: { set: ReturnType<typeof vi.fn> }; cookies: { set: ReturnType<typeof vi.fn> } }
  | undefined;
let lastRedirect:
  | {
      url: string | URL;
      headers: { set: ReturnType<typeof vi.fn> };
      cookies: { set: ReturnType<typeof vi.fn> };
    }
  | undefined;

function mockHeaders() {
  return { set: vi.fn() };
}

function mockResponse() {
  lastResponse = { headers: mockHeaders(), cookies: { set: vi.fn() } };
  return lastResponse;
}

function requestFor(
  pathname: string,
  cookies: Record<string, string> = {},
) {
  const url = new URL(`http://localhost:3000${pathname}`);
  const entries = Object.entries(cookies).map(([name, value]) => ({ name, value }));

  return {
    nextUrl: {
      pathname: url.pathname,
      searchParams: url.searchParams,
      clone: () => new URL(url.toString()),
    },
    cookies: {
      getAll: () => entries,
      get: (name: string) => entries.find((entry) => entry.name === name),
      set: vi.fn(),
    },
  } as never;
}

function claimsAt(timestampMs: number) {
  return {
    data: {
      claims: {
        amr: [{ method: "password", timestamp: Math.floor(timestampMs / 1000) }],
        iat: Math.floor(timestampMs / 1000),
      },
    },
    error: null,
  };
}

function authClient() {
  return {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      getClaims: mocks.getClaims,
      signOut: mocks.signOut,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SESSION_MAX_AGE_DAYS = "14";
  process.env.SESSION_IDLE_HOURS = "72";
  process.env.SESSION_COOKIE_SECRET = SECRET;

  mocks.next.mockImplementation(() => mockResponse());
  mocks.redirect.mockImplementation((url: string | URL) => {
    lastRedirect = {
      url,
      headers: mockHeaders(),
      cookies: { set: vi.fn() },
    };
    return lastRedirect;
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u-1", factors: [] } },
  });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.getClaims.mockResolvedValue(claimsAt(NOW - HOUR));
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createServerClient.mockImplementation(
    (
      _url: string,
      _key: string,
      options: { cookies?: { setAll?: (pairs: CookiePair[]) => void } },
    ) => {
      void options;
      return authClient();
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SESSION_MAX_AGE_DAYS;
  delete process.env.SESSION_IDLE_HOURS;
  delete process.env.SESSION_COOKIE_SECRET;
  vi.clearAllMocks();
});

describe("proxy() session limits", () => {
  it("expires a session whose absolute lifetime has elapsed", async () => {
    mocks.getClaims.mockResolvedValue(claimsAt(NOW - 15 * DAY));

    await proxy(requestFor("/transactions"));

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(lastRedirect?.url.toString()).toContain("/login");
    expect(lastRedirect?.url.toString()).toContain("reason=session_expired");
    expect(lastRedirect?.cookies.set).toHaveBeenCalledWith(
      LAST_SEEN_COOKIE,
      "",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 }),
    );
  });

  it("expires a session after the idle window with no requests", async () => {
    const lastSeen = await signLastSeen(SECRET, "u-1", NOW - 73 * HOUR);

    await proxy(requestFor("/transactions", { [LAST_SEEN_COOKIE]: lastSeen }));

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(lastRedirect?.url.toString()).toContain("reason=session_expired");
  });

  it("lets a fresh session through without rewriting the cookie", async () => {
    const lastSeen = await signLastSeen(SECRET, "u-1", NOW - 60 * 1000);

    await proxy(requestFor("/transactions", { [LAST_SEEN_COOKIE]: lastSeen }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
    expect(lastResponse?.cookies.set).not.toHaveBeenCalledWith(
      LAST_SEEN_COOKIE,
      expect.anything(),
      expect.anything(),
    );
  });

  it("refreshes the last-seen cookie at most every five minutes", async () => {
    const lastSeen = await signLastSeen(SECRET, "u-1", NOW - 6 * 60 * 1000);

    await proxy(requestFor("/transactions", { [LAST_SEEN_COOKIE]: lastSeen }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    const write = lastResponse?.cookies.set.mock.calls.find(
      ([name]) => name === LAST_SEEN_COOKIE,
    );
    expect(write).toBeDefined();
    expect(write?.[2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    await expect(verifyLastSeen(SECRET, "u-1", write?.[1] ?? "")).resolves.toBe(NOW);
  });

  it("treats a tampered cookie as now once, then enforces idle expiry", async () => {
    const tampered = `${await signLastSeen(SECRET, "u-1", NOW - HOUR)}x`;

    await proxy(requestFor("/transactions", { [LAST_SEEN_COOKIE]: tampered }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    const write = lastResponse?.cookies.set.mock.calls.find(
      ([name]) => name === LAST_SEEN_COOKIE,
    );
    expect(write).toBeDefined();
    const freshCookie = write?.[1] as string;

    // The next request is 73 hours later. The cookie written above is now
    // stale, so the idle limit is enforced rather than counting as "now" again.
    vi.setSystemTime(new Date(NOW + 73 * HOUR));
    await proxy(requestFor("/transactions", { [LAST_SEEN_COOKIE]: freshCookie }));

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(lastRedirect?.url.toString()).toContain("reason=session_expired");
  });

  it("skips session limits on public pages", async () => {
    mocks.getClaims.mockResolvedValue(claimsAt(NOW - 15 * DAY));

    await proxy(requestFor("/design"));

    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
  });
});
