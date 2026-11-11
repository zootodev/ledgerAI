import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  hasVerifiedFactor,
  MFA_CHALLENGE_PATH,
  needsMfaStepUp,
  readAalFromAccessToken,
} from "@/lib/auth/mfa";
import {
  earliestAmrTimestampMs,
  LAST_SEEN_COOKIE,
  lastSeenCookieOptions,
  resolveSessionLimits,
  sessionExpiryReason,
  shouldRefreshLastSeen,
  signLastSeen,
  verifyLastSeen,
  type SessionExpiryReason,
} from "@/lib/auth/session-limits";

// Public routes are reachable without a session. Everything else under the
// app area requires an authenticated user. /auth/callback and /auth/confirm
// must stay public: both are hit without a session when the user first clicks
// an email link (the callback forwards the token, the confirm page verifies it
// on an explicit POST).
// /forgot-password and /reset-password are reachable without a session (the
// reset link's recovery page is hit before a session is established).
// /api/health is an uptime probe: it must answer a monitor directly (not with
// a /login redirect) and returns only a fixed, non-sensitive status body.
//
// Matching is EXACT (pathname equality only), never prefix-based, so lookalike
// routes such as "/design-editor" are never accidentally public. A trailing
// slash is normalized so "/login/" behaves like "/login" — Next serves these
// pages at their canonical, slash-less form.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/design",
  "/privacy",
  "/terms",
  "/auth/callback",
  "/auth/confirm",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/api/health",
]);

/** True when `path` is one of the deliberately public route pathnames. */
export function isPublicPath(path: string): boolean {
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  return PUBLIC_PATHS.has(normalized);
}

/**
 * Root pathnames of the authenticated app. Only these (and their children)
 * are sent to /login for an anonymous visitor: an unknown URL is left alone so
 * Next renders the branded 404 instead of bouncing the visitor into a sign-in
 * flow for a page that was never going to exist. Matching on a known root is
 * what keeps lookalikes (/design-editor) unknown.
 *
 * This is a routing nicety, not the security boundary: every real page still
 * calls requireAuthContext() and redirects itself.
 */
const PROTECTED_ROOT_PATHS = new Set([
  "/overview",
  "/transactions",
  "/income",
  "/expenses",
  "/reports",
  "/insights",
  "/import",
  "/onboarding",
  "/account",
  "/settings",
  "/ask",
  "/ask-v2",
  MFA_CHALLENGE_PATH,
]);

/** True when `path` is a known authenticated app route (or a child of one). */
export function isProtectedPath(path: string): boolean {
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  if (PROTECTED_ROOT_PATHS.has(normalized)) return true;
  const [root] = normalized.slice(1).split("/");
  return PROTECTED_ROOT_PATHS.has(`/${root}`);
}

/**
 * The one authenticated route reachable at aal1: the second-factor challenge.
 * A user with a verified factor is parked here until the session is aal2.
 * Re-exported from the MFA helpers so the proxy, the post-verification routing
 * and the challenge page share one definition.
 */
export { MFA_CHALLENGE_PATH };

/** True when the path is the MFA challenge itself (never step-up gated). */
export function isMfaChallengePath(path: string): boolean {
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  return normalized === MFA_CHALLENGE_PATH;
}

/** Content-Security-Policy with a per-request nonce (SG1-04). */
export function cspPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** 128-bit CSP nonce, safe on the Edge runtime (no Buffer/base64 dependency). */
function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Force the strongest safe attributes on every Supabase session cookie.
 * @supabase/ssr defaults to `httpOnly: false` and no `Secure` flag; the auth
 * token and PKCE code-verifier cookies are only ever read server-side (there
 * is no browser Supabase client), so httpOnly is safe and keeps the JWT out
 * of script. `Secure` is on in production — the middleware only ever runs
 * behind HTTPS there — but off in dev so localhost HTTP still works.
 */
function hardenedCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Attach the SG1-04 response headers: a fresh CSP (with a nonce Next picks up
 * for its inline bootstrap scripts via the `x-nonce` header) in production,
 * plus sticky clickjacking/mime/referrer protection. Redirect responses get
 * the same frame protection without a CSP — they never render HTML.
 */
function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("x-nonce", nonce);
    response.headers.set("Content-Security-Policy", cspPolicy(nonce));
  }
}

/**
 * Clear the Supabase session cookies and the last-seen cookie on an expiry
 * redirect. `signOut()` normally does this through the SSR cookie adapter, but
 * a redirect response is created separately below, so clear explicitly to be
 * certain nothing survives the trip to /login.
 */
function clearAuthCookies(response: NextResponse, request: NextRequest): void {
  const secure = process.env.NODE_ENV === "production";
  const names = new Set<string>([LAST_SEEN_COOKIE]);

  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) names.add(name);
  }

  for (const name of names) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: 0,
    });
  }
}

