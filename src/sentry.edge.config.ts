import * as Sentry from "@sentry/nextjs";
import { serverSentryOptions } from "@/lib/observability/sentry-options";

/**
 * Edge runtime Sentry init (middleware/proxy and edge routes). Loaded from
 * `src/instrumentation.ts` only when `NEXT_RUNTIME === "edge"`. Inert without
 * a DSN.
 */
Sentry.init(serverSentryOptions());
