import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Public routes are reachable without a session. Everything else under the
// app area requires an authenticated user. /auth/callback must stay public:
// it is hit without a session when the user first clicks an email link.
// /forgot-password and /reset-password are reachable without a session (the
// reset link's recovery page is hit before a session is established).
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
  "/auth/callback",
  "/forgot-password",
  "/reset-password",
]);

/** True when `path` is one of the deliberately public route pathnames. */
export function isPublicPath(path: string): boolean {
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  return PUBLIC_PATHS.has(normalized);
}

/** Content-Security-Policy with a per-request nonce (SG1-04). */
function cspPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
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

export async function proxy(request: NextRequest) {
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

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and internal Next routes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};