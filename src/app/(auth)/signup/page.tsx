import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
};

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  return <SignupForm />;
}
