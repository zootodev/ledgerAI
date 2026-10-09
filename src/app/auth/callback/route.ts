import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { resolvePostAuthRedirect } from "@/lib/auth/redirect";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { ensureOnboarding } from "@/lib/services/auth";

/**
 * One-time callback that Supabase redirects to after a user clicks the email
 * confirmation link (PKCE flow). Exchanges the `?code` for a session cookie,
 * provisions the user's profile + first business, and continues to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");

  const baseUrl = await getAppBaseUrl();
  const next = resolvePostAuthRedirect(rawNext, baseUrl);
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
  // Never bounce to /onboarding here: `next` may point at the password-reset
  // page, and a recovery session must land there.
  await ensureOnboarding({ bounce: false }).catch(() => null);

  return NextResponse.redirect(new URL(next, baseUrl).toString());
}