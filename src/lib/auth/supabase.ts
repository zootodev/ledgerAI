import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { CookieOptions } from "@supabase/ssr";

/**
 * Create a Supabase server client bound to the request's cookies.
 * Returns null when Supabase env vars are not configured so the app
 * remains runnable during setup. Use `getSupabaseServer` and prefer a
 * non-null guard before performing user-facing operations.
 */
export async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    // PKCE: the email-confirmation link returns the session as a `?code` that
    // the /auth/callback route exchanges server-side (works with the SSR
    // cookie storage). Implicit flow would leave tokens in the URL hash,
    // which server-rendered pages cannot read.
    auth: { flowType: "pkce" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; safe to ignore when middleware handles
          // cookie refresh.
        }
      },
    },
  });
}
