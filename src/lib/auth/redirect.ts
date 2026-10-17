/**
 * Post-auth redirect resolution used by the /auth/callback route.
 *
 * The `next` query param must NEVER redirect off the application origin.
 * Any value that fails the structural allowlist (relative path of safe
 * characters only) or that resolves to a different origin defaults back to
 * the internal /overview target.
 */
const SAFE_RELATIVE_PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@?%#/-]{0,2047}$/;

/**
 * Resolve a `next` value to an internal redirect target bounded to the app
 * origin. Returns `{baseUrl}/overview` for anything external, malformed, or
 * unset — never raises.
 *
 * Structural defense-in-depth plus a resolved-origin equality check:
 * even if a parser variant slips through (backslashes, mixed slashes,
 * percent-encodings that browsers normalize to host separators), the final
 * `new URL()` resolution must still land on the application origin.
 */
export function resolvePostAuthRedirect(
  raw: string | null | undefined,
  baseUrl: string,
): string {
  const fallback = `${baseUrl}/overview`;

  if (!raw || !SAFE_RELATIVE_PATH.test(raw)) return fallback;

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(raw, baseUrl);
    if (resolved.origin !== base.origin) return fallback;
    return resolved.toString();
  } catch {
    return fallback;
  }
}

/**
 * Validate a `next` value and return it as an internal, *relative* path
 * (`/path?query#hash`) — or `null` when it is absent or fails validation.
 *
 * Unlike {@link resolvePostAuthRedirect} this carries no fallback, so callers
 * can tell "the user asked for a specific page" from "no usable target given".
 * Used where the value has to survive a round trip through a form (the
 * `/auth/confirm` hidden field): only an already-validated, same-origin path is
 * ever emitted, and a hostile value is dropped rather than forwarded.
 */
export function resolveInternalNext(
  raw: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!raw || !SAFE_RELATIVE_PATH.test(raw)) return null;

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(raw, baseUrl);
    if (resolved.origin !== base.origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}