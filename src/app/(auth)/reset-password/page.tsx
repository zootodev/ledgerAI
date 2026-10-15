import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
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

  return <ResetPasswordForm />;
}
