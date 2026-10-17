import * as React from "react";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

export interface LegalPageProps {
  title: string;
  /** Human "last updated" date shown under the title. */
  updated: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the static legal pages (/privacy, /terms). These pages are
 * public (see PUBLIC_PATHS in src/proxy.ts) and intentionally plain: a compact
 * header, the document body, and a slim footer with the same links as the
 * landing page so a signed-out visitor is never stranded.
 */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="LedgerAI home" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
              L
            </span>
            <span className="font-semibold text-foreground">LedgerAI</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-secondary transition-colors hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
          <div className="mt-8 space-y-6 text-sm leading-relaxed text-secondary">
            {children}
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-6 text-sm text-secondary sm:px-6">
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="transition-colors hover:text-foreground"
          >
            Contact
          </a>
          <span className="text-muted">© {new Date().getFullYear()} LedgerAI</span>
        </div>
      </footer>
    </div>
  );
}
