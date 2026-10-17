import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getMfaStatus } from "@/lib/services/mfa";
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
  // will accept a password change. The proxy steps up every *protected* route,
  // but this page is public — so finish the challenge first and come back. This
  // also covers a user who reaches the page directly instead of via the link.
  const mfa = await getMfaStatus();
  if (mfa.enabled && mfa.currentLevel !== "aal2") {
    redirect(`/auth/mfa?next=${encodeURIComponent("/reset-password")}`);
  }

  return <ResetPasswordForm />;
}
