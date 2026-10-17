import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared, pure Sentry option builders (Section 5 — post-launch monitoring).
 *
 * These are deliberately free of `Sentry.init` side effects so they can be
 * unit-tested directly. The `sentry.*.config.ts` files call
 * `Sentry.init(serverSentryOptions())` / `clientSentryOptions()` at boot.
 *
 * Privacy posture: `sendDefaultPii` is OFF and events are scrubbed of request
 * bodies, headers, cookies, query strings and user identity before they leave
 * the process. Financial rows live only in Postgres and must never ride along
 * in an error payload.
 */

export interface SentryEnv {
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
}

/** The DSN Sentry is enabled with, or `undefined` when monitoring is off. */
export function resolveSentryDsn(env: SentryEnv = process.env): string | undefined {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim() || env.SENTRY_DSN?.trim();
  return dsn ? dsn : undefined;
}

/**
 * Deployment label. Prefers an explicit `SENTRY_ENVIRONMENT`, then the Vercel
 * environment (production/preview/development), then NODE_ENV.
 */
export function resolveSentryEnvironment(env: SentryEnv = process.env): string {
  if (env.SENTRY_ENVIRONMENT?.trim()) return env.SENTRY_ENVIRONMENT.trim();
  if (env.VERCEL_ENV?.trim()) return env.VERCEL_ENV.trim();
  return env.NODE_ENV ?? "development";
}

/**
 * Trace sample rate. Defaults to a light 10% in production and off elsewhere
 * (errors are always captured regardless of tracing). Values outside [0, 1]
 * fall back to the default rather than throwing.
 */
export function resolveTracesSampleRate(env: SentryEnv = process.env): number {
  const raw = env.SENTRY_TRACES_SAMPLE_RATE;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, 1);
  }
  return resolveSentryEnvironment(env) === "production" ? 0.1 : 1;
}

/** Keep only the origin+path of a URL; drop query strings and fragments. */
export function stripUrlSecrets(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Not a parseable absolute URL (e.g. a bare path) — drop the query anyway.
    return url.split(/[?#]/, 1)[0];
  }
}

/**
 * Remove everything that could carry tenant data, secrets or PII from an event
 * before it is sent. Runs for every captured error and message.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Never send the signed-in user's identity or email.
  delete event.user;

  if (event.request) {
    // Keep the method and a query-free URL for triage; drop headers (cookies,
    // Authorization), POST bodies (form fields, passwords) and raw query.
    event.request = {
      method: event.request.method,
      url: stripUrlSecrets(event.request.url),
    };
  }

  // Defence in depth: drop free-form extras that could hold copied payloads.
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes("password") ||
        normalized.includes("token") ||
        normalized.includes("secret") ||
        normalized.includes("body") ||
        normalized.includes("query")
      ) {
        delete event.extra[key];
      }
    }
  }

  return event;
}

/** Server / edge runtime options (Node + Edge share this shape). */
export function serverSentryOptions(env: SentryEnv = process.env) {
  const dsn = resolveSentryDsn(env);
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: resolveSentryEnvironment(env),
    tracesSampleRate: resolveTracesSampleRate(env),
    // Never attach IP addresses, cookies or request bodies automatically.
    sendDefaultPii: false,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
  };
}

/** Browser options: same privacy posture, no tracing by default. */
export function clientSentryOptions(env: SentryEnv = process.env) {
  const dsn = resolveSentryDsn(env);
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: resolveSentryEnvironment(env),
    tracesSampleRate: resolveTracesSampleRate(env),
    sendDefaultPii: false,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
  };
}
