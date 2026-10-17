import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { confirmEmailAction } from "./actions";
import { EmailConfirmCard } from "@/components/auth/email-confirm-card";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { parseEmailOtpType } from "@/lib/auth/email-otp";
import { resolveInternalNext } from "@/lib/auth/redirect";

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
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const rawType = typeof params.type === "string" ? params.type : "";
  const rawNext = typeof params.next === "string" ? params.next : "";

  const type = parseEmailOtpType(rawType);
  // Without a token or a recognized type there is nothing to confirm: fall back
  // to the sign-in error surface.
  if (!tokenHash || !type) redirect("/login?error=missing_code");

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
