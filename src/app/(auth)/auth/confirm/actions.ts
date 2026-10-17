"use server";

import { redirect } from "next/navigation";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { parseEmailOtpType } from "@/lib/auth/email-otp";
import { resolvePostVerificationTarget } from "@/lib/auth/post-auth";
import { getSupabaseServer } from "@/lib/auth/supabase";

/** Only accept an actual string form value; ignore missing/File entries. */
function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Consume a one-time email link — but only on an explicit, user-initiated POST.
 *
 * This is the second half of the /auth/confirm split: the GET page renders a
 * button, and the button submits here. Keeping `verifyOtp` out of the GET
 * handler is what stops a mail scanner's link pre-fetch from burning the
 * single-use token before the human taps it.
 *
 * The values come from hidden fields, so every one of them is re-validated: the
 * `type` must be a known Supabase OTP type and `next` is re-checked on the
 * server before it is ever used as a redirect target.
 */
export async function confirmEmailAction(formData: FormData): Promise<void> {
  const tokenHash = asString(formData.get("token_hash"));
  const type = parseEmailOtpType(asString(formData.get("type")));
  const rawNext = asString(formData.get("next"));

  const baseUrl = await getAppBaseUrl();
  const loginUrl = `${baseUrl}/login`;

  // A failed link is re-rendered *in place* on /auth/confirm, never redirected
  // to /login: the proxy sends a signed-in visitor away from /login (to
  // /overview or the 2FA challenge), which made the failure look like nothing
  // happened at all. The error URL deliberately carries no token — a dead link
  // must not be retryable and the one-time secret must not linger in history.
  // `type` travels along so the error card can offer the right recovery action.
  const confirmError = (error: string) =>
    `${baseUrl}/auth/confirm?error=${error}${
      type ? `&type=${encodeURIComponent(type)}` : ""
    }`;

  let target: string;

  if (!tokenHash || !type) {
    // Nothing verifiable: there is no token to consume and no valid type.
    target = confirmError("missing_code");
  } else {
    const supabase = await getSupabaseServer();

    if (!supabase) {
      // No session can exist without Supabase, so the sign-in page is visible
      // here — this is an infrastructure problem, not a link failure.
      target = `${loginUrl}?error=not_configured`;
    } else {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      target = error
        ? // Expired, already used, or otherwise rejected. Carry the link type
          // so the error card offers a fresh reset link vs. a fresh
          // confirmation email.
          confirmError("auth_failed")
        : await resolvePostVerificationTarget(rawNext, baseUrl, {
            user: data.user,
            accessToken: data.session?.access_token,
          });
    }
  }

  redirect(target);
}
