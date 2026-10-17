import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * `/robots.txt`. A public launch should invite crawlers only to the marketing
 * surface and keep them out of the authenticated product and the hidden Ask
 * routes. This mirrors the proxy's public allow-list: anything that requires a
 * session (and every AI surface) is disallowed.
 */
const DISALLOW = [
  // APIs and auth machinery.
  "/api/",
  "/auth/",
  // Authenticated app.
  "/account/",
  "/onboarding",
  "/overview",
  "/transactions",
  "/income",
  "/expenses",
  "/reports",
  "/insights",
  "/import",
  "/settings",
  // Account entry points (useless to crawlers, and no content to index).
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  // Hidden surfaces.
  "/ask",
  "/ask-v2",
  "/design",
];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: DISALLOW,
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
