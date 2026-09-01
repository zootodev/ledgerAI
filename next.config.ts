import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Opt out of the expanded static/cache behaviors so authenticated,
     session-derived data is always revalidated (Supabase SSR best practice). */
  cacheComponents: false,
  /* Mobile testing through a local tunnel makes the browser Origin differ from
     the Host Next sees, tripping the Server Actions CSRF guard. Allow those
     tunnel domains, plus "null" — Safari and privacy/opaque contexts start the
     POST with `Origin: null`, which never matches a hostname. */
  allowedDevOrigins: [
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
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "null",
        "**.ngrok-free.app",
        "**.ngrok.io",
        "**.ngrok.com",
        "**.trycloudflare.com",
        "**.loca.lt",
        "**.localhost.run",
        "**.serveo.net",
      ],
    },
  },
};

export default nextConfig;
