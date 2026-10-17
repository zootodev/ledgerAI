import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SERVICE ROLE key. It can call the
 * admin API (e.g. `auth.admin.deleteUser`) which the anon/cookie client
 * cannot. It must NEVER be imported into a client component — the service
 * role key bypasses RLS entirely.
 *
 * Returns null when the key/url are absent so the app still runs in setup
 * mode; callers must handle the null (skip the privileged operation).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
