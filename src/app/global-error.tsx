"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";
import { captureException } from "@/lib/observability/capture";

/**
 * Last-resort error boundary. Replaces the root layout entirely, so it must
 * render its own <html>/<body>. Used only when the root layout itself fails.
 * As with the route boundaries, no error message, stack, or digest is shown.
 * The exception is reported to monitoring (scrubbed) rather than rendered.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="en-NG">
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
          <div className="w-full max-w-md">
            <ErrorState
              title="The app didn't start"
              description="Reload the page. If it still fails, come back in a few minutes."
              onRetry={reset}
            />
            <div className="mt-4 text-center">
              <Link
                href="/"
                className="text-sm font-medium text-brand hover:underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
