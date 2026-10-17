import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { needsMfaStepUp, readAalFromAccessToken } from "@/lib/auth/mfa";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
};

export default async function ResetPasswordPage() {
  // The emailed link lands here through the auth callback, which exchanges the
  // PKCE code into a recovery session. Without that session the user cannot
  // update a password, so gate the page on it.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // An account with a verified factor needs an `aal2` session before Supabase
  // will accept a password change ("AAL2 session is required…"). A recovery
  // session arrives as aal1 and the proxy steps up only *protected* routes —
  // this page is public — so finish the challenge first and come back. This
  // also covers a user who reaches the page directly instead of via the link.
  // `needsMfaStepUp(user, aal)` is exactly `hasVerifiedFactor(user) && aal !==
  // "aal2"`, the same rule the proxy and the post-verification routing apply.
  const supabase = await getSupabaseServer();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (needsMfaStepUp(session?.user, readAalFromAccessToken(session?.access_token))) {
    redirect(`/auth/mfa?next=${encodeURIComponent("/reset-password")}`);
  }

  return <ResetPasswordForm />;
}
