import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { ensureOnboarding } from "@/lib/services/auth";

/**
 * One-time callback that Supabase redirects to after a user clicks the email
 * confirmation link (PKCE flow). Exchanges the `?code` for a session cookie,
 * provisions the user's profile + first business, and continues to the app.
 */
function isInternalPath(value: string): boolean {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return false;
  // Reject anything with control chars / whitespace / delimiters a malicious
  // `next` could smuggle into the redirect target.
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  return true;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");
  const next = rawNext && isInternalPath(rawNext) ? rawNext : "/overview";

  const baseUrl = await getAppBaseUrl();
  const loginUrl = `${baseUrl}/login`;

  if (!code) {
    return NextResponse.redirect(`${loginUrl}?error=missing_code`);
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(`${loginUrl}?error=not_configured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${loginUrl}?error=auth_failed`);
  }

  // Only reached with a freshly exchanged, genuinely authenticated session.
  // Idempotent: profile upsert + first-business lookup-or-create.
  await ensureOnboarding().catch(() => null);

  return NextResponse.redirect(new URL(next, baseUrl).toString());
}