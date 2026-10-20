import { retryOnTransient } from "@/lib/db/transient";

/**
 * How long the /import page waits before its single retry. Pool exhaustion
 * (EMAXCONNSESSION) and recycled connections are usually gone by the next
 * tick, but retrying immediately tends to hit the same saturated pool; a short
 * pause gives in-flight queries time to release their clients.
 */
export const IMPORT_LOAD_RETRY_DELAY_MS = 300;

/**
 * Run one /import page lookup, retrying a transient DB failure once after a
 * short delay. Non-transient errors (validation, authorization, Next.js
 * control flow) are rethrown untouched so they are never masked by a retry.
 */
export function retryImportLoad<T>(operation: () => Promise<T>): Promise<T> {
  return retryOnTransient(operation, {
    attempts: 2,
    delayMs: IMPORT_LOAD_RETRY_DELAY_MS,
    onRetry: () => console.warn("[import] retrying page load after a transient DB error"),
  });
}
