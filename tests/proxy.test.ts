import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
  redirect: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
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
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.createServerClient.mockImplementation(
    (
      _url: string,
      _key: string,
      options: { cookies?: { setAll?: (pairs: CookiePair[]) => void } },
    ) => {
      capturedSetAll = options?.cookies?.setAll;
      return { auth: { getUser: mocks.getUser, getSession: mocks.getSession } };
    },
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  vi.clearAllMocks();
});

describe("isPublicPath", () => {
  it.each([
    "/",
    "/login",
    "/signup",
    "/design",
    "/privacy",
    "/terms",
    "/auth/callback",
    "/forgot-password",
    "/reset-password",
  ])("treats the intended route %s as public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

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

describe("proxy() MFA step-up gating", () => {
  /** Build a decodable JWT whose payload carries an `aal` claim. */
  function jwtWithAal(aal: string): string {
    const payload = Buffer.from(JSON.stringify({ aal })).toString("base64url");
    return `header.${payload}.signature`;
  }

  const verifiedTotp = { id: "f1", status: "verified", factor_type: "totp" };
  const unverifiedTotp = { id: "f2", status: "unverified", factor_type: "totp" };

  function signInWith(factors: unknown[], accessToken: string | null) {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u-1", factors } } });
    mocks.getSession.mockResolvedValue({
      data: { session: accessToken ? { access_token: accessToken } : null },
    });
  }

  it("parks an aal1 session that has a verified factor on the MFA challenge", async () => {
    signInWith([verifiedTotp], jwtWithAal("aal1"));

    await proxy(requestFor("/transactions"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const dest = mocks.redirect.mock.calls[0][0].toString();
    expect(dest).toContain("/auth/mfa");
    expect(dest).toContain("next=%2Ftransactions");
  });

  it("lets the MFA challenge page itself render at aal1", async () => {
    signInWith([verifiedTotp], jwtWithAal("aal1"));

    await proxy(requestFor("/auth/mfa"));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
  });

  it("lets an aal2 session through to protected pages", async () => {
    signInWith([verifiedTotp], jwtWithAal("aal2"));

    await proxy(requestFor("/transactions"));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalled();
  });

  it("does not consult the session when there is no verified factor", async () => {
    signInWith([unverifiedTotp], null);

    await proxy(requestFor("/overview"));

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a stepped-up user away from /login to the app, not the challenge", async () => {
    signInWith([verifiedTotp], jwtWithAal("aal2"));

    await proxy(requestFor("/login"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const dest = mocks.redirect.mock.calls[0][0].toString();
    expect(dest).toContain("/overview");
    expect(dest).not.toContain("/auth/mfa");
  });

  it("sends an un-stepped-up user away from /login to the challenge", async () => {
    signInWith([verifiedTotp], jwtWithAal("aal1"));

    await proxy(requestFor("/login"));

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect.mock.calls[0][0].toString()).toContain("/auth/mfa");
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