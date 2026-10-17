import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Session-replacement integration test.
 *
 * Unlike confirm-action.test.ts — which mocks `@/lib/auth/supabase` — this file
 * exercises the REAL Supabase SSR wiring: `getSupabaseServer()` reads and writes
 * through `next/headers` cookies. That is the layer that decides whether a
 * freshly verified recovery session replaces a different user's existing one.
 */
const h = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    cookieName: "sb-ledger-auth-token",
    userA: { id: "user-a", email: "a@example.com" },
    userB: { id: "user-b", email: "b@example.com" },
    redirect: vi.fn(),
    jar: {
      getAll: () => [...map.entries()].map(([name, value]) => ({ name, value })),
      get: (name: string) =>
        map.has(name) ? { name, value: map.get(name) as string } : undefined,
      set: (name: string, value: string) => {
        map.set(name, value);
      },
      clear: () => map.clear(),
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => h.jar }));

// A minimal stand-in for @supabase/ssr that honours the storage adapter the way
// the real client does: `verifyOtp` writes the new session through `setAll`,
// and `getUser` reads whatever is currently stored.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        getAll: () => { name: string; value: string }[];
        setAll: (cookies: { name: string; value: string }[]) => void;
      };
    },
  ) => ({
    auth: {
      async verifyOtp() {
        options.cookies.setAll([{ name: h.cookieName, value: "token-b" }]);
        return { data: { user: h.userB, session: { access_token: "token-b" } }, error: null };
      },
      async getUser() {
        const token = options.cookies
          .getAll()
          .find((cookie) => cookie.name === h.cookieName)?.value;
        return { data: { user: token === "token-b" ? h.userB : null } };
      },
    },
  }),
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://app.test"),
}));

vi.mock("@/lib/services/auth", () => ({
  ensureOnboarding: vi.fn(async () => ({ id: h.userB.id, email: h.userB.email })),
  needsOnboarding: vi.fn(async () => false),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));

import { confirmEmailAction } from "@/app/(auth)/auth/confirm/actions";
import { getCurrentUser } from "@/lib/auth/server";

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.jar.clear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  // The browser is already signed in as a *different* user.
  h.jar.set(h.cookieName, "token-a");
});

describe("confirmEmailAction session replacement", () => {
  it("lets the freshly verified recovery session replace the existing one", async () => {
    await confirmEmailAction(
      formData({ token_hash: "recovery-token", type: "recovery", next: "/reset-password" }),
    );

    // The recovery session reached the reset page...
    expect(h.redirect).toHaveBeenCalledWith("http://app.test/reset-password");
    // ...and it is the new user's session that now lives in the cookies, not the
    // previously signed-in user's.
    expect(h.jar.get(h.cookieName)?.value).toBe("token-b");
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "user-b" });
  });
});
