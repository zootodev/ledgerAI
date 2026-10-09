import type { NextConfig } from "next";

/* Production security headers applied at the response level on every route.
   Content-Security-Policy (with a per-request nonce) is emitted from
   src/proxy.ts instead — it can only be generated per request — while the
   static, frame/referrer/mime headers below never change and are safe to
   declare here. Strict-Transport-Security is intentionally NOT set here:
   Vercel already emits HSTS on the production edge. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
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

export default nextConfig;