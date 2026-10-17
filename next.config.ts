import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/* Production security headers applied at the response level on every route.
   Content-Security-Policy (with a per-request nonce) is emitted from
   src/proxy.ts instead — it can only be generated per request — while the
   static, frame/referrer/mime headers below never change and are safe to
   declare here.

   Strict-Transport-Security is emitted ONLY in production: pinning HTTPS on a
   dev or preview origin would make localhost / a preview alias unreachable
   over plain HTTP, and for that host the pin is effectively irreversible.
   `preload` is deliberately omitted until every subdomain is confirmed
   HTTPS-only (submission is a one-way commitment). */
export function buildSecurityHeaders(isProduction: boolean) {
  return [
    ...(isProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]
      : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
  ];
}

const securityHeaders = buildSecurityHeaders(process.env.NODE_ENV === "production");

const nextConfig: NextConfig = {
  /* Drop the `X-Powered-By: Next.js` fingerprint header from every response. */
  poweredByHeader: false,
  /* pdf-parse (and its pdfjs-dist engine) uses runtime requires and a
     worker that break when bundled — keep it external so it loads from
     node_modules on the server only (it is never imported client-side). */
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
  /* pdf-parse loads pdfjs-dist/legacy/build/pdf.worker.mjs at runtime via a
     dynamic import() that Vercel's file tracer can't follow, so the worker
     (and the @napi-rs/canvas natives that polyfill DOMMatrix at pdf-mjs
     evaluation) must be traced explicitly into the deployed function. */
  outputFileTracingIncludes: {
    "/import": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
      "./node_modules/@napi-rs/canvas-linux-arm64-musl/**/*",
    ],
  },
  /* Opt out of the expanded static/cache behaviors so authenticated,
     session-derived data is always revalidated (Supabase SSR best practice). */
  cacheComponents: false,
  /* Development-only server-actions allowed origins. Tunnel/LAN hosts make
     the browser Origin differ from the Host Next sees (local mobile testing),
     so they are listed HERE — dev-only by construction — and crucially NOT in
     any production server-actions origin allowlist (see the SG1-05 test). */
  allowedDevOrigins: [
    /* Safari and privacy/opaque contexts start a dev POST with `Origin: null`,
       which never matches a hostname. Dev-only: harmless, never shipped. */
    "null",
    /* LAN address of this machine, so the phone's HMR websockets aren't
       blocked in dev (See "Blocked cross-origin request" in the dev log). */
    "172.20.10.2",
    "**.ngrok-free.app",
    "**.ngrok.io",
    "**.ngrok.com",
    "**.trycloudflare.com",
    "**.loca.lt",
    "**.localhost.run",
    "**.serveo.net",
    "**.devtunnels.ms",
    "zooto.taile2c6a0.ts.net",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  // Source-map upload only runs when an auth token is present (CI/production).
  // Without one, debug IDs are still injected so stack traces correlate, but
  // nothing is uploaded — keeping local and CI builds hermetic.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: process.env.SENTRY_AUTH_TOKEN ? false : "disable-upload",
  },
  webpack: {
    // Instrument server functions/components for error monitoring only when a
    // DSN is configured, so an un-monitored local build stays lean.
    autoInstrumentServerFunctions: Boolean(
      process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
    ),
  },
});
