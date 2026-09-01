import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Opt out of the expanded static/cache behaviors so authenticated,
     session-derived data is always revalidated (Supabase SSR best practice). */
  cacheComponents: false,
};

export default nextConfig;
