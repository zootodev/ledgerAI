import * as React from "react";
import Link from "next/link";

/**
 * Shared shell for the auth route group (sign in, sign up, forgot/reset
 * password). Owns the branded card so each page renders only its content, and
 * adds a slim legal footer under the card.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-ledgerai flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            aria-label="LedgerAI home"
            className="mb-6 flex items-center gap-2"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
              L
            </span>
            <span className="text-lg font-semibold text-foreground">LedgerAI</span>
          </Link>
          <div className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
            {children}
          </div>
          <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>© {new Date().getFullYear()} LedgerAI</span>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
