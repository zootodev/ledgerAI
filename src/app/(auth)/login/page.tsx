import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Sign in",
};

// Failures from /auth/callback are mapped to fixed, safe copy here — nothing
// from the provider is ever echoed to the client. Unknown `error` values
// render no alert at all, and every known value carries a safe recovery path.
const CALLBACK_ERRORS: Record<
  string,
  { title: string; message: string; action?: { label: string; href: string } }
> = {
  missing_code: {
    title: "Incomplete sign-in link",
    message: "This link is missing its confirmation code and may have been truncated.",
    action: {
      label: "Request a new password-reset link",
      href: "/forgot-password",
    },
  },
  auth_failed: {
    title: "This link is invalid or has expired",
    message: "Confirmation links can only be used once. Sign in, or request a fresh link.",
    action: {
      label: "Request a new password-reset link",
      href: "/forgot-password",
    },
  },
  not_configured: {
    title: "Email sign-in isn't available right now",
    message: "Please try again shortly.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const { error } = await searchParams;
  const callbackError =
    typeof error === "string" ? CALLBACK_ERRORS[error] : undefined;

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
            {callbackError && (
              <Alert tone="danger" title={callbackError.title} className="mb-6">
                <p>{callbackError.message}</p>
                {callbackError.action && (
                  <Link
                    href={callbackError.action.href}
                    className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                  >
                    {callbackError.action.label}
                  </Link>
                )}
              </Alert>
            )}
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}