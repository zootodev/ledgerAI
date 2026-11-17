// ============================================================
// LedgerAI — route classification (shared by proxy and client)
// ------------------------------------------------------------
// Pure, dependency-free pathname helpers. The proxy uses these for
// redirects/session limits; the idle guard uses the protected-root
// check so no timers are started on public pages.
// ============================================================

import { MFA_CHALLENGE_PATH } from "./mfa";

// Public routes are reachable without a session. Everything else under the
// app area requires an authenticated user. /auth/callback and /auth/confirm
// must stay public: both are hit without a session when the user first clicks
// an email link (the callback forwards the token, the confirm page verifies it
// on an explicit POST). /forgot-password and /reset-password are reachable
// without a session (the reset link's recovery page is hit before a session is
// established). /api/health is an uptime probe: it must answer a monitor
// directly (not with a /login redirect) and returns only a fixed body.
//
// Matching is EXACT (pathname equality only), never prefix-based, so lookalike
// routes such as "/design-editor" are never accidentally public. A trailing
// slash is normalized so "/login/" behaves like "/login".
export const PUBLIC_PATHS = new Set([
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
 * flow for a page that was never going to exist. This is a routing nicety, not
 * the security boundary.
 */
export const PROTECTED_ROOT_PATHS = new Set([
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

/** True when the path is the MFA challenge itself (never step-up gated). */
export function isMfaChallengePath(path: string): boolean {
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  return normalized === MFA_CHALLENGE_PATH;
}
