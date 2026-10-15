// ============================================================
// LedgerAI — Account-scope query resolution
// ------------------------------------------------------------
// Reports and Transactions are the only surfaces that accept a single-account
// ?accountId= scope. This module is the ONE place that decides whether a raw
// URL value may be honored, so both pages reject invalid ids identically and
// a foreign tenant id can never silently widen or empty a view.
//
// The id is only ever a FILTER over rows already bounded by the session
// businessId — it is never an authorization boundary. Ownership is still
// enforced server-side against the session business by the caller/service.
// ============================================================

/** Canonical UUID shape accepted for an account id (matches zod's `z.uuid`). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountScope {
  /** The single, session-owned account id to apply, or undefined (business-wide). */
  accountId?: string;
  /** True when the URL carried an accountId that is not usable and must be dropped. */
  rejected: boolean;
}

/**
 * Resolve a raw ?accountId= search value against the ids the session business
 * owns. Anything that is not exactly one well-formed UUID the business owns —
 * repeated, empty, malformed, or foreign — is rejected so the caller can
 * remove it from the URL and render business-wide, rather than showing a
 * silently-empty or silently-widened view. An absent value means business-wide.
 */
export function resolveAccountScope(
  value: string | string[] | undefined,
  ownedIds: Iterable<string>,
): AccountScope {
  if (value === undefined) return { rejected: false };
  if (typeof value !== "string" || value.length === 0 || !UUID_RE.test(value)) {
    return { rejected: true };
  }
  for (const id of ownedIds) {
    if (id === value) return { accountId: value, rejected: false };
  }
  return { rejected: true };
}

/**
 * The same URL with every accountId param removed; other params (notably the
 * date range) are preserved verbatim, including repeated non-account values.
 * This keeps the address bar and the rendered scope in agreement after an
 * invalid account id is rejected.
 */
export function urlWithoutAccountId(
  basePath: string,
  search: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "accountId") continue;
    if (typeof value === "string" && value !== "") {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) if (item !== "") qs.append(key, item);
    }
  }
  const q = qs.toString();
  return q ? `${basePath}?${q}` : basePath;
}
