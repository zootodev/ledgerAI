"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Route-level error boundary for /reports (Next.js convention: a client
 * component named `error.tsx` in the route segment). Catches unexpected
 * failures that bubble out of the reports page/sections and renders a safe,
 * retryable panel instead of a white-screen error.
 *
 * Safety: only `error.digest` (a stable, non-sensitive id Next attaches) is
 * logged. The error message / stack trace — which for a server-side failure
 * can embed DB internals, tenant ids or query text — is deliberately never
 * rendered or logged.
 */
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log only the digest. Never error.message/stack (see doc comment).
    console.error(
      `[reports] boundary caught${error.digest ? ` (digest ${error.digest})` : ""}`,
    );
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <ErrorState
          title="Reports couldn't be loaded"
          description="Something went wrong while preparing your reports. Click Try again to reload them."
          onRetry={reset}
        />
      </div>
    </main>
  );
}