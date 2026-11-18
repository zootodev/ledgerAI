import Link from "next/link";
export const metadata = { title: "Page not found | LedgerAI" };

/**
 * Branded 404.
 *
 * Reached for any URL that does not match a route — the proxy deliberately
 * leaves unknown paths alone so this page renders instead of funneling the
 * visitor into /login. `noindex` keeps an accidental or stale link out of
 * search results (the 404 status code already does the same for crawlers).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <meta name="robots" content="noindex, nofollow" />
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-medium tabular-nums text-muted">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          The address is wrong or the page has moved. Check the link, or go back
          to your overview.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/overview"
            className="inline-flex h-10 items-center gap-2 rounded-button bg-brand px-4 text-sm font-medium text-on-accent transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Go to overview
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-button border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Back to home
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted">
          Looking to sign in?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
