// ============================================================
// LedgerAI — session activity ping (browser-safe constants)
// ------------------------------------------------------------
// Shared by the proxy, the ping Route Handler, the idle-warning
// component and their tests. No server secrets live here.
// ============================================================

export const SESSION_PING_PATH = "/api/session/ping";

/** Server-side minimum gap between last-seen cookie writes. */
export const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

/** The browser pings no more often than the server refreshes the cookie. */
export const SESSION_PING_INTERVAL_MS = LAST_SEEN_REFRESH_MS;

/** Warning lead time for the idle countdown. */
export const IDLE_WARNING_LEAD_MS = 2 * 60 * 1000;
