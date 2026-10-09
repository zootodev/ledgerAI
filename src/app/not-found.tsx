import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="mx-auto w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <FileQuestion className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          This page went missing.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Head
          back to the start and we&apos;ll get you back on track.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-button bg-brand px-5 text-base font-medium text-on-accent shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Back to home
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-button border border-border-strong bg-surface px-5 text-base font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}