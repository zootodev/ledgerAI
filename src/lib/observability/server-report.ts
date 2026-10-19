import { resolveSentryDsn } from "@/lib/observability/sentry-options";

/**
 * Report a failure the app RECOVERED from — for example the /import page
 * catching a database error and rendering an inline retry instead of crashing.
 *
 * The error is marked as HANDLED so Sentry records it for triage without
 * treating it as an unhandled crash (no alert/page on a recovered blip). When
 * no DSN is configured this is a no-op, and it never throws into the render
 * path.
 */
export function reportHandledError(type: string, error: unknown): void {
  // Server-side breadcrumb. The message is never rendered to the client.
  console.error(`[${type}] handled error:`, error);

  if (!resolveSentryDsn()) return;

  void import("@sentry/nextjs")
    .then((Sentry) =>
      Sentry.captureException(error, {
        mechanism: { handled: true, type },
      }),
    )
    .catch(() => {
      /* monitoring must never throw into the app */
    });
}
