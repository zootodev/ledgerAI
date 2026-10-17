import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { parseEmailOtpType } from "@/lib/auth/email-otp";
import { resolvePostVerificationTarget } from "@/lib/auth/post-auth";
import { getSupabaseServer } from "@/lib/auth/supabase";

/**
 * One-time callback that Supabase redirects to after a user clicks a link in
 * an email. Supports BOTH link shapes:
 *
 *   - `?token_hash=…&type=…` — the OTP flow (a template built with
 *     `{{ .TokenHash }}`). The link is NOT verified here: the untouched token
 *     is forwarded to /auth/confirm, where a single explicit button POST does
 *     the `verifyOtp` call.
 *   - `?code=…` — the PKCE flow (Supabase's default `{{ .ConfirmationURL }}`).
 *     The code is exchanged here for a session using the code-verifier cookie
 *     set in the browser that started the flow.
 *
 * Either way the user's profile + first business are provisioned idempotently,
 * then the user continues into the app.
 *
 * WHY the OTP flow is split in two steps: mail providers and ESP link scanners
 * pre-fetch every URL in an email. When this GET handler verified the OTP
 * itself, that pre-fetch consumed the one-time token within seconds and the
 * human's own click then failed with "One-time token not found". A GET must
 * therefore stay side-effect free for `token_hash` links.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = parseEmailOtpType(url.searchParams.get("type"));
  const rawNext = url.searchParams.get("next");

  const baseUrl = await getAppBaseUrl();
  const loginUrl = `${baseUrl}/login`;

  // Every *link* failure lands on /auth/confirm's in-place error state, never on
  // /login: the proxy bounces a signed-in visitor away from /login, which made
  // the failure invisible. Only an infrastructure problem (Supabase not
  // configured) is reported on the sign-in page. `type` is carried through so
  // the error card can offer the right recovery action.
  const linkError = (error: string) =>
    `${baseUrl}/auth/confirm?error=${error}${
      otpType ? `&type=${encodeURIComponent(otpType)}` : ""
    }`;

  // Forward the still-unused one-time token to the confirmation screen, which
  // only verifies on an explicit, user-initiated POST. Preserve `next` (the
  // password-reset flow sends `next=/reset-password`) for that POST to
  // re-validate and use.
  if (tokenHash && otpType) {
    const confirm = new URL(`${baseUrl}/auth/confirm`);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", otpType);
    if (rawNext) confirm.searchParams.set("next", rawNext);
    return NextResponse.redirect(confirm.toString());
  }

  if (!code) {
    return NextResponse.redirect(linkError("missing_code"));
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(`${loginUrl}?error=not_configured`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(linkError("auth_failed"));
  }

  const target = await resolvePostVerificationTarget(rawNext, baseUrl, {
    user: data.user,
    accessToken: data.session?.access_token,
  });
  return NextResponse.redirect(new URL(target, baseUrl).toString());
}