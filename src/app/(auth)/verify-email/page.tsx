import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = {
  title: "Confirm your email",
};

export const dynamic = "force-dynamic";

/**
 * Resend-verification screen. Reached when sign-in fails because the email was
 * never confirmed (or directly). Public: the user is not signed in yet.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const { email, sent } = await searchParams;
  const initialEmail = typeof email === "string" ? email : "";

  return <ResendVerificationForm initialEmail={initialEmail} sent={sent === "1"} />;
}
