import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Verification types Supabase may put in an email link's `type` query param.
 * `email`/`signup` both denote a new-account confirmation depending on the
 * template; `recovery` is a password reset.
 *
 * Shared by the `/auth/callback` route (which forwards the untouched token) and
 * the `/auth/confirm` page + action (which verify it) so both agree on exactly
 * which types are acceptable — an unrecognized `type` is never forwarded or
 * passed to Supabase.
 */
export const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

/** Narrow an untrusted `type` query value to a known Supabase OTP type. */
export function parseEmailOtpType(
  raw: string | null | undefined,
): EmailOtpType | null {
  return raw && EMAIL_OTP_TYPES.has(raw as EmailOtpType)
    ? (raw as EmailOtpType)
    : null;
}

/**
 * Which user-facing flow an email link belongs to. `recovery` is the
 * password-reset flow; every other type confirms an address or completes a
 * sign-in, so they share one "confirm" presentation and one failure recovery
 * path ("resend confirmation email" rather than "reset password").
 */
export type EmailLinkKind = "recovery" | "confirmation";

/** Classify a link type for copy and failure-recovery routing. */
export function emailLinkKind(type: EmailOtpType): EmailLinkKind {
  return type === "recovery" ? "recovery" : "confirmation";
}
