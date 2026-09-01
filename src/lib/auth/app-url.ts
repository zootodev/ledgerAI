import { headers } from "next/headers";

/**
 * Public base URL of the app used to build links that get emailed to the user
 * (e.g. the Supabase confirmation redirect). Resolved in this order:
 *
 *   1. `NEXT_PUBLIC_APP_URL` — set this to your production URL (e.g.
 *      `https://app.example.com`) when deploying. An empty/unset value turns
 *      this off for local development.
 *   2. The incoming request host — in development this makes the applied
 *      development/LAN address win automatically (localhost on the laptop,
 *      the laptop's reachable LAN address on a phone), so no dev IP is
 *      hardcoded.
 *   3. `http://localhost:3000` as a last-resort fallback.
 *
 * The host is validated before being used to avoid host-header injection.
 */
const FALLBACK = "http://localhost:3000";

const HOST_PATTERN =
  /^(?:localhost|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?))*(?::\d{1,5})?$/;

/** Accept only a plain host[:port] (hostname, subdomains, or IPv4 address). */
function sanitizeHost(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  if (!host || host.length > 253 || !HOST_PATTERN.test(host)) return null;

  const port = host.split(":").pop();
  if (port !== undefined && Number(port) > 65535) return null;
  return host;
}

export async function getAppBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // malformed env value — fall through to the request host
    }
  }

  try {
    const requestHeaders = await headers();
    const proto = (requestHeaders.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
    const host =
      (requestHeaders.get("x-forwarded-host") ?? "").split(",")[0].trim() ||
      (requestHeaders.get("host") ?? "").trim();
    const safeHost = sanitizeHost(host);
    if (safeHost) {
      const scheme = proto.toLowerCase() === "https" ? "https" : "http";
      return `${scheme}://${safeHost}`;
    }
  } catch {
    // headers() unavailable (e.g. build-time/static context) — fall through
  }

  return FALLBACK;
}