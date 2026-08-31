import { getSupabaseServer } from "./supabase";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * Resolve the currently authenticated user from the server-side session.
 * Returns null when unauthenticated or when Supabase is not configured.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    name:
      (user.user_metadata?.name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      null,
  };
}
