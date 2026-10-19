// ============================================================
// Transient database-error detection + a single-retry helper
// ------------------------------------------------------------
// A connection blip (the pooler recycling an idle socket, a
// connect timeout) should not fail a page load outright. These
// helpers classify the errors that are worth ONE retry and run it.
//
// They are deliberately narrow: an error that is not clearly a
// transport/pool problem is rethrown untouched, so a genuine bug
// is never masked or retried.
// ============================================================

/** Prisma error codes that mean "the connection failed", not "the query is wrong". */
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach the database server
  "P1002", // Connection timed out
  "P1008", // Operation timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
]);

/** Lower-cased substrings that indicate a dropped connection or a pool timeout. */
const TRANSIENT_MESSAGE_HINTS = [
  "connection pool",
  "pool timeout",
  "timed out",
  "timeout",
  "connection closed",
  "closed the connection",
  "server has closed the connection",
  "connection reset",
  "econnreset",
  "etimedout",
  "connection terminated",
  "driveradaptererror",
  "connectionclosed",
];

/** Collect the lower-cased messages from an error and its cause/error chain. */
function messageChain(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || error === undefined) return "";
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error !== "object") return "";
  const node = error as { message?: unknown; cause?: unknown; error?: unknown };
  const parts: string[] = [];
  if (typeof node.message === "string") parts.push(node.message.toLowerCase());
  parts.push(messageChain(node.cause, depth + 1));
  parts.push(messageChain(node.error, depth + 1));
  return parts.join(" ");
}

/** True when the error looks like a transient connection/pool failure. */
export function isTransientPrismaError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_PRISMA_CODES.has(code.toUpperCase())) {
    return true;
  }

  const text = messageChain(error);
  return text.length > 0 && TRANSIENT_MESSAGE_HINTS.some((hint) => text.includes(hint));
}

export interface RetryOptions {
  /** Total attempts, including the first. Defaults to 2 ("retry once"). */
  attempts?: number;
  /** Delay before each retry, in milliseconds. Defaults to 0. */
  delayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Run `operation`, retrying only transient errors up to `attempts` times.
 * A non-transient error (or the final attempt) is rethrown as-is.
 */
export async function retryOnTransient<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 2));
  const delayMs = Math.max(0, options.delayMs ?? 0);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientPrismaError(error)) throw error;
      options.onRetry?.(error, attempt);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
