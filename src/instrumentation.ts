import * as Sentry from "@sentry/nextjs";

/**
 * Next.js server instrumentation hook (Section 5 — post-launch monitoring).
 *
 * `register()` boots the correct Sentry runtime exactly once; `onRequestError`
 * forwards every unhandled server-side request error (route handlers, server
 * components, server actions) to Sentry with the scrubbing applied by the
 * shared options. Both are no-ops when no DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
