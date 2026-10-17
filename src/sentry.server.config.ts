import * as Sentry from "@sentry/nextjs";
import { serverSentryOptions } from "@/lib/observability/sentry-options";

/**
 * Server (Node.js) runtime Sentry init. Loaded from `src/instrumentation.ts`
 * only when `NEXT_RUNTIME === "nodejs"`. Inert without a DSN.
 */
Sentry.init({
  ...serverSentryOptions(),
  // Request errors are captured automatically via `onRequestError` in
  // instrumentation.ts; no extra integrations are needed here.
});
