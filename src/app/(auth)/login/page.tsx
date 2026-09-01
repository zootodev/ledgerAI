import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  return (
    <div className="theme-ledgerai flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
              L
            </span>
            <span className="text-lg font-semibold text-foreground">LedgerAI</span>
          </div>
          <div className="rounded-card border border-border bg-surface p-8 shadow-card">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}