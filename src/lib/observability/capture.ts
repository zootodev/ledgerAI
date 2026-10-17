/**
 * Failure-proof exception reporting for client error boundaries.
 *
 * Monitoring must never break the render path and must never ship the Sentry
 * SDK into the initial bundle when it isn't configured, so the SDK is imported
 * lazily and every failure is swallowed. When no public DSN is set the client
 * SDK is disabled and `captureException` is effectively a no-op.
 */
export function captureException(error: unknown): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      /* monitoring must never throw into the app */
    });
}
