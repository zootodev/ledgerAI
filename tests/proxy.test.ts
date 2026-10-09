import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
  redirect: vi.fn(),
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

type CookiePair = {
  name: string;
  value: string;
  options: CookieOptions;
};
let capturedSetAll: ((pairs: CookiePair[]) => void) | undefined;
let lastResponse: { headers: { set: ReturnType<typeof vi.fn> }; cookies: { set: ReturnType<typeof vi.fn> } } | undefined;

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.next,
    redirect: mocks.redirect,
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { proxy, isPublicPath } from "@/proxy";

function mockHeaders() {
  return { set: vi.fn() };
}

function mockResponse() {
  lastResponse = {
    headers: mockHeaders(),
    cookies: { set: vi.fn() },
  };
  return lastResponse;
}

function nextUrlFor(pathname: string) {
  const url = new URL(`http://localhost:3000${pathname}`);
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
    clone: () => new URL(url.toString()),
  };
}

function requestFor(pathname: string) {
  return {
    nextUrl: nextUrlFor(pathname),
    cookies: {
      getAll: () => [] as { name: string; value: string }[],
      set: vi.fn(),
    },
  } as never;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mocks.next.mockImplementation(() => mockResponse());
  mocks.redirect.mockImplementation((url: string | URL) => ({
    url,
    headers: mockHeaders(),
  }));
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.createServerClient.mockImplementation(
    (
      _url: string,
      _key: string,
      options: { cookies?: { setAll?: (pairs: CookiePair[]) => void } },
    ) => {
      capturedSetAll = options?.cookies?.setAll;
      return { auth: { getUser: mocks.getUser } };
    },
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  vi.clearAllMocks();
});

describe("isPublicPath", () => {
  it.each(["/", "/login", "/signup", "/design", "/auth/callback", "/forgot-password", "/reset-password"])(
    "treats the intended route %s as public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it("normalizes a trailing slash for canonical pages", () => {
    expect(isPublicPath("/login/")).toBe(true);
    expect(isPublicPath("/design///")).toBe(true);
  });

  it.each([
    "/design-editor",
    "/design-editor/settings",
    "/login-foo",
    "/login/secret",
    "/signup-extra",
    "/auth/callback/magic",
    "/overview",
    "/settings",
    "/reports",
    "/transactions",
  ])("treats the lookalike route %s as NOT public", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("proxy() route gating", () => {
  it("serves a public page without a session", async () => {
    await proxy(requestFor("/design"));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
  });

  it("serves the auth callback without a session", async () => {
    await proxy(requestFor("/auth/callback?code=abc"));

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("serves forgot-password and reset-password without a session", async () => {
    await proxy(requestFor("/forgot-password"));
    await proxy(requestFor("/reset-password"));

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects anonymous visitors of a lookalike path to /login", async () => {
    await proxy(requestFor("/design-editor"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const dest = mocks.redirect.mock.calls[0][0].toString();
    expect(dest).toContain("/login");
    expect(dest).toContain("next=");
  });

  it("protects a real app route for anonymous visitors", async () => {
    await proxy(requestFor("/overview"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect.mock.calls[0][0].toString()).toContain("/login");
  });

  it("redirects an authenticated user away from /login to /overview", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });

    await proxy(requestFor("/login"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const dest = mocks.redirect.mock.calls[0][0].toString();
    expect(dest).toContain("/overview");
  });

  it("does not redirect a protected page for an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });

    await proxy(requestFor("/transactions"));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
  });
});

describe("proxy() session cookie hardening", () => {
  const env = process.env as { NODE_ENV?: string };

  it("marks Supabase auth cookies httpOnly/SameSite=Lax/Path=/ and Secure in production", async () => {
    const savedNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      await proxy(requestFor("/overview"));

      expect(capturedSetAll).toBeDefined();
      capturedSetAll?.([{ name: "sb-token", value: "jwt", options: { path: "/" } }]);

      expect(lastResponse?.cookies.set).toHaveBeenCalledWith(
        "sb-token",
        "jwt",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: true,
        }),
      );
    } finally {
      env.NODE_ENV = savedNodeEnv;
    }
  });

  it("keeps Secure off in development so localhost HTTP still works", async () => {
    const savedNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "development";
    try {
      await proxy(requestFor("/overview"));

      capturedSetAll?.([{ name: "sb-token", value: "jwt", options: { path: "/" } }]);

      expect(lastResponse?.cookies.set).toHaveBeenCalledWith(
        "sb-token",
        "jwt",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", secure: false }),
      );
    } finally {
      env.NODE_ENV = savedNodeEnv;
    }
  });
});