import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  return <ForgotPasswordForm />;
}