/**
 * Revoke the current Supabase session (not just the browser cookies) and send
 * the user back to the sign-in screen with an explanatory reason.
 */
async function expireSession(
  supabase: ReturnType<typeof createServerClient>,
  request: NextRequest,
  nonce: string,
  reason: SessionExpiryReason,
): Promise<NextResponse> {
  try {
    // Local scope: an idle/absolute expiry on this device must not revoke the
    // user's other devices. "Sign out of all devices" uses global scope.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("[proxy] session expiry: revoking session failed", {
        reason,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("[proxy] session expiry: revoking session threw", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("reason", "session_expired");

  const redirect = NextResponse.redirect(url);
  clearAuthCookies(redirect, request);
  applySecurityHeaders(redirect, nonce);
  return redirect;
}

export async function proxy(request: NextRequest) {
  // Health probe fast-path: answer with security headers and no Supabase auth
  // round-trip, so an uptime monitor gets a truthful signal about *this* app
  // and its database even during an auth-provider incident. The route itself
  // returns only a fixed, non-sensitive body.
  if (request.nextUrl.pathname === "/api/health") {
    const healthResponse = NextResponse.next();
    applySecurityHeaders(healthResponse, generateCspNonce());
    return healthResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured the app runs in a "setup" mode; do not block.
  if (!supabaseUrl || !supabaseAnonKey) {
    const setupResponse = NextResponse.next();
    applySecurityHeaders(setupResponse, generateCspNonce());
    return setupResponse;
  }

  let response = NextResponse.next({ request });
  const nonce = generateCspNonce();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, hardenedCookieOptions(options)),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);
  const limits = resolveSessionLimits();
  let lastSeenRefreshAt: number | null = null;

  // Enforce the app-level session lifetime on authenticated app routes. Public
  // pages are deliberately skipped so they keep working for signed-out and
  // expired visitors; /login and /signup are checked too, otherwise an expired
  // session would first be redirected to /overview and only then back here.
  if (user && (!isPublic || path === "/login" || path === "/signup")) {
    let signedInAt: number | null = null;
    try {
      const { data: claimsData, error } = await supabase.auth.getClaims();
      if (!error) {
        signedInAt = earliestAmrTimestampMs(claimsData?.claims ?? null);
      }
    } catch {
      // `getUser()` already authenticated this request. A claims/JWKS hiccup
      // must not sign everyone out; the idle limit below still applies.
    }

    const now = Date.now();
    let lastSeenAt: number | null = null;

    if (limits.secret) {
      const cookieValue = request.cookies.get(LAST_SEEN_COOKIE)?.value;
      lastSeenAt = cookieValue
        ? await verifyLastSeen(limits.secret, user.id, cookieValue)
        : null;

      if (lastSeenAt === null) {
        // Missing/tampered cookies count as activity now, once. The freshly
        // written cookie is enforced from the next request onward.
        lastSeenAt = now;
        lastSeenRefreshAt = now;
      } else if (shouldRefreshLastSeen(lastSeenAt, now)) {
        // Refresh at most every five minutes, not on every request.
        lastSeenRefreshAt = now;
      }
    }

    const expiry = sessionExpiryReason({ now, signedInAt, lastSeenAt, limits });
    if (expiry) {
      return expireSession(supabase, request, nonce, expiry);
    }
  }

  // 2FA step-up: a session whose account has a verified factor must reach
  // aal2 before it can touch any protected surface. Only sessions that
  // actually have a verified factor trigger the extra session read.
  let mfaStepUp = false;
  if (user && hasVerifiedFactor(user)) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    mfaStepUp = needsMfaStepUp(user, readAalFromAccessToken(session?.access_token));
  }

  // Only known app routes go to the sign-in screen. Anything else (a typo, a
  // stale bookmark, a lookalike path) falls through to Next and renders the
  // 404 page — no silent funnel into /login for a page that does not exist.
  if (!user && !isPublic && isProtectedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  // Park an aal1 session with a verified factor on the challenge before it
  // reaches anything else (the challenge page itself is exempt).
  if (user && mfaStepUp && !isMfaChallengePath(path) && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = MFA_CHALLENGE_PATH;
    url.search = "";
    if (path !== "/overview") url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    // A user who still owes a second factor goes to the challenge, not the app.
    url.pathname = mfaStepUp ? MFA_CHALLENGE_PATH : "/overview";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  if (lastSeenRefreshAt !== null && user && limits.secret) {
    const value = await signLastSeen(limits.secret, user.id, lastSeenRefreshAt);
    response.cookies.set(
      LAST_SEEN_COOKIE,
      value,
      lastSeenCookieOptions(
        limits.maxAgeMs,
        process.env.NODE_ENV === "production",
      ),
    );
  }

  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and internal Next routes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml|css|js|woff2?)$).*)",
  ],
};