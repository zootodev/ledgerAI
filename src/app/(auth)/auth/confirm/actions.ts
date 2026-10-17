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

  let target: string;

  if (!tokenHash || !type) {
    // Nothing verifiable: send the user to the sign-in error surface rather
    // than a dead end.
    target = `${loginUrl}?error=missing_code`;
  } else {
    const supabase = await getSupabaseServer();

    if (!supabase) {
      target = `${loginUrl}?error=not_configured`;
    } else {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      target = error
        ? // Carry the link type so the sign-in page can offer the right
          // recovery action (resend confirmation vs. request a reset link).
          `${loginUrl}?error=auth_failed&type=${encodeURIComponent(type)}`
        : await resolvePostVerificationTarget(rawNext, baseUrl);
    }
  }

  redirect(target);
}
