import type { Metadata } from "next";
import {
  EmailConfirmCard,
  EmailConfirmError,
} from "@/components/auth/email-confirm-card";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { parseEmailOtpType } from "@/lib/auth/email-otp";
import { resolveInternalNext } from "@/lib/auth/redirect";
import { confirmEmailAction } from "./actions";

export const metadata: Metadata = {
  title: "Confirm your email",
  // A one-time link must never be indexed — and no crawler should ever reach
  // the button that consumes the token.
  robots: { index: false, follow: false },
};

// Carries a single-use token in the query string: never cached or prerendered.
// (`force-dynamic` makes Next serve this page with `Cache-Control: no-store`.)
export const dynamic = "force-dynamic";

/**
 * Confirmation screen for `{{ .TokenHash }}` email links.
 *
 * The GET never touches the token — it only renders a button. Verification
 * happens in `confirmEmailAction` on the explicit POST, so an automated link
 * pre-fetch (mail provider, ESP click-tracker) can no longer consume the
 * one-time token before the human taps it.
 *
 * Both inputs are validated here as well as in the action: `type` must be a
 * known Supabase OTP type, and `next` is reduced to an internal, same-origin
 * path (or dropped) before it is put in the form. The action re-validates the
 * target with `resolvePostAuthRedirect` before it is ever used for a redirect.
 *
 * A failed link is shown *here*, not on /login: the proxy sends a signed-in
 * visitor away from /login, so a redirect made the failure look like nothing
 * happened. The failure URL never carries the token, and the card echoes
 * nothing from the query string.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const rawType = typeof params.type === "string" ? params.type : "";
  const rawNext = typeof params.next === "string" ? params.next : "";

  const type = parseEmailOtpType(rawType);

  // Failure surface: the action bounced back with an error, or the link itself
  // is unusable (no token / unrecognized type). A known `type` selects the
  // recovery action; anything else defaults to "resend confirmation email".
  if (error || !tokenHash || !type) {
    return <EmailConfirmError type={type} />;
  }

  const next = resolveInternalNext(rawNext, await getAppBaseUrl()) ?? "";

  return (
    <EmailConfirmCard
      tokenHash={tokenHash}
      type={type}
      next={next}
      action={confirmEmailAction}
    />
  );
}
