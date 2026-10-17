import * as Sentry from "@sentry/nextjs";
import { clientSentryOptions } from "@/lib/observability/sentry-options";

/**
 * Browser Sentry init (Section 5). Next.js loads `instrumentation-client.ts`
 * automatically on the client. Inert without `NEXT_PUBLIC_SENTRY_DSN`.
 */
Sentry.init(clientSentryOptions());

/** Report client-side navigation transitions to Sentry's tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
