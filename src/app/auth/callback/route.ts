import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { resolvePostAuthRedirect } from "@/lib/auth/redirect";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { ensureOnboarding, needsOnboarding } from "@/lib/services/auth";

/**
 * Verification types Supabase may put in an email link's `type` query param.
 * `email`/`signup` both denote a new-account confirmation depending on the
 * template; `recovery` is a password reset.
 */
const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

/**
 * One-time callback that Supabase redirects to after a user clicks a link in
 * an email. Supports BOTH link shapes:
 *
 *   - `?code=…` — the PKCE flow (Supabase's default `{{ .ConfirmationURL }}`).
 *     The code is exchanged for a session using the code-verifier cookie set in
 *     the browser that started the flow.
 *   - `?token_hash=…&type=…` — the OTP flow (a template built with
 *     `{{ .TokenHash }}`). Verified entirely server-side with no cookie, so it
 *     also succeeds when the link is opened in a different browser or a mail
 *     app's in-app browser (e.g. Gmail), where no PKCE verifier exists.
 *
 * Either way the user's profile + first business are provisioned idempotently,
 * then the user continues into the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const rawNext = url.searchParams.get("next");

  const baseUrl = await getAppBaseUrl();
  const loginUrl = `${baseUrl}/login`;

  const otpType =
    rawType && EMAIL_OTP_TYPES.has(rawType as EmailOtpType)
      ? (rawType as EmailOtpType)
      : null;

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(`${loginUrl}?error=missing_code`);
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(`${loginUrl}?error=not_configured`);
  }

  const verified = code
    ? (await supabase.auth.exchangeCodeForSession(code)).error === null
    : (
        await supabase.auth.verifyOtp({
          token_hash: tokenHash as string,
          type: otpType as EmailOtpType,
        })
      ).error === null;

  if (!verified) {
    return NextResponse.redirect(`${loginUrl}?error=auth_failed`);
  }

  // Only reached with a freshly established, genuinely authenticated session.
  // Idempotent: profile upsert + first-business lookup-or-create. Never bounce
  // to /onboarding from here — `next` may point at the password-reset page and
  // a recovery session must land there.
  await ensureOnboarding({ bounce: false }).catch(() => null);

  // A caller that supplied `next` (e.g. the reset link) lands exactly there.
  // Otherwise send brand-new users to onboarding and everyone else to the
  // dashboard.
  const target = rawNext
    ? resolvePostAuthRedirect(rawNext, baseUrl)
    : (await needsOnboarding().catch(() => false))
      ? `${baseUrl}/onboarding`
      : `${baseUrl}/overview`;

  return NextResponse.redirect(new URL(target, baseUrl).toString());
}