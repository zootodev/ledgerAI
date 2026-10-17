// ============================================================
// LedgerAI — canonical site origin
// ------------------------------------------------------------
// Static (build/module-time) origin used for metadata that must be
// ABSOLUTE: `metadataBase`, Open Graph, the sitemap and robots.txt.
//
// The runtime `getAppBaseUrl()` in `@/lib/auth/app-url` resolves the
// request host (for emailed links); this helper deliberately does NOT
// touch `headers()`, so it is safe to evaluate in a build-time metadata
// route. It reads only the configured public URL, then falls back to
// localhost so a local build never throws.
// ============================================================

const FALLBACK = "http://localhost:3000";

/**
 * Absolute origin for canonical/OG/sitemap URLs. Prefers
 * `NEXT_PUBLIC_APP_URL` (set it to the production origin when deploying),
 * falling back to `http://localhost:3000` for local development and builds.
 */
export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return new URL(url.origin);
      }
    } catch {
      // malformed value - fall through to the local fallback
    }
  }
  return new URL(FALLBACK);
}
