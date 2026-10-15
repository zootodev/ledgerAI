"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Root route error boundary. Catches unexpected render/data errors from any
 * page that does not define its own `error.tsx`, keeping the failure inside the
 * normal app chrome instead of a white screen.
 *
 * Safety: only `error.digest` (a stable, non-sensitive id Next attaches) is
 * logged. The raw message/stack — which can embed DB internals, tenant ids or
 * query text — is deliberately never rendered or logged.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      `[app] boundary caught${error.digest ? ` (digest ${error.digest})` : ""}`,
    );
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <ErrorState
          title="Something went wrong"
          description="We couldn't load this page. Try again, or head back to your overview."
          onRetry={reset}
        />
        <div className="mt-4 text-center">
          <Link
            href="/overview"
            className="text-sm font-medium text-brand hover:underline"
          >
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
