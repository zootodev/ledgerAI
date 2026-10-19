/**
 * Next.js implements `redirect()` and `notFound()` by THROWING a sentinel
 * object whose `digest` starts with `NEXT_REDIRECT` / equals `NEXT_NOT_FOUND`.
 *
 * Any server-side try/catch that wraps navigation-capable code (a page calling
 * `ensureOnboarding()`, for example) must rethrow these, otherwise the redirect
 * is swallowed and the user sees an error panel instead of the intended page.
 */
export function isNextControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null | undefined)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}
