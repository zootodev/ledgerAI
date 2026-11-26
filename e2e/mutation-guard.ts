export interface MutationEnv {
  E2E_ALLOW_MUTATION?: string;
  BASE_URL?: string;
  E2E_SAFE_HOSTS?: string;
}

/** Loopback always refers to the machine running the browser, not a tenant. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function safeHosts(env: MutationEnv): string[] {
  return (env.E2E_SAFE_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry.includes("://") ? entry : `http://${entry}`).hostname.toLowerCase();
      } catch {
        // An explicit host:port entry is also a valid allowlist value.
        return entry.split(":")[0];
      }
    });
}

/**
 * Gate every spec that writes financial data. Both the explicit opt-in AND a
 * non-production target are required: a prod URL can never be unlocked by an
 * accidental E2E_ALLOW_MUTATION=1 in a shared shell/CI environment.
 */
export function mutationTargetAllowed(env: MutationEnv = process.env as MutationEnv): boolean {
  if (env.E2E_ALLOW_MUTATION !== "1") return false;

  const raw = (env.BASE_URL ?? "http://localhost:3000").trim();
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return false;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;

  const host = target.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return true;
  return safeHosts(env).includes(host);
}

/**
 * Reason shown when a mutating spec is skipped. Call `test.skip(!allowed(),
 * MUTATION_SKIP_REASON)` as the first line of any spec that writes data.
 */
export const MUTATION_SKIP_REASON =
  "Mutating e2e specs need E2E_ALLOW_MUTATION=1 and a localhost/127.0.0.1 or E2E_SAFE_HOSTS target.";
